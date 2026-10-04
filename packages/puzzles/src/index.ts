import type { Puzzle } from './types';
import { XIANGQI_PUZZLES } from './data/xiangqi';
import { XIANGQI_LARGE_PUZZLES } from './data/xiangqi_large';

export type { Puzzle, PuzzleProgress } from './types';
export { XIANGQI_PUZZLES, XIANGQI_LARGE_PUZZLES };

/** 精选 12 局 — 按难度循序渐进。 */
export const CURATED_PUZZLES: Puzzle[] = XIANGQI_PUZZLES;
/** 题库 100 局 — 搜索 / 筛选 / 随机抽题。 */
export const LARGE_PUZZLES: Puzzle[] = XIANGQI_LARGE_PUZZLES;

export const ALL_PUZZLES: Puzzle[] = [...CURATED_PUZZLES];
export const ALL_WITH_LARGE: Puzzle[] = [...CURATED_PUZZLES, ...LARGE_PUZZLES];

export function getPuzzleById(id: string): Puzzle | undefined {
  return ALL_WITH_LARGE.find(p => p.id === id);
}

/**
 * Which list a puzzle came from. The id convention (`-large-`) is owned by
 * this data package so the UI never has to parse ids.
 */
export function listForPuzzle(puzzle: Puzzle): Puzzle[] {
  return puzzle.id.includes('-large-') ? LARGE_PUZZLES : CURATED_PUZZLES;
}
