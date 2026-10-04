import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';

export type XiangqiFont = 'default' | 'lishu';
export type XiangqiTexture = 'flat' | 'realistic';
export type MoveHistoryMode = 'hiddenDuringPlay' | 'compact' | 'always';
export type XiangqiNotation = 'iccs' | 'traditional';

/**
 * Difficulty strategy for engine-driven games:
 *  1 `host-weakened`  — search budget (nodes/depth + movetime cap) plus
 *                       near-equal MultiPV randomisation. Default.
 *  2 `engine-options` — the engine's own strength options (UCI_Elo /
 *                       Skill Level / MultiPV / ...), user-editable, no
 *                       host-side randomisation.
 *  3 `onnx-tier`      — research ONNX tier models T1..T5 running in the
 *                       WebView (WebGPU, falling back to WASM).
 */
export type EngineMode = 1 | 2 | 3;

export type OnnxTemperatureId = 'play' | 'arena' | 'greedy';

/** Mode 2: custom option values + search budget for one engine level. */
export interface Mode2LevelOverride {
  /** UCI option name -> value. Wins over the level preset. */
  options: Record<string, string | number | boolean>;
  movetimeMs?: number;
  nodes?: number;
  depth?: number;
}

/** Mode 2 overrides, keyed by the engine strength level used for that level. */
export type Mode2Overrides = Record<string, Mode2LevelOverride>;

export interface AppSettings {
  /** 2: show legal move dots */
  showLegalTargets: boolean;
  /** 3: how move history is displayed */
  moveHistoryMode: MoveHistoryMode;
  /** 6: flip opponent pieces upright vs facing you */
  flipOpponentPieces: boolean;
  /** 9: xiangqi piece font */
  xiangqiFont: XiangqiFont;
  /** 10: xiangqi board/piece texture */
  xiangqiTexture: XiangqiTexture;
  /** xiangqi traditional notation */
  xiangqiNotation: XiangqiNotation;
  /** auto watch delay in ms */
  autoDelayMs: number;
  /** sound: move piece drop */
  soundEnabled: boolean;

  // ---- experimental / tester surface ---------------------------------------
  /**
   * Tester mode. When on, every difficulty selection opens a modal that also
   * exposes the engine mode (1/2/3) and its settings. When off, the original
   * inline difficulty pickers are used and the stored engine mode still applies.
   */
  testerMode: boolean;
  /** Difficulty strategy (see EngineMode) for 人机 / 残局. Default 1. */
  engineMode: EngineMode;
  /**
   * 观战模式：红方 / 黑方各自的棋力方案。允许**异构**（例如红方走引擎原生选项、
   * 黑方走 ONNX 档位模型），因为双方本来就是两个独立 runner。
   */
  engineModeWhite: EngineMode;
  engineModeBlack: EngineMode;
  /** Mode 2 custom overrides, keyed by engine strength level ("2","6","10","14","18"). */
  mode2: Mode2Overrides;
  /** Mode 3: move-choice temperature preset (research doc §5). */
  onnxTemperature: OnnxTemperatureId;
  /** Mode 3: mate guard (research doc §7 — measured +90..180 Elo). */
  onnxMateGuard: boolean;
}

const DEFAULTS: AppSettings = {
  showLegalTargets: true,
  moveHistoryMode: 'hiddenDuringPlay',
  flipOpponentPieces: false,
  xiangqiFont: 'default',
  xiangqiTexture: 'flat',
  xiangqiNotation: 'traditional',
  autoDelayMs: 800,
  soundEnabled: true,

  testerMode: false,
  engineMode: 1,
  engineModeWhite: 1,
  engineModeBlack: 1,
  mode2: {},
  onnxTemperature: 'play',
  onnxMateGuard: true,
};

const STORAGE_KEY = 'chessnext.settings.v1';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(s: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

interface SettingsCtx {
  settings: AppSettings;
  setSettings(updater: (prev: AppSettings) => AppSettings): void;
  update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  /** Replace the Mode 2 override block for one engine level. */
  setMode2Override(level: number, value: Mode2LevelOverride | null): void;
  reset(): void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider(props: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(() => load());

  // persist on change + apply CSS hooks for the xiangqi font/texture
  useEffect(() => {
    save(settings);
    document.documentElement.setAttribute('data-xq-font', settings.xiangqiFont);
    document.documentElement.setAttribute('data-xq-texture', settings.xiangqiTexture);
  }, [settings]);

  const setSettings = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    setSettingsState(prev => updater(prev));
  }, []);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettingsState(prev => ({ ...prev, [key]: value }));
  }, []);

  const setMode2Override = useCallback((level: number, value: Mode2LevelOverride | null) => {
    setSettingsState(prev => {
      const next = { ...prev.mode2 };
      if (value === null) delete next[String(level)];
      else next[String(level)] = value;
      return { ...prev, mode2: next };
    });
  }, []);

  const reset = useCallback(() => setSettingsState(DEFAULTS), []);

  const value = useMemo<SettingsCtx>(
    () => ({ settings, setSettings, update, setMode2Override, reset }),
    [settings, setSettings, update, setMode2Override, reset],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}

// Helper for non-React contexts (e.g., outside provider)
export function getStoredSettings(): AppSettings {
  return load();
}

export const ENGINE_MODE_LABELS: Record<EngineMode, { title: string; hint: string }> = {
  1: {
    title: '模式 1 · 搜索预算弱化（默认）',
    hint: '用 nodes + depth 限制搜索，并在近分着法间随机；跨设备一致，不依赖引擎选项',
  },
  2: {
    title: '模式 2 · 引擎原生棋力选项',
    hint: '直接用 UCI_Elo / Skill Level 等引擎选项，数值可自定义，不做主机随机',
  },
  3: {
    title: '模式 3 · 档位模型 T1–T5（ONNX）',
    hint: '实验性研究产物，在 WebView 内用 WebGPU / WASM 推理，T1 最弱、T5 最强',
  },
};

/**
 * Which setting a difficulty modal edits.
 *  - `global` : 人机 / 残局（单一对手）
 *  - `white` / `black` : 观战模式下的红方 / 黑方，可各自选不同方案（异构）
 */
export type EngineModeTarget = 'global' | 'white' | 'black';

export function engineModeFor(settings: AppSettings, target: EngineModeTarget): EngineMode {
  if (target === 'white') return settings.engineModeWhite;
  if (target === 'black') return settings.engineModeBlack;
  return settings.engineMode;
}

export function targetLabel(target: EngineModeTarget): string {
  if (target === 'white') return '红方';
  if (target === 'black') return '黑方';
  return '';
}

