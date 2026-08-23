import { describe, expect, it } from 'vitest';
import { ChessRules } from '../src';

describe('ChessRules', () => {
  it('starts from the initial position', () => {
    const r = new ChessRules();
    expect(r.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(r.turn()).toBe('w');
    expect(r.result()).toBeNull();
    expect(r.moves()).toHaveLength(20);
  });

  it('plays the Scholar’s Mate sequence and detects checkmate', () => {
    const r = new ChessRules();
    for (const uci of ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6']) {
      expect(r.move(uci)).not.toBeNull();
    }
    expect(r.move('h5f7')).toMatchObject({ san: 'Qxf7#' });
    expect(r.result()).toEqual({ winner: 'w', reason: 'checkmate' });
    expect(r.isCheck()).toBe(true);
  });

  it('rejects a move that leaves the king in check', () => {
    // White Ka1 cannot step to b1: black queen c2 covers b1 diagonally
    // WITHOUT checking a1 — so a1b1 is illegal while h2h3 is fine.
    const r = new ChessRules('k7/8/8/8/8/8/2q4P/K7 w - - 0 1');
    expect(r.move('a1b1')).toBeNull();
    expect(r.move('h2h3')).not.toBeNull();
  });

  it('detects stalemate as a draw', () => {
    const r = new ChessRules('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    // Black king h8: Qf7 guards g8/g7/h7... Kg6 covers g7,h7,g8 -> stalemate.
    expect(r.result()).toEqual({ winner: null, reason: 'stalemate' });
  });

  it('detects insufficient material', () => {
    const r = new ChessRules('k7/8/8/8/8/8/8/7K w - - 0 1');
    expect(r.result()).toEqual({ winner: null, reason: 'insufficient-material' });
  });

  it('supports undo and history', () => {
    const r = new ChessRules();
    r.move('e2e4');
    r.move('e7e5');
    expect(r.history().map(h => h.uci)).toEqual(['e2e4', 'e7e5']);
    expect(r.undo()).toBe(true);
    expect(r.history()).toHaveLength(1);
    expect(r.turn()).toBe('b');

    const empty = new ChessRules();
    expect(empty.undo()).toBe(false);
  });

  it('handles promotion with the uci suffix', () => {
    const r = new ChessRules('k7/7P/8/8/8/8/8/K7 w - - 0 1');
    const m = r.move('h7h8q');
    expect(m?.promotion).toBe('q');
    // Qh8 gives check along the 8th rank.
    expect(m?.san.startsWith('h8=Q')).toBe(true);
    expect(r.fen()).toContain('Q');
  });

  it('clones into independent speculative branches', () => {
    const main = new ChessRules();
    main.move('e2e4');
    // Cloning by FEN intentionally drops repetition history (documented).
    const branch = main.clone();
    branch.move('e7e5');
    expect(main.history()).toHaveLength(1);
    expect(branch.history()).toHaveLength(1);
    expect(branch.fen()).not.toBe(main.fen());
  });
});
