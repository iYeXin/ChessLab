/**
 * Type declarations for the vendored xiangqi.js (BSD-2-Clause).
 * The upstream library ships without TypeScript definitions; this describes
 * only the surface we consume. See ../vendor/xiangqi.js for implementation.
 */

/** Turn/piece-color token used inside xiangqi.js ('r' = red = first mover). */
export type XiangqiColor = 'r' | 'b';

export interface XiangqiPrettyMove {
  /** Coordinate notation ("h2e2") — identical to engine UCI moves. */
  iccs: string;
  from: string;
  to: string;
  piece: string;
  color: XiangqiColor;
  captured?: string;
  flags: string;
}

export interface XiangqiMovesOptions {
  verbose?: boolean;
  square?: string;
}

export interface XiangqiGame {
  load(fen: string): void;
  reset(): void;
  fen(): string;
  turn(): XiangqiColor;
  moves(options?: XiangqiMovesOptions): XiangqiPrettyMove[] | string[];
  move(move: string | { from: string; to: string }): XiangqiPrettyMove | null;
  undo(): XiangqiPrettyMove | null;
  in_check(): boolean;
  in_checkmate(): boolean;
  in_stalemate(): boolean;
  insufficient_material(): boolean;
  in_threefold_repetition(): boolean;
  in_draw(): boolean;
  game_over(): boolean;
  history(options: { verbose: true }): XiangqiPrettyMove[];
  history(options?: { verbose?: false }): string[];
  perft(depth: number): number;
  ascii(): string;
}

export const Xiangqi: { new (fen?: string): XiangqiGame };
