import { describe, expect, it, vi } from 'vitest';
import type { AssistEngine, AssistSnapshot } from '../src/analysis';
import type { EngineTurnRunner } from '../src/runner';
import { GameSession, type SessionEvent } from '../src/session';
import { ChessRules } from '@chesslab/rules-chess';

/** Scripted assist engine recording interactions for assertions. */
function fakeAssist() {
  const state = { begins: [] as string[], stops: 0, disposes: 0 };
  let linesCb: ((l: AssistSnapshot) => void) | null = null;
  const engine: AssistEngine = {
    begin(fen) {
      state.begins.push(fen);
      linesCb?.([
        { multipv: 1, depth: 9, uci: 'e7e5', scoreCp: 10, pv: ['e7e5'] },
      ]);
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

  it('refreshes analysis on moves and undo, emits assist line events', async () => {
    const { engine, state } = fakeAssist();
    const { session, events } = makeSession(async () => engine);
    await session.start();
    await session.enableAssist({ multiPv: 2 });

    // enableAssist kicks off analysis at the current position.
    expect(state.begins).toHaveLength(1);

    session.playHumanMove('e2e4');
    await vi.waitFor(() => expect(events.some(e => e.kind === 'assist')).toBe(true));
    expect(state.begins).toHaveLength(2);
    expect(state.begins[1]).not.toBe(state.begins[0]); // new fen

    const assistEvents = events.filter(e => e.kind === 'assist');
    const last = assistEvents[assistEvents.length - 1];
    expect(last?.kind).toBe('assist');
    expect(last?.kind === 'assist' ? last.lines[0]?.uci : undefined).toBe('e7e5');

    // Undo also refreshes (turn event fires after undo too).
    const before = state.begins.length;
    session.undo();
    expect(state.begins.length).toBe(before + 1);

    // Disable halts the search.
    session.disableAssist();
    expect(session.assistEnabled).toBe(false);
    expect(state.stops).toBeGreaterThanOrEqual(1);

    await session.dispose();
    expect(state.disposes).toBe(1);
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
