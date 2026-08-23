import * as vendor from '../vendor/xiangqi.js';
import {
  INITIAL_FENS,
  other,
  type GameResult,
  type HistoryEntry,
  type LegalMove,
  type Piece,
  type PieceType,
  type RulesAdapter,
  type Side,
  type Square,
} from '@chesslab/rules-core';

const Xiangqi = vendor.Xiangqi;

/**
 * Xiangqi (Chinese chess) rules backed by the vendored xiangqi.js (BSD-2).
 *
 * Normalization notes
 * -------------------
 * - xiangqi.js uses turn tokens 'r' (red) / 'b'; we expose 'w' / 'b' with
 *   w === red (first mover), consistent across all games in this app.
 * - Its FEN dialect therefore differs from the public one in the active-color
 *   field only; `normalizeFenIn` / `normalizeFenOut` handle that boundary.
 * - Move coordinates are ICCS ("h2e2", files a-i, ranks 0-9 with rank 0 on
 *   Red's side). This is the same alphabet Pikafish speaks, so moves pass
 *   through to the engine unmodified.
 *
 * Known limitations inherited from upstream (fine for MVP):
 * - Perpetual-check / perpetual-chase (长将/长捉) adjudication is NOT enforced
 *   client-side. Repetition draws are detected as simple threefold repetition.
 */
export class XiangqiRules implements RulesAdapter {
  readonly gameType = 'xiangqi' as const;
  private g: vendor.XiangqiGame;

  constructor(fen?: string) {
    this.g = new Xiangqi(fen ? normalizeFenIn(fen) : undefined);
  }

  reset(fen?: string): void {
    this.g.reset();
    if (fen) this.g.load(normalizeFenIn(fen));
  }

  fen(): string {
    return normalizeFenOut(this.g.fen());
  }

  turn(): Side {
    return this.g.turn() === 'r' ? 'w' : 'b';
  }

  moves(opts?: { square?: Square }): LegalMove[] {
    const raw = this.g.moves({ verbose: true }) as vendor.XiangqiPrettyMove[];
    const filtered =
      opts?.square && opts.square.length >= 2
        ? raw.filter(m => m.from === opts.square)
        : raw;
    return filtered.map(toLegalMove);
  }

  move(uci: string): LegalMove | null {
    if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) return null;
    const m = this.g.move(uci);
    return m ? toLegalMove(m) : null;
  }

  undo(): boolean {
    return this.g.undo() !== null;
  }

  isCheck(): boolean {
    return this.g.in_check();
  }

  pieceAt(square: Square): Piece | null {
    const p = this.g.get(square);
    if (!p) return null;
    // Vendor colors: 'r'(red)/'b' — red is our normalized 'w' (first mover).
    const side: Side = p.color === 'r' ? 'w' : 'b';
    return { type: p.type as PieceType, side };
  }

  result(): GameResult | null {
    if (this.g.in_checkmate()) {
      // Side to move is checkmated -> opponent wins.
      return { winner: other(this.turn()), reason: 'checkmate' };
    }
    if (this.g.in_stalemate()) {
      // 困毙: unlike chess, a stalemated side LOSES.
      return { winner: other(this.turn()), reason: 'no-legal-moves' };
    }
    if (this.g.in_threefold_repetition()) return { winner: null, reason: 'repetition' };
    if (this.g.insufficient_material()) {
      return { winner: null, reason: 'insufficient-material' };
    }
    if (this.g.in_draw()) return { winner: null, reason: 'agreement' };
    return null;
  }

  history(): readonly HistoryEntry[] {
    const h = this.g.history({ verbose: true });
    return h.map(m => ({ uci: m.iccs, san: m.iccs }));
  }

  clone(): RulesAdapter {
    return new XiangqiRules(this.fen());
  }

  /** Direct passthrough for tests / debugging. */
  perft(depth: number): number {
    return this.g.perft(depth);
  }
}

function toLegalMove(m: vendor.XiangqiPrettyMove): LegalMove {
  return { uci: m.iccs, from: m.from, to: m.to, san: m.iccs };
}

/** Public FEN ('w' first-mover token) -> xiangqi.js FEN ('r'). */
function normalizeFenIn(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts[1] === 'w') parts[1] = 'r';
  else if (parts[1] === 'b') parts[1] = 'b';
  return parts.join(' ');
}

/** xiangqi.js FEN ('r') -> public FEN ('w'). */
function normalizeFenOut(fen: string): string {
  const parts = fen.split(/\s+/);
  if (parts[1] === 'r') parts[1] = 'w';
  return parts.join(' ');
}

export const xiangqiInitialFen = INITIAL_FENS.xiangqi;
