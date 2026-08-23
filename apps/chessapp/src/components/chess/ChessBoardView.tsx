import React, { useMemo } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { Piece, Square } from '@chesslab/rules-core';
import {
  CHESS_GLYPHS,
  type GameTheme,
} from '../../theme/games';
import { boardPoints, keyOf, type BoardPoint } from '../../game/boards';

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
  onPressPoint(p: BoardPoint): void;
}

/** 8x8 grid board, walnut/maple squares, glyph pieces, coordinate frame. */
export function ChessBoardView(props: Props) {
  const { size, orientation, pieces, theme, onPressPoint } = props;
  const points = useMemo(() => boardPoints('chess', orientation), [orientation]);
  const cell = Math.floor(size / 8);

  const files =
    orientation === 'w'
      ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <View
      style={[
        styles.frame,
        {
          width: cell * 8 + 26,
          height: cell * 8 + 26,
          backgroundColor: theme.board.frame,
          borderColor: theme.board.frameBorder,
        },
      ]}
    >
      <View style={{ flexDirection: 'row' }}>
        {/* rank labels */}
        <View style={{ width: 13, paddingTop: 0 }}>
          {ranks.map(r => (
            <View key={r} style={{ height: cell, justifyContent: 'center' }}>
              <Text style={[styles.coord, { color: theme.board.coordText }]}>{r}</Text>
            </View>
          ))}
        </View>

        <View>
          <View style={styles.grid}>
            {chunk(points, 8).map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {row.map(p => {
                  const sq = keyOf(p);
                  const piece = pieces[sq];
                  const isDark = (fileIdx(p) + rankIdxChess(p)) % 2 === 1;
                  return (
                    <SquareCell
                      key={sq}
                      square={sq}
                      cell={cell}
                      baseColor={
                        isDark ? theme.board.darkSquare : theme.board.lightSquare
                      }
                      layer={props}
                      onPress={() => onPressPoint(p)}
                    >
                      {piece ? (
                        <Text
                          style={[
                            styles.glyph,
                            {
                              color: theme.pieces[piece.side].fg,
                              fontSize: cell * 0.72,
                              textShadowColor: theme.pieces[piece.side].shadow,
                            },
                          ]}
                        >
                          {CHESS_GLYPHS[piece.type] ?? '?'}
                        </Text>
                      ) : null}
                    </SquareCell>
                  );
                })}
              </View>
            ))}
          </View>
          {/* file labels */}
          <View style={{ flexDirection: 'row', height: 13 }}>
            {files.map(f => (
              <View key={f} style={{ width: cell, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[styles.coord, { color: theme.board.coordText }]}>{f}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
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
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: overlay,
          }}
        />
      ) : null}
      {isTarget ? (
        <View
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

import { PressableCell } from './PressableCell';

const styles = StyleSheet.create({
  frame: {
    borderWidth: 2,
    padding: 0,
  },
  grid: {},
  coord: { fontSize: 9, fontWeight: '600' },
  glyph: {
    fontWeight: '700',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

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
