import type { GameType } from '@chesslab/rules-core';

/**
 * Two deliberately DIFFERENT visual languages:
 *
 * - chess   : European tournament feel — walnut & maple board, cream/ink
 *             pieces, muted warm parchment chrome. Quiet and precise.
 * - xiangqi : Chinese paper-and-ink feel — rice-paper background, tan board
 *             with ink lines and the river, vermilion / ink-black round
 *             pieces with calligraphic characters.
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

  bg: '#EFE9DE',
  surface: '#F7F3EA',
  surfaceAlt: '#E4DCCD',
  textPrimary: '#2A251D',
  textSecondary: '#8B8271',
  accent: '#7A5230',
  accentSoft: '#D9C6AC',
  danger: '#A33B31',
  ok: '#3E7C4F',

  board: {
    frame: '#5D4634',
    frameBorder: '#3E2E21',
    lightSquare: '#EDD6B0',
    darkSquare: '#AE8658',
    line: '#5D4634',
    coordText: '#8A6F52',
  },

  highlight: {
    selected: 'rgba(122,82,48,0.45)',
    targetDot: 'rgba(62,44,28,0.35)',
    lastMoveFrom: 'rgba(214,168,96,0.40)',
    lastMoveTo: 'rgba(224,182,110,0.55)',
    hint: 'rgba(58,110,165,0.75)',
    checkKing: 'rgba(163,59,49,0.60)',
  },

  pieces: {
    w: { fg: '#FBF7EE', border: '#B49B72', shadow: 'rgba(43,32,18,0.45)' },
    b: { fg: '#241F19', border: '#0E0C09', shadow: 'rgba(240,230,210,0.18)' },
  },
};

export const XIANGQI_THEME: GameTheme = {
  gameType: 'xiangqi',
  displayName: '中国象棋',
  subtitle: 'XIANGQI',

  bg: '#F3EBDB',
  surface: '#FAF5E9',
  surfaceAlt: '#E9DFC8',
  textPrimary: '#26211A',
  textSecondary: '#8A8070',
  accent: '#A63A2B',
  accentSoft: '#E4C9AF',
  danger: '#A63A2B',
  ok: '#41694A',

  board: {
    frame: '#C9A96E',
    frameBorder: '#8A6C3E',
    lightSquare: '#E7CD97', // board face (lines are drawn on it)
    darkSquare: '#E7CD97',
    line: '#4A3418',
    coordText: '#8A6C3E',
    riverText: '#6B4F2A',
  },

  highlight: {
    selected: 'rgba(166,58,43,0.30)',
    targetDot: 'rgba(74,52,24,0.38)',
    lastMoveFrom: 'rgba(196,148,74,0.35)',
    lastMoveTo: 'rgba(206,160,84,0.50)',
    hint: 'rgba(58,110,165,0.70)',
    checkKing: 'rgba(166,58,43,0.55)',
  },

  // Round discs with ring + character.
  pieces: {
    w: { fg: '#F6E7C8', border: '#A63A2B', shadow: 'rgba(90,50,20,0.35)' }, // red side
    b: { fg: '#F1E8D2', border: '#33302A', shadow: 'rgba(60,50,30,0.30)' }, // black side
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
