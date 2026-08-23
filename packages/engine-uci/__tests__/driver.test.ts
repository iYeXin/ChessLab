import { describe, expect, it, vi } from 'vitest';
import { UciEngineDriver } from '../src/driver';
import { STOCKFISH_PROFILE } from '../src/profiles';
import type { EngineTransport } from '../src/types';

/** Scriptable in-memory transport simulating a well-behaved UCI engine. */
class ScriptedTransport implements EngineTransport {
  written: string[] = [];
  private lineCbs = new Set<(line: string) => void>();
  private resolveExit!: (code: number | null) => void;
  readonly exited = new Promise<number | null>(r => (this.resolveExit = r));

  /** Called on every `go`; feed replies asynchronously from here. */
  onGo?: (line: string) => void = undefined;

  write(line: string): void {
    this.written.push(line);
    if (line === 'uci') {
      this.feed('id name Stockfish 18');
      this.feed('id author the Stockfish developers');
      this.feed('option name Threads type spin default 1 min 1 max 1024');
      this.feed('option name Hash type spin default 16 min 1 max 33554432');
      this.feed('option name MultiPV type spin default 1 min 1 max 500');
      this.feed('option name UCI_Elo type spin default 1320 min 1320 max 3190');
      this.feed('option name UCI_LimitStrength type check default false');
      this.feed('uciok');
    } else if (line === 'isready') {
      this.feed('readyok');
    } else if (line.startsWith('go')) {
      this.onGo?.(line);
    }
  }

  kill(): void {
    this.resolveExit(0);
  }

  onLine(cb: (line: string) => void): void {
    this.lineCbs.add(cb);
  }
  onIOError(_cb: (err: Error) => void): void {}

  feed(line: string): void {
    for (const cb of [...this.lineCbs]) cb(line);
  }
}

async function startedPair(
  configure?: (t: ScriptedTransport) => void,
): Promise<[UciEngineDriver, ScriptedTransport]> {
  const t = new ScriptedTransport();
  configure?.(t);
  const d = new UciEngineDriver(STOCKFISH_PROFILE);
  await d.start(t);
  return [d, t];
}

describe('UciEngineDriver', () => {
  it('performs handshake and records engine identity + options', async () => {
    const [driver] = await startedPair();
    expect(driver.name).toBe('Stockfish 18');
    expect(driver.isAlive).toBe(true);
    expect(driver.availableOptions.has('UCI_Elo')).toBe(true);
    await driver.quit();
  });

  it('sends profile defaults then isready right after uciok', async () => {
    const [driver, t] = await startedPair();
    expect(t.written).toEqual([
      'uci',
      'setoption name Threads value 2',
      'setoption name Hash value 128',
      'setoption name MultiPV value 1',
      'isready',
    ]);
    await driver.quit();
  });

  it('streams info and resolves with bestmove', async () => {
    const [driver, t] = await startedPair();
    const depths: number[] = [];

    // `go` is written synchronously inside search(), so arm the responder first.
    t.onGo = () => {
      t.onGo = undefined; // answer only this search
      t.feed('info depth 6 score cp 100 nodes 500 nps 10000 pv h1h8');
      t.feed('info depth 8 score mate 1 pv h1h8');
      t.feed('bestmove h1h8');
    };

    const r = await driver.search(
      { fen: 'k7/8/8/8/8/8/8/K6R w - - 0 1' },
      { movetimeMs: 100 },
      info => {
        if (info.depth !== undefined) depths.push(info.depth);
      },
    );

    expect(r.bestmove).toBe('h1h8');
    expect(depths).toEqual([6, 8]);
    await driver.quit();
  });

  it('maps "(none)" bestmove to null', async () => {
    const [driver, t] = await startedPair();
    const p = driver.search({ fen: 'k7/8/8/8/8/8/8/K7 w - - 0 1' }, { movetimeMs: 10 });
    // The queued search writes `go` asynchronously; wait for it, then answer.
    await vi.waitFor(() => expect(t.written.some(l => l.startsWith('go'))).toBe(true));
    t.feed('bestmove (none)');
    const r = await p;
    expect(r.bestmove).toBeNull();
    await driver.quit();
  });

  it('serializes concurrent searches FIFO', async () => {
    const [driver, t] = await startedPair();

    const p1 = driver.search({ fen: 'fen-one' }, { depth: 1 });
    const p2 = driver.search({ fen: 'fen-two' }, { depth: 1 });

    // The first search reaches the wire asynchronously (queued microtask).
    await vi.waitFor(() =>
      expect(t.written.filter(l => l.startsWith('position')).length).toBe(1),
    );
    expect(t.written.some(l => l.includes('fen-two'))).toBe(false);

    // Answer only the first `go`.
    await vi.waitFor(() => expect(t.written.some(l => l.startsWith('go'))).toBe(true));
    t.feed('bestmove e2e4');
    const r1 = await p1;
    expect(r1.bestmove).toBe('e2e4');

    // Now the second search gets its turn.
    await vi.waitFor(() => expect(t.written.some(l => l.includes('fen-two'))).toBe(true));
    t.feed('bestmove d2d4');
    const r2 = await p2;
    expect(r2.bestmove).toBe('d2d4');

    expect(t.written.filter(l => l.startsWith('position')).length).toBe(2);
    await driver.quit();
  });

  it('rejects pending searches and reports death when process exits', async () => {
    const t = new ScriptedTransport();
    const d = new UciEngineDriver(STOCKFISH_PROFILE);
    await d.start(t);

    const death = vi.fn();
    d.onEngineDied(death);
    // Never answer `go`.
    t.onGo = () => undefined;

    const p = d.search({}, { infinite: true });
    t.kill();

    await expect(p).rejects.toThrow(/engine died|exited/);
    expect(death).toHaveBeenCalledTimes(1);
    expect(d.isAlive).toBe(false);
  });

  it('applies strength options via setOptions and confirms readiness', async () => {
    const [driver, t] = await startedPair();
    const before = t.written.length;
    await driver.setOptions({ UCI_LimitStrength: true, UCI_Elo: 2000 });
    expect(t.written.slice(before)).toEqual([
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 2000',
      'isready',
    ]);
    await driver.quit();
  });
});
