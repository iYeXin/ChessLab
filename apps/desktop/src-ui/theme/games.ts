import type { GameType } from '@chesslab/rules-core';

/**
 * Port of apps/chessapp/src/theme/games.ts — same structure, but every color
 * is a CSS custom property resolved on the game root class (see themes.css).
 * Components stay 1:1 with the RN reference; switching games = switching the
 * root class.
 */

export interface PieceStyle {
  /** Disc face (xiangqi) or glyph color (chess). */
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
    /** Xiangqi only: river caption color. */
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

export const CHESS_THEME: GameTheme = {
  gameType: 'chess',
  displayName: '国际象棋',
  subtitle: 'CHESS',

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
  },

  highlight: {
    selected: 'var(--hl-selected)',
    targetDot: 'var(--hl-target-dot)',
    lastMoveFrom: 'var(--hl-last-from)',
    lastMoveTo: 'var(--hl-last-to)',
    hint: 'var(--hl-hint)',
    checkKing: 'var(--hl-check-king)',
  },

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

  // Round discs with ring + character.
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

/** Glyphs for chess pieces — filled forms render consistently across fonts. */
export const CHESS_GLYPHS: Record<string, string> = {
  k: '\u265A',
  q: '\u265B',
  r: '\u265C',
  b: '\u265D',
  n: '\u265E',
  p: '\u265F',
};

/** Calligraphic characters for xiangqi pieces, per side. */
export const XIANGQI_CHARS: Record<'w' | 'b', Record<string, string>> = {
  w: { k: '帥', a: '仕', b: '相', r: '俥', n: '傌', c: '炮', p: '兵' },
  b: { k: '將', a: '士', b: '象', r: '車', n: '馬', c: '砲', p: '卒' },
};

export function themeFor(gameType: GameType): GameTheme {
  return gameType === 'chess' ? CHESS_THEME : XIANGQI_THEME;
}

/** Root class that activates a theme's CSS variables. */
export function themeClassFor(gameType: GameType): string {
  return gameType === 'chess' ? 'theme-chess' : 'theme-xiangqi';
}
