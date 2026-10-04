import { describe, expect, it } from 'vitest';
import type { Side } from '@chessnext/rules-core';
import { adjudicateRepetition, positionKey, type ReplayRules } from '../src/adjudicate';
import { XiangqiRules } from '../src';

/**
 * 长将 fixture — single-rook perpetual check.
 *
 * Black king e9, red rook a9 (already checking along rank 9), black to move.
 * The king shuttles e9<->e8 while the rook toggles a9<->a8, delivering a
 * check on EVERY red ply. After two full laps the start position occurs for
 * the third time → red is 长将 and must LOSE.
 */
const PERPETUAL_CHECK_START = 'R3k4/9/9/9/9/9/9/9/9/3K5 b - - 0 1';
const CHECK_LAP = ['e9e8', 'a9a8', 'e8e9', 'a8a9'];

/** Mirror: BLACK rook perpetually checks; red to move. */
const PERPETUAL_CHECK_MIRROR = '3k5/9/9/9/9/9/9/9/9/r3K4 w - - 0 1';
const MIRROR_LAP = ['e0e1', 'a0a1', 'e1e0', 'a1a0'];

/** Benign repetition — advisor toggles, kings shuttle, nobody ever checks. */
const BENIGN_START = '4k4/9/9/9/9/9/9/9/4A4/5K3 b - - 0 1';
const BENIGN_LAP = ['e9e8', 'e1d0', 'e8e9', 'd0e1'];

function playLaps(r: XiangqiRules, laps: number[], movesPerLap: string[]): void {
  for (let i = 0; i < laps.length; i += 1) {
    for (const uci of movesPerLap) {
      expect(r.move(uci), `move ${uci} in lap ${i}`).not.toBeNull();
    }
  }
}

describe('XiangqiRules repetition adjudication (长将判负)', () => {
  it('rules the perpetual checker the LOSER at the third occurrence', () => {
    const r = new XiangqiRules(PERPETUAL_CHECK_START);
    playLaps(r, [1, 1], CHECK_LAP); // two full laps → third occurrence of start
    expect(r.result()).toEqual({ winner: 'b', reason: 'perpetual-check' });
  });

  it('is color-symmetric (black perpetual checker loses too)', () => {
    const r = new XiangqiRules(PERPETUAL_CHECK_MIRROR);
    playLaps(r, [1, 1], MIRROR_LAP);
    expect(r.result()).toEqual({ winner: 'w', reason: 'perpetual-check' });
  });

  it('stays a draw when neither side checks (benign repetition)', () => {
    const r = new XiangqiRules(BENIGN_START);
    playLaps(r, [1, 1], BENIGN_LAP);
    expect(r.result()).toEqual({ winner: null, reason: 'repetition' });
  });

  it('returns null before the third occurrence', () => {
    const r = new XiangqiRules(PERPETUAL_CHECK_START);
    playLaps(r, [1], CHECK_LAP); // one lap → second occurrence only
    expect(r.result()).toBeNull();
    expect(positionKey(r.fen())).toBe(positionKey(PERPETUAL_CHECK_START)); // board+turn equal, counters differ
  });

  it('keeps adjudication correct across undo/replay', () => {
    const r = new XiangqiRules(PERPETUAL_CHECK_START);
    playLaps(r, [1, 1], CHECK_LAP);
    expect(r.result()?.reason).toBe('perpetual-check');

    expect(r.undo()).toBe(true);
    expect(r.undo()).toBe(true);
    expect(r.result()).toBeNull(); // tracking unwound correctly

    // Re-close the cycle — adjudicates again.
    expect(r.move('e8e9')).not.toBeNull();
    expect(r.move('a8a9')).not.toBeNull();
    expect(r.result()).toEqual({ winner: 'b', reason: 'perpetual-check' });
  });

  it('occurrencesAfter counts would-be repeats (guardrail probe)', () => {
    const r = new XiangqiRules(PERPETUAL_CHECK_START);
    playLaps(r, [1], CHECK_LAP); // start position seen twice now (black to move)

    // From the start position (black to move) e9e8 recreates a position seen once before → count 2.
    expect(r.occurrencesAfter('e9e8')).toBe(2);
    // e9d9 is illegal (still in rook's line), so 0.
    expect(r.occurrencesAfter('e9d9')).toBe(0);
    // illegal input → 0.
    expect(r.occurrencesAfter('z9z9')).toBe(0);
  });

  it('still detects mate/stalemate ahead of repetition', () => {
    const r = new XiangqiRules(
      'rnbakab1r/9/1c5c1/p1p5p/4p1p2/4P1P2/P1P3nCP/1C3A3/4NK3/RNB2AB1R w - - 0 1',
    );
    expect(r.result()).toEqual({ winner: 'b', reason: 'checkmate' });
  });
});

// ---------------------------------------------------------------------------
// Pure classifier — scripted replay boards cover branches real fixtures
// cannot reach cheaply (both-forbidden, desync, malformed input).
// ---------------------------------------------------------------------------

/**
 * Fake board: `move` succeeds unless the uci is `??`, `isCheck()` reports
 * true iff the move just played ends with '+'.
 * Turn alternates strictly per ply (white starts).
 */
function fakeBoard(): ReplayRules {
  let plies = 0;
  let lastCheck = false;
  return {
    turn(): Side {
      return plies % 2 === 0 ? 'w' : 'b';
    },
    move(uci: string): unknown {
      if (uci === '??') return null;
      lastCheck = uci.endsWith('+');
      plies += 1;
      return {};
    },
    isCheck(): boolean {
      return lastCheck;
    },
  };
}

function inputFor(moves: string[], occurrencesOfCurrent = 3) {
  // Parity keys mimic real alternation: even indices 'x w', odd 'x b'.
  // This keeps occurrences spaced ≥2 apart like real games.
  const positions: string[] = Array.from({ length: moves.length + 1 }, (_, i) => (i % 2 === 0 ? 'x w' : 'x b'));
  if (occurrencesOfCurrent < 3) positions[positions.length - 1] = 'fresh b';
  // For the default triple case ensure current (last) indeed occurs 3 times:
  // with parity, current key occurs at every second index. For 8 moves (9 positions)
  // current 'x w' occurs at 0,2,4,6,8 — five times, last three [4,6,8].
  return {
    positions,
    moves,
    createReplay: () => fakeBoard(),
  };
}

describe('adjudicateRepetition classifier', () => {
  it('condemns the only perpetually checking side', () => {
    // w plies all check ('+'), b plies idle. Window (last two laps) is plies 4-7.
    const v = adjudicateRepetition(inputFor(['a1+', 'b1', 'c1+', 'd2', 'e1+', 'f2', 'g1+', 'h2']));
    expect(v).toEqual({ winner: 'b', reason: 'perpetual-check' });
  });

  it('is symmetric for black as the checker', () => {
    const v = adjudicateRepetition(inputFor(['a1', 'b1+', 'c1', 'd2+', 'e1', 'f2+', 'g1', 'h2+']));
    expect(v).toEqual({ winner: 'w', reason: 'perpetual-check' });
  });

  it('returns null when BOTH sides check throughout (v1 draw policy)', () => {
    const v = adjudicateRepetition(inputFor(['a1+', 'b1+', 'c1+', 'd2+', 'e1+', 'f2+', 'g1+', 'h2+']));
    expect(v).toBeNull();
  });

  it('returns null when a side varies with a non-check mid-cycle', () => {
    // White checks in first lap but idles in the second lap's window (e1 without '+').
    const v = adjudicateRepetition(inputFor(['a1+', 'b1', 'c1+', 'd2', 'e1', 'f2', 'g1+', 'h2']));
    expect(v).toBeNull();
  });

  it('returns null without a triple or on malformed input', () => {
    expect(adjudicateRepetition(inputFor(['a1+', 'b1'], 2))).toBeNull();
    expect(
      adjudicateRepetition({ positions: ['x w', 'x w'], moves: [], createReplay: () => fakeBoard() }),
    ).toBeNull();
    // length mismatch
    expect(
      adjudicateRepetition({
        positions: ['x w', 'x w', 'x w'],
        moves: ['a1'],
        createReplay: () => fakeBoard(),
      }),
    ).toBeNull();
    // replay desync inside the adjudication window (plies 4-7)
    expect(adjudicateRepetition(inputFor(['a1+', 'b1', 'c1+', 'd2', '??', 'f2', 'g1+', 'h2']))).toBeNull();
  });
});

describe('positionKey', () => {
  it('ignores move counters but keeps side to move', () => {
    expect(positionKey('R3k4/9/9/9/9/9/9/9/9/3K6 b - - 0 1')).toBe(
      positionKey('R3k4/9/9/9/9/9/9/9/9/3K6 b - - 42 7'),
    );
    expect(positionKey('R3k4/9/9/9/9/9/9/9/9/3K6 b - - 0 1')).not.toBe(
      positionKey('R3k4/9/9/9/9/9/9/9/9/3K6 w - - 0 1'),
    );
  });
});
