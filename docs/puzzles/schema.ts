/**
 * Standard Puzzle Schema — 中国象棋（xiangqi, 9x10）
 *
 * 与 `packages/puzzles/src/types.ts` 保持一致；设计目标是与
 * `packages/rules-core` 的 RulesAdapter / MoveUci / FEN 完全兼容，
 * 可直接被 engine-uci (Pikafish) 验证，也可被 game-session 回放。
 */

import type { GameType, MoveUci, Side } from '@chessnext/rules-core';

export interface Puzzle {
  /** 全局唯一，如 xiangqi-basic-001 / xiangqi-large-001 */
  id: string;
  gameType: GameType;
  title: string;
  /** 象棋 FEN：10 行，w = 红先 */
  fen: string;
  sideToMove: Side;
  /**
   * 参考解法（ICCS）。**注意**：这是采集时的参考着法，不是单步杀着；
   * 残局现为完整人机对战，不做单步强制判定。
   */
  solution: MoveUci[];
  /** 主题：如 basic / checkmate / cannon / shi-qing-ya-qu / jianghu */
  themes: string[];
  /** 1-5 内部难度（古谱按名局难度） */
  rating: 1 | 2 | 3 | 4 | 5;
  /** 来源描述，如 "basic-checkmates / 对面笑" */
  source: string;
  sourceUrl?: string;
  /** 目前仅有 "MIT"（xiangqi-pwa-offline） */
  license: string;
  description?: string;
}

/** 校验辅助：象棋 FEN 应为 10 行。 */
export function isValidPuzzleFen(p: Puzzle): boolean {
  return p.fen.split(' ')[0]?.split('/').length === 10;
}
