/**
 * Move-choice temperature presets.
 *
 * From the research doc §5 — do NOT use greedy in the product:
 *  - greedy makes the same opening play identically every game, so the
 *    between-game variance is exactly 0 and style metrics become undefined;
 *  - but high temperature everywhere injects incoherence and destroys whatever
 *    style the model has.
 *
 * The measured-good presets are staged by ply.
 */

export type TemperaturePresetId = 'play' | 'arena' | 'greedy';

export interface TemperaturePreset {
  id: TemperaturePresetId;
  label: string;
  hint: string;
  /** [ply < 16, ply < 60, later] */
  stages: readonly [number, number, number];
}

export const TEMPERATURE_PRESETS: readonly TemperaturePreset[] = [
  {
    id: 'play',
    label: '实战',
    hint: '变化自然，默认',
    stages: [1.0, 0.7, 0.25],
  },
  {
    id: 'arena',
    label: '评测',
    hint: '更稳定',
    stages: [0.3, 0.2, 0.1],
  },
  {
    id: 'greedy',
    label: '贪心（调试）',
    hint: '每局完全相同',
    stages: [1e-4, 1e-4, 1e-4],
  },
] as const;

export function temperaturePreset(id: TemperaturePresetId): TemperaturePreset {
  const p = TEMPERATURE_PRESETS.find(t => t.id === id);
  if (!p) throw new Error(`unknown temperature preset: ${id}`);
  return p;
}

export function temperatureForPly(ply: number, preset: TemperaturePreset): number {
  if (ply < 16) return preset.stages[0];
  if (ply < 60) return preset.stages[1];
  return preset.stages[2];
}
