import { describe, it, expect } from 'vitest';
import { CHESS_PUZZLES } from '../src/data/chess';
import { XIANGQI_PUZZLES } from '../src/data/xiangqi';
import { validatePuzzle } from '../src/validate';
import { ALL_PUZZLES } from '../src/index';

describe('puzzles dataset', () => {
  it('all puzzles have valid FEN and legal solution move', () => {
    for (const p of ALL_PUZZLES) {
      const r = validatePuzzle(p);
      expect(r.ok, `${p.id}: ${r.error} fen=${p.fen} solution=${p.solution.join(',')}`).toBe(true);
    }
  });

  it('all puzzle ids are unique', () => {
    const ids = ALL_PUZZLES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dataset size is small-and-beautiful (<=30)', () => {
    expect(ALL_PUZZLES.length).toBeGreaterThanOrEqual(16);
    expect(ALL_PUZZLES.length).toBeLessThanOrEqual(30);
    expect(CHESS_PUZZLES.length).toBeGreaterThanOrEqual(8);
    expect(XIANGQI_PUZZLES.length).toBeGreaterThanOrEqual(8);
  });

  it('ratings are 1-5', () => {
    for (const p of ALL_PUZZLES) {
      expect([1, 2, 3, 4, 5]).toContain(p.rating);
    }
  });
});
