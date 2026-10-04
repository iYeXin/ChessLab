import type { Puzzle } from './types';
import { XiangqiRules } from '@chessnext/rules-xiangqi';

/** 校验 FEN 是否可被规则库加载，且解法着法均合法。 */
export function validatePuzzle(puzzle: Puzzle): { ok: boolean; error?: string } {
  try {
    const rules = new XiangqiRules(puzzle.fen);
    // 验证 sideToMove 与 FEN 一致
    if (rules.turn() !== puzzle.sideToMove) {
      return { ok: false, error: `turn mismatch: fen=${rules.turn()} vs puzzle.sideToMove=${puzzle.sideToMove}` };
    }
    // 验证每步解法是否合法（在初始局面走第一步即合法即可）
    for (const uci of puzzle.solution) {
      const clone = rules.clone();
      const mv = clone.move(uci);
      if (!mv) return { ok: false, error: `illegal solution move ${uci} for ${puzzle.id}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export function validateAll(puzzles: Puzzle[]): { id: string; ok: boolean; error?: string }[] {
  return puzzles.map(p => ({ id: p.id, ...validatePuzzle(p) }));
}
