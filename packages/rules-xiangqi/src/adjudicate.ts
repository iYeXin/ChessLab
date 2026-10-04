import type { GameResult, MoveUci, Side } from '@chessnext/rules-core';

/**
 * Repetition adjudication for xiangqi (重复局面裁决 — 长将判负).
 *
 * Rule basis (《象棋竞赛规则》 / Asian rules, v1 scope):
 * - When a position occurs for the THIRD time, the two repetition cycles that
 *   just completed are examined.
 * - If ONE side's plies across those cycles are ALL checks (长将) while the
 *   other side's are not all checks, the checking side LOSES — they were
 *   forbidden to repeat and refused to vary.
 * - Every other combination stays a draw at v1: benign repetitions (双方均为
 *   允许着法), both-sides-forbidden edge cases (双长将 etc.), and 长捉
 *   (perpetual chase — its 捉/兑/献 classification is deliberately deferred;
 *   see docs. Defaulting it to a draw is the conservative choice).
 *
 * Check detection is exact: a ply "gives check" iff the opponent is in check
 * after it — verified by replaying the cycle on a fresh adapter. No
 * heuristics, so 长将 adjudication has zero misclassification risk.
 */

/**
 * Position identity for repetition purposes: board placement + side to move.
 * Matches the vendor's own threefold keying (`fen.split(' ').slice(0, 2)`).
 */
export function positionKey(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return `${parts[0] ?? ''} ${parts[1] ?? 'w'}`;
}

/** Minimal structural surface needed to replay a cycle on real rules. */
export interface ReplayRules {
  turn(): Side;
  /** Apply one coordinate move; returns falsy when illegal (history desync). */
  move(uci: MoveUci): unknown;
  /** True when the side to move NOW (i.e. the opponent of the last mover) is in check. */
  isCheck(): boolean;
}

export interface AdjudicationInput {
  /**
   * FEN after each ply; index 0 is the position before any ply.
   * `positions[i+1]` must be reachable from `positions[i]` via `moves[i]`.
   */
  positions: readonly string[];
  /** Coordinate moves; `moves.length === positions.length - 1`. */
  moves: readonly MoveUci[];
  /** Factory for fresh replay boards positioned at a given FEN. */
  createReplay(fen: string): ReplayRules;
}

export interface AdjudicationResult {
  winner: Side;
  reason: 'perpetual-check';
}

/**
 * Adjudicate the third occurrence of the CURRENT position (the last entry of
 * `input.positions`).
 *
 * Returns `{ winner, reason: 'perpetual-check' }` when exactly one side was
 * perpetually checking across the two completed cycles, otherwise `null`
 * (no triple yet, replay desync, or any draw-classified combination).
 */
export function adjudicateRepetition(input: AdjudicationInput): AdjudicationResult | null {
  const { positions, moves } = input;
  if (positions.length < 3 || moves.length !== positions.length - 1) return null;

  const current = positionKey(positions[positions.length - 1] ?? '');

  // Last three occurrences of the current position. The third IS the final
  // entry (we adjudicate immediately after the move that closed the triple).
  const occurrences: number[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    if (positionKey(positions[i] ?? '') === current) occurrences.push(i);
  }
  if (occurrences.length < 3) return null;

  const p = occurrences[occurrences.length - 3]!;
  const r = positions.length - 1;
  // Window = every ply from just after occurrence #1 up to occurrence #3:
  // two complete laps. Union window (not per-lap) keeps the verdict sound
  // even when the two laps reach the same positions via different paths.
  const windowMoves = moves.slice(p, r);
  if (windowMoves.length === 0) return null;

  const startFen = positions[p] ?? '';
  const board = input.createReplay(startFen);

  const gaveCheck: boolean[] = [];
  const plySide: Side[] = [];
  for (let t = 0; t < windowMoves.length; t += 1) {
    const uci = windowMoves[t];
    if (!uci) return null;
    const mover = board.turn();
    if (!board.move(uci)) return null; // history desync — bail out to a draw
    gaveCheck.push(board.isCheck());
    plySide.push(mover);
  }

  const allChecks = (side: Side): boolean =>
    plySide.some(s => s === side) && plySide.every((s, i) => s !== side || gaveCheck[i]);

  const wPerpetual = allChecks('w');
  const bPerpetual = allChecks('b');

  if (wPerpetual && !bPerpetual) return { winner: 'b', reason: 'perpetual-check' };
  if (bPerpetual && !wPerpetual) return { winner: 'w', reason: 'perpetual-check' };
  return null; // benign repetition / both forbidden → draw (v1 policy)
}
