import type { Puzzle } from './types';
import { CHESS_PUZZLES } from './data/chess';
import { XIANGQI_PUZZLES } from './data/xiangqi';
import { CHESS_LARGE_PUZZLES } from './data/chess_large';
import { XIANGQI_LARGE_PUZZLES } from './data/xiangqi_large';

export type { Puzzle, PuzzleProgress } from './types';
export { CHESS_PUZZLES, XIANGQI_PUZZLES, CHESS_LARGE_PUZZLES, XIANGQI_LARGE_PUZZLES };

export const ALL_PUZZLES: Puzzle[] = [...CHESS_PUZZLES, ...XIANGQI_PUZZLES];
export const ALL_LARGE_PUZZLES: Puzzle[] = [...CHESS_LARGE_PUZZLES, ...XIANGQI_LARGE_PUZZLES];
export const ALL_WITH_LARGE: Puzzle[] = [...ALL_PUZZLES, ...ALL_LARGE_PUZZLES];

export function getPuzzlesByGameType(gameType: Puzzle['gameType']): Puzzle[] {
  return ALL_PUZZLES.filter(p => p.gameType === gameType);
}

export function getPuzzleById(id: string): Puzzle | undefined {
  return ALL_WITH_LARGE.find(p => p.id === id) ?? ALL_PUZZLES.find(p => p.id === id);
}

export function getLargeByGameType(gameType: Puzzle['gameType']): Puzzle[] {
  return ALL_LARGE_PUZZLES.filter(p => p.gameType === gameType);
}

export function getPuzzlesByRating(countPerLevel = 99): Puzzle[] {
  // 用于小而美：按难度均衡抽样
  return ALL_PUZZLES;
}

/** 校验着法是否命中解法（v1 单步，大小写不敏感） */
export function isCorrectMove(puzzle: Puzzle, uci: string): boolean {
  return puzzle.solution.some(s => s.toLowerCase() === uci.toLowerCase());
}

/** 获取首步解法，用于提示 */
export function firstSolutionMove(puzzle: Puzzle): string | null {
  return puzzle.solution[0] ?? null;
}
