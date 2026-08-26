import { describe, expect, it, vi } from 'vitest';
import type { EngineRunnerFactory, EngineTurnRunner } from '../src/runner';
import { GameSession, type SessionEvent } from '../src/session';
import { GameClock } from '../src/clock';
import { ChessRules } from '@chesslab/rules-chess';
import { XiangqiRules } from '@chesslab/rules-xiangqi';

const CHESS_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Scripted engine: always answers with a fixed move for the requested side. */
function scriptedRunner(bestmove: string): EngineTurnRunner {
  return {
    profileId: 'fake',
    async requestMove({ onInfo }) {
      onInfo?.({ depth: 1, scoreCp: 10, pv: [bestmove] });
      return { bestmove };
    },
    cancel() {},
    async dispose() {},
  };
}

/** Scripted engine that also records every request for assertions. */
function recordingRunner(moves: string[]): { runner: EngineTurnRunner; requests: { fen: string; moves: string[] }[] } {
  const requests: { fen: string; moves: string[] }[] = [];
  let i = 0;
  return {
    requests,
    runner: {
      profileId: 'fake',
      async requestMove(args) {
        requests.push({ fen: args.fen, moves: [...args.moves] });
        const mv = moves[Math.min(i, moves.length - 1)] ?? null;
        i += 1;
        return { bestmove: mv };
      },
      cancel() {},
      async dispose() {},
    },
  };
}

function factoryFor(movesByCall: string[]): EngineRunnerFactory {
  let call = 0;
  return () => {
    const move = movesByCall[Math.min(call, movesByCall.length - 1)] ?? 'e2e4';
    call += 1;
    return scriptedRunner(move);
  };
}

async function collect(session: GameSession): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];
  session.subscribe(e => events.push(e));
  return events;
}

describe('GameSession (human vs engine)', () => {
  it('lets the human move first and the engine reply', async () => {
    // Human plays e4 -> engine replies e5.
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'human', side: 'w', name: 'You' },
      black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 5 },
      engineRunnerFactory: factoryFor(['e7e5']),
    });
    const events = await collect(session);
    await session.start();

    expect(session.playHumanMove('e2e4')).toBe(true);
    // Give the queued engine turn a tick to resolve.
    await vi.waitFor(() => {
      expect(events.some(e => e.kind === 'move' && e.by === 'b' && e.uci === 'e7e5')).toBe(true);
    });

    expect(session.rules.fen()).toContain('w KQkq'); // after 1.e4 e5 white to move
    await session.dispose();
  });

  it('emits thinking/engineInfo/result lifecycle events', async () => {
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'engine', side: 'w', profileId: 'stockfish', strengthLevel: 3 },
      black: { kind: 'human', side: 'b' },
      engineRunnerFactory: factoryFor(['e2e4']),
    });
    const events = await collect(session);
    await session.start();

    await vi.waitFor(() => {
      const kinds = events.map(e => e.kind);
      expect(kinds).toContain('thinking');
      expect(kinds).toContain('engineInfo');
    });
    const info = events.find(e => e.kind === 'engineInfo');
    expect(info && info.kind === 'engineInfo' && info.info.scoreCp).toBe(10);
    expect(events.some(e => e.kind === 'turn' && e.side === 'b')).toBe(true);

    session.resign('b');
    expect(session.finalResult).toEqual({ winner: 'w', reason: 'resign' });
    await session.dispose();
  });

  it('undo pops back to the human turn in vs-engine games', async () => {
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'human', side: 'w' },
      black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 1 },
      engineRunnerFactory: factoryFor(['e7e5']),
    });
    await collect(session);
    await session.start();
    session.playHumanMove('e2e4');
    await vi.waitFor(() => expect(session.rules.history()).toHaveLength(2));

    expect(session.undo()).toBe(true);
    // Both plies gone; white (human) to move again.
    expect(session.rules.history()).toHaveLength(0);
    expect(session.rules.turn()).toBe('w');

    session.playHumanMove('d2d4');
    await vi.waitFor(() => expect(session.rules.history()).toHaveLength(2));
    await session.dispose();
  });

  it('rejects human input when it is not their turn or illegal', async () => {
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'human', side: 'w' },
      black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 1 },
      engineRunnerFactory: factoryFor(['e7e5']),
    });
    await session.start();

    expect(session.playHumanMove('e2e6')).toBe(false); // illegal
    expect(session.playHumanMove('e2e4')).toBe(true);

    // Engine is now "thinking"; human input must be ignored.
    expect(session.playHumanMove('d2d4')).toBe(false);
    await session.dispose();
  });

  it('feeds engines the full move history, not a bare FEN (repetition awareness)', async () => {
    const rec = recordingRunner(['e7e5']);
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'human', side: 'w' },
      black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 1 },
      engineRunnerFactory: () => rec.runner,
    });
    await collect(session);
    await session.start();
    session.playHumanMove('e2e4');

    await vi.waitFor(() => expect(rec.requests.length).toBeGreaterThan(0));
    expect(rec.requests[0]).toEqual({ fen: CHESS_START, moves: ['e2e4'] });
    await session.dispose();
  });

  it('hint requests also carry the full history', async () => {
    const rec = recordingRunner(['e7e5', 'g1f3']);
    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'human', side: 'w' },
      black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 1 },
      engineRunnerFactory: () => rec.runner,
    });
    await session.start();
    session.playHumanMove('e2e4');
    await vi.waitFor(() => expect(rec.requests).toHaveLength(1));

    // hint() lazily reuses the same factory/runner — its second request is for white to move.
    const mv = await session.hint();
    expect(mv?.uci).toBe('g1f3');
    expect(rec.requests).toHaveLength(2);
    expect(rec.requests[1]).toEqual({ fen: CHESS_START, moves: ['e2e4', 'e7e5'] });
    await session.dispose();
  });
});

describe('GameSession xiangqi repetition adjudication (长将)', () => {
  // Black king d9, red rook a8, red king e0. The engine (white) toggles the
  // rook a8<->a9 checking on EVERY ply; the human king shuttles d9<->d8.
  // Third occurrence of the start position → 长将判负 against the engine.
  const SHUTTLE_FEN = '3k5/R8/9/9/9/9/9/9/9/4K4 w - - 0 1';

  it('declares the perpetual-checking ENGINE the loser', async () => {
    const rec = recordingRunner(['a8a9', 'a9a8', 'a8a9', 'a9a8']);
    const session = new GameSession({
      rules: new XiangqiRules(SHUTTLE_FEN),
      white: { kind: 'engine', side: 'w', profileId: 'pikafish', strengthLevel: 6 },
      black: { kind: 'human', side: 'b' },
      engineRunnerFactory: () => rec.runner,
    });
    const events = await collect(session);
    await session.start();

    for (const human of ['d9d8', 'd8d9', 'd9d8', 'd8d9']) {
      await vi.waitFor(() => {
        expect(session.currentPlayerConfig()?.kind).toBe('human');
      });
      expect(session.playHumanMove(human)).toBe(true);
    }

    await vi.waitFor(() => expect(session.over).toBe(true), { timeout: 2000 });
    expect(session.finalResult).toEqual({ winner: 'b', reason: 'perpetual-check' });
    expect(events.some(e => e.kind === 'result')).toBe(true);
    await session.dispose();
  });

  it('candidateGuard reaches the runner and admits fresh moves', async () => {
    let capturedGuard: ((mv: string) => boolean) | undefined;
    let requests = 0;
    const probeRunner: EngineTurnRunner = {
      profileId: 'fake',
      async requestMove(args) {
        capturedGuard = args.guardCandidate;
        requests += 1;
        return { bestmove: null };
      },
      cancel() {},
      async dispose() {},
    };
    const session = new GameSession({
      rules: new XiangqiRules(SHUTTLE_FEN),
      white: { kind: 'engine', side: 'w', profileId: 'pikafish', strengthLevel: 6 },
      black: { kind: 'human', side: 'b' },
      engineRunnerFactory: () => probeRunner,
    });
    await session.start();
    await vi.waitFor(() => expect(requests).toBeGreaterThan(0));

    // Fresh position → allowed. (Veto counting semantics are covered by the
    // rules-layer occurrencesAfter tests.)
    expect(capturedGuard).toBeDefined();
    expect(capturedGuard!('a8a7')).toBe(true);
    await session.dispose();
  });
});

describe('GameSession (engine vs engine)', () => {
  it('chains moves until a terminal result', async () => {
    // Scripted Fool's Mate: white 1.f3 g4?, black answers 1...e5 2...Qh4#.
    function seqRunner(moves: string[]): EngineTurnRunner {
      let i = 0;
      return {
        profileId: 'fake',
        async requestMove() {
          const mv = i < moves.length ? (moves[i] ?? null) : null;
          i += 1;
          return { bestmove: mv };
        },
        cancel() {},
        async dispose() {},
      };
    }

    const session = new GameSession({
      rules: new ChessRules(),
      white: { kind: 'engine', side: 'w', profileId: 'stockfish', strengthLevel: 1 },
      black: { kind: 'engine', side: 'b', profileId: 'stockfish', strengthLevel: 20 },
      engineRunnerFactory: args =>
        args.strengthLevel === 20
          ? seqRunner(['e7e5', 'd8h4'])
          : seqRunner(['f2f3', 'g2g4']),
    });
    await collect(session);
    await session.start();

    await vi.waitFor(
      () => {
        expect(session.over).toBe(true);
      },
      { timeout: 2000 },
    );
    expect(session.finalResult).toMatchObject({ winner: 'b', reason: 'checkmate' });
    expect(session.rules.history().map(h => h.uci)).toEqual([
      'f2f3',
      'e7e5',
      'g2g4',
      'd8h4',
    ]);
    await session.dispose();
  }, 5000);
});

describe('GameClock flagging', () => {
  it('flags the active side when their time elapses (injected clock)', () => {
    let fakeNow = 0;
    let flagged: 'w' | 'b' | null = null;

    // Injected timer never actually ticks; elapsed time is driven by fakeNow.
    const fakeSetInterval = (() => 0) as unknown as typeof setInterval;
    const clock = new GameClock(
      { initialMs: 1000, incrementMs: 0 },
      { onFlag: s => (flagged = s) },
      fakeSetInterval,
      () => undefined,
      () => fakeNow,
    );

    clock.start('w');
    expect(flagged).toBeNull();

    fakeNow += 5_000; // way past the 1s budget
    const state = clock.stop(); // stop() performs a final tick

    expect(flagged).toBe('w');
    expect(state.remainingW).toBe(0);
    expect(state.running).toBe(false);
  });

  it('adds increment after each completed move', () => {
    let fakeNow = 1000;
    const clock = new GameClock(
      { initialMs: 60_000, incrementMs: 500 },
      { onFlag: () => undefined },
      (() => 0) as unknown as typeof setInterval,
      () => undefined,
      () => fakeNow,
    );
    clock.start('w');
    fakeNow += 2_000; // white thought for 2s
    clock.switchTo('b');
    const s = clock.state();
    expect(s.remainingW).toBe(58_500); // 60000 - 2000 + 500
    expect(s.activeSide).toBe('b');
  });

  it('pause freezes the budget; elapsed paused time is not charged', () => {
    let fakeNow = 1000;
    const clock = new GameClock(
      { initialMs: 60_000, incrementMs: 0 },
      { onFlag: () => undefined },
      (() => 0) as unknown as typeof setInterval,
      () => undefined,
      () => fakeNow,
    );
    clock.start('w');
    fakeNow += 5_000; // think 5s
    const snap = clock.pause();
    expect(snap.remainingW).toBe(55_000);

    fakeNow += 120_000; // two minutes pass while suspended — not charged
    clock.resume();
    fakeNow += 1_000; // one more active second after resume
    const st = clock.stop();
    expect(st.remainingW).toBe(54_000);
    expect(st.running).toBe(false);
  });
});
