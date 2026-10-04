/**
 * Which difficulty strategy (engine mode) each side plays.
 *
 * Kept dependency-free so it can be unit tested in plain Node.
 *
 * Why this exists: 观战 lets Red and Black use different modes (heterogeneous),
 * but 人机 / 残局 have a single engine opponent. Resolving "per side" from
 * settings that always carry 观战 defaults would silently ignore the mode the
 * player picked — e.g. choosing mode 3 (ONNX) in 人机 still spawned Pikafish,
 * because the per-side default was 1. So the caller must be explicit: it passes
 * `watchModes` **only** for 观战.
 */

export type EngineModeLike = 1 | 2 | 3;

export interface WatchModePlan {
  white: EngineModeLike;
  black: EngineModeLike;
}

export interface SideModePlan {
  w: EngineModeLike;
  b: EngineModeLike;
}

/**
 * @param engineMode mode for the single engine opponent (人机 / 残局)
 * @param watchModes set **only** in 观战 to give each side its own mode
 */
export function resolveSideModes(engineMode: EngineModeLike, watchModes?: WatchModePlan): SideModePlan {
  if (!watchModes) return { w: engineMode, b: engineMode };
  return { w: watchModes.white, b: watchModes.black };
}

/**
 * True when every side that runs an engine is on the ONNX tier model, i.e. no
 * UCI process is needed at all (so assist analysis is unavailable).
 */
export function isOnnxOnly(modes: readonly EngineModeLike[]): boolean {
  return modes.length > 0 && modes.every(m => m === 3);
}
