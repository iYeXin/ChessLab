import type { GameType, MoveUci, Side } from '@chessnext/rules-core';

/**
 * Standard Puzzle Schema — 小而美
 * 所有残局统一此形状，可被 rules / engine / session 直接消费。
 * 本实验版仅收录中国象棋残局。
 */
export interface Puzzle {
  /** 全局唯一，如 xiangqi-basic-001 / xiangqi-large-001 */
  id: string;
  gameType: GameType;
  /** 展示标题，如 "对面笑" / "第001局 气吞关右" */
  title: string;
  /** 标准 FEN：象棋 10 行，w = 红先 */
  fen: string;
  sideToMove: Side;
  /** 参考解法（ICCS）。残局为完整人机对战，解法仅作参考/提示，不做单步强制判定 */
  solution: MoveUci[];
  /** 主题标签，用于筛选与展示 */
  themes: string[];
  /** 内部难度 1-5（1入门 5大师） */
  rating: 1 | 2 | 3 | 4 | 5;
  source: string;
  sourceUrl?: string;
  license: string;
  description?: string;
}

/** 残局闯关进度（与 `apps/desktop/src-ui/state/puzzles.ts` 的本地存储一致）。 */
export interface PuzzleProgress {
  solved: Record<string, boolean>;
  solvedAt: Record<string, number>;
}
