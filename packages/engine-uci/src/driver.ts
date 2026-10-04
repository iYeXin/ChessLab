import { parseUciLine, uciCommands } from './protocol';
import type { MoveUci } from '@chessnext/rules-core';
import type {
  EngineId,
  EngineInfo,
  EngineOptionDef,
  EngineProfile,
  EngineTransport,
  GoLimits,
  UciEvent,
  UciOptionValue,
} from './types';

export interface SearchPosition {
  /** Full FEN; omit to use startpos. */
  fen?: string;
  /** Moves from the starting (or FEN) position, coordinate notation. */
  moves?: readonly MoveUci[];
}

export interface SearchResult {
  bestmove: MoveUci | null;
  ponder?: MoveUci;
}

export interface DriverLogger {
  debug?(msg: string): void;
  warn?(msg: string): void;
}

interface PendingSearch {
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
  onInfo?: (info: EngineInfo) => void;
}

// Generous handshake budget: on Android, first `isready` after `setoption
// EvalFile` loads a 50MB+ NNUE file and can take well over 15s on slow
// storage. A dead process fails fast via the exit handler (see below).
const HANDSHAKE_TIMEOUT_MS = 45_000;

/**
 * One driver instance owns one engine process.
 *
 * Lifecycle: create(transport) -> handshake() -> [newGame() | setOptions() |
 * search()*] -> quit(). Searches are serialized internally (a UCI engine has
 * a single search thread of control); calling code can fire-and-forget since
 * requests queue up in order.
 */
export class UciEngineDriver {
  readonly profile: EngineProfile;

  private transport: EngineTransport | null = null;
  private options = new Map<string, EngineOptionDef>();
  private engineName = '';
  private pending: PendingSearch[] = [];
  private waiters: Array<(e: UciEvent) => boolean> = [];
  private waiterFails: Array<(err: Error) => void> = [];
  private alive = false;
  private deathReason: string | null = null;

  constructor(profile: EngineProfile, private logger?: DriverLogger) {
    this.profile = profile;
  }

  get id(): EngineId {
    return this.profile.id;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get name(): string {
    return this.engineName;
  }

  get availableOptions(): ReadonlyMap<string, EngineOptionDef> {
    return this.options;
  }

  onEngineDied(handler: (reason: string) => void): void {
    this.deathHandlers.push(handler);
  }
  private deathHandlers: Array<(reason: string) => void> = [];

  /**
   * Attach the transport and perform the `uci` handshake plus the initial
   * option set / readiness check. Idempotent-safe: throws if already started.
   */
  async start(transport: EngineTransport): Promise<void> {
    if (this.transport) throw new Error(`${this.profile.id}: already started`);
    this.transport = transport;

    const exitP = transport.exited.then(code => {
      const lastLine = (transport.stderrTail ?? '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .pop();
      const reason =
        `process exited (code ${code ?? 'signal'})` +
        (lastLine ? `: ${lastLine.slice(0, 200)}` : '');
      this.alive = false;
      this.deathReason = reason;
      for (const p of this.pending.splice(0)) {
        p.reject(new Error(`engine died during search: ${reason}`));
      }
      // Fail in-flight handshakes immediately instead of burning the full
      // timeout when the process is already gone.
      for (const f of this.waiterFails.splice(0)) f(new Error(`engine died during handshake: ${reason}`));
      this.waiters = [];
      for (const h of this.deathHandlers) h(reason);
    });
    // Avoid unhandled rejection noise when nobody awaits the exit promise.
    exitP.catch(() => undefined);

    transport.onLine(line => this.handleLine(line));
    transport.onIOError(err => {
      this.logger?.warn?.(`${this.profile.id} IO error: ${err.message}`);
    });

    await this.roundTrip(uciCommands.uci(), 'uciok', events => {
      for (const ev of events) {
        if (ev.kind === 'id' && ev.name) this.engineName = ev.name;
        if (ev.kind === 'option') this.options.set(ev.option.name, ev.option);
      }
    });

    for (const [name, value] of Object.entries(this.profile.defaultOptions)) {
      this.send(uciCommands.setOption(name, value));
    }
    await this.ready();
    this.alive = true;
  }

  /** Apply extra options (Threads/Hash/EvalFile/...), then verify readiness. */
  async setOptions(options: Record<string, UciOptionValue>): Promise<void> {
    this.assertAlive();
    for (const [name, value] of Object.entries(options)) {
      this.send(uciCommands.setOption(name, value));
    }
    await this.ready();
  }

  async newGame(): Promise<void> {
    this.assertAlive();
    this.send(uciCommands.newGame());
    await this.ready();
  }

  /**
   * Run one blocking search. Info lines are streamed through `onInfo`.
   * Only one search runs at a time; concurrent calls are queued FIFO.
   */
  async search(
    position: SearchPosition,
    limits: GoLimits,
    onInfo?: (info: EngineInfo) => void,
  ): Promise<SearchResult> {
    this.assertAlive();

    const run = (): Promise<SearchResult> =>
      new Promise<SearchResult>((resolve, reject) => {
        this.pending.push({ resolve, reject, onInfo });
        this.send(uciCommands.position(position));
        this.send(uciCommands.go(limits));
      });

    // Serialize searches FIFO: each run starts only after the previous one
    // settled (a UCI engine has exactly one active `go` at a time).
    const queued = this.queueTail.then(run, run);
    this.queueTail = queued.catch(() => undefined);
    return queued;
  }
  private queueTail: Promise<unknown> = Promise.resolve();

  /** Abort the active search early; its promise resolves with bestmove-so-far. */
  stop(): void {
    if (this.transport && this.alive) this.send(uciCommands.stop());
  }

  async quit(): Promise<void> {
    if (!this.transport) return;
    try {
      this.send(uciCommands.quit());
    } catch {
      /* process may already be gone */
    }
    this.transport.kill();
    this.transport = null;
    this.alive = false;
  }

  // -------------------------------------------------------------------------

  private send(line: string): void {
    if (!this.transport) throw new Error(`${this.profile.id}: not started`);
    this.logger?.debug?.(`>> ${line}`);
    this.transport.write(line);
  }

  private assertAlive(): void {
    if (this.deathReason) throw new Error(`engine dead: ${this.deathReason}`);
    if (!this.alive) throw new Error('engine not started');
  }

  private ready(): Promise<void> {
    return this.roundTrip(uciCommands.isReady(), 'readyok', () => undefined);
  }

  /** Send a command, buffer events until `until` arrives, then settle. */
  private roundTrip(
    command: string,
    until: 'uciok' | 'readyok',
    absorb: (events: UciEvent[]) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const collected: UciEvent[] = [];
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.profile.id}: timeout waiting for ${until}`));
      }, HANDSHAKE_TIMEOUT_MS);

      const waiter = (ev: UciEvent): boolean => {
        collected.push(ev);
        if (ev.kind === until) {
          clearTimeout(timer);
          cleanup();
          absorb(collected);
          resolve();
          return true;
        }
        return false;
      };

      const cleanup = () => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        this.waiterFails = this.waiterFails.filter(f => f !== fail);
      };
      const fail = (err: Error) => {
        clearTimeout(timer);
        cleanup();
        reject(err);
      };
      this.waiters.push(waiter);
      this.waiterFails.push(fail);
      this.send(command);
    });
  }

  private handleLine(raw: string): void {
    if (raw.trim().length === 0) return;
    const event = parseUciLine(raw);
    this.logger?.debug?.(`<< ${raw}`);

    // Handshake-phase waiters consume first.
    for (let i = 0; i < this.waiters.length; i += 1) {
      const waiter = this.waiters[i];
      if (waiter && waiter(event)) {
        this.waiters.splice(i, 1);
        return;
      }
    }

    switch (event.kind) {
      case 'bestmove': {
        const p = this.pending.shift();
        // Engines emit "(none)" / "(null)" when no legal move exists.
        const mv =
          event.move === '(none)' || event.move === '(null)' ? null : event.move;
        if (p) p.resolve({ bestmove: mv, ...(event.ponder ? { ponder: event.ponder } : {}) });
        else this.logger?.warn?.('bestmove without active search');
        break;
      }
      case 'info': {
        const current = this.pending[this.pending.length - 1];
        current?.onInfo?.(event.info);
        break;
      }
      case 'unparsed':
        if (event.line.trim()) this.logger?.debug?.(`(ignored) ${event.line}`);
        break;
      default:
        break;
    }
  }
}
