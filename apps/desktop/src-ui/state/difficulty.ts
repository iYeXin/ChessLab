import { TIER_IDS, type TierId } from '@chessnext/engine-onnx';

/**
 * Difficulty <-> engine level mapping, shared by the setup screen, the puzzles
 * screen, the difficulty modal and the engine factories.
 */

/** Engine strength levels behind the five difficulty labels. */
export const DIFFICULTY_LEVELS = [2, 6, 10, 14, 18] as const;

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTY_LABELS = ['入门', '业余', '进阶', '大师', '特级'] as const;

export const DIFFICULTY_IDS: readonly Difficulty[] = [1, 2, 3, 4, 5] as const;

export function levelForDifficulty(difficulty: Difficulty): number {
  return DIFFICULTY_LEVELS[difficulty - 1] ?? 10;
}

/** Nearest difficulty for an arbitrary engine level (round-trip safe). */
export function difficultyForLevel(level: number): Difficulty {
  const exact = DIFFICULTY_LEVELS.indexOf(level as (typeof DIFFICULTY_LEVELS)[number]);
  if (exact >= 0) return (exact + 1) as Difficulty;
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  DIFFICULTY_LEVELS.forEach((l, i) => {
    const d = Math.abs(l - level);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  });
  return (best + 1) as Difficulty;
}

/**
 * Mode 3 tier for an engine level. Off-scale levels (a hint asks for strength
 * 20) resolve to the nearest tier, i.e. the strongest available.
 */
export function tierForLevel(level: number): TierId {
  return TIER_IDS[difficultyForLevel(level) - 1] ?? 3;
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_LABELS[difficulty - 1] ?? '';
}
