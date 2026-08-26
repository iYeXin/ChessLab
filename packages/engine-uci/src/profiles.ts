import type { MoveUci } from '@chesslab/rules-core';
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
// Pikafish host-side weakening
// ---------------------------------------------------------------------------

/**
 * Why not movetime? Pikafish 2026-01-02 exposes no UCI_Elo / Skill Level
 * (verified via `uci` dump). Movetime-only weakening is hardware-dependent:
 * a 3× CPU gap (desktop vs mid phone) makes the same level play at very
 * different strength, and quiet positions still find the best move in <300ms.
 *
 * Policy (v2 — "natural variety", no deliberate mistakes):
 *  - Strength comes from the SEARCH BUDGET: `nodes` + shallow `depth` guard
 *    (deterministic across devices), with `movetime` only as a slow-device
 *    safety cap.
 *  - Randomness applies ONLY among "equally playable" moves: when several
 *    candidates sit within a small ambiguity window of the best move
 *    (分差不悬殊), pick one at random — the variety of a human choosing
 *    between plans, without gifting material.
 *  - Safety rails (不致命): never randomize away a forced mate; never pick a
 *    line that gets mated; never pick below the absolute score floor.
 *    If no alternative qualifies, the best move is played — always.
 */
export interface PikafishStrengthSpec {
  /** UCI `go` limits (nodes/depth + movetime cap). */
  limits: import('./types').GoLimits;
  /** MultiPV to request (1 = deterministic bestmove). */
  multiPv: number;
  /** Max cp loss vs the best move for it to count as "equally playable". */
  ambiguityWindowCp: number;
  /** Absolute cp floor (engine POV) — candidates below are never picked. */
  absoluteFloorCp: number;
}

export function pikafishSpecForLevel(
  level: number,
  clock?: { remainingMs?: number; incrementMs?: number },
): PikafishStrengthSpec {
  const lvl = clamp(Math.round(level), 1, 20);

  // ---- MultiPV breadth (how many alternatives we can see) -------------------
  // Full strength (16+) stays single-PV deterministic.
  let multiPv: number;
  if (lvl <= 4) multiPv = 4;
  else if (lvl <= 8) multiPv = 3;
  else if (lvl <= 14) multiPv = 2;
  else multiPv = 1;

  // Ambiguity window: how much worse a move may be and still count as
  // "a different plan" rather than a mistake. Narrows with level.
  const ambiguityWindowCp =
    lvl <= 4 ? 90 : lvl <= 8 ? 70 : lvl <= 12 ? 50 : lvl <= 14 ? 35 : 30;

  // Absolute floor: never pick a move this bad even if within the window
  // (protects against "slightly worse" drifting into "objectively losing").
  const absoluteFloorCp = -clamp(100 - lvl * 5, 30, 90);

  // ---- Search budget (nodes/depth + movetime cap) ---------------------------
  const movetimeCap = pickThinkTimeMs(lvl, clock);

  // Levels 16-20 are “full strength” — let the engine think with time.
  // Still request MultiPV=1 so the bestmove path stays fast.
  if (lvl >= 16) {
    return {
      limits: { movetimeMs: movetimeCap },
      multiPv,
      ambiguityWindowCp,
      absoluteFloorCp,
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
    ambiguityWindowCp,
    absoluteFloorCp,
  };
}

/**
 * Choose the move to actually play from MultiPV infos.
 *
 * Randomizes ONLY among near-equal alternatives (loss ≤ ambiguityWindowCp,
 * not getting mated, not below absoluteFloorCp). A forced mate is always
 * played; if nothing is genuinely comparable, the engine's bestmove stands.
 *
 * `allowCandidate` (optional) vetoes RANDOMIZED alternatives only — the
 * engine's own bestmove is exempt and always playable. The session layer uses
 * this to keep the variety randomizer from stepping into repetition loops the
 * bestmove itself avoided. Pure function — `rng` injectable for tests.
 */
export function choosePikafishMove(
  infos: ReadonlyMap<number, import('./types').EngineInfo>,
  fallbackBestmove: import('@chesslab/rules-core').MoveUci | null,
  spec: PikafishStrengthSpec,
  rng: () => number = Math.random,
  allowCandidate?: (mv: MoveUci) => boolean,
): import('@chesslab/rules-core').MoveUci | null {
  if (spec.multiPv <= 1 || infos.size <= 1) return fallbackBestmove;

  const sorted = [...infos.values()]
    .filter(i => i.pv[0] && i.multipv !== undefined)
    .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99));

  if (sorted.length === 0) return fallbackBestmove;
  const top = sorted[0]!;
  const topMove = (top.pv[0] as import('@chesslab/rules-core').MoveUci) ?? fallbackBestmove;

  // Forced win on the board — never randomize it away.
  if (top.scoreMate !== undefined && top.scoreMate > 0) return topMove;

  const topScore = scoreToCp(top);

  // "Equally playable" pool: the best move plus every alternative within the
  // ambiguity window that is neither mated nor below the absolute floor.
  const pool = sorted.filter(c => {
    if (c === top) return true;
    if (c.scoreMate !== undefined) return false; // any mating line against us / for us is decisive
    const loss = topScore - scoreToCp(c);
    if (loss < 0 || loss > spec.ambiguityWindowCp) return false; // 悬殊 → not eligible
    if (scoreToCp(c) < spec.absoluteFloorCp) return false; // 致命下限
    const mv = c.pv[0] as import('@chesslab/rules-core').MoveUci;
    if (allowCandidate && !allowCandidate(mv)) return false; // vetoed (e.g. repeats a position)
    return true;
  });

  // Nothing genuinely comparable → play the best move. No deliberate errors.
  if (pool.length <= 1) return topMove;

  // Uniform pick among genuinely comparable moves — natural human variety.
  const pick = pool[Math.floor(rng() * pool.length)]!;
  return (pick.pv[0] as import('@chesslab/rules-core').MoveUci) ?? topMove;
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
