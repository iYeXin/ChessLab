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
  strengthOptionSpec,
} from '../src/profiles';

describe('Pikafish profile', () => {
  it('pins the version that still exposes native strength options', () => {
    expect(PIKAFISH_VERSION).toBe('2023-03-05');
    // These are exactly why this version was chosen — later releases dropped them.
    expect(PIKAFISH_PROFILE.supportsLimitStrength).toBe(true);
    expect(PIKAFISH_PROFILE.supportsSkillLevel).toBe(true);
    expect(PIKAFISH_PROFILE.requiresExternalNnue).toBe(true);
    expect(getProfile('pikafish')).toBe(PIKAFISH_PROFILE);
    expect(Object.keys(ENGINE_PROFILES)).toEqual(['pikafish']);
  });

  it('documents the option ranges taken from the engine `uci` dump', () => {
    expect(strengthOptionSpec('UCI_Elo')).toMatchObject({ type: 'spin', min: 1350, max: 2850 });
    expect(strengthOptionSpec('Skill Level')).toMatchObject({ type: 'spin', min: 0, max: 20 });
    expect(strengthOptionSpec('Repetition Rule')).toMatchObject({
      type: 'combo',
      vars: ['AsianRule', 'ChineseRule'],
    });
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

describe('mode 2 — engineOptionsStrategy', () => {
  it('maps levels onto the engine-reported Elo range', () => {
    expect(engineOptionsStrategy().id).toBe('engine-options');
    const eloSpec = strengthOptionSpec('UCI_Elo')!;
    const min = eloSpec.min!;
    const max = eloSpec.max!;

    const low = engineOptionPresetForLevel(1);
    const high = engineOptionPresetForLevel(20);
    expect(low.options.UCI_Elo).toBe(min);
    expect(high.options.UCI_Elo).toBe(max);

    // Monotonically increasing across every level.
    let prev = -Infinity;
    for (let lvl = 1; lvl <= 20; lvl++) {
      const elo = engineOptionPresetForLevel(lvl).options.UCI_Elo as number;
      expect(elo).toBeGreaterThanOrEqual(prev);
      expect(elo).toBeGreaterThanOrEqual(min);
      expect(elo).toBeLessThanOrEqual(max);
      prev = elo;
    }
  });

  it('enables native limiting and stays deterministic (no randomisation)', () => {
    const plan = engineOptionsStrategy().plan({ level: 10 });
    expect(plan.options.UCI_LimitStrength).toBe(true);
    expect(plan.options.MultiPV).toBe(1);
    // multiPv 1 means choosePikafishMove returns the engine bestmove verbatim.
    expect(plan.spec.multiPv).toBe(1);
    expect(plan.spec.ambiguityWindowCp).toBe(0);
    expect(plan.spec.absoluteFloorCp).toBe(0);
  });

  it('clamps out-of-range levels', () => {
    expect(engineOptionPresetForLevel(-5).options.UCI_Elo).toBe(1350);
    expect(engineOptionPresetForLevel(999).options.UCI_Elo).toBe(2850);
  });

  it('lets user overrides win over the preset', () => {
    const { options, limits } = engineOptionPresetForLevel(10, undefined, {
      options: { UCI_Elo: 2000, 'Skill Level': 7, 'Repetition Rule': 'ChineseRule' },
      limits: { depth: 12, nodes: 50_000 },
    });
    expect(options.UCI_Elo).toBe(2000);
    expect(options['Skill Level']).toBe(7);
    expect(options['Repetition Rule']).toBe('ChineseRule');
    expect(limits.depth).toBe(12);
    expect(limits.nodes).toBe(50_000);
  });

  it('drops empty / non-numeric overrides instead of sending them', () => {
    const { options, limits } = engineOptionPresetForLevel(10, undefined, {
      options: { 'Skill Level': '', UCI_Elo: 1 },
      limits: { depth: Number.NaN as unknown as number },
    });
    expect(options['Skill Level']).toBeUndefined();
    expect(options.UCI_Elo).toBe(1);
    expect(limits.depth).toBeUndefined();
  });

  it('honours a full custom option set through the strategy', () => {
    const strategy = engineOptionsStrategy({ options: { UCI_LimitStrength: false, 'Skill Level': 3 } });
    const plan = strategy.plan({ level: 18 });
    expect(plan.options.UCI_LimitStrength).toBe(false);
    expect(plan.options['Skill Level']).toBe(3);
  });
});
