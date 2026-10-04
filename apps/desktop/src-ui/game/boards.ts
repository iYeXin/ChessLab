import type { Side, Square } from '@chessnext/rules-core';

/** Xiangqi board geometry (9 files x 10 ranks, pieces sit on intersections). */

export const XQ_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;
/** Xiangqi ranks 0-9; rank 0 = Red's back rank (bottom by default). */
export const XQ_RANKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export interface BoardPoint {
  file: string;
  rank: string;
}

/**
 * Ordered board points, first element = top-left cell when `orientation` side
 * sits at the bottom.
 */
export function boardPoints(orientation: Side): BoardPoint[] {
  const files = orientation === 'w' ? XQ_FILES : [...XQ_FILES].reverse();
  const ranks = orientation === 'w' ? [...XQ_RANKS].reverse() : [...XQ_RANKS];
  const out: BoardPoint[] = [];
  for (const r of ranks) for (const f of files) out.push({ file: f, rank: String(r) });
  return out;
}

export function keyOf(p: BoardPoint): Square {
  return `${p.file}${p.rank}`;
}

/** Every square on the board (board snapshots iterate this). */
export const ALL_SQUARES: Square[] = boardPoints('w').map(keyOf);
