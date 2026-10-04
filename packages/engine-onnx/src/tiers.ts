/**
 * Tier metadata for the T1–T5 ladder.
 *
 * Transcribed from the research artifact `export/tiers.json` so the UI can
 * describe the ladder without a network/file read. If the models are refreshed,
 * update this table too (scripts/fetch-models.mjs can print the source values).
 *
 * ⚠️ Wording guard (from the research doc §10): these tiers must NOT be
 * described as "corresponding to an amateur rank" or as playing "like a human".
 * The difficulty comes from *insufficient training*, so a tier plays like a
 * degraded version of one strong player. What MAY be claimed: monotonically
 * increasing difficulty, adjacent tiers distinguishable, small size, runs
 * on-device.
 */

export type TierId = 1 | 2 | 3 | 4 | 5;

export const TIER_IDS: readonly TierId[] = [1, 2, 3, 4, 5] as const;

export interface TierMeta {
  tier: TierId;
  /** Display id, e.g. "T3". */
  id: string;
  /** Training positions seen by this tier. */
  trainRecords: number;
  /** Offline top-1 policy accuracy on the shared validation split. */
  valTop1: number;
  valTop3: number;
  valValueAcc: number;
}

export const TIER_META: readonly TierMeta[] = [
  { tier: 1, id: 'T1', trainRecords: 100_304, valTop1: 0.2913, valTop3: 0.5245, valValueAcc: 0.7355 },
  { tier: 2, id: 'T2', trainRecords: 300_939, valTop1: 0.3286, valTop3: 0.5779, valValueAcc: 0.7958 },
  { tier: 3, id: 'T3', trainRecords: 1_005_087, valTop1: 0.3752, valTop3: 0.6385, valValueAcc: 0.8372 },
  { tier: 4, id: 'T4', trainRecords: 3_014_632, valTop1: 0.4111, valTop3: 0.6841, valValueAcc: 0.8718 },
  { tier: 5, id: 'T5', trainRecords: 9_905_000, valTop1: 0.4387, valTop3: 0.7187, valValueAcc: 0.8928 },
] as const;

export function tierMeta(tier: TierId): TierMeta {
  const m = TIER_META.find(t => t.tier === tier);
  if (!m) throw new Error(`unknown tier: ${tier}`);
  return m;
}

/** Public path (served by the WebView) of a tier's fp16 model. */
export function tierModelPath(tier: TierId): string {
  return `/models/tier_T${tier}/model_fp16.onnx`;
}

/** Difficulty level 1..5 (入门..特级) maps straight onto T1..T5. */
export function tierForDifficulty(difficulty: number): TierId {
  const d = Math.min(5, Math.max(1, Math.round(difficulty)));
  return d as TierId;
}
