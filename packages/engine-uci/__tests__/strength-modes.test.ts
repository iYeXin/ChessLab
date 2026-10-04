import { describe, expect, it } from 'vitest';
import {
  ENGINE_PROFILES,
  PIKAFISH_PROFILE,
  PIKAFISH_STRENGTH_OPTIONS,
  PIKAFISH_VERSION,
  engineOptionPresetForLevel,
  engineOptionsStrategy,
  getProfile,
  hostWeakenedStrategy,
  mode2SkillForLevel,
  strengthOptionSpec,
} from '../src/profiles';

describe('Pikafish profile', () => {
  it('pins the version that still exposes the Skill Level option', () => {
    expect(PIKAFISH_VERSION).toBe('2023-03-05');
    expect(PIKAFISH_PROFILE.requiresExternalNnue).toBe(true);
    expect(getProfile('pikafish')).toBe(PIKAFISH_PROFILE);
    expect(Object.keys(ENGINE_PROFILES)).toEqual(['pikafish']);
  });

  it('exposes only options that change playing strength', () => {
    // Kept: the strength knob and the mate-threat search depth.
    expect(strengthOptionSpec('Skill Level')).toMatchObject({ type: 'spin', min: 0, max: 20 });
    expect(strengthOptionSpec('Mate Threat Depth')).toMatchObject({ type: 'spin', min: 0, max: 10 });

    // Removed on purpose (see the table's doc comment): an Elo scale whose floor
    // is far too strong for 入门, plus everything that cannot affect the move
    // under this app's fixed search limits.
    for (const gone of [
      'UCI_Elo',
      'UCI_LimitStrength',
      'MultiPV',
      'Slow Mover',
      'nodestime',
      'Move Overhead',
      'Threads',
      'Hash',
      'Sixty Move Rule',
      'Repetition Rule',
      'Repetition Fold',
      'UCI_ShowWDL',
    ]) {
      expect(strengthOptionSpec(gone), gone).toBeUndefined();
    }

    // Every entry must carry a default for the editor to display.
    for (const spec of PIKAFISH_STRENGTH_OPTIONS) {
      expect(spec.defaultValue, spec.name).toBeDefined();
    }
  });
});

describe('mode 1 — hostWeakenedStrategy', () => {
  it('plans search-budget limits and matching MultiPV', () => {
    const plan = hostWeakenedStrategy().plan({ level: 4 });
    expect(hostWeakenedStrategy().id).toBe('host-weakened');
    expect(plan.spec.multiPv).toBe(4);
    expect(plan.options).toEqual({ MultiPV: 4 });
    expect(plan.spec.limits.nodes).toBeGreaterThan(0);
    expect(plan.spec.limits.depth).toBeGreaterThanOrEqual(3);
    expect(plan.spec.ambiguityWindowCp).toBeGreaterThan(0);
  });

  it('goes single-PV and time-based at full strength', () => {
    const plan = hostWeakenedStrategy().plan({ level: 18 });
    expect(plan.spec.multiPv).toBe(1);
    expect(plan.spec.limits.nodes).toBeUndefined();
    expect(plan.spec.limits.movetimeMs).toBeGreaterThan(0);
  });
});

describe('mode 2 — Skill Level mapping', () => {
  it('anchors the five shipped difficulties at 0 / 5 / 10 / 15 / 20', () => {
    // Engine levels behind 入门 / 业余 / 进阶 / 大师 / 特级.
    expect([2, 6, 10, 14, 18].map(mode2SkillForLevel)).toEqual([0, 5, 10, 15, 20]);
  });

  it('keeps 入门 at the engine’s weakest setting', () => {
    // The whole point of using Skill Level instead of UCI_Elo: the Elo floor is
    // 1350, which is not a beginner setting.
    expect(mode2SkillForLevel(2)).toBe(0);
    expect(mode2SkillForLevel(1)).toBe(0);
  });

  it('is monotonic and clamped for off-scale levels', () => {
    let prev = -Infinity;
    for (let lvl = 1; lvl <= 20; lvl++) {
      const skill = mode2SkillForLevel(lvl);
      expect(skill).toBeGreaterThanOrEqual(prev);
      expect(skill).toBeGreaterThanOrEqual(0);
      expect(skill).toBeLessThanOrEqual(20);
      prev = skill;
    }
    expect(mode2SkillForLevel(-5)).toBe(0);
    // A hint asks for strength 20 -> nearest tier's end.
    expect(mode2SkillForLevel(999)).toBe(20);
  });

  it('plans Skill Level and nothing Elo-shaped', () => {
    const { options } = engineOptionPresetForLevel(10);
    expect(options['Skill Level']).toBe(10);
    expect(options.MultiPV).toBe(1);
    expect(options.UCI_LimitStrength).toBeUndefined();
    expect(options.UCI_Elo).toBeUndefined();
  });

  it('stays deterministic (no host-side randomisation)', () => {
    const plan = engineOptionsStrategy().plan({ level: 10 });
    expect(engineOptionsStrategy().id).toBe('engine-options');
    expect(plan.spec.multiPv).toBe(1);
    expect(plan.spec.ambiguityWindowCp).toBe(0);
    expect(plan.spec.absoluteFloorCp).toBe(0);
  });
});

describe('mode 2 — user overrides', () => {
  it('lets overrides win over the preset', () => {
    const { options, limits } = engineOptionPresetForLevel(10, undefined, {
      options: { 'Skill Level': 7, 'Mate Threat Depth': 3 },
      limits: { depth: 12, nodes: 50_000 },
    });
    expect(options['Skill Level']).toBe(7);
    expect(options['Mate Threat Depth']).toBe(3);
    expect(limits.depth).toBe(12);
    expect(limits.nodes).toBe(50_000);
  });

  it('drops empty / non-numeric overrides instead of sending them', () => {
    const { options, limits } = engineOptionPresetForLevel(10, undefined, {
      options: { 'Mate Threat Depth': '', 'Skill Level': 1 },
      limits: { depth: Number.NaN as unknown as number },
    });
    expect(options['Mate Threat Depth']).toBeUndefined();
    expect(options['Skill Level']).toBe(1);
    expect(limits.depth).toBeUndefined();
  });

  it('honours a full custom option set through the strategy', () => {
    const strategy = engineOptionsStrategy({ options: { 'Skill Level': 3, 'Mate Threat Depth': 5 } });
    const plan = strategy.plan({ level: 18 });
    expect(plan.options['Skill Level']).toBe(3);
    expect(plan.options['Mate Threat Depth']).toBe(5);
  });
});
