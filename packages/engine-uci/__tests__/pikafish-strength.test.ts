import { describe, expect, it } from 'vitest';
import { choosePikafishMove, pikafishSpecForLevel } from '../src/profiles';
import type { EngineInfo } from '../src/types';

function info(multipv: number, pv: string[], over: Partial<EngineInfo> = {}): EngineInfo {
  return { multipv, pv, ...over };
}

/** Level 6: multiPv 3, ambiguity window 70cp, floor -70cp. */
const spec = pikafishSpecForLevel(6);

describe('choosePikafishMove (natural variety policy)', () => {
  it('plays the best move when alternatives are far worse (悬殊)', () => {
    const infos = new Map([
      [1, info(1, ['h2e2'], { scoreCp: 120 })],
      [2, info(2, ['b0c2'], { scoreCp: -80 })], // loss 200 ≫ window 70
    ]);
    // rng=0 would pick the first pool member if it were eligible — must not.
    expect(choosePikafishMove(infos, 'h2e2', spec, () => 0)).toBe('h2e2');
  });

  it('randomizes only among near-equal moves', () => {
    const infos = new Map([
      [1, info(1, ['h2e2'], { scoreCp: 30 })],
      [2, info(2, ['b0c2'], { scoreCp: 10 })], // loss 20 ≤ 70 → eligible
      [3, info(3, ['h6g4'], { scoreCp: -90 })], // loss 120 → not eligible
    ]);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      seen.add(choosePikafishMove(infos, 'h2e2', spec, Math.random)!);
    }
    expect(seen.has('h2e2')).toBe(true);
    expect(seen.has('b0c2')).toBe(true);
    expect(seen.has('h6g4')).toBe(false);
  });

  it('never randomizes away a forced mate', () => {
    const infos = new Map([
      [1, info(1, ['e6e9'], { scoreMate: 2 })],
      [2, info(2, ['b0c2'], { scoreCp: 300 })],
    ]);
    for (let i = 0; i < 50; i++) {
      expect(choosePikafishMove(infos, 'e6e9', spec, Math.random)).toBe('e6e9');
    }
  });

  it('excludes candidates that get mated or fall below the absolute floor', () => {
    const infos = new Map([
      [1, info(1, ['h2e2'], { scoreCp: 40 })],
      [2, info(2, ['b0c2'], { scoreCp: 20, scoreMate: -3 })], // gets mated → out
      [3, info(3, ['i0h1'], { scoreCp: -80 })], // below floor -70 (and loss 120) → out
    ]);
    for (let i = 0; i < 50; i++) {
      expect(choosePikafishMove(infos, 'h2e2', spec, Math.random)).toBe('h2e2');
    }
  });

  it('full strength (multiPv 1) is fully deterministic', () => {
    const s20 = pikafishSpecForLevel(20);
    expect(s20.multiPv).toBe(1);
    const infos = new Map([
      [1, info(1, ['h2e2'], { scoreCp: 5 })],
      [2, info(2, ['b0c2'], { scoreCp: 3 })], // near-equal, but no MultiPV → no variety
    ]);
    expect(choosePikafishMove(infos, 'h2e2', s20)).toBe('h2e2');
  });

  it('window narrows with level (high levels rarely deviate)', () => {
    const s2 = pikafishSpecForLevel(2);
    const s14 = pikafishSpecForLevel(14);
    expect(s2.ambiguityWindowCp).toBeGreaterThan(s14.ambiguityWindowCp);
    expect(s2.absoluteFloorCp).toBeLessThan(s14.absoluteFloorCp);
  });

  it('falls back to bestmove when no usable infos', () => {
    expect(choosePikafishMove(new Map(), 'h2e2', spec)).toBe('h2e2');
  });

  it('allowCandidate vetoes randomized alternatives but never the bestmove', () => {
    const infos = new Map([
      [1, info(1, ['h2e2'], { scoreCp: 30 })],
      [2, info(2, ['b0c2'], { scoreCp: 10 })], // near-equal → would be pooled
      [3, info(3, ['h6g4'], { scoreCp: 5 })], // near-equal → would be pooled
    ]);
    const veto = (mv: string) => mv !== 'b0c2' && mv !== 'h6g4'; // only top survives
    for (let i = 0; i < 50; i++) {
      expect(choosePikafishMove(infos, 'h2e2', spec, Math.random, veto)).toBe('h2e2');
    }
    // bestmove exempt from the veto even when it "fails" the predicate.
    expect(choosePikafishMove(infos, 'h2e2', spec, () => 0.5, () => false)).toBe('h2e2');
  });

  it('allowCandidate receives every candidate move', () => {
    const infos = new Map([
      [1, info(1, ['h2e2'], { scoreCp: 30 })],
      [2, info(2, ['b0c2'], { scoreCp: 10 })],
    ]);
    const seen: string[] = [];
    choosePikafishMove(infos, 'h2e2', spec, () => 0, mv => {
      seen.push(mv);
      return true;
    });
    expect(seen).toContain('b0c2'); // the non-top pool member was probed
  });
});
