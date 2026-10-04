import type { EngineInfo } from '@chessnext/engine-uci';
import type {
  GameResult,
  LegalMove,
  MoveUci,
  RulesAdapter,
  Side,
} from '@chessnext/rules-core';
import { GameClock, type ClockState, type TimeControlMs } from './clock';
import type { AssistEngine, AssistEngineFactory, AssistSnapshot } from './analysis';
import type { EngineRunnerFactory, EngineTurnRunner } from './runner';

export type PlayerConfig =
  | { kind: 'human'; side: Side; name?: string }
  | {
      kind: 'engine';
      side: Side;
      name?: string;
      /** Engine profile id — 'pikafish' for xiangqi. */
      profileId: string;
      /** 1 (weakest) .. 20 (strongest). */
      strengthLevel: number;
    };

export type SessionEvent =
  | { kind: 'started'; fen: string }
  | { kind: 'turn'; side: Side }
  | { kind: 'move'; uci: MoveUci; san: string; by: Side; moveNumber: number }
  | { kind: 'thinking'; side: Side }
  | { kind: 'engineInfo'; side: Side; info: EngineInfo }
  | { kind: 'clock'; state: ClockState }
  | { kind: 'assist'; lines: AssistSnapshot }
  | { kind: 'result'; result: GameResult }
  | { kind: 'error'; error: Error };

export interface SessionOptions {
  rules: RulesAdapter;
  white: PlayerConfig;
  black: PlayerConfig;
  timeControl?: TimeControlMs;
  /**
   * Creates engine turn runners. Injected by the app layer with real UCI
   * drivers; tests pass scripted fakes.
   */
  engineRunnerFactory?: EngineRunnerFactory;
  /**
   * Creates the dedicated assist/hint analysis engine (independent process
   * from the game opponent — see packages/game-session/src/analysis.ts).
   */
  analysisFactory?: AssistEngineFactory;
  /** When false, engine moves require explicit step() (for 观战步进 mode). */
  autoPlay?: boolean;
  /** Delay between auto moves in ms (for watch mode) */
  autoDelayMs?: number;
}

/**
 * Orchestrates one complete game: rule enforcement, player turns (human /
 * engine), clocks, results and events. UI layers only subscribe + feed
 * human moves in.
 *
 * Extension seam for online play: a future RemotePlayer is just another
 * `PlayerConfig` whose moves arrive from a websocket instead of the UI —
 * nothing below this class changes.
 */
export class GameSession {
  private listeners = new Set<(e: SessionEvent) => void>();
  private runners = new Map<Side, EngineTurnRunner>();
  private clock: GameClock | null = null;
  private result: GameResult | null = null;
  private started = false;
  private disposed = false;
  private engineThinking: Side | null = null;
  private assist: AssistEngine | null = null;
  private assistOn = false;
  private assistOpts: {
    multiPv?: number;
    budgetMs?: number;
    maxDepth?: number;
    pauseOnOpponentTurn: boolean;
  } = { pauseOnOpponentTurn: true };
  private hintRunner: EngineTurnRunner | null = null;
  private autoPaused = false;
  private autoDelayMs: number;
  /** Position the game started from — base for engine `position ... moves ...`. */
  private startFen = '';

  constructor(private opts: SessionOptions) {
    this.autoDelayMs = opts.autoDelayMs ?? 0;
  }

  // ---- lifecycle -----------------------------------------------------------

  get autoPlay(): boolean {
    return this.opts.autoPlay ?? true;
  }

  get isAutoPaused(): boolean {
    return this.autoPaused;
  }

  setAutoPaused(paused: boolean): void {
    if (this.autoPaused === paused) return;
    this.autoPaused = paused;
    if (!paused && this.autoPlay && !this.over && !this.disposed && !this.engineThinking) {
      const cfg = this.currentPlayerConfig();
      if (cfg?.kind === 'engine') void this.pumpEngineTurn();
    }
  }

  setAutoDelayMs(ms: number): void {
    this.autoDelayMs = Math.max(0, ms);
  }

  /** Manual step for 观战步进 mode: trigger one engine ply if it's engine's turn. */
  step(): boolean {
    if (this.disposed || this.over) return false;
    const cfg = this.currentPlayerConfig();
    if (!cfg || cfg.kind !== 'engine' || this.engineThinking) return false;
    void this.pumpEngineTurn();
    return true;
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('session already started');
    this.started = true;
    this.startFen = this.opts.rules.fen();
    await this.ensureRunners();
    this.emit({ kind: 'started', fen: this.opts.rules.fen() });

    if (this.opts.timeControl) {
      this.clock = new GameClock(this.opts.timeControl, {
        onTick: state => this.emit({ kind: 'clock', state }),
        onFlag: side => {
          this.finish({
            winner: side === 'w' ? 'b' : 'w',
            reason: 'timeout',
          });
          this.engineThinking = null;
        },
      });
      this.clock.start('w');
    }

    this.emit({ kind: 'turn', side: 'w' });
    if (this.autoPlay) void this.pumpEngineTurn();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.engineThinking = null;
    this.clock?.dispose();
    if (this.assist) {
      await this.assist.dispose().catch(() => undefined);
      this.assist = null;
      this.assistOn = false;
    }
    if (this.hintRunner) {
      await this.hintRunner.dispose().catch(() => undefined);
      this.hintRunner = null;
    }
    for (const r of this.runners.values()) await r.dispose().catch(() => undefined);
    this.runners.clear();
    this.listeners.clear();
  }

  // ---- input ---------------------------------------------------------------

  /** Human move entry. Returns false when it's not legal or not our turn. */
  playHumanMove(uci: MoveUci): boolean {
    const cfg = this.currentPlayerConfig();
    if (this.over || !this.started || cfg?.kind !== 'human') return false;
    return this.applyMove(uci);
  }

  resign(side: Side): void {
    if (!this.over) {
      this.finish({ winner: side === 'w' ? 'b' : 'w', reason: 'resign' });
      this.engineThinking = null;
    }
  }

  /**
   * Take back plies until it is a human's turn again (so vs-engine games pop
   * both the engine reply and your move). Cancels any thinking engine.
   * Returns true when something was undone.
   */
  undo(): boolean {
    if (this.over || !this.rules.history().length) return false;

    this.cancelEngineThinking();

    let removed = 0;
    do {
      if (!this.rules.undo()) break;
      removed += 1;
    } while (
      this.rules.history().length > 0 &&
      this.currentPlayerConfig()?.kind !== 'human'
    );

    // If we undid into an engine-vs-human boundary such that it's now the
    // engine's turn (human played last), hand control back to the human by
    // undoing one more ply when possible.
    const cur = this.currentPlayerConfig();
    if (cur?.kind === 'engine' && this.rules.history().length > 0 && removed > 0) {
      this.rules.undo();
    }

    this.emit({ kind: 'turn', side: this.rules.turn() });

    // If play was rewound into an engine turn (e.g. human is Black and undid
    // the engine's opening move), let the engine think again instead of
    // stalling the session.
    const afterUndo = this.currentPlayerConfig();
    if (this.autoPlay && afterUndo?.kind === 'engine' && !this.over && this.started) {
      void this.pumpEngineTurn();
    }
    return removed > 0;
  }

  /**
   * Quick one-shot suggestion for the current position (L1 hint).
   * The engine instance is created lazily and REUSED across calls — spawning
   * a UCI process per hint would cost 1-2s each time.
   */
  async hint(movetimeMs = 700): Promise<LegalMove | null> {
    const factory = this.opts.engineRunnerFactory;
    if (!factory) return null;
    const profileId = 'pikafish';
    this.hintRunner ??= await factory({ profileId, strengthLevel: 20 });
    try {
      const pos = this.engineSearchPosition();
      const { bestmove } = await this.hintRunner.requestMove({
        fen: pos.fen,
        moves: pos.moves,
        level: 20,
        clock: { remainingMs: movetimeMs },
      });
      void movetimeMs;
      return bestmove ? (this.rules.moves().find(m => m.uci === bestmove) ?? null) : null;
    } catch (err) {
      // A dead hint engine must not poison future hints.
      await this.hintRunner.dispose().catch(() => undefined);
      this.hintRunner = null;
      throw err;
    }
  }

  // ---- assist mode ("辅助着棋", L2) ---------------------------------------

  /**
   * Turn on continuous analysis of the position on the move. Requires
   * `opts.analysisFactory`. Emits `assist` events with top-N lines.
   *
   * Power policy:
   * - pauseOnOpponentTurn (default true): analyze ONLY while a human is on
   *   move — avoids two engines searching simultaneously (double load).
   * - budgetMs / maxDepth: finite search bursts instead of `go infinite`
   *   (e.g. budgetMs 1200 = short CPU burst per position, then idle).
   */
  async enableAssist(opts?: {
    multiPv?: number;
    budgetMs?: number;
    maxDepth?: number;
    pauseOnOpponentTurn?: boolean;
  }): Promise<void> {
    if (!this.opts.analysisFactory) {
      throw new Error('enableAssist requires SessionOptions.analysisFactory');
    }
    this.assistOpts = {
      multiPv: opts?.multiPv,
      budgetMs: opts?.budgetMs,
      maxDepth: opts?.maxDepth,
      pauseOnOpponentTurn: opts?.pauseOnOpponentTurn ?? true,
    };
    if (!this.assist) {
      this.assist = await this.opts.analysisFactory();
      this.assist.onLines(lines => {
        if (this.assistOn && !this.over && !this.disposed) {
          this.emit({ kind: 'assist', lines });
        }
      });
    }
    this.assistOn = true;
    if (!this.suspended) {
      this.beginAssist();
    }
  }

  disableAssist(): void {
    this.assistOn = false;
    this.assist?.stop();
  }

  get assistEnabled(): boolean {
    return this.assistOn;
  }

  // ---- mobile power lifecycle ---------------------------------------------

  private suspended = false;
  private assistWasOnBeforeSuspend = false;

  /**
   * Called when the app goes to background / screen locks: cancels any active
   * engine search, pauses the clock and halts assist analysis. Idempotent.
   * The OS would eventually freeze us anyway, but that can take minutes of
   * full-core burn first — explicit suspension is the battery-friendly path.
   */
  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.cancelEngineThinking();
    this.clock?.pause();
    this.assistWasOnBeforeSuspend = this.assistOn;
    if (this.assistOn) this.assist?.stop();
  }

  /** Foreground again: restore clocks, assist and any pending engine turn. */
  resume(): void {
    if (!this.suspended || this.disposed) return;
    this.suspended = false;
    this.clock?.resume();
    if (
      this.assistWasOnBeforeSuspend &&
      this.assist &&
      !this.over &&
      this.currentPlayerConfig()?.kind === 'human'
    ) {
      this.beginAssist();
    }
    // A cancelled opponent search must be re-issued or the game stalls (autoPlay only).
    const cfg = this.currentPlayerConfig();
    if (this.autoPlay && !this.over && cfg?.kind === 'engine') {
      void this.pumpEngineTurn();
    }
  }

  // ---- introspection --------------------------------------------------------

  get rules(): RulesAdapter {
    return this.opts.rules;
  }

  get over(): boolean {
    return this.result !== null || this.opts.rules.result() !== null;
  }

  get finalResult(): GameResult | null {
    return this.result ?? this.opts.rules.result();
  }

  currentPlayerConfig(): PlayerConfig | null {
    if (this.over) return null;
    return this.rules.turn() === 'w' ? this.opts.white : this.opts.black;
  }

  subscribe(fn: (e: SessionEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- internals -------------------------------------------------------------

  /**
   * Engine search position: the game's STARTING fen plus the full move list.
   *
   * Sending only the bare current-position FEN (the old behavior) leaves the
   * engine repetition-blind — it cannot know a position already occurred and
   * will happily walk into 长将/三次重复. With history attached, engines that
   * score repetitions (and Pikafish's built-in Asian-rule adjudication) see
   * the true game state. History is cheap for UCI engines to replay.
   */
  private engineSearchPosition(): { fen: string; moves: MoveUci[] } {
    const base = this.startFen || this.rules.fen();
    const moves = this.rules.history().map(h => h.uci);
    return { fen: base, moves };
  }

  /**
   * Veto predicate handed to randomized Pikafish move selection: an
   * alternative must not step into a previously-seen position (count ≥ 2
   * including itself). The engine's own bestmove stays exempt — if it chooses
   * a repetition, client-side adjudication applies the official outcome.
   */
  private candidateGuard(): ((mv: MoveUci) => boolean) | undefined {
    const probe = this.opts.rules.occurrencesAfter?.bind(this.opts.rules);
    if (!probe) return undefined;
    return mv => {
      try {
        return (probe(mv) ?? 0) < 2;
      } catch {
        return true; // probe failure must never veto a legal candidate
      }
    };
  }

  /** Restart assist analysis at the live position (with full move history). */
  private beginAssist(): void {
    if (!this.assist) return;
    const pos = this.engineSearchPosition();
    this.assist.begin(pos.fen, { ...this.assistOpts, moves: pos.moves });
  }

  private emit(e: SessionEvent): void {
    for (const fn of [...this.listeners]) fn(e);

    // Assist mode follows position changes. Duty-cycle policy:
    // - 'started' always (re)starts analysis at the initial position;
    // - 'turn' restarts it only when a HUMAN is on move (default), so the
    //   assist engine never doubles up with the opponent's own search.
    if (!this.assistOn || !this.assist || this.suspended) return;
    if (e.kind === 'started') {
      this.beginAssist();
      return;
    }
    if (
      e.kind === 'turn' &&
      (!this.assistOpts.pauseOnOpponentTurn ||
        this.currentPlayerConfig()?.kind === 'human')
    ) {
      this.beginAssist();
      return;
    }
    if (e.kind === 'turn' && this.assistOpts.pauseOnOpponentTurn) {
      this.assist.stop(); // opponent thinking — free the CPU
    }
  }

  private applyMove(uci: MoveUci): boolean {
    const mover = this.rules.turn();
    const applied = this.rules.move(uci);
    if (!applied) return false;

    this.clock?.switchTo(mover === 'w' ? 'b' : 'w');
    this.emit({
      kind: 'move',
      uci: applied.uci,
      san: applied.san,
      by: mover,
      moveNumber: Math.ceil(this.rules.history().length / 2),
    });

    const res = this.rules.result();
    if (res) {
      this.finish(res);
      this.engineThinking = null;
      return true;
    }

    this.emit({ kind: 'turn', side: this.rules.turn() });
    if (this.autoPlay && !this.autoPaused) {
      if (this.autoDelayMs > 0) {
        const delay = this.autoDelayMs;
        setTimeout(() => {
          if (!this.disposed && !this.over && !this.autoPaused) void this.pumpEngineTurn();
        }, delay);
      } else {
        void this.pumpEngineTurn();
      }
    }
    return true;
  }

  private async pumpEngineTurn(): Promise<void> {
    if (this.disposed || this.over) return;
    const cfg = this.currentPlayerConfig();
    if (!cfg || cfg.kind !== 'engine') return;

    const side = this.rules.turn();
    const runner = this.runners.get(side);
    if (!runner) return;

    this.engineThinking = side;
    this.emit({ kind: 'thinking', side });

    try {
      const { bestmove } = await runner.requestMove({
        ...this.engineSearchPosition(),
        level: cfg.strengthLevel,
        clock:
          this.clock ?
            (() => {
              const s = this.clock.state();
              return {
                remainingMs: side === 'w' ? s.remainingW : s.remainingB,
                incrementMs: this.opts.timeControl?.incrementMs ?? 0,
              };
            })()
          : undefined,
        onInfo: info => this.emit({ kind: 'engineInfo', side, info }),
        guardCandidate: this.candidateGuard(),
      });

      if (this.disposed || this.over || this.engineThinking !== side) return; // stale
      if (!bestmove) return;

      this.engineThinking = null;
      this.applyMove(bestmove);
    } catch (err) {
      if (!this.disposed) {
        this.emit({
          kind: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    } finally {
      if (this.engineThinking === side) this.engineThinking = null;
    }
  }

  private cancelEngineThinking(): void {
    if (this.engineThinking !== null) {
      this.runners.get(this.engineThinking)?.cancel();
      this.engineThinking = null;
    }
  }

  private finish(result: GameResult): void {
    if (this.result) return;
    this.result = result;
    this.clock?.stop();
    this.cancelEngineThinking();
    if (this.assistOn) this.assist?.stop(); // game over — halt analysis
    this.emit({ kind: 'result', result });
  }

  private async ensureRunners(): Promise<void> {
    const factory = this.opts.engineRunnerFactory;
    if (!factory) return;
    for (const cfg of [this.opts.white, this.opts.black]) {
      if (cfg.kind === 'engine') {
        this.runners.set(cfg.side, await factory({ profileId: cfg.profileId, strengthLevel: cfg.strengthLevel }));
      }
    }
  }
}
