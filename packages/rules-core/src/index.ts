/**
 * Shared rule-engine abstractions for every supported game.
 *
 * Design notes
 * ------------
 * - Sides are normalized to 'w' | 'b' across ALL games so that the engine and
 *   session layers never care about game-specific naming:
 *       chess    : w = white, b = black
 *       xiangqi  : w = red (moves first), b = black
 *     The presentation layer maps these tokens to localized piece colors.
 * - Moves are expressed as UCI/ICCS-style coordinate strings ("e2e4", "h2e2",
 *   promotions as a trailing piece letter, e.g. "e7e8q"). This is exactly what
 *   Stockfish / Pikafish accept in `position ... moves ...`, so no translation
 *   is needed at the engine boundary.
 * - Implementations must be pure logic: no I/O, no React, no timers. That keeps
 *   them testable on Node and reusable if we later port to other surfaces.
 */

export type GameType = 'chess' | 'xiangqi';

/** Normalized side token. 'w' always moves first. */
export type Side = 'w' | 'b';

export type Square = string;

/** Coordinate move ("e2e4", "h2e2", "a7a8q"). Same alphabet used by the engines. */
export type MoveUci = string;

export interface LegalMove {
  uci: MoveUci;
  from: Square;
  to: Square;
  /** Promotion piece letter (chess only): q r b n */
  promotion?: string;
  /** Human-readable notation for lists/logs (SAN for chess, ICCS for xiangqi). */
  san: string;
}

export type GameEndReason =
  // decisive endings
  | 'checkmate' // chess checkmate / xiangqi 将死
  | 'no-legal-moves' // xiangqi 困毙 — stalemated side LOSES (unlike chess)
  | 'resign'
  | 'timeout'
  // draws
  | 'stalemate' // chess pat only
  | 'repetition'
  | 'fifty-move-rule' // chess 50-move
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

  /** Terminal state, or null while the game is ongoing. */
  result(): GameResult | null;

  history(): readonly HistoryEntry[];

  clone(): RulesAdapter;
}

export const other = (side: Side): Side => (side === 'w' ? 'b' : 'w');

/** Initial position FEN per game, useful for engines (`position fen ...`). */
export const INITIAL_FENS: Record<GameType, string> = {
  chess: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  // Xiangqi FEN dialect: 10 ranks x 9 files, rank order top(black) -> bottom(red).
  xiangqi: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
};
