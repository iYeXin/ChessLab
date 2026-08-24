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

  // Item 8: polished style adds gradient, inner shadow, rounded corners
  const frameStyle: React.CSSProperties = polished
    ? {
        width: cell * 8 + 26,
        height: cell * 8 + 26,
        background: `linear-gradient(145deg, ${theme.board.frame} 0%, #3e2e20 100%)`,
        border: `2px solid ${theme.board.frameBorder}`,
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
        display: 'flex',
        overflow: 'hidden',
      }
    : {
        width: cell * 8 + 26,
        height: cell * 8 + 26,
        backgroundColor: theme.board.frame,
        border: `2px solid ${theme.board.frameBorder}`,
        display: 'flex',
      };

  return (
    <div className={`chess-board ${polished ? 'polished' : ''}`} style={frameStyle}>
      {/* rank labels */}
      <div style={{ width: 13 }}>
        {ranks.map(r => (
          <div
            key={r}
            style={{
              height: cell,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: theme.board.coordText, fontSize: 9, fontWeight: 600 }}>{r}</span>
          </div>
        ))}
      </div>

      <div>
        <div>
          {chunk(points, 8).map((row, ri) => (
            <div key={ri} style={{ display: 'flex' }}>
              {row.map(p => {
                const sq = keyOf(p);
                const piece = pieces[sq];
                const isDark = (fileIdx(p) + rankIdxChess(p)) % 2 === 1;
                return (
                  <SquareCell
                    key={sq}
                    square={sq}
                    cell={cell}
                    baseColor={isDark ? theme.board.darkSquare : theme.board.lightSquare}
                    layer={props}
                    onPress={() => onPressPoint(p)}
                  >
                    {piece ? (
                      <span
                        style={{
                          color: theme.pieces[piece.side].fg,
                          fontSize: cell * 0.72,
                          fontWeight: 700,
                          lineHeight: 1,
                          textShadow: polished
                            ? `0 1px 3px ${theme.pieces[piece.side].shadow}, 0 0 1px rgba(0,0,0,0.3)`
                            : `0 1px 2px ${theme.pieces[piece.side].shadow}`,
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
        <div style={{ display: 'flex', height: 13 }}>
          {files.map(f => (
            <div
              key={f}
              style={{
                width: cell,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: theme.board.coordText, fontSize: 9, fontWeight: 600 }}>
                {f}
              </span>
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
  onPress,
  children,
}: {
  square: string;
  cell: number;
  baseColor: string;
  layer: BoardLayerProps;
  onPress(): void;
  children?: React.ReactNode;
}) {
  let overlay: string | null = null;
  if (layer.lastFrom === square || layer.lastTo === square) overlay = 'rgba(230,180,90,0.45)';
  if (layer.selected === square) overlay = 'rgba(120,170,90,0.55)';
  if (layer.hint && (layer.hint.from === square || layer.hint.to === square)) {
    overlay = 'rgba(70,130,190,0.50)';
  }
  const isTarget = layer.targets.has(square);

  return (
    <PressableCell size={cell} color={baseColor} onPress={onPress}>
      {overlay ? (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: overlay }} />
      ) : null}
      {isTarget ? (
        <div
          style={{
            position: 'absolute',
            width: cell * 0.28,
            height: cell * 0.28,
            borderRadius: cell,
            backgroundColor: 'rgba(40,80,40,0.42)',
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
  children,
}: {
  size: number;
  color: string;
  onPress(): void;
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
