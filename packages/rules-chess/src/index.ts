import { Chess, type Move } from 'chess.js';
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

/**
 * International chess rules backed by chess.js (BSD-2-Clause).
 *
 * chess.js v1 throws on illegal moves instead of returning null, so the raw
 * library calls are wrapped here — the adapter contract stays null-returning.
 */
export class ChessRules implements RulesAdapter {
  readonly gameType = 'chess' as const;
  private c: Chess;

  constructor(fen?: string) {
    this.c = fen ? new Chess(fen) : new Chess();
  }

  reset(fen?: string): void {
    this.c = fen ? new Chess(fen) : new Chess();
  }

  fen(): string {
    return this.c.fen();
  }

  turn(): Side {
    return this.c.turn();
  }

  moves(opts?: { square?: Square }): LegalMove[] {
    const verbose = this.c.moves({ square: opts?.square as never, verbose: true }) as Move[];
    return verbose.map(m => ({
      // chess.js exposes `lan`; fall back to manual composition for safety.
      uci: m.lan ?? `${m.from}${m.to}${m.promotion ?? ''}`,
      from: m.from,
      to: m.to,
      ...(m.promotion ? { promotion: m.promotion } : {}),
      san: m.san,
    }));
  }

  move(uci: string): LegalMove | null {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      const m = this.c.move({ from, to, promotion });
      if (!m) return null;
      return {
        uci: m.lan ?? `${m.from}${m.to}${m.promotion ?? ''}`,
        from: m.from,
        to: m.to,
        ...(m.promotion ? { promotion: m.promotion } : {}),
        san: m.san,
      };
    } catch {
      return null;
    }
  }

  undo(): boolean {
    return this.c.undo() !== null;
  }

  isCheck(): boolean {
    return this.c.isCheck();
  }

  pieceAt(square: Square): Piece | null {
    const p = this.c.get(square as never);
    if (!p) return null;
    return { type: p.type as PieceType, side: p.color as Side };
  }

  result(): GameResult | null {
    if (this.c.isCheckmate()) {
      return { winner: other(this.c.turn()), reason: 'checkmate' };
    }
    if (this.c.isStalemate()) return { winner: null, reason: 'stalemate' };
    if (this.c.isInsufficientMaterial()) {
      return { winner: null, reason: 'insufficient-material' };
    }
    if (this.c.isThreefoldRepetition()) return { winner: null, reason: 'repetition' };
    if (this.c.isDrawByFiftyMoves()) return { winner: null, reason: 'fifty-move-rule' };
    if (this.c.isDraw()) return { winner: null, reason: 'agreement' };
    return null;
  }

  history(): readonly HistoryEntry[] {
    return (this.c.history({ verbose: true }) as Move[]).map(m => ({
      uci: m.lan ?? `${m.from}${m.to}${m.promotion ?? ''}`,
      san: m.san,
    }));
  }

  /**
   * Note: cloning by FEN drops the repetition history. Good enough for
   * speculative branches (hints); the live game keeps using this instance.
   */
  clone(): RulesAdapter {
    return new ChessRules(this.c.fen());
  }
}

export const chessInitialFen = INITIAL_FENS.chess;
