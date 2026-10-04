import type { GameType } from '@chessnext/rules-core';

/**
 * Design tokens for the single supported game (中国象棋).
 *
 * Every color is a CSS custom property resolved on `.theme-xiangqi` (see
 * themes.css), so components carry zero hard-coded palette values. The
 * `GameTheme` shape is kept generic on purpose: adding a second game back
 * means adding one more token set next to this one.
 */

export interface PieceStyle {
  /** Disc face color. */
  fg: string;
  border: string;
  shadow: string;
}

export interface GameTheme {
  gameType: GameType;
  displayName: string;
  subtitle: string;

  bg: string;
  surface: string;
  surfaceAlt: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentSoft: string;
  danger: string;
  ok: string;

  board: {
    frame: string;
    frameBorder: string;
    lightSquare: string;
    darkSquare: string;
    line: string;
    coordText: string;
    /** River caption color (楚河 / 漢界). */
    riverText?: string;
  };

  highlight: {
    selected: string;
    targetDot: string;
    lastMoveFrom: string;
    lastMoveTo: string;
    hint: string;
    checkKing: string;
  };

  pieces: Record<'w' | 'b', PieceStyle>;
}

export const XIANGQI_THEME: GameTheme = {
  gameType: 'xiangqi',
  displayName: '中国象棋',
  subtitle: 'XIANGQI',

  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surfaceAlt: 'var(--surface-alt)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  danger: 'var(--danger)',
  ok: 'var(--ok)',

  board: {
    frame: 'var(--board-frame)',
    frameBorder: 'var(--board-frame-border)',
    lightSquare: 'var(--board-light)',
    darkSquare: 'var(--board-dark)',
    line: 'var(--board-line)',
    coordText: 'var(--board-coord-text)',
    riverText: 'var(--board-river-text)',
  },

  highlight: {
    selected: 'var(--hl-selected)',
    targetDot: 'var(--hl-target-dot)',
    lastMoveFrom: 'var(--hl-last-from)',
    lastMoveTo: 'var(--hl-last-to)',
    hint: 'var(--hl-hint)',
    checkKing: 'var(--hl-check-king)',
  },

  // Round discs with ring + calligraphic character.
  pieces: {
    w: {
      fg: 'var(--piece-w-fg)',
      border: 'var(--piece-w-border)',
      shadow: 'var(--piece-w-shadow)',
    },
    b: {
      fg: 'var(--piece-b-fg)',
      border: 'var(--piece-b-border)',
      shadow: 'var(--piece-b-shadow)',
    },
  },
};

/** Root class that activates the theme's CSS variables. */
export const THEME_CLASS = 'theme-xiangqi';

/** Calligraphic characters for xiangqi pieces, per side. */
export const XIANGQI_CHARS: Record<'w' | 'b', Record<string, string>> = {
  w: { k: '帥', a: '仕', b: '相', r: '俥', n: '傌', c: '炮', p: '兵' },
  b: { k: '將', a: '士', b: '象', r: '車', n: '馬', c: '砲', p: '卒' },
};
