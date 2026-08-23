import { describe, expect, it, vi } from 'vitest';
import { createUciAssistEngine } from '../src/analysis';
import { STOCKFISH_PROFILE } from '@chesslab/engine-uci';
import { UciEngineDriver } from '@chesslab/engine-uci/src/driver';
import type { EngineTransport } from '@chesslab/engine-uci/src/types';

class ScriptedTransport implements EngineTransport {
  written: string[] = [];
  private lineCbs = new Set<(line: string) => void>();
  private resolveExit!: (code: number | null) => void;
  readonly exited = new Promise<number | null>(r => (this.resolveExit = r));
  onGo?: () => void;

  write(line: string): void {
    this.written.push(line);
    if (line === 'uci') {
      this.feed('id name Stockfish 18');
      this.feed('option name MultiPV type spin default 1 min 1 max 500');
      this.feed('uciok');
    } else if (line === 'isready') {
      this.feed('readyok');
    } else if (line.startsWith('go')) {
      this.onGo?.();
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

async function makeAssist() {
  const t = new ScriptedTransport();
  const driver = new UciEngineDriver(STOCKFISH_PROFILE);
  await driver.start(t);
  const assist = createUciAssistEngine(driver);
  return { assist, t, driver };
}

describe('createUciAssistEngine', () => {
  it('aggregates MultiPV lines sorted best-first', async () => {
    const { assist, t } = await makeAssist();
    const seen: number[][] = [];
    assist.onLines(lines => seen.push(lines.map(l => l.multipv)));

    // Arm responder before begin(): go is written synchronously inside.
    let goCount = 0;
    t.onGo = () => {
      goCount += 1;
      if (goCount !== 2) return; // first `go` belongs to... none; guard anyway
    };

    // Fire begin but do not await completion of the infinite search promise;
    // begin() resolves after options+search dispatch.
    const beginP = assist.begin('fen-x', { multiPv: 3 });
    t.onGo = () => {
      t.feed('info depth 5 multipv 3 score cp -30 pv c3c4');
      t.feed('info depth 6 multipv 1 score cp 40 pv a1a2');
      t.feed('info depth 6 multipv 2 score mate 1 pv b2c3');
      t.feed('info depth 7 multipv 1 score cp 55 pv d1d2');
    };
    await beginP;

    const last = seen[seen.length - 1];
    expect(last).toEqual([1, 2, 3]);
    expect(t.written.some(l => l === 'setoption name MultiPV value 3')).toBe(true);
    expect(t.written.some(l => l.startsWith('go infinite'))).toBe(true);

    assist.stop();
    expect(t.written.some(l => l === 'stop')).toBe(true);
    await vi.waitFor(() => expect(seen[seen.length - 1]).toEqual([])); // cleared
  });

  it('drops stale lines after a restart', async () => {
    const { assist, t } = await makeAssist();
    const seen: string[][] = [];
    assist.onLines(lines => seen.push(lines.map(l => l.uci ?? '?')));

    await assist.begin('fen-one');
    t.onGo = undefined;
    assist.begin('fen-two'); // gen bump
    t.feed('info depth 9 multipv 1 score cp 999 pv z9z8'); // stale for fen-one

    expect(seen[seen.length - 1]).toEqual([]);
  });

  it('dispose stops and quits the driver', async () => {
    const { assist, t, driver } = await makeAssist();
    await assist.dispose();
    expect(driver.isAlive).toBe(false);
    expect(t.written.includes('quit')).toBe(true);
  });
});
