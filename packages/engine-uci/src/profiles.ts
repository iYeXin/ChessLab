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

// ---------------------------------------------------------------------------
// Pikafish host-side weakening (1+2)
// ---------------------------------------------------------------------------

/**
 * Why not movetime? Pikafish 2026-01-02 exposes no UCI_Elo / Skill Level
 * (verified via `uci` dump). Movetime-only weakening is hardware-dependent:
 * a 3× CPU gap (desktop vs mid phone) makes the same level play at very
 * different strength, and quiet positions still find the best move in <300ms.
 *
 * Robust policy (hardware-independent primary, bounded wall time):
 *  - 1. `nodes` (and a shallow `depth` guard) as the primary limiter — search
 *     tree size is deterministic across devices;
 *  - 2. `movetimeMs` only as a safety cap so slow devices don't stall;
 *  - 3. `MultiPV` + score-windowed random pick emulates Skill Level / human
 *     blunders, giving linear Elo progression instead of “still best but fast”.
 */
export interface PikafishStrengthSpec {
  /** UCI `go` limits (nodes/depth + movetime cap). */
  limits: import('./types').GoLimits;
  /** MultiPV to request (1 = deterministic bestmove). */
  multiPv: number;
  /** Probability to keep the best PV (remainder → random among the window). */
  bestMoveProbability: number;
  /** Max cp loss vs best to still be considered as a blunder candidate. */
  scoreWindowCp: number;
}

export function pikafishSpecForLevel(
  level: number,
  clock?: { remainingMs?: number; incrementMs?: number },
): PikafishStrengthSpec {
  const lvl = clamp(Math.round(level), 1, 20);

  // ---- MultiPV / stochastic policy (mirrors Stockfish Skill Level) ----------
  // low  → many candidates, low best-move rate, wide window
  // high → deterministic
  let multiPv: number;
  if (lvl <= 4) multiPv = 4;
  else if (lvl <= 8) multiPv = 3;
  else if (lvl <= 14) multiPv = 2;
  else multiPv = 1;

  const bestMoveProbability = multiPv === 1 ? 1 : clamp(0.22 + lvl * 0.042, 0.22, 0.95);
  // window narrows as level rises: 350 → 150 cp
  const scoreWindowCp = clamp(Math.round(380 - lvl * 11), 150, 400);

  // ---- Search budget (nodes/depth + movetime cap) ---------------------------
  const movetimeCap = pickThinkTimeMs(lvl, clock);

  // Levels 16-20 are “full strength” — let the engine think with time.
  // Still request MultiPV=1 so the bestmove path stays fast.
  if (lvl >= 16) {
    return {
      limits: { movetimeMs: movetimeCap },
      multiPv,
      bestMoveProbability,
      scoreWindowCp,
    };
  }

  // Hardware-independent primary: nodes. Exponential covers 800 .. ~350k.
  // Tested nps: ~1M on desktop, ~0.3M on mid phone — same nodes = same move.
  // Formula tuned against `go depth`/`nodes` probes on Pikafish 2026-01-02:
  // depth 3≈800 nodes, 6≈3.5k, 10≈30k, 15≈250k.
  const nodes = Math.round(700 * Math.pow(1.52, lvl - 1));
  // Clamp depth so very tactical positions don't explode beyond the node budget.
  const depth = clamp(Math.floor(3.2 + lvl * 0.68), 3, 16);
  // Give nodes a wall-time headroom on slow devices, but never exceed the
  // level's movetime budget by more than 60%.
  const movetimeWithHeadroom = Math.round(movetimeCap * 1.6);

  return {
    limits: { nodes, depth, movetimeMs: movetimeWithHeadroom },
    multiPv,
    bestMoveProbability,
    scoreWindowCp,
  };
}

/**
 * Choose the move to actually play from MultiPV infos.
 * Pure function — `rng` injectable for tests.
 */
export function choosePikafishMove(
  infos: ReadonlyMap<number, import('./types').EngineInfo>,
  fallbackBestmove: import('@chesslab/rules-core').MoveUci | null,
  spec: PikafishStrengthSpec,
  rng: () => number = Math.random,
): import('@chesslab/rules-core').MoveUci | null {
  if (spec.multiPv <= 1 || infos.size <= 1) return fallbackBestmove;

  const sorted = [...infos.values()]
    .filter(i => i.pv[0] && i.multipv !== undefined)
    .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99));

  if (sorted.length === 0) return fallbackBestmove;
  const best = sorted[0]!;
  const bestScore = scoreToCp(best);
  const candidates = sorted.filter(c => {
    if (c === best) return false;
    const s = scoreToCp(c);
    // Mate lines: only keep if best is also mate and mate distance is close
    if (c.scoreMate !== undefined || best.scoreMate !== undefined) {
      if (c.scoreMate === undefined || best.scoreMate === undefined) return false;
      return Math.abs(c.scoreMate - best.scoreMate) <= 2;
    }
    return bestScore - s <= spec.scoreWindowCp;
  });

  if (candidates.length === 0) return (best.pv[0] as import('@chesslab/rules-core').MoveUci) ?? fallbackBestmove;

  if (rng() < spec.bestMoveProbability) {
    return (best.pv[0] as import('@chesslab/rules-core').MoveUci) ?? fallbackBestmove;
  }
  const pick = candidates[Math.floor(rng() * candidates.length)]!;
  return (pick.pv[0] as import('@chesslab/rules-core').MoveUci) ?? fallbackBestmove;
}

function scoreToCp(info: import('./types').EngineInfo): number {
  if (info.scoreMate !== undefined) {
    // Mate in N: treat as ±100000 ∓ N*100 so it sorts as extreme cp
    return info.scoreMate > 0 ? 100_000 - info.scoreMate * 100 : -100_000 - info.scoreMate * 100;
  }
  return info.scoreCp ?? 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
