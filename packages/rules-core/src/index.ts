/**
 * Shared rule-engine abstractions.
 *
 * Scope note
 * ----------
 * This experimental build supports **xiangqi (中国象棋) only**. The `GameType`
 * union and the `RulesAdapter` façade are deliberately kept as a single-member
 * seam: the engine, session and UI layers stay game-agnostic, so the western
 * chess adapter could be added back without touching any plumbing above it.
 *
 * Design notes
 * ------------
 * - Sides are normalized to 'w' | 'b' across all games so that the engine and
 *   session layers never care about game-specific naming:
 *       xiangqi  : w = red (moves first), b = black
 *     The presentation layer maps these tokens to localized piece colors.
 * - Moves are ICCS coordinate strings ("h2e2"). This is exactly what Pikafish
 *   accepts in `position ... moves ...`, so no translation is needed at the
 *   engine boundary.
 * - Implementations must be pure logic: no I/O, no React, no timers. That keeps
 *   them testable on Node and reusable if we later port to other surfaces.
 */

export type GameType = 'xiangqi';

/** Normalized side token. 'w' is red and always moves first. */
export type Side = 'w' | 'b';

export type Square = string;

/** ICCS coordinate move ("h2e2"). Same alphabet the engine speaks. */
export type MoveUci = string;

export interface LegalMove {
  uci: MoveUci;
  from: Square;
  to: Square;
  /** Human-readable notation for lists/logs (ICCS, or traditional 中文记谱). */
  san: string;
}

export type GameEndReason =
  // decisive endings
  | 'checkmate' // 将死
  | 'no-legal-moves' // 困毙 — the stalemated side LOSES (unlike western chess)
  | 'resign'
  | 'timeout'
  /** 长将 — the perpetual checker must vary; on the third repetition they LOSE. */
  | 'perpetual-check' // decisive (reserved: 'perpetual-chase' when 长捉 lands)
  // draws
  | 'repetition'
  | 'insufficient-material'
  | 'agreement';

export interface GameResult {
  /** Winning side; null for draws. */
  winner: Side | null;
  reason: GameEndReason;
}

export interface HistoryEntry {
  uci: MoveUci;
  san: string;
}

/** Xiangqi piece types: 将/帅 士/仕 象/相 马 车 炮 卒/兵. */
export type PieceType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p';

export interface Piece {
  type: PieceType;
  side: Side;
}

/**
 * Uniform façade over per-game rule implementations. One instance represents
 * one live game; use `clone()` for speculative branches (hints, analysis).
 */
export interface RulesAdapter {
  readonly gameType: GameType;

  /** Start a fresh game, or load a custom position via FEN. */
  reset(fen?: string): void;

  /** Current position as FEN (game-specific FEN dialects are fine here). */
  fen(): string;

  /** Side to move. */
  turn(): Side;

  /** All legal moves in the current position (optionally filtered by origin square). */
  moves(opts?: { square?: Square }): LegalMove[];

  /**
   * Play a move by coordinate notation.
   * Returns the applied move, or null when illegal/ambiguous.
   */
  move(uci: MoveUci): LegalMove | null;

  /** Revert the last half-move. Returns false when no history. */
  undo(): boolean;

  isCheck(): boolean;

  /** Piece on a square, or null when empty. Board lookup for rendering. */
  pieceAt(square: Square): Piece | null;

  /** Terminal state, or null while the game is ongoing. */
  result(): GameResult | null;

  history(): readonly HistoryEntry[];

  clone(): RulesAdapter;

  /**
   * Repetition probe (optional; implemented by adapters that track position
   * history): how many times the position AFTER playing `uci` would have
   * occurred, counting this move. 1 = first occurrence, 2 = would repeat a
   * previously seen position, etc. Returns 0 when `uci` is illegal.
   *
   * Used by the session layer to keep randomized engine alternatives from
   * drifting into repetition loops.
   */
  occurrencesAfter?(uci: MoveUci): number;
}

export const other = (side: Side): Side => (side === 'w' ? 'b' : 'w');

/** Initial position FEN per game, useful for engines (`position fen ...`). */
export const INITIAL_FENS: Record<GameType, string> = {
  // Xiangqi FEN dialect: 10 ranks x 9 files, rank order top(black) -> bottom(red).
  xiangqi: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
};
