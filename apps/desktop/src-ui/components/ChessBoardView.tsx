import React, { useMemo } from 'react';
import type { Piece, Square } from '@chesslab/rules-core';
import { CHESS_GLYPHS, type GameTheme } from '../theme/games';
import { boardPoints, keyOf, type BoardPoint } from '../game/boards';

/**
 * DOM port of apps/chessapp/src/components/chess/ChessBoardView.tsx.
 * 8x8 grid board, walnut/maple squares, glyph pieces, coordinate frame.
 */

export interface BoardLayerProps {
  selected: Square | null;
  targets: ReadonlySet<Square>;
  lastFrom: Square | null;
  lastTo: Square | null;
  hint: { from: Square; to: Square } | null;
}

export function emptyLayer(): BoardLayerProps {
  return { selected: null, targets: new Set(), lastFrom: null, lastTo: null, hint: null };
}

interface Props extends BoardLayerProps {
  size: number;
  orientation: 'w' | 'b';
  pieces: Record<Square, Piece>;
  theme: GameTheme;
  flipOpponentPieces?: boolean;
  polished?: boolean;
  onPressPoint(p: BoardPoint): void;
}

export function ChessBoardView(props: Props) {
  const { size, orientation, pieces, theme, onPressPoint, flipOpponentPieces, polished } = props;
  const points = useMemo(() => boardPoints('chess', orientation), [orientation]);
  const cell = Math.floor(size / 8);

  const files =
    orientation === 'w'
      ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];

  // Item 7: refined polished board - walnut bevel, inset board shadow, elegant coords
  const frameStyle: React.CSSProperties = polished
    ? {
        width: cell * 8 + 26,
        height: cell * 8 + 26,
        background: `linear-gradient(145deg, #4a3728 0%, #5d4634 25%, #6b543e 50%, #5d4634 75%, #3e2e20 100%)`,
        border: `1px solid #2a1e12`,
        borderRadius: 8,
        boxShadow: '0 10px 28px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.4)',
        display: 'flex',
        overflow: 'hidden',
        padding: 3,
        boxSizing: 'border-box',
      }
    : {
        width: cell * 8 + 26,
        height: cell * 8 + 26,
        backgroundColor: theme.board.frame,
        border: `2px solid ${theme.board.frameBorder}`,
        display: 'flex',
      };

  const coordColor = polished ? '#e8d5b5' : theme.board.coordText;
  return (
    <div className={`chess-board ${polished ? 'polished' : ''}`} style={frameStyle}>
      {/* rank labels */}
      <div style={{ width: 13, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {ranks.map(r => (
          <div key={r} style={{ height: cell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: coordColor, fontSize: polished ? 8 : 9, fontWeight: polished ? 500 : 600, opacity: polished ? 0.9 : 1, letterSpacing: 0.3 }}>{r}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, boxShadow: polished ? 'inset 0 0 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' : undefined, borderRadius: polished ? 3 : 0, overflow: 'hidden' }}>
        <div>
          {chunk(points, 8).map((row, ri) => (
            <div key={ri} style={{ display: 'flex' }}>
              {row.map(p => {
                const sq = keyOf(p);
                const piece = pieces[sq];
                const isDark = (fileIdx(p) + rankIdxChess(p)) % 2 === 1;
                const light = polished ? '#f0d9b5' : theme.board.lightSquare;
                const dark = polished ? '#b58863' : theme.board.darkSquare;
                // polished squares get subtle inner highlight
                const sqBg = isDark ? dark : light;
                return (
                  <SquareCell
                    key={sq}
                    square={sq}
                    cell={cell}
                    baseColor={sqBg}
                    layer={props}
                    polished={polished}
                    onPress={() => onPressPoint(p)}
                  >
                    {piece ? (
                      <span
                        style={{
                          color: theme.pieces[piece.side].fg,
                          fontSize: cell * 0.68,
                          fontWeight: 750,
                          lineHeight: 1,
                          fontFamily: polished ? '"Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", sans-serif' : undefined,
                          textShadow: polished
                            ? `0 2px 4px ${theme.pieces[piece.side].shadow}, 0 1px 0 rgba(0,0,0,0.4)`
                            : `0 1px 2px ${theme.pieces[piece.side].shadow}`,
                          filter: polished ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' : undefined,
                          transform: flipOpponentPieces && piece.side !== orientation ? 'rotate(180deg)' : undefined,
                          display: 'inline-block',
                        }}
                      >
                        {CHESS_GLYPHS[piece.type] ?? '?'}
                      </span>
                    ) : null}
                  </SquareCell>
                );
              })}
            </div>
          ))}
        </div>
        {/* file labels */}
        <div style={{ display: 'flex', height: 13, backgroundColor: polished ? 'rgba(0,0,0,0.04)' : 'transparent' }}>
          {files.map(f => (
            <div key={f} style={{ width: cell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: coordColor, fontSize: polished ? 8 : 9, fontWeight: polished ? 500 : 600, opacity: polished ? 0.9 : 1, letterSpacing: 0.3 }}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SquareCell({
  square,
  cell,
  baseColor,
  layer,
  polished,
  onPress,
  children,
}: {
  square: string;
  cell: number;
  baseColor: string;
  layer: BoardLayerProps;
  polished?: boolean;
  onPress(): void;
  children?: React.ReactNode;
}) {
  let overlay: string | null = null;
  if (layer.lastFrom === square || layer.lastTo === square) overlay = polished ? 'rgba(232,185,108,0.42)' : 'rgba(230,180,90,0.45)';
  if (layer.selected === square) overlay = polished ? 'rgba(130,175,95,0.52)' : 'rgba(120,170,90,0.55)';
  if (layer.hint && (layer.hint.from === square || layer.hint.to === square)) {
    overlay = polished ? 'rgba(82,138,190,0.48)' : 'rgba(70,130,190,0.50)';
  }
  const isTarget = layer.targets.has(square);

  return (
    <PressableCell size={cell} color={baseColor} onPress={onPress} polished={polished}>
      {overlay ? <div style={{ position: 'absolute', inset: 0, backgroundColor: overlay, border: polished ? '1px solid rgba(255,255,255,0.12)' : undefined }} /> : null}
      {isTarget ? (
        <div
          style={{
            position: 'absolute',
            width: cell * 0.26,
            height: cell * 0.26,
            borderRadius: cell,
            backgroundColor: polished ? 'rgba(45,75,45,0.38)' : 'rgba(40,80,40,0.42)',
            boxShadow: polished ? 'inset 0 1px 2px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.15)' : undefined,
            border: polished ? '1px solid rgba(255,255,255,0.18)' : undefined,
          }}
        />
      ) : null}
      {children}
    </PressableCell>
  );
}

/** Square cell with press feedback (port of PressableCell.tsx). */
function PressableCell({
  size,
  color,
  onPress,
  polished,
  children,
}: {
  size: number;
  color: string;
  onPress(): void;
  polished?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        width: size,
        height: size,
        padding: 0,
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        boxShadow: polished ? 'inset 0 0 0 0.5px rgba(0,0,0,0.06)' : undefined,
      }}
    >
      {children}
    </button>
  );
}

function chunk<T>(arr: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function fileIdx(p: BoardPoint): number {
  return p.file.charCodeAt(0) - 97;
}
function rankIdxChess(p: BoardPoint): number {
  return Number(p.rank) - 1;
}
