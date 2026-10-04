import { describe, expect, it } from 'vitest';
import { XiangqiRules } from '@chessnext/rules-xiangqi';
import {
  buildModelInput,
  buildPlanes,
  flipMoveIndex,
  indexToIccs,
  indexToSquare,
  maskedSoftmax,
  moveToIndex,
  normalizeSquares,
  pieceCode,
  softmax3,
  squareToIndex,
  squaresFromRules,
} from '../src/encoding';
import { NMOVE, NSQ, PLANES } from '../src/types';
import { temperatureForPly, temperaturePreset } from '../src/temperature';
import { findWinningMove } from '../src/mate';

const INITIAL_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

describe('square / move indexing', () => {
  it('uses rank * 9 + file with rank 0 = Red back rank', () => {
    expect(squareToIndex('a0')).toBe(0);
    expect(squareToIndex('e0')).toBe(4);
    expect(squareToIndex('i9')).toBe(89);
    expect(indexToSquare(0)).toBe('a0');
    expect(indexToSquare(89)).toBe('i9');
  });

  it('round-trips ICCS moves through moveIndex', () => {
    for (const uci of ['h2e2', 'b9c7', 'a0a1', 'e0e1', 'i9i8']) {
      expect(indexToIccs(moveToIndex(uci))).toBe(uci);
    }
    // from * 90 + to
    expect(moveToIndex('h2e2')).toBe(squareToIndex('h2') * NSQ + squareToIndex('e2'));
  });

  it('flipMoveIndex is the 8099 - m involution', () => {
    expect(flipMoveIndex(0)).toBe(NMOVE - 1);
    expect(flipMoveIndex(NMOVE - 1)).toBe(0);
    for (const m of [0, 1, 2272, 4555, NMOVE - 1]) {
      expect(flipMoveIndex(flipMoveIndex(m))).toBe(m);
    }
  });
});

describe('squaresFromRules', () => {
  it('encodes the initial position (1..7 red K,A,B,N,R,C,P; 8..14 black)', () => {
    const s = squaresFromRules(new XiangqiRules(INITIAL_FEN));
    expect(s.length).toBe(NSQ);

    expect(s[squareToIndex('e0')]).toBe(1); // red general  K
    expect(s[squareToIndex('d0')]).toBe(2); // red adviser   A
    expect(s[squareToIndex('c0')]).toBe(3); // red elephant  B
    expect(s[squareToIndex('b0')]).toBe(4); // red horse     N
    expect(s[squareToIndex('a0')]).toBe(5); // red rook      R
    expect(s[squareToIndex('b2')]).toBe(6); // red cannon    C
    expect(s[squareToIndex('a3')]).toBe(7); // red pawn      P

    expect(s[squareToIndex('e9')]).toBe(8); // black general
    expect(s[squareToIndex('a9')]).toBe(12); // black rook
    expect(s[squareToIndex('b7')]).toBe(13); // black cannon
    expect(s[squareToIndex('a6')]).toBe(14); // black pawn

    expect(s[squareToIndex('e5')]).toBe(0); // empty
  });

  it('pieceCode maps type+side consistently', () => {
    expect(pieceCode('k', 'w')).toBe(1);
    expect(pieceCode('p', 'w')).toBe(7);
    expect(pieceCode('k', 'b')).toBe(8);
    expect(pieceCode('p', 'b')).toBe(14);
  });
});

describe('view normalization (the silent-failure path)', () => {
  it('is a no-op when Red is to move', () => {
    const s = squaresFromRules(new XiangqiRules(INITIAL_FEN));
    const n = normalizeSquares(s, true);
    expect(Array.from(n)).toEqual(Array.from(s));
  });

  it('rotates 180 degrees AND swaps colours when Black is to move', () => {
    const s = squaresFromRules(new XiangqiRules(INITIAL_FEN));
    const n = normalizeSquares(s, false);
    for (let i = 0; i < NSQ; i++) {
      const src = s[NSQ - 1 - i]!;
      const expected = src === 0 ? 0 : src <= 7 ? src + 7 : src - 7;
      expect(n[i]).toBe(expected);
    }
    // Red's general (code 1 at e0) becomes a black general (code 8) at e9.
    expect(n[squareToIndex('e9')]).toBe(8);
    // Black's general (code 8 at e9) becomes a red general (code 1) at e0.
    expect(n[squareToIndex('e0')]).toBe(1);
  });

  it('carries the flip into the legal-move set for Black', () => {
    const rules = new XiangqiRules(INITIAL_FEN.replace(' w ', ' b '));
    const input = buildModelInput(rules, 0);
    expect(input.sideToMoveIsRed).toBe(false);
    expect(input.legalModelMoves).toEqual(input.legalMoves.map(flipMoveIndex));
    // The flipped set is a different set of indices, not the same one.
    expect(input.legalModelMoves).not.toEqual(input.legalMoves);
  });

  it('keeps the legal set unchanged for Red', () => {
    const input = buildModelInput(new XiangqiRules(INITIAL_FEN), 0);
    expect(input.sideToMoveIsRed).toBe(true);
    expect(input.legalModelMoves).toEqual(input.legalMoves);
  });
});

describe('buildPlanes', () => {
  it('produces a (17,10,9) float32 block with the documented planes', () => {
    const squares = squaresFromRules(new XiangqiRules(INITIAL_FEN));
    const planes = buildPlanes(normalizeSquares(squares, true), { inCheck: false, ply: 128 });
    expect(planes.length).toBe(PLANES * NSQ);

    // Plane 0 holds red generals: only e0.
    const plane0 = Array.from(planes.slice(0, NSQ));
    expect(plane0.filter(v => v === 1).length).toBe(1);
    expect(planes[squareToIndex('e0')]).toBe(1);

    // Plane 7 holds black generals: only e9.
    expect(planes[7 * NSQ + squareToIndex('e9')]).toBe(1);

    // Plane 14 = in check.
    expect(planes[14 * NSQ]).toBe(0);
    const inCheck = buildPlanes(squares, { inCheck: true, ply: 0 });
    expect(inCheck[14 * NSQ]).toBe(1);
    expect(inCheck[15 * NSQ - 1]).toBe(1);

    // Plane 15 = min(ply / 256, 1).
    expect(planes[15 * NSQ]).toBeCloseTo(0.5, 6);
    expect(buildPlanes(squares, { inCheck: false, ply: 1000 })[15 * NSQ]).toBe(1);

    // Plane 16 is constant 1.
    expect(planes[16 * NSQ]).toBe(1);
    expect(planes[17 * NSQ - 1]).toBe(1);
  });
});

describe('maskedSoftmax', () => {
  it('only assigns mass to legal moves', () => {
    const logits = new Float32Array(NMOVE).fill(50);
    logits[10] = 100; // illegal but highest
    const legal = [1, 2, 3];
    const ranked = maskedSoftmax(logits, legal, 1);
    expect(ranked.map(r => r.move).sort((a, b) => a - b)).toEqual(legal);
    expect(ranked.some(r => r.move === 10)).toBe(false);
    const total = ranked.reduce((s, r) => s + r.p, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('sharpens with lower temperature', () => {
    const logits = new Float32Array(NMOVE);
    logits[1] = 2;
    logits[2] = 1;
    const warm = maskedSoftmax(logits, [1, 2], 1);
    const cold = maskedSoftmax(logits, [1, 2], 0.1);
    expect(cold[0]!.p).toBeGreaterThan(warm[0]!.p);
    expect(cold[0]!.move).toBe(1);
  });

  it('returns nothing when there are no legal moves', () => {
    expect(maskedSoftmax(new Float32Array(NMOVE), [], 1)).toEqual([]);
  });
});

describe('softmax3 / temperature presets', () => {
  it('normalizes (win, draw, loss) logits to probabilities', () => {
    const v = softmax3(new Float32Array([2, 0, 0]));
    expect(v.win + v.draw + v.loss).toBeCloseTo(1, 6);
    expect(v.win).toBeGreaterThan(v.draw);
    expect(v.draw).toBeCloseTo(v.loss, 9);
  });

  it('stages the play preset by ply', () => {
    const play = temperaturePreset('play');
    expect(temperatureForPly(0, play)).toBe(1.0);
    expect(temperatureForPly(15, play)).toBe(1.0);
    expect(temperatureForPly(16, play)).toBe(0.7);
    expect(temperatureForPly(59, play)).toBe(0.7);
    expect(temperatureForPly(60, play)).toBe(0.25);
  });
});

describe('mate guard (findWinningMove)', () => {
  it('finds a rules-level immediate win that a single check would miss', () => {
    // Synthetic rules-level fixture: Red to move and e0f0 leaves Black with no
    // legal reply. (Not necessarily game-reachable; the guard's contract is
    // defined against this same rules library.)
    const rules = new XiangqiRules('4k4/3R5/9/9/9/9/9/9/9/R3K4 w - - 0 1');
    expect(findWinningMove(rules)).toBe('e0f0');
  });

  it('does not fire in the opening and leaves the adapter untouched', () => {
    const rules = new XiangqiRules(INITIAL_FEN);
    const before = rules.fen();
    const historyBefore = rules.history().length;
    expect(findWinningMove(rules)).toBeNull();
    expect(rules.fen()).toBe(before);
    expect(rules.history().length).toBe(historyBefore);
  });
});
