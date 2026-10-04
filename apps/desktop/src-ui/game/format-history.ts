import type { HistoryEntry, Piece, Square } from '@chessnext/rules-core';
import { XiangqiRules } from '@chessnext/rules-xiangqi';
import { toTraditional, getSameFilePieces } from './xiangqi-notation';
import { ALL_SQUARES } from './boards';

/**
 * Format history entries for display, respecting the notation setting.
 * Traditional (中文) notation needs the board position before each move, so we
 * replay the game from the start position.
 */
export function formatHistoryForDisplay(
  history: readonly HistoryEntry[],
  xiangqiNotation: 'iccs' | 'traditional',
): string[] {
  if (xiangqiNotation !== 'traditional') {
    return history.map(h => h.san);
  }

  const rules = new XiangqiRules();
  const result: string[] = [];

  const boardMap = (): Record<Square, Piece> => {
    const map: Record<Square, Piece> = {};
    for (const sq of ALL_SQUARES) {
      const p = rules.pieceAt(sq);
      if (p) map[sq] = p;
    }
    return map;
  };

  for (const entry of history) {
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
    const side = piece.side;
    const boardBefore = boardMap();
    const fileIdx = from.charCodeAt(0) - 97;
    try {
      result.push(
        toTraditional(from, to, piece.type, side, sq => boardBefore[sq] ?? null, (fi, pt, s) =>
          getSameFilePieces(boardBefore, fi, pt, s),
        ),
      );
    } catch {
      result.push(entry.san);
    }
    rules.move(entry.uci);
  }

  return result;
}
