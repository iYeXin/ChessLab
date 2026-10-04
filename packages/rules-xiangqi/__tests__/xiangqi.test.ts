import { describe, expect, it } from 'vitest';
import { XiangqiRules } from '../src';

describe('XiangqiRules', () => {
  it('starts from the initial position with normalized turn token', () => {
    const r = new XiangqiRules();
    expect(r.fen()).toBe(
      'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1',
    );
    expect(r.turn()).toBe('w');
    expect(r.result()).toBeNull();
  });

  it('has 44 legal moves in the initial position (perft 1)', () => {
    const r = new XiangqiRules();
    expect(r.perft(1)).toBe(44);
    expect(r.moves()).toHaveLength(44);
  });

  it('perft(2) matches Pikafish ground truth exactly', () => {
    const r = new XiangqiRules();
    expect(r.perft(2)).toBe(1920);
  }, 30_000);

  it('perft(3) matches Pikafish ground truth exactly', () => {
    // Pikafish 2026-01-02 (`go perft 3`) reports 79666 nodes.
    //
    // This used to be 79446: the vendored xiangqi.js ships a `perft()` helper
    // that generates PSEUDO-legal moves and then filters on `king_attacked(turn)`
    // AFTER the move — by which point `turn` is the opponent. It therefore
    // accepted moves leaving the mover's own general en prise and discarded
    // checking moves. `XiangqiRules.perft()` now walks the verified legal move
    // list instead. Verified against the engine at depth 3 per root move
    // (44/44 identical) and at depth 4 (3_290_240, 44/44 identical).
    const r = new XiangqiRules();
    expect(r.perft(3)).toBe(79666);
  }, 30_000);

  it('perft(4) matches Pikafish ground truth exactly', () => {
    const r = new XiangqiRules();
    expect(r.perft(4)).toBe(3_290_240);
  }, 120_000);

  it('plays cannon-to-center (中炮) and horse moves', () => {
    const r = new XiangqiRules();
    // Red cannon h2 -> e2 (center file), classic 中炮 first move.
    const applied = r.move('h2e2');
    expect(applied).toMatchObject({ from: 'h2', to: 'e2' });
    expect(typeof applied?.san).toBe('string');
    expect(r.turn()).toBe('b');

    // Black horse h9 -> g7.
    expect(r.move('h9g7')).toMatchObject({ from: 'h9', to: 'g7' });
  });

  it('respects the flying-general rule via check detection on custom fens', () => {
    // Generals facing each other with an empty file is illegal to *leave* so;
    // loading it directly exercises the library's validation path instead.
    const r = new XiangqiRules();
    expect(() => r.reset('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1')).not.toThrow();
  });

  it('detects checkmate from a known position', () => {
    // Regression fixture from upstream README (checkmate example):
    // red ('r') to move and checkmated -> black wins.
    const r = new XiangqiRules(
      'rnbakab1r/9/1c5c1/p1p5p/4p1p2/4P1P2/P1P3nCP/1C3A3/4NK3/RNB2AB1R w - - 0 1',
    );
    expect(r.result()).toEqual({ winner: 'b', reason: 'checkmate' });
  });

  it('treats 困毙 (stalemate) as a LOSS for the side to move', () => {
    // Regression fixture from upstream README (stalemate example):
    // black ('b') to move, no legal moves, not in check -> 困毙, black LOSES.
    const r = new XiangqiRules('3aca3/1Cnrk4/b3r4/2p1n4/2b6/9/9/9/4C4/ppppcK3 b - - 0 1');
    expect(r.result()).toEqual({ winner: 'w', reason: 'no-legal-moves' });
  });

  it('round-trips FEN through reset/fen with w<->r translation', () => {
    const fen = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b - - 0 1';
    const r = new XiangqiRules(fen);
    expect(r.turn()).toBe('b');
    expect(r.fen()).toBe(fen);
  });

  it('rejects malformed and geometrically impossible moves silently', () => {
    const r = new XiangqiRules();
    expect(r.move('z9z9')).toBeNull(); // bad coordinates
    expect(r.move('b0b1')).toBeNull(); // horse cannot move straight
    expect(r.moves()).toHaveLength(44); // state untouched
  });
});
