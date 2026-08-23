import type { EngineInfo } from '@chesslab/engine-uci';
import type {
  GameResult,
  LegalMove,
  MoveUci,
  RulesAdapter,
  Side,
} from '@chesslab/rules-core';
import { GameClock, type ClockState, type TimeControlMs } from './clock';
import type { EngineRunnerFactory, EngineTurnRunner } from './runner';

export type PlayerConfig =
  | { kind: 'human'; side: Side; name?: string }
  | {
      kind: 'engine';
      side: Side;
      name?: string;
      /** 'stockfish' for chess games, 'pikafish' for xiangqi. */
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

  constructor(private opts: SessionOptions) {}

  // ---- lifecycle -----------------------------------------------------------

  async start(): Promise<void> {
    if (this.started) throw new Error('session already started');
    this.started = true;
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
    void this.pumpEngineTurn();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.engineThinking = null;
    this.clock?.dispose();
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
    if (afterUndo?.kind === 'engine' && !this.over && this.started) {
      void this.pumpEngineTurn();
    }
    return removed > 0;
  }

  /** Quick one-shot suggestion for the current position (analysis helper). */
  async hint(movetimeMs = 700): Promise<LegalMove | null> {
    const factory = this.opts.engineRunnerFactory;
    if (!factory) return null;
    const profileId = this.opts.rules.gameType === 'chess' ? 'stockfish' : 'pikafish';
    const runner = await factory({ profileId, strengthLevel: 20 });
    try {
      const { bestmove } = await runner.requestMove({
        fen: this.rules.fen(),
        moves: [],
        level: 20,
        clock: { remainingMs: movetimeMs },
        onInfo: undefined,
      });
      return bestmove ? (this.rules.moves().find(m => m.uci === bestmove) ?? null) : null;
    } finally {
      await runner.dispose().catch(() => undefined);
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

  private emit(e: SessionEvent): void {
    for (const fn of [...this.listeners]) fn(e);
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
    void this.pumpEngineTurn();
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
        fen: this.rules.fen(),
        moves: [],
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
