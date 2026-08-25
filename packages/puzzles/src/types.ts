import type { GameType, MoveUci, Side } from '@chesslab/rules-core';

/**
 * Standard Puzzle Schema — 小而美
 * 所有残局统一此形状，可被 rules / engine / session 直接消费
 */
export interface Puzzle {
  /** 全局唯一，如 xiangqi-basic-001 / chess-lucena-b */
  id: string;
  gameType: GameType;
  /** 展示标题，如 "对面笑" / "Lucena — 搭桥" */
  title: string;
  /** 标准 FEN：chess 8行，xiangqi 10行 */
  fen: string;
  sideToMove: Side;
  /** 解法序列（UCI/ICCS）。v1 均为「找最佳着」单步，未来可扩展为完整主变 + 自动应着 */
  solution: MoveUci[];
  /** 主题标签，用于筛选与展示 */
  themes: string[];
  /** 内部难度 1-5（1入门 5大师） */
  rating: 1 | 2 | 3 | 4 | 5;
  source: string;
  sourceUrl?: string;
  license: string;
  description?: string;
  /** 仅 Lichess：对手的坏着（用于从原始 FEN 还原谜面，v1 已预转换） */
  initialMove?: MoveUci | null;
}

export type PuzzleCategory = 'basic' | 'classic' | 'jianghu' | 'endgame' | 'theory';

export interface PuzzleProgress {
  solved: Record<string, boolean>;
  stars: Record<string, number>; // 1-3
  lastPlayedId?: string;
}
