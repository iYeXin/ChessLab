import React, { useMemo } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { Piece, Square } from '@chesslab/rules-core';
import { XIANGQI_CHARS, type GameTheme } from '../../theme/games';
import { boardPoints, keyOf, XQ_FILES, type BoardPoint } from '../../game/boards';

interface Props {
  size: number;
  orientation: 'w' | 'b';
  pieces: Record<Square, Piece>;
  theme: GameTheme;
  selected: string | null;
  targets: ReadonlySet<string>;
  lastFrom: string | null;
  lastTo: string | null;
  hint: { from: string; to: string } | null;
  onPressPoint(p: BoardPoint): void;
}

const LINE_W = 1;

/**
 * 9x10 intersection board drawn with ink lines on a tan face:
 * outer double border, river with 楚河/漢界, palace diagonals,
 * round disc pieces sitting ON intersections.
 */
export function XiangqiBoardView(props: Props) {
  const { size, orientation, pieces, theme, onPressPoint } = props;
  const points = useMemo(() => boardPoints('xiangqi', orientation), [orientation]);

  const pad = Math.max(14, Math.floor(size * 0.06));
  const cellX = (size - pad * 2) / 8; // 9 files -> 8 gaps
  const cellY = (size - pad * 2) / 9; // 10 ranks -> 9 gaps
  const disc = Math.min(cellX, cellY) * 0.92;

  // point index helpers
  const fileIdx = (f: string) => XQ_FILES.indexOf(f as (typeof XQ_FILES)[number]);
  const rankIdx = (r: string) => Number(r);
  const pos = (p: BoardPoint) => ({
    x: pad + fileIdx(p.file) * cellX,
    y: pad + rankIdx(p.rank) * cellY,
  });

  const faceColor = theme.board.lightSquare;
  const line = theme.board.line;

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          backgroundColor: faceColor,
          borderColor: theme.board.frameBorder,
        },
      ]}
    >
      {/* horizontal lines (10) */}
      {Array.from({ length: 10 }, (_, ri) => (
        <View
          key={`h${ri}`}
          style={{
            position: 'absolute',
            left: pad - LINE_W / 2,
            top: pad + ri * cellY - LINE_W / 2,
            width: size - pad * 2 + LINE_W,
            height: LINE_W,
            backgroundColor: line,
          }}
        />
      ))}
      {/* vertical lines (9), split across the river except edge files */}
      {Array.from({ length: 9 }, (_, fi) => {
        const x = pad + fi * cellX - LINE_W / 2;
        const riverTop = pad + 4 * cellY;
        const riverBottom = pad + 5 * cellY;
        const edge = fi === 0 || fi === 8;
        return (
          <View key={`v${fi}`}>
            <View
              style={{
                position: 'absolute',
                left: x,
                top: pad - LINE_W / 2,
                width: LINE_W,
                height: edge ? cellY * 9 : cellY * 4,
                backgroundColor: line,
              }}
            />
            {!edge && (
              <View
                style={{
                  position: 'absolute',
                  left: x,
                  top: riverBottom - LINE_W / 2,
                  width: LINE_W,
                  height: cellY * 4,
                  backgroundColor: line,
                }}
              />
            )}
          </View>
        );
      })}
      {/* outer double frame */}
      <View
        style={{
          position: 'absolute',
          left: pad - 4,
          top: pad - 4,
          width: size - pad * 2 + 8,
          height: cellY * 9 + 8,
          borderWidth: LINE_W + 0.5,
          borderColor: line,
        }}
      />

      {/* palace diagonals */}
      <PalaceDiagonals pad={pad} cellX={cellX} cellY={cellY} line={line} top={false} />
      <PalaceDiagonals pad={pad} cellX={cellX} cellY={cellY} line={line} top={true} />

      {/* river captions */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: pad + 4 * cellY,
          width: size,
          height: cellY,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Math.floor(cellX * 0.8),
        }}
        pointerEvents="none"
      >
        <Text
          style={[
            styles.riverText,
            { color: theme.board.riverText, fontSize: Math.floor(cellY * 0.52) },
            orientation === 'w' ? undefined : styles.flipX,
          ]}
        >
          楚 河
        </Text>
        <Text
          style={[
            styles.riverText,
            { color: theme.board.riverText, fontSize: Math.floor(cellY * 0.52) },
            orientation === 'w' ? undefined : styles.flipX,
          ]}
        >
          漢 界
        </Text>
      </View>

      {/* hit areas + pieces at intersections */}
      {points.map(p => {
        const sq = keyOf(p);
        const { x, y } = pos(p);
        const piece = pieces[sq];
        const hit = Math.min(cellX, cellY);
        const isTarget = props.targets.has(sq);
        const isSelected = props.selected === sq;
        const isLast = props.lastFrom === sq || props.lastTo === sq;
        const isHint = props.hint && (props.hint.from === sq || props.hint.to === sq);

        return (
          <Pressable
            key={sq}
            onPress={() => onPressPoint(p)}
            style={{
              position: 'absolute',
              left: x - hit / 2,
              top: y - hit / 2,
              width: hit,
              height: hit,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* markers under the disc */}
            {(isTarget || isSelected || isLast || !!isHint) && (
              <View
                style={{
                  position: 'absolute',
                  width: disc * 1.02,
                  height: disc * 1.02,
                  borderRadius: disc,
                  borderWidth: isHint || isSelected ? 2 : 0,
                  borderColor: isHint
                    ? theme.highlight.hint
                    : theme.highlight.selected,
                  backgroundColor: isTarget
                    ? theme.highlight.targetDot
                    : isHint || isSelected
                      ? theme.highlight.selected
                      : isLast
                        ? theme.highlight.lastMoveTo
                        : 'transparent',
                }}
              />
            )}
            {piece && (
              <Disc
                diameter={disc}
                piece={piece}
                theme={theme}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function PalaceDiagonals({
  pad,
  cellX,
  cellY,
  line,
  top,
}: {
  pad: number;
  cellX: number;
  cellY: number;
  line: string;
  top: boolean;
}) {
  // Palace spans files d-f (idx 3-5), ranks 0-2 (red bottom) or 7-9 (top).
  const yBase = top ? pad + 7 * cellY : pad + 0;
  const xL = pad + 3 * cellX;
  const w = cellX * 2;
  const h = cellY * 2;
  const angle = (Math.atan2(h, w) * 180) / Math.PI;
  const len = Math.sqrt(w * w + h * h);

  const mk = (flip: boolean) => (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: flip ? xL : xL,
        top: flip ? yBase : yBase,
        width: len,
        height: LINE_W,
        backgroundColor: line,
        transform: [{ translateX: 0 }, { translateY: flip ? h : 0 }, { rotate: `${flip ? -angle : angle}deg` }],
        transformOrigin: flip ? '0 100%' : '0 0',
      }}
    />
  );
  return (
    <>
      {mk(false)}
      {mk(true)}
    </>
  );
}

function Disc({
  diameter,
  piece,
  theme,
}: {
  diameter: number;
  piece: Piece;
  theme: GameTheme;
}) {
  const style = theme.pieces[piece.side];
  const char = XIANGQI_CHARS[piece.side][piece.type] ?? '?';
  return (
    <View
      pointerEvents="none"
      style={{
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        backgroundColor: style.fg,
        borderWidth: Math.max(1.5, diameter * 0.05),
        borderColor: style.border,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: style.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.8,
        shadowRadius: 1.5,
        elevation: 2,
      }}
    >
      <Text
        style={{
          color: piece.side === 'w' ? '#A63A2B' : '#2B2721',
          fontSize: diameter * 0.56,
          fontWeight: '700',
          lineHeight: diameter * 0.62,
          includeFontPadding: false,
        }}
      >
        {char}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
  },
  riverText: {
    fontWeight: '700',
    letterSpacing: 6,
    opacity: 0.75,
  },
  flipX: {
    transform: [{ scaleX: -1 }],
  },
});
