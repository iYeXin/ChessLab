/**
 * Standard Puzzle Schema for ChessLab
 * 适用于国际象棋 (chess, 8x8) 与中国象棋 (xiangqi, 9x10)
 * 设计目标：与 packages/rules-core 的 RulesAdapter / MoveUci / FEN 完全兼容，
 * 可直接被 engine-uci (Stockfish/Pikafish) 验证，可被 game-session 回放。
 */

import type { GameType, MoveUci, Side } from '@chesslab/rules-core';

export interface Puzzle {
  /** 全局唯一，如 xiangqi-shiqing-001 / chess-lichess-00sHx */
  id: string;
  gameType: GameType;
  title: string;
  /** 标准 FEN：chess 8行含半回合/易位，xiangqi 10行 w=红先 */
  fen: string;
  sideToMove: Side;
  /** 解法序列，仅含谜面后的正解（Lichess 需去掉首步坏着） */
  solution: MoveUci[];
  /** 主题：如 rookEndgame/lucena/philidor / basic-checkmate/smothered */
  themes: string[];
  /** 1-5 内部难度（Lichess Rating 1500-1700→2, 1900+→4等；古谱按名局难度） */
  rating: 1 | 2 | 3 | 4 | 5;
  /** 来源描述，如 "dffge552/xiangqi-pwa-offline / shi-qing-ya-qu #001" */
  source: string;
  sourceUrl?: string;
  license: string; // "MIT" | "CC0" | "Public Domain"
  description?: string;
  /** 仅 Lichess：对手的坏着，用于从原始FEN还原谜面 */
  initialMove?: MoveUci | null;
}

// 校验辅助（与后续 scripts/fetch-puzzles.ts 共用）
export function isValidPuzzleFen(p: Puzzle): boolean {
  const ranks = p.fen.split(' ')[0].split('/');
  return p.gameType === 'chess' ? ranks.length === 8 : ranks.length === 10;
}
