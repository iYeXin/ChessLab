import type { PieceType, RulesAdapter, Side, Square } from '@chessnext/rules-core';
import { NMOVE, NSQ, PLANES, type PositionValue, type RankedMove } from './types';

/**
 * Board / move encoding for the ONNX tier models.
 *
 * Square index: `rank * 9 + file`, rank 0 = Red's back rank, file 0 = a.
 * Piece code:   0 = empty, 1..7 = red K,A,B,N,R,C,P, 8..14 = black same order.
 * Move index:   `from * 90 + to`.
 *
 * ⚠️ The model always sees the board from the side to move's point of view,
 * "as Red". When Black is to move the caller MUST rotate the board 180°, swap
 * the colours AND flip move indices (`flipMoveIndex`). Getting this wrong does
 * not throw — it silently produces moves for the wrong side. `buildModelInput`
 * does all three so callers cannot forget.
 */

/** Board index from (rank, file). */
export const sq = (rank: number, file: number): number => rank * 9 + file;

/** Our piece letters -> model codes. Order matters: K,A,B,N,R,C,P. */
const PIECE_CODE: Record<PieceType, number> = {
  k: 1,
  a: 2,
  b: 3,
  n: 4,
  r: 5,
  c: 6,
  p: 7,
};

/** Red pieces are codes 1..7, black pieces 8..14. */
export function pieceCode(type: PieceType, side: Side): number {
  const base = PIECE_CODE[type];
  if (!base) throw new Error(`unknown piece type: ${type}`);
  return side === 'w' ? base : base + 7;
}

export function squareToIndex(square: Square): number {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square.slice(1));
  if (!Number.isInteger(rank) || file < 0 || file > 8 || rank < 0 || rank > 9) {
    throw new Error(`bad square: ${square}`);
  }
  return sq(rank, file);
}

export function indexToSquare(i: number): Square {
  return `${String.fromCharCode(97 + (i % 9))}${Math.floor(i / 9)}`;
}

/** UCI/ICCS move ("h2e2") -> move index. */
export function moveToIndex(uci: string): number {
  return squareToIndex(uci.slice(0, 2)) * NSQ + squareToIndex(uci.slice(2, 4));
}

/** Move index -> ICCS move. */
export function indexToIccs(m: number): string {
  return indexToSquare(Math.floor(m / NSQ)) + indexToSquare(m % NSQ);
}

/**
 * The 180° view flip, applied to MOVE indices.
 *
 * Must be used both when mapping legal moves into model view and when mapping
 * the model's answer back. `8099 - m` (not 8099 alone) because the board flip
 * is `89 - i` on both endpoints.
 */
export const flipMoveIndex = (m: number): number => NMOVE - 1 - m;

/** Rotate 180° and swap colours when Black is to move. */
export function normalizeSquares(squares: Uint8Array, sideToMoveIsRed: boolean): Uint8Array {
  if (sideToMoveIsRed) return Uint8Array.from(squares);
  const out = new Uint8Array(NSQ);
  for (let i = 0; i < NSQ; i++) {
    const v = squares[NSQ - 1 - i]!;
    out[i] = v === 0 ? 0 : v <= 7 ? v + 7 : v - 7;
  }
  return out;
}

/** Build the (17,10,9) input planes from an already-normalized board. */
export function buildPlanes(
  squares: Uint8Array,
  meta: { inCheck: boolean; ply: number },
): Float32Array {
  const out = new Float32Array(PLANES * NSQ);
  for (let i = 0; i < NSQ; i++) {
    const v = squares[i]!;
    if (v !== 0) out[(v - 1) * NSQ + i] = 1; // planes 0..13 = codes 1..14
  }
  const base = 14 * NSQ;
  if (meta.inCheck) out.fill(1, base, base + NSQ); // plane 14: side to move in check
  out.fill(Math.min(meta.ply / 256, 1), 15 * NSQ, 16 * NSQ); // plane 15: ply/256
  out.fill(1, 16 * NSQ, 17 * NSQ); // plane 16: constant 1 (side-to-move plane)
  return out;
}

/** Read the 90-cell board encoding out of a rules adapter. */
export function squaresFromRules(rules: RulesAdapter): Uint8Array {
  const out = new Uint8Array(NSQ);
  for (let rank = 0; rank < 10; rank++) {
    for (let file = 0; file < 9; file++) {
      const square = indexToSquare(sq(rank, file));
      const piece = rules.pieceAt(square);
      if (piece) out[sq(rank, file)] = pieceCode(piece.type, piece.side);
    }
  }
  return out;
}

/** Legal moves as model move indices, in ORIGINAL view. */
export function legalMoveIndices(rules: RulesAdapter): number[] {
  return rules.moves().map(m => moveToIndex(m.uci));
}

export interface ModelInput {
  /** (17,10,9) float32 planes, ready for the session. */
  planes: Float32Array;
  /** Legal move indices in ORIGINAL board view. */
  legalMoves: number[];
  /** Legal move indices in MODEL view (after the 180° flip when Black moves). */
  legalModelMoves: number[];
  sideToMoveIsRed: boolean;
}

/**
 * Full input build. Handles the view normalization so the runner cannot get it
 * wrong: rotate board, swap colours, and flip the legal-move indices.
 */
export function buildModelInput(rules: RulesAdapter, ply: number): ModelInput {
  const sideToMoveIsRed = rules.turn() === 'w';
  const squares = squaresFromRules(rules);
  const normalized = normalizeSquares(squares, sideToMoveIsRed);
  const planes = buildPlanes(normalized, { inCheck: rules.isCheck(), ply });
  const legalMoves = legalMoveIndices(rules);
  const legalModelMoves = legalMoves.map(m => (sideToMoveIsRed ? m : flipMoveIndex(m)));
  return { planes, legalMoves, legalModelMoves, sideToMoveIsRed };
}

/** Map a MODEL-view move index back to ORIGINAL view. */
export function modelMoveToReal(m: number, sideToMoveIsRed: boolean): number {
  return sideToMoveIsRed ? m : flipMoveIndex(m);
}

/**
 * Softmax restricted to the legal moves (numerically stable), descending.
 *
 * `legalMoves` MUST be in model view — the logits are model view.
 */
export function maskedSoftmax(
  logits: ArrayLike<number>,
  legalMoves: readonly number[],
  temperature = 1,
): { move: number; p: number }[] {
  if (legalMoves.length === 0) return [];
  const t = temperature > 0 ? temperature : 1e-4;

  let max = -Infinity;
  for (const m of legalMoves) {
    const v = logits[m] ?? -Infinity;
    if (v > max) max = v;
  }

  let sum = 0;
  const probs = new Array<number>(legalMoves.length);
  for (let i = 0; i < legalMoves.length; i++) {
    const e = Math.exp(((logits[legalMoves[i]!] ?? 0) - max) / t);
    probs[i] = e;
    sum += e;
  }
  const denom = sum > 0 ? sum : 1;
  const items = legalMoves.map((m, i) => ({ move: m, p: probs[i]! / denom }));
  items.sort((a, b) => b.p - a.p);
  return items;
}

/** (win, draw, loss) logits -> probabilities. */
export function softmax3(v: ArrayLike<number>): PositionValue {
  const a = v[0] ?? 0;
  const b = v[1] ?? 0;
  const c = v[2] ?? 0;
  const max = Math.max(a, b, c);
  const ea = Math.exp(a - max);
  const eb = Math.exp(b - max);
  const ec = Math.exp(c - max);
  const sum = ea + eb + ec || 1;
  return { win: ea / sum, draw: eb / sum, loss: ec / sum };
}

/** Convenience: rank model logits and translate back to ORIGINAL view. */
export function rankMoves(
  logits: ArrayLike<number>,
  input: Pick<ModelInput, 'legalMoves' | 'legalModelMoves' | 'sideToMoveIsRed'>,
  temperature: number,
): RankedMove[] {
  return maskedSoftmax(logits, input.legalModelMoves, temperature).map(r => {
    const real = modelMoveToReal(r.move, input.sideToMoveIsRed);
    return { move: real, iccs: indexToIccs(real), p: r.p };
  });
}
