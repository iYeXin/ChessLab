import type { MoveUci } from '@chessnext/rules-core';
import type { EngineId, EngineInfo, EngineProfile, GoLimits, UciOptionValue } from './types';

/**
 * Engine profiles. The version-pinned binary is distributed with the app
 * (see scripts/fetch-engines.ps1); profiles describe only what the protocol
 * layer needs to know.
 */

export const PIKAFISH_VERSION = '2023-03-05';

/**
 * Why this specific version: it is the last Pikafish release that still exposes
 * the `Skill Level` spin option (0..20), which is what mode 2 ("engine options")
 * drives. Later releases removed it. Verified with `pikafish-avx2.exe` + `uci`
 * — see PIKAFISH_STRENGTH_OPTIONS.
 */
export const PIKAFISH_PROFILE: EngineProfile = {
  id: 'pikafish',
  gameType: 'xiangqi',
  displayName: `Pikafish ${PIKAFISH_VERSION} 皮卡鱼`,
  binaryName: 'pikafish',
  defaultOptions: {
    Threads: 2,
    Hash: 128,
  },
  requiresExternalNnue: true, // ships as external pikafish.nnue -> EvalFile
};

export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  pikafish: PIKAFISH_PROFILE,
};

export function getProfile(id: EngineId): EngineProfile {
  const p = ENGINE_PROFILES[id];
  if (!p) throw new Error(`unknown engine id: ${id}`);
  return p;
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
// Difficulty strategy seam
// ---------------------------------------------------------------------------

export type StrengthStrategyId = 'host-weakened' | 'engine-options';

/** Everything the driver needs for ONE search. */
export interface TurnPlan {
  /**
   * Complete option set to apply before the search. Authoritative: the runner
   * applies exactly this and injects nothing else.
   */
  options: Record<string, UciOptionValue>;
  /** Search limits, plus the randomisation windows used by host-weakened mode. */
  spec: PikafishStrengthSpec;
}

export interface EngineTurnStrategy {
  readonly id: StrengthStrategyId;
  plan(args: {
    level: number;
    clock?: { remainingMs?: number; incrementMs?: number };
  }): TurnPlan;
}

/**
 * Mode 1 (default) — host-side weakening.
 *
 * Strength comes from the SEARCH BUDGET (`nodes` + shallow `depth`, with
 * `movetime` as a slow-device cap) plus near-equal MultiPV randomisation. This
 * is hardware-independent and works on engines with no native strength knobs.
 */
export function hostWeakenedStrategy(): EngineTurnStrategy {
  return {
    id: 'host-weakened',
    plan({ level, clock }) {
      const spec = pikafishSpecForLevel(level, clock);
      return { options: { MultiPV: spec.multiPv }, spec };
    },
  };
}

/**
 * Mode 2 — drive the engine's OWN strength options. No host-side weakening and
 * no randomisation: the same position with the same options always yields the
 * same move.
 *
 * The user may override any option value and the search budget; ranges are
 * validated against `PIKAFISH_STRENGTH_OPTIONS`.
 */
export function engineOptionsStrategy(overrides?: EngineOptionsOverrides): EngineTurnStrategy {
  return {
    id: 'engine-options',
    plan({ level, clock }) {
      const preset = engineOptionPresetForLevel(level, clock, overrides);
      return {
        options: preset.options,
        // multiPv 1 => choosePikafishMove returns the engine's bestmove verbatim.
        spec: {
          limits: preset.limits,
          multiPv: 1,
          ambiguityWindowCp: 0,
          absoluteFloorCp: 0,
        },
      };
    },
  };
}

export interface EngineOptionsOverrides {
  options?: Record<string, UciOptionValue>;
  limits?: GoLimits;
}

/**
 * Strength knob for mode 2: the engine's own `Skill Level`, spread over the five
 * shipped difficulties.
 *
 * `Skill Level` (0..20) is used rather than `UCI_Elo` on purpose: the engine's
 * Elo floor is 1350, which would make 「入门」 anything but beginner-friendly.
 * The mapping below puts the five difficulties at 0 / 5 / 10 / 15 / 20, i.e.
 * the weakest setting really is the engine's weakest.
 *
 * Levels are the engine levels behind the difficulty labels (2/6/10/14/18), so
 * the linear form below lands exactly on those five anchor points; off-scale
 * levels (a hint asks for 20) clamp to the ends.
 */
export const MODE2_SKILL_MIN_LEVEL = 2;
export const MODE2_SKILL_MAX_LEVEL = 18;

export function mode2SkillForLevel(level: number): number {
  const lvl = clamp(Math.round(level), MODE2_SKILL_MIN_LEVEL, MODE2_SKILL_MAX_LEVEL);
  const span = MODE2_SKILL_MAX_LEVEL - MODE2_SKILL_MIN_LEVEL; // 16
  return clamp(Math.round(((lvl - MODE2_SKILL_MIN_LEVEL) / span) * 20), 0, 20);
}

/** Default option presets for the "engine options" strategy. */
export function engineOptionPresetForLevel(
  level: number,
  clock?: { remainingMs?: number; incrementMs?: number },
  overrides?: EngineOptionsOverrides,
): { options: Record<string, UciOptionValue>; limits: GoLimits } {
  const lvl = clamp(Math.round(level), 1, 20);

  const options: Record<string, UciOptionValue> = {
    'Skill Level': mode2SkillForLevel(lvl),
    // Keep a single PV: mode 2 plays the engine's bestmove verbatim.
    MultiPV: 1,
  };
  const limits: GoLimits = { movetimeMs: pickThinkTimeMs(lvl, clock) };

  if (overrides?.options) {
    for (const [k, v] of Object.entries(overrides.options)) {
      if (v !== undefined && v !== null && v !== '') options[k] = v;
    }
  }
  if (overrides?.limits) {
    for (const [k, v] of Object.entries(overrides.limits)) {
      if (typeof v === 'number' && Number.isFinite(v)) (limits as Record<string, number>)[k] = v;
    }
  }
  return { options, limits };
}

// ---------------------------------------------------------------------------
// Editable engine options (mode 2 UI surface)
// ---------------------------------------------------------------------------

export interface StrengthOptionSpec {
  name: string;
  type: 'check' | 'spin' | 'combo';
  min?: number;
  max?: number;
  vars?: string[];
  /** Engine-reported default (used by the mode 2 editor display). */
  defaultValue: string | number | boolean;
  /** Short Chinese hint for the option editor. */
  hint: string;
}

/**
 * The engine options that actually change how strongly Pikafish 2023-03-05
 * plays, transcribed from `pikafish-avx2.exe` -> `uci`. These drive (and
 * validate) mode 2's editor.
 *
 * Deliberately short. Everything else the engine reports was removed because it
 * does not affect playing strength under this app's fixed search limits:
 *   - `UCI_LimitStrength` / `UCI_Elo` — an alternative strength scale whose
 *     floor (1350) is far too strong for 「入门」; mode 2 uses `Skill Level`.
 *   - `MultiPV` — mode 2 plays the engine's bestmove verbatim, so it changes
 *     nothing here (a placebo control).
 *   - `Slow Mover` / `Move Overhead` / `nodestime` — time-management knobs that
 *     only matter under a `go wtime/btime` clock; we send `go movetime/nodes`.
 *   - `Threads` / `Hash` — resource usage, not playing strength at fixed work.
 *   - `Sixty Move Rule` / `Repetition Rule` / `Repetition Fold` — adjudication.
 *   - `UCI_ShowWDL` — output formatting only.
 */
export const PIKAFISH_STRENGTH_OPTIONS: readonly StrengthOptionSpec[] = [
  { name: 'Skill Level', type: 'spin', min: 0, max: 20, defaultValue: 20, hint: '棋力等级：0 最弱，20 最强' },
  { name: 'Mate Threat Depth', type: 'spin', min: 0, max: 10, defaultValue: 1, hint: '杀棋威胁搜索深度' },
] as const;

export function strengthOptionSpec(name: string): StrengthOptionSpec | undefined {
  return PIKAFISH_STRENGTH_OPTIONS.find(o => o.name === name);
}

/** Search-budget fields the mode 2 editor also exposes (not UCI options). */
export const SEARCH_BUDGET_FIELDS = [
  { key: 'movetimeMs', label: '每步思考时间', unit: 'ms', min: 50, max: 60_000, hint: '固定思考时长' },
  { key: 'nodes', label: '节点上限', unit: 'nodes', min: 100, max: 50_000_000, hint: '按节点数限制搜索' },
  { key: 'depth', label: '深度上限', unit: 'ply', min: 1, max: 60, hint: '按深度限制搜索' },
] as const;

// ---------------------------------------------------------------------------
// Host-side weakening (mode 1)
// ---------------------------------------------------------------------------

/**
 * Why not movetime alone? Movetime-only weakening is hardware-dependent: a 3×
 * CPU gap (desktop vs mid phone) makes the same level play at very different
 * strength, and quiet positions still find the best move in <300ms.
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
  limits: GoLimits;
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
  // Formula tuned against `go depth`/`nodes` probes on Pikafish:
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
  infos: ReadonlyMap<number, EngineInfo>,
  fallbackBestmove: MoveUci | null,
  spec: PikafishStrengthSpec,
  rng: () => number = Math.random,
  allowCandidate?: (mv: MoveUci) => boolean,
): MoveUci | null {
  if (spec.multiPv <= 1 || infos.size <= 1) return fallbackBestmove;

  const sorted = [...infos.values()]
    .filter(i => i.pv[0] && i.multipv !== undefined)
    .sort((a, b) => (a.multipv ?? 99) - (b.multipv ?? 99));

  if (sorted.length === 0) return fallbackBestmove;
  const top = sorted[0]!;
  const topMove = (top.pv[0] as MoveUci) ?? fallbackBestmove;

  // Forced win on the board — never randomize it away.
  if (top.scoreMate !== undefined && top.scoreMate > 0) return topMove;

  const topScore = scoreToCp(top);

  // "Equally playable" pool: the best move plus every alternative within the
  // ambiguity window that is neither mated nor below the absolute floor.
  const pool = sorted.filter(c => {
    if (c === top) return true;
    if (c.scoreMate !== undefined) return false; // any mating line is decisive
    const loss = topScore - scoreToCp(c);
    if (loss < 0 || loss > spec.ambiguityWindowCp) return false; // 悬殊 → not eligible
    if (scoreToCp(c) < spec.absoluteFloorCp) return false; // 致命下限
    const mv = c.pv[0] as MoveUci;
    if (allowCandidate && !allowCandidate(mv)) return false; // vetoed (e.g. repeats a position)
    return true;
  });

  // Nothing genuinely comparable → play the best move. No deliberate errors.
  if (pool.length <= 1) return topMove;

  // Uniform pick among genuinely comparable moves — natural human variety.
  const pick = pool[Math.floor(rng() * pool.length)]!;
  return (pick.pv[0] as MoveUci) ?? topMove;
}

function scoreToCp(info: EngineInfo): number {
  if (info.scoreMate !== undefined) {
    // Mate in N: treat as ±100000 ∓ N*100 so it sorts as extreme cp
    return info.scoreMate > 0 ? 100_000 - info.scoreMate * 100 : -100_000 - info.scoreMate * 100;
  }
  return info.scoreCp ?? 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
