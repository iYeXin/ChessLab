import type { HistoryEntry } from '@chesslab/rules-core';
import { XiangqiRules } from '@chesslab/rules-xiangqi';
import { toTraditional, getSameFilePieces } from './xiangqi-notation';
import type { Square, Piece } from '@chesslab/rules-core';

/**
 * Format a history entry for display, respecting the notation setting.
 * For xiangqi traditional, we replay the game to get the board before each move.
 */
export function formatHistoryForDisplay(
  history: readonly HistoryEntry[],
  gameType: 'chess' | 'xiangqi',
  xiangqiNotation: 'iccs' | 'traditional',
): string[] {
  if (gameType !== 'xiangqi' || xiangqiNotation !== 'traditional') {
    return history.map(h => h.san);
  }

  // For traditional, replay the game
  const rules = new XiangqiRules();
  const result: string[] = [];
  const boardMap = (): Record<Square, Piece> => {
    const map: Record<Square, Piece> = {};
    // We need to get all pieces from the board
    // Use the rules' internal board via pieceAt for all squares
    // For simplicity, iterate over all possible squares
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    for (const f of files) {
      for (let r = 0; r <= 9; r++) {
        const sq = `${f}${r}` as Square;
        const p = rules.pieceAt(sq);
        if (p) map[sq] = p;
      }
    }
    return map;
  };

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    if (!entry) {
      result.push('');
      continue;
    }
    const from = entry.uci.slice(0, 2) as Square;
    const to = entry.uci.slice(2, 4) as Square;
    const piece = rules.pieceAt(from);
    if (!piece) {
      result.push(entry.san);
      rules.move(entry.uci);
      continue;
    }
    const side = piece.side as 'w' | 'b';
    const boardBefore = boardMap();
    const fileIdx = from.charCodeAt(0) - 97;
    const sameFile = getSameFilePieces(boardBefore, fileIdx, piece.type, side);
    // Need a function that returns same file squares
    const getSame = (fi: number, pt: string, s: 'w' | 'b') => getSameFilePieces(boardBefore, fi, pt, s);
    try {
      const trad = toTraditional(from, to, piece.type, side, sq => boardBefore[sq] ?? null, getSame);
      result.push(trad);
    } catch {
      result.push(entry.san);
    }
    rules.move(entry.uci);
  }

  return result;
}
