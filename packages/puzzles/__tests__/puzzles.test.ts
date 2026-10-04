import { describe, it, expect } from 'vitest';
import { XIANGQI_PUZZLES } from '../src/data/xiangqi';
import { XIANGQI_LARGE_PUZZLES } from '../src/data/xiangqi_large';
import { validatePuzzle } from '../src/validate';
import { ALL_PUZZLES, ALL_WITH_LARGE, listForPuzzle } from '../src/index';

describe('puzzles dataset', () => {
  it('all curated puzzles have valid FEN and a legal solution move', () => {
    for (const p of ALL_PUZZLES) {
      const r = validatePuzzle(p);
      expect(r.ok, `${p.id}: ${r.error} fen=${p.fen} solution=${p.solution.join(',')}`).toBe(true);
    }
  });

  it('all puzzle ids are unique across both lists', () => {
    const ids = ALL_WITH_LARGE.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dataset sizes match the documented counts', () => {
    expect(XIANGQI_PUZZLES.length).toBe(12);
    expect(XIANGQI_LARGE_PUZZLES.length).toBe(100);
    expect(ALL_WITH_LARGE.length).toBe(112);
  });

  it('every puzzle is xiangqi (experimental build is xiangqi-only)', () => {
    for (const p of ALL_WITH_LARGE) {
      expect(p.gameType).toBe('xiangqi');
    }
  });

  it('ratings are 1-5', () => {
    for (const p of ALL_PUZZLES) {
      expect([1, 2, 3, 4, 5]).toContain(p.rating);
    }
  });

  it('listForPuzzle routes ids to the right list', () => {
    expect(listForPuzzle(ALL_PUZZLES[0]!).length).toBe(12);
    expect(listForPuzzle(XIANGQI_LARGE_PUZZLES[0]!).length).toBe(100);
  });
});
