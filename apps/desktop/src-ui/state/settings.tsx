import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';

export type XiangqiFont = 'default' | 'lishu';
export type XiangqiTexture = 'flat' | 'realistic';
export type ChessBoardStyle = 'classic' | 'polished';
export type MoveHistoryMode = 'hiddenDuringPlay' | 'compact' | 'always';
export type XiangqiNotation = 'iccs' | 'traditional';

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
  /** 8: chess board polish */
  chessBoardStyle: ChessBoardStyle;
  /** xiangqi traditional notation */
  xiangqiNotation: XiangqiNotation;
  /** auto watch delay in ms */
  autoDelayMs: number;
  /** sound: move piece drop */
  soundEnabled: boolean;
}

const DEFAULTS: AppSettings = {
  showLegalTargets: true,
  moveHistoryMode: 'hiddenDuringPlay',
  flipOpponentPieces: false,
  xiangqiFont: 'default',
  xiangqiTexture: 'flat',
  chessBoardStyle: 'polished',
  xiangqiNotation: 'traditional',
  autoDelayMs: 800,
  soundEnabled: true,
};

const STORAGE_KEY = 'chesslab.settings.v1';

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
  reset(): void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider(props: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(() => load());

  // persist on change
  useEffect(() => {
    save(settings);
    // apply CSS hooks for xiangqi font/texture and chess polish
    document.documentElement.setAttribute('data-xq-font', settings.xiangqiFont);
    document.documentElement.setAttribute('data-xq-texture', settings.xiangqiTexture);
    document.documentElement.setAttribute('data-chess-style', settings.chessBoardStyle);
  }, [settings]);

  // hydrate font attribute on mount (for SSR-ish)
  useEffect(() => {
    document.documentElement.setAttribute('data-xq-font', settings.xiangqiFont);
    document.documentElement.setAttribute('data-xq-texture', settings.xiangqiTexture);
    document.documentElement.setAttribute('data-chess-style', settings.chessBoardStyle);
  }, []); // eslint-disable-line

  const setSettings = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    setSettingsState(prev => {
      const next = updater(prev);
      return next;
    });
  }, []);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettingsState(prev => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettingsState(DEFAULTS), []);

  const value = useMemo<SettingsCtx>(() => ({ settings, setSettings, update, reset }), [settings, setSettings, update, reset]);

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
