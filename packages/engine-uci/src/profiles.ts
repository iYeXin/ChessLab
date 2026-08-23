import type { EngineId, EngineProfile, UciOptionValue } from './types';

/**
 * Per-engine profiles. Version-pinned binaries are distributed with the app
 * (see scripts/fetch-engines.ps1); profiles describe only what the protocol
 * layer needs to know.
 */

export const STOCKFISH_PROFILE: EngineProfile = {
  id: 'stockfish',
  gameType: 'chess',
  displayName: 'Stockfish',
  binaryName: 'stockfish',
  defaultOptions: {
    // Conservative mobile-friendly defaults; the session layer tunes these
    // per device (cores/RAM) at startup.
    Threads: 2,
    Hash: 128,
    MultiPV: 1,
  },
  supportsLimitStrength: true, // UCI_LimitStrength + UCI_Elo (1320-3190)
  supportsSkillLevel: true,
  requiresExternalNnue: false, // default nets are embedded since SF16
};

export const PIKAFISH_PROFILE: EngineProfile = {
  id: 'pikafish',
  gameType: 'xiangqi',
  displayName: 'Pikafish 皮卡鱼',
  binaryName: 'pikafish',
  defaultOptions: {
    Threads: 2,
    Hash: 128,
  },
  // Verified against the Pikafish 2026-01-02 option list: it exposes neither
  // Skill Level nor UCI_LimitStrength/UCI_Elo. Weakening therefore happens
  // purely through think-time scaling (see pickThinkTimeMs).
  supportsLimitStrength: false,
  supportsSkillLevel: false,
  requiresExternalNnue: true, // ships as external pikafish.nnue -> EvalFile
};

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  stockfish: STOCKFISH_PROFILE,
  pikafish: PIKAFISH_PROFILE,
};

export function getProfile(id: EngineId): EngineProfile {
  const p = ENGINE_PROFILES[id];
  if (!p) throw new Error(`unknown engine id: ${id}`);
  return p;
}

/** Options actually sent to the engine for a given strength level (1..20). */
export function computeStrengthOptions(
  profile: EngineProfile,
  availableOptions: ReadonlyMap<string, unknown>,
  level: number,
): Record<string, UciOptionValue> {
  const lvl = clamp(Math.round(level), 1, 20);
  const has = (name: string) => availableOptions.has(name);

  if (profile.supportsLimitStrength && has('UCI_LimitStrength') && has('UCI_Elo')) {
    const minElo = Number((availableOptions.get('UCI_Elo') as { min?: number })?.min ?? 1320);
    const maxElo = Number((availableOptions.get('UCI_Elo') as { max?: number })?.max ?? 3190);
    const elo = Math.round(minElo + ((maxElo - minElo) * (lvl - 1)) / 19);
    return { UCI_LimitStrength: true, UCI_Elo: elo };
  }

  if (profile.supportsSkillLevel && has('Skill Level')) {
    // Skill Level spin options run 0..20 on both engines.
    return { 'Skill Level': lvl - 1 };
  }

  return {};
}

/**
 * Simple think-time policy for engine turns:
 * fixed comfortable time scaled by level, optionally capped by the clock.
 */
export function pickThinkTimeMs(
  level: number,
  clock?: { remainingMs?: number; incrementMs?: number },
): number {
  const lvl = clamp(Math.round(level), 1, 20);
  let t = 250 + lvl * lvl * 6.5; // ~0.3s .. ~2.8s across levels
  if (clock?.remainingMs !== undefined) {
    const safe = Math.max(80, (clock.remainingMs + (clock.incrementMs ?? 0)) / 30);
    t = Math.min(t, safe);
  }
  return Math.round(t);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
