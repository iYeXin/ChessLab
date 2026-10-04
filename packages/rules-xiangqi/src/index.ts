import * as vendor from '../vendor/xiangqi.js';
import {
  INITIAL_FENS,
  other,
  type GameResult,
  type HistoryEntry,
  type LegalMove,
  type MoveUci,
  type Piece,
  type PieceType,
  type RulesAdapter,
  type Side,
  type Square,
} from '@chessnext/rules-core';
import { adjudicateRepetition, positionKey } from './adjudicate';

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
 * - Perpetual-chase (长捉) adjudication is NOT enforced client-side; a third
 *   repetition involving only chase/idle plies stays a draw. Perpetual CHECK
 *   (长将) IS adjudicated as a loss — see src/adjudicate.ts.
 */
export class XiangqiRules implements RulesAdapter {
  readonly gameType = 'xiangqi' as const;
  private g: vendor.XiangqiGame;

  /**
   * Position history for repetition tracking. `posFens[0]` is the position
   * before any ply; `posFens[i]` is the (public-dialect) FEN after ply `i`.
   * `posCounts` incrementally counts occurrences per repetition key.
   */
  private posFens: string[] = [];
  private posCounts = new Map<string, number>();

  constructor(fen?: string) {
    this.g = new Xiangqi(fen ? normalizeFenIn(fen) : undefined);
    this.retrack();
  }

  reset(fen?: string): void {
    this.g.reset();
    if (fen) this.g.load(normalizeFenIn(fen));
    this.retrack();
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
    if (!m) return null;
    this.trackPosition();
    return toLegalMove(m);
  }

  undo(): boolean {
    const ok = this.g.undo() !== null;
    if (ok) this.untrackPosition();
    return ok;
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
    // Third occurrence of the current position → official-rules adjudication:
    // a perpetual checker (长将) LOSES instead of drawing the game. Other
    // repetition combinations remain draws (see src/adjudicate.ts for scope).
    if ((this.posCounts.get(positionKey(this.fen())) ?? 0) >= 3) {
      const verdict = adjudicateRepetition({
        positions: this.posFens,
        moves: this.history().map(h => h.uci),
        createReplay: fen => new XiangqiRules(fen),
      });
      if (verdict) return { winner: verdict.winner, reason: verdict.reason };
      return { winner: null, reason: 'repetition' };
    }
    if (this.g.insufficient_material()) {
      return { winner: null, reason: 'insufficient-material' };
    }
    if (this.g.in_draw()) return { winner: null, reason: 'agreement' };
    return null;
  }

  /** See RulesAdapter.occurrencesAfter — powers anti-repetition guardrails. */
  occurrencesAfter(uci: MoveUci): number {
    if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) return 0;
    const probe = new XiangqiRules(this.fen());
    if (!probe.move(uci)) return 0;
    return (this.posCounts.get(positionKey(probe.fen())) ?? 0) + 1;
  }

  history(): readonly HistoryEntry[] {
    const h = this.g.history({ verbose: true });
    return h.map(m => ({ uci: m.iccs, san: m.iccs }));
  }

  clone(): RulesAdapter {
    // Note: cloning by FEN drops repetition history — same trade-off as the
    // chess adapter; live games always run on the original instance.
    return new XiangqiRules(this.fen());
  }

  /**
   * Node count for the current position, matching Pikafish `go perft <depth>`.
   *
   * NOTE — why this does not call the vendored `xiangqi.js` `perft()`:
   * that helper generates PSEUDO-legal moves and then filters with
   * `if (!king_attacked(turn))` *after* `make_move`, at which point `turn` has
   * already flipped to the OPPONENT. It therefore counts moves that leave the
   * mover's own general en prise and discards moves that give check. Measured
   * at depth 3 from the start position it returns 79446 where the true value
   * (Pikafish 2026-01-02) is 79666 — a defect in the debug utility only; the
   * move generator itself agrees with the engine move-for-move.
   *
   * We therefore walk our own verified legal move list.
   */
  perft(depth: number): number {
    if (depth <= 0) return 1;
    const moves = this.g.moves({ verbose: true }) as vendor.XiangqiPrettyMove[];
    if (depth === 1) return moves.length;
    let nodes = 0;
    for (const m of moves) {
      if (!this.g.move(m.iccs)) continue; // defensive: list came from the engine
      nodes += this.perft(depth - 1);
      this.g.undo();
    }
    return nodes;
  }

  // ---- repetition tracking --------------------------------------------------

  private retrack(): void {
    const fen = this.fen();
    this.posFens = [fen];
    this.posCounts = new Map([[positionKey(fen), 1]]);
  }

  private trackPosition(): void {
    const fen = this.fen();
    this.posFens.push(fen);
    const key = positionKey(fen);
    this.posCounts.set(key, (this.posCounts.get(key) ?? 0) + 1);
  }

  private untrackPosition(): void {
    const fen = this.posFens.pop();
    if (!fen) return;
    const key = positionKey(fen);
    const next = (this.posCounts.get(key) ?? 1) - 1;
    if (next <= 0) this.posCounts.delete(key);
    else this.posCounts.set(key, next);
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
