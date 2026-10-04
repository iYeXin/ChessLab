import { describe, expect, it } from 'vitest';
import { XiangqiRules } from '@chessnext/rules-xiangqi';
import { flipMoveIndex, indexToIccs, moveToIndex } from '../src/encoding';
import { createOnnxRunner, inferPosition, MATE_GUARD_TOP_K } from '../src/runner';
import { temperaturePreset } from '../src/temperature';
import { NMOVE, type OnnxOutputs, type OnnxSession } from '../src/types';

const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
const BLACK_TO_MOVE_FEN = INITIAL_FEN.replace(' w ', ' b ');

/** Session stub: returns logits with spikes at chosen move indices. */
class FakeSession implements OnnxSession {
  readonly backend = 'fake';
  runs = 0;
  constructor(
    private readonly spikes: Record<number, number>,
    private readonly value = new Float32Array([2, 0, 0]),
  ) {}
  async run(): Promise<OnnxOutputs> {
    this.runs += 1;
    const policy = new Float32Array(NMOVE).fill(-10);
    for (const [k, v] of Object.entries(this.spikes)) policy[Number(k)] = v;
    return { policy, value: this.value };
  }
  dispose(): void {}
}

const args = (session: OnnxSession, rules: XiangqiRules, mateGuard = false) => ({
  session,
  rules,
  preset: temperaturePreset('greedy'),
  mateGuard,
  rng: () => 0.5,
});

describe('ONNX inference: side-to-move view handling', () => {
  it('picks the model-preferred move when Red is to move', async () => {
    const target = moveToIndex('h2e2');
    const session = new FakeSession({ [target]: 30 });
    const res = await inferPosition(args(session, new XiangqiRules(INITIAL_FEN)));
    expect(indexToIccs(res.bestMove)).toBe('h2e2');
    expect(res.top[0]!.iccs).toBe('h2e2');
    expect(res.value.win).toBeGreaterThan(0.5);
  });

  it('★ applies the 8099 - m flip when Black is to move', async () => {
    // The model sees Black's "h9g7" (ICCS) as flipMoveIndex(moveToIndex('h9g7')).
    const realMove = moveToIndex('h9g7');
    const modelMove = flipMoveIndex(realMove);
    expect(modelMove).not.toBe(realMove);

    const session = new FakeSession({ [modelMove]: 30 });
    const res = await inferPosition(args(session, new XiangqiRules(BLACK_TO_MOVE_FEN)));
    expect(indexToIccs(res.bestMove)).toBe('h9g7');
  });

  it('only ever returns a legal move, for both sides', async () => {
    for (const fen of [INITIAL_FEN, BLACK_TO_MOVE_FEN]) {
      const rules = new XiangqiRules(fen);
      const legal = new Set(rules.moves().map(m => m.uci));
      // Spike an ILLEGAL high index plus one legal one.
      const session = new FakeSession({ 0: 99, [moveToIndex(rules.moves()[0]!.uci)]: 50 });
      const res = await inferPosition(args(session, new XiangqiRules(fen)));
      expect(legal.has(indexToIccs(res.bestMove))).toBe(true);
    }
  });

  it('returns no move when the side to move has none', async () => {
    // Red to move and already checkmated (rules-level fixture).
    const fen = 'rnbakab1r/9/1c5c1/p1p5p/4p1p2/4P1P2/P1P3nCP/1C3A3/4NK3/RNB2AB1R w - - 0 1';
    const rules = new XiangqiRules(fen);
    expect(rules.moves().length).toBe(0);
    const session = new FakeSession({});
    const res = await inferPosition(args(session, rules));
    expect(res.bestMove).toBe(-1);
    expect(session.runs).toBe(0); // no inference wasted
  });
});

describe('ONNX inference: mate guard', () => {
  // Synthetic rules-level fixture (found by brute force over small rook
  // endings): Red to move and e0f0 leaves Black with no legal reply, while
  // every other Red move does not. The guard's contract is defined against this
  // same rules library, so the test is meaningful even though such a position
  // is not reachable in a normal game.
  const MATE_FEN = '4k4/3R5/9/9/9/9/9/9/9/R3K4 w - - 0 1';
  const WINNING = 'e0f0';

  it('plays the immediate win even though the model prefers another move', async () => {
    const rules = new XiangqiRules(MATE_FEN);
    const decoy = rules.moves().map(m => m.uci).find(u => u !== WINNING);
    expect(decoy, 'fixture must offer a non-winning alternative').toBeTruthy();

    const session = new FakeSession({ [moveToIndex(decoy!)]: 99 });
    const res = await inferPosition(args(session, new XiangqiRules(MATE_FEN), true));
    expect(indexToIccs(res.bestMove)).toBe(WINNING);
    // The guard wins before spending an inference.
    expect(session.runs).toBe(0);
  });

  it('lets the model choose when the guard is disabled', async () => {
    const rules = new XiangqiRules(MATE_FEN);
    const decoy = rules.moves().map(m => m.uci).find(u => u !== WINNING)!;

    const session = new FakeSession({ [moveToIndex(decoy)]: 99 });
    const res = await inferPosition(args(session, new XiangqiRules(MATE_FEN), false));
    expect(indexToIccs(res.bestMove)).toBe(decoy);
    expect(session.runs).toBe(1);
  });

  it('keeps the model choice in the opening where no win exists', async () => {
    const target = moveToIndex('h2e2');
    const session = new FakeSession({ [target]: 30 });
    const res = await inferPosition(args(session, new XiangqiRules(INITIAL_FEN), true));
    expect(indexToIccs(res.bestMove)).toBe('h2e2');
    expect(session.runs).toBe(1);
  });
});

describe('createOnnxRunner', () => {
  it('rebuilds the position from fen + moves and answers in ICCS', async () => {
    const target = moveToIndex('h2e2');
    const session = new FakeSession({ [target]: 30 });
    const runner = createOnnxRunner({
      session,
      createRules: fen => new XiangqiRules(fen),
      temperaturePreset: 'greedy',
      mateGuard: true,
      rng: () => 0.5,
    });
    expect(runner.profileId).toBe('onnx-tier');

    const { bestmove } = await runner.requestMove({
      fen: INITIAL_FEN,
      moves: [],
      level: 10,
    });
    expect(bestmove).toBe('h2e2');
  });

  it('replays the move list so the model scores the live position', async () => {
    // After 1. h2e2 it is Black's turn; the runner must answer as Black.
    const realMove = moveToIndex('b9c7');
    const session = new FakeSession({ [flipMoveIndex(realMove)]: 30 });
    const runner = createOnnxRunner({
      session,
      createRules: fen => new XiangqiRules(fen),
      temperaturePreset: 'greedy',
      mateGuard: false,
      rng: () => 0.5,
    });
    const { bestmove } = await runner.requestMove({
      fen: INITIAL_FEN,
      moves: ['h2e2'],
      level: 10,
    });
    expect(bestmove).toBe('b9c7');
  });

  it('exposes a bounded mate-guard window', () => {
    expect(MATE_GUARD_TOP_K).toBeGreaterThan(0);
    expect(MATE_GUARD_TOP_K).toBeLessThanOrEqual(20);
  });
});
