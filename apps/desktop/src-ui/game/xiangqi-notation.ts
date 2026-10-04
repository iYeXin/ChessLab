import type { Piece, Square } from '@chessnext/rules-core';

// Chinese piece names per side
const NAMES: Record<'w' | 'b', Record<string, string>> = {
  w: { k: '帅', a: '仕', b: '相', r: '俥', n: '傌', c: '炮', p: '兵' },
  b: { k: '将', a: '士', b: '象', r: '車', n: '馬', c: '砲', p: '卒' },
};

const FILE_CHINESE = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * Convert a move to traditional Chinese notation like "炮二平五" or "兵五进一".
 * boardBefore is a function to get piece at square, and the side to move.
 * from/to are ICCS squares like "h2" -> file h, rank 2.
 */
export function toTraditional(
  from: Square,
  to: Square,
  pieceType: string,
  side: 'w' | 'b',
  boardBefore: (sq: Square) => Piece | null,
  allSquaresWithSamePieceOnFile: (fileIdx: number, pieceType: string, side: 'w' | 'b') => Square[],
): string {
  const pieceName = NAMES[side][pieceType] ?? pieceType;

  // File indices: ICCS file a-i (0-8), rank 0-9 (0 is Red back rank)
  const fileOf = (sq: Square) => sq.charCodeAt(0) - 97; // a->0
  const rankOf = (sq: Square) => Number(sq.slice(1));

  const fromFileIdx = fileOf(from);
  const toFileIdx = fileOf(to);
  const fromRank = rankOf(from);
  const toRank = rankOf(to);

  // Traditional file numbers: from player's perspective, 1 is on the right
  const toFileNum = (fileIdx: number, s: 'w' | 'b') => (s === 'w' ? 9 - fileIdx : fileIdx + 1);
  const fromFileNum = toFileNum(fromFileIdx, side);
  const toFileNumVal = toFileNum(toFileIdx, side);

  // For pawn, advisor, bishop, etc., need to handle same file multiple pieces
  // Determine if there are two same pieces on the same file before the move
  const sameFilePieces = allSquaresWithSamePieceOnFile(fromFileIdx, pieceType, side);
  let prefix = '';
  if (sameFilePieces.length > 1) {
    // Sort by rank: for Red, front is larger rank (closer to opponent); for Black, smaller rank is front
    // In xiangqi, "前" is the piece closer to the opponent (more advanced)
    // For Red, higher rank (larger number) is more advanced (towards Black)
    // For Black, lower rank (smaller number) is more advanced (towards Red)
    const sorted = [...sameFilePieces].sort((a, b) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (side === 'w') return rb - ra; // descending for Red: front is larger rank
      return ra - rb; // for Black: front is smaller rank
    });
    const idx = sorted.indexOf(from);
    const count = sameFilePieces.length;
    if (idx !== -1) {
      if (count === 2) {
        prefix = idx === 0 ? '前' : '后';
      } else if (count === 3) {
        if (idx === 0) prefix = '前';
        else if (idx === 1) prefix = '中';
        else prefix = '后';
      } else if (count === 4) {
        // 4 子同列: 前/二/三/后（官方2007规则）
        const map4 = ['前', '二', '三', '后'];
        prefix = map4[idx] ?? '';
      } else if (count >= 5) {
        // 5 子同列: 前/二/三/四/后
        const map5 = ['前', '二', '三', '四', '后'];
        if (count === 5) {
          prefix = map5[idx] ?? '';
        } else {
          // 理论上限 5 兵，>5 时前、后固定，中段按序二三四…
          if (idx === 0) prefix = '前';
          else if (idx === count - 1) prefix = '后';
          else {
            const mids = ['二', '三', '四', '五', '六', '七'];
            prefix = mids[idx - 1] ?? String(idx + 1);
          }
        }
      }
    }
    // For 前/中/后 case, we don't use file number, we use 前/中/后 + piece name
    // e.g., "前兵进一" or "后炮平五" or "二兵平三"
    // The full notation becomes "前兵进一" etc., without file number
    if (prefix) {
      const act = getAction(fromFileIdx, fromRank, toFileIdx, toRank, side, pieceType);
      let suffix = '';
      if (act === '平') {
        suffix = FILE_CHINESE[toFileNumVal] ?? String(toFileNumVal);
      } else {
        if (pieceType === 'n' || pieceType === 'b' || pieceType === 'a' || pieceType === 'k') {
          suffix = FILE_CHINESE[toFileNumVal] ?? String(toFileNumVal);
        } else {
          const dist = getRankDistance(fromRank, toRank, side);
          suffix = FILE_CHINESE[dist] ?? String(dist);
        }
      }
      return `${prefix}${pieceName}${act}${suffix}`;
    }
  }

  // No disambiguation needed, use normal notation: Piece + fromFileNum + action + suffix
  const action = getAction(fromFileIdx, fromRank, toFileIdx, toRank, side, pieceType);
  let suffix = '';
  if (action === '平') {
    suffix = FILE_CHINESE[toFileNumVal] ?? String(toFileNumVal);
  } else {
    if (pieceType === 'n' || pieceType === 'b' || pieceType === 'a' || pieceType === 'k') {
      suffix = FILE_CHINESE[toFileNumVal] ?? String(toFileNumVal);
    } else {
      const dist = getRankDistance(fromRank, toRank, side);
      suffix = FILE_CHINESE[dist] ?? String(dist);
    }
  }

  return `${pieceName}${FILE_CHINESE[fromFileNum] ?? String(fromFileNum)}${action}${suffix}`;
}

function getAction(
  fromFileIdx: number,
  fromRank: number,
  toFileIdx: number,
  toRank: number,
  side: 'w' | 'b',
  pieceType: string,
): '进' | '退' | '平' {
  if (fromRank === toRank) return '平';
  // For Red, forward is increasing rank (towards Black)
  // For Black, forward is decreasing rank (towards Red)
  const isForward = side === 'w' ? toRank > fromRank : toRank < fromRank;
  return isForward ? '进' : '退';
}

function getRankDistance(fromRank: number, toRank: number, side: 'w' | 'b'): number {
  // Distance in terms of player's perspective ranks (1-10)
  // For Red, rank distance is toRank - fromRank (positive forward)
  // For Black, rank distance is fromRank - toRank
  // But traditional notation uses the number of intersections moved, not the file number
  // For vertical moves, it's the number of ranks moved
  // For simplicity, use absolute difference
  // However, for pieces like king, advisor, bishop, the distance is not used; they use file
  // So this is only for rook, cannon, pawn vertical moves
  const diff = Math.abs(toRank - fromRank);
  return diff;
}

// Helper to get all squares with same piece type on same file
export function getSameFilePieces(
  board: Record<Square, Piece>,
  fileIdx: number,
  pieceType: string,
  side: 'w' | 'b',
): Square[] {
  const result: Square[] = [];
  for (const sq in board) {
    const p = board[sq];
    if (!p || p.side !== side || p.type !== pieceType) continue;
    const f = sq.charCodeAt(0) - 97;
    if (f === fileIdx) result.push(sq);
  }
  return result;
}
