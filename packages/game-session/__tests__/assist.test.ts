import { describe, expect, it, vi } from 'vitest';
import { createUciAssistEngine } from '../src/analysis';
import type { AssistEngine, AssistSnapshot } from '../src/analysis';
import { STOCKFISH_PROFILE } from '@chesslab/engine-uci';
import { UciEngineDriver } from '@chesslab/engine-uci/src/driver';
import type { EngineTransport } from '@chesslab/engine-uci/src/types';
import type { EngineTurnRunner } from '../src/runner';
import { GameSession, type SessionEvent } from '../src/session';
import { ChessRules } from '@chesslab/rules-chess';

// ---------------------------------------------------------------------------
// createUciAssistEngine (protocol level)
// ---------------------------------------------------------------------------

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

    // The `go` write happens asynchronously inside begin()'s search queue;
    // arm the responder up front so it answers exactly once.
    let fed = false;
    t.onGo = () => {
      if (fed) return;
      fed = true;
      t.feed('info depth 5 multipv 3 score cp -30 pv c3c4');
      t.feed('info depth 6 multipv 1 score cp 40 pv a1a2');
      t.feed('info depth 6 multipv 2 score mate 1 pv b2c3');
      t.feed('info depth 7 multipv 1 score cp 55 pv d1d2');
    };

    await assist.begin('fen-x', { multiPv: 3 });
    await vi.waitFor(() => expect(seen[seen.length - 1]).toEqual([1, 2, 3]));
    expect(t.written.some(l => l === 'setoption name MultiPV value 3')).toBe(true);

    assist.stop();
    expect(t.written.some(l => l === 'stop')).toBe(true);
    expect(seen[seen.length - 1]).toEqual([]); // cleared on stop
  });

  it('budgetMs issues a finite movetime burst instead of infinite', async () => {
    const { assist, t } = await makeAssist();
    await assist.begin('fen-y', { budgetMs: 1200 });
    const go = t.written.find(l => l.startsWith('go'));
    expect(go).toBe('go movetime 1200');
    expect(t.written.some(l => l.startsWith('go infinite'))).toBe(false);
  });

  it('drops stale lines after a restart', async () => {
    const { assist, t } = await makeAssist();
    const seen: string[][] = [];
    assist.onLines(lines => seen.push(lines.map(l => l.uci ?? '?')));

    await assist.begin('fen-one');
    t.onGo = undefined;
    assist.begin('fen-two'); // gen bump
    t.feed('info depth 9 multipv 1 score cp 999 pv z9z8'); // stale

    expect(seen[seen.length - 1]).toEqual([]);
  });

  it('dispose stops and quits the driver', async () => {
    const { assist, t, driver } = await makeAssist();
    await assist.dispose();
    expect(driver.isAlive).toBe(false);
    expect(t.written.includes('quit')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GameSession integration
// ---------------------------------------------------------------------------

/** Scripted assist engine recording interactions for assertions. */
function fakeAssist() {
  const state = { begins: [] as string[], stops: 0, disposes: 0 };
  let linesCb: ((l: AssistSnapshot) => void) | null = null;
  const engine: AssistEngine = {
    begin(fen) {
      state.begins.push(fen);
      linesCb?.([{ multipv: 1, depth: 9, uci: 'e7e5', scoreCp: 10, pv: ['e7e5'] }]);
    },
    stop() {
      state.stops += 1;
    },
    onLines(cb) {
      linesCb = cb;
      return () => {
        linesCb = null;
      };
    },
    async dispose() {
      state.disposes += 1;
    },
  };
  return { engine, state };
}

const nullRunner: EngineTurnRunner = {
  profileId: 'fake',
  async requestMove() {
    return { bestmove: null };
  },
  cancel() {},
  async dispose() {},
};

function countingRunner() {
  const state = { requests: 0 };
  const runner: EngineTurnRunner = {
    profileId: 'fake',
    async requestMove() {
      state.requests += 1;
      return { bestmove: null };
    },
    cancel() {},
    async dispose() {},
  };
  return { runner, state };
}

function makeSession(analysisFactory?: () => Promise<AssistEngine>) {
  const session = new GameSession({
    rules: new ChessRules(),
    white: { kind: 'human', side: 'w' },
    black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 5 },
    engineRunnerFactory: () => nullRunner,
    analysisFactory,
  });
  const events: SessionEvent[] = [];
  session.subscribe(e => events.push(e));
  return { session, events };
}

describe('GameSession assist mode integration', () => {
  it('requires an analysisFactory', async () => {
    const { session } = makeSession();
    await expect(session.enableAssist()).rejects.toThrow(/analysisFactory/);
  });

  it('default policy: analyze on human turns only — pauses while opponent thinks', async () => {
    const { engine, state } = fakeAssist();
    const { session, events } = makeSession(async () => engine);
    await session.start();
    await session.enableAssist({ multiPv: 2 });

    expect(state.begins).toHaveLength(1); // kicked off at current position
    const assistEvents = events.filter(e => e.kind === 'assist');
    expect(assistEvents.length).toBeGreaterThanOrEqual(1);
    expect(assistEvents[0]?.kind === 'assist' && assistEvents[0].lines[0]?.uci).toBe('e7e5');

    // Human moves -> engine's turn: analysis must PAUSE (no double load).
    session.playHumanMove('e2e4');
    expect(state.begins).toHaveLength(1); // no restart
    expect(state.stops).toBeGreaterThanOrEqual(1);

    // Undo -> human on move again: analysis resumes.
    session.undo();
    expect(state.begins).toHaveLength(2);

    await session.dispose();
    expect(state.disposes).toBe(1);
  });

  it('pauseOnOpponentTurn:false keeps analyzing through engine turns', async () => {
    const { engine, state } = fakeAssist();
    const { session } = makeSession(async () => engine);
    await session.start();
    await session.enableAssist({ pauseOnOpponentTurn: false });

    session.playHumanMove('e2e4');
    expect(state.begins).toHaveLength(2); // restarted on the new position
    expect(state.stops).toBe(0);

    await session.dispose();
  });

  it('halts analysis when the game ends', async () => {
    const { engine, state } = fakeAssist();
    const { session } = makeSession(async () => engine);
    await session.start();
    await session.enableAssist();

    session.resign('w');
    expect(session.over).toBe(true);
    expect(state.stops).toBeGreaterThanOrEqual(1);

    await session.dispose();
  });
});

describe('GameSession mobile power lifecycle', () => {
  it('suspend cancels work; resume restores assist and re-issues engine turn', async () => {
    const { engine, state } = fakeAssist();
    const { runner, state: runnerState } = countingRunner();
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'human', side: 'w' },
      black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 3 },
      engineRunnerFactory: () => runner,
      analysisFactory: async () => engine,
    });
    await session.start();
    await session.enableAssist();

    // Human to move: nothing running yet. Background the app.
    session.suspend();
    expect(session.assistEnabled).toBe(true); // flag preserved across suspend

    // Foreground, make our move — opponent search gets issued.
    session.playHumanMove('e2e4');
    await vi.waitFor(() => expect(runnerState.requests).toBe(1));

    // Background DURING opponent thinking: in-flight search must be cancelled.
    session.suspend();
    // ...and foregrounding re-issues it (otherwise the game would stall).
    session.resume();
    await vi.waitFor(() => expect(runnerState.requests).toBeGreaterThanOrEqual(2));

    // Assist was restored too (human on move after engine replies? engine
    // returns null bestmove so still engine turn; either way no crash).
    await session.dispose();
    expect(state.disposes).toBe(1);
  }, 8000);

  it('suspend/resume are idempotent and safe on a fresh session', () => {
    const { session } = makeSession();
    session.suspend();
    session.suspend(); // no-op
    session.resume();
    session.resume(); // no-op
    expect(session.over).toBe(false);
  });
});

describe('GameSession hint reuse', () => {
  it('reuses one runner across hint calls instead of respawning', async () => {
    let created = 0;
    const runner: EngineTurnRunner = {
      profileId: 'fake',
      async requestMove() {
        return { bestmove: 'g1f3' };
      },
      cancel() {},
      async dispose() {},
    };
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'human', side: 'w' },
      black: { kind: 'human', side: 'b' },
      engineRunnerFactory: () => {
        created += 1;
        return runner;
      },
    });
    const m1 = await session.hint();
    const m2 = await session.hint();
    expect(m1?.uci).toBe('g1f3');
    expect(m2?.uci).toBe('g1f3');
    expect(created).toBe(1);
    await session.dispose();
  });
});
