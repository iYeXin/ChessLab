import React, { useMemo } from 'react';
import type { Piece, Square } from '@chesslab/rules-core';
import { XIANGQI_CHARS, type GameTheme } from '../theme/games';
import { boardPoints, keyOf, XQ_FILES, type BoardPoint } from '../game/boards';

/**
 * DOM port of apps/chessapp/src/components/xiangqi/XiangqiBoardView.tsx.
 * 9x10 intersection board drawn with ink lines on a tan face:
 * outer double border, river with 楚河/漢界, palace diagonals,
 * round disc pieces sitting ON intersections.
 */

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
  flipOpponentPieces?: boolean;
  xiangqiFont?: 'default' | 'lishu';
  xiangqiTexture?: 'flat' | 'realistic';
  onPressPoint(p: BoardPoint): void;
}

const LINE_W = 1;

export function XiangqiBoardView(props: Props) {
  const { size, orientation, pieces, theme, onPressPoint, flipOpponentPieces, xiangqiFont, xiangqiTexture } = props;
  const points = useMemo(() => boardPoints('xiangqi', orientation), [orientation]);

  const pad = Math.max(14, Math.floor(size * 0.06));
  const cellX = (size - pad * 2) / 8; // 9 files -> 8 gaps
  const cellY = (size - pad * 2) / 9; // 10 ranks -> 9 gaps
  const disc = Math.min(cellX, cellY) * 0.92;

  // point index helpers
  const fileIdx = (f: string) => XQ_FILES.indexOf(f as (typeof XQ_FILES)[number]);
  const rankIdx = (r: string) => Number(r);
  /** Screen y for an ICCS rank: rank0 (Red back rank) sits at the BOTTOM
   *  when Red is at the bottom (orientation 'w'). */
  const yOf = (rank: number) => pad + (orientation === 'w' ? 9 - rank : rank) * cellY;
  const pos = (p: BoardPoint) => ({
    x: pad + fileIdx(p.file) * cellX,
    y: yOf(rankIdx(p.rank)),
  });

  const faceColor = theme.board.lightSquare;
  const line = theme.board.line;

  const isRealistic = xiangqiTexture === 'realistic';
  // Refined realistic: very subtle wood, not rough gradient
  const boardBg = isRealistic
    ? `linear-gradient(180deg, #f7e8c0 0%, #eedad1 45%, #e8d5a8 100%)`
    : faceColor;

  return (
    <div
      className={`xq-board ${isRealistic ? 'realistic' : 'flat'} ${xiangqiFont === 'lishu' ? 'font-lishu' : ''}`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        background: boardBg,
        border: `1px solid ${theme.board.frameBorder}`,
        overflow: 'visible',
        boxShadow: isRealistic ? 'inset 0 0 12px rgba(139,108,62,0.25), 0 2px 8px rgba(0,0,0,0.15)' : undefined,
      }}
    >
      {/* horizontal lines (10) */}
      {Array.from({ length: 10 }, (_, ri) => (
        <div
          key={`h${ri}`}
          style={{
            position: 'absolute',
            left: pad - LINE_W / 2,
            top: yOf(ri) - LINE_W / 2,
            width: size - pad * 2 + LINE_W,
            height: LINE_W,
            backgroundColor: line,
          }}
        />
      ))}
      {/* vertical lines (9), split across the river except edge files */}
      {Array.from({ length: 9 }, (_, fi) => {
        const x = pad + fi * cellX - LINE_W / 2;
        const riverTop = Math.min(yOf(4), yOf(5));
        const riverBottom = Math.max(yOf(4), yOf(5));
        const topEdge = Math.min(yOf(0), yOf(9));
        const edge = fi === 0 || fi === 8;
        return (
          <React.Fragment key={`v${fi}`}>
            <div
              style={{
                position: 'absolute',
                left: x,
                top: topEdge - LINE_W / 2,
                width: LINE_W,
                height: edge ? cellY * 9 : riverTop - topEdge,
                backgroundColor: line,
              }}
            />
            {!edge && (
              <div
                style={{
                  position: 'absolute',
                  left: x,
                  top: riverBottom - LINE_W / 2,
                  width: LINE_W,
                  height: topEdge + cellY * 9 - riverBottom,
                  backgroundColor: line,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
      {/* outer double frame */}
      <div
        style={{
          position: 'absolute',
          left: pad - 4,
          top: Math.min(yOf(0), yOf(9)) - 4,
          width: size - pad * 2 + 8,
          height: Math.abs(yOf(9) - yOf(0)) + 8,
          borderWidth: LINE_W + 0.5,
          borderStyle: 'solid',
          borderColor: line,
          pointerEvents: 'none',
        }}
      />

      {/* palace diagonals: palace spans ranks 0-2 (Red) and 7-9 (Black);
          yBase is the palace's TOP edge on screen. */}
      <PalaceDiagonals
        pad={pad}
        cellX={cellX}
        cellY={cellY}
        line={line}
        yBase={orientation === 'w' ? yOf(2) : yOf(0)}
      />
      <PalaceDiagonals
        pad={pad}
        cellX={cellX}
        cellY={cellY}
        line={line}
        yBase={orientation === 'w' ? yOf(9) : yOf(7)}
      />

      {/* river captions */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: Math.min(yOf(4), yOf(5)),
          width: size,
          height: cellY,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Math.floor(cellX * 0.8),
          pointerEvents: 'none',
        }}
      >
        {(['楚 河', '漢 界'] as const).map(t => (
          <span
            key={t}
            style={{
              color: theme.board.riverText,
              fontSize: Math.floor(cellY * 0.52),
              fontWeight: 700,
              letterSpacing: 6,
              opacity: 0.75,
              transform: orientation === 'w' ? undefined : 'scaleX(-1)',
            }}
          >
            {t}
          </span>
        ))}
      </div>

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
          <button
            type="button"
            key={sq}
            onClick={() => onPressPoint(p)}
            style={{
              position: 'absolute',
              left: x - hit / 2,
              top: y - hit / 2,
              width: hit,
              height: hit,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* markers under the disc */}
            {(isTarget || isSelected || isLast || !!isHint) && (
              <div
                style={{
                  position: 'absolute',
                  width: disc * 1.02,
                  height: disc * 1.02,
                  borderRadius: disc,
                  borderWidth: isHint || isSelected ? 2 : 0,
                  borderStyle: 'solid',
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
                flip={!!flipOpponentPieces && piece.side !== orientation}
                font={xiangqiFont}
                realistic={isRealistic}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function PalaceDiagonals({
  pad,
  cellX,
  cellY,
  line,
  yBase,
}: {
  pad: number;
  cellX: number;
  cellY: number;
  line: string;
  /** Screen y of the palace's TOP edge. */
  yBase: number;
}) {
  // Palace spans files d-f (idx 3-5), two cells tall.
  const xL = pad + 3 * cellX;
  const w = cellX * 2;
  const h = cellY * 2;
  const angle = (Math.atan2(h, w) * 180) / Math.PI;
  const len = Math.sqrt(w * w + h * h);

  const mk = (flip: boolean) => (
    <div
      style={{
        position: 'absolute',
        left: xL,
        top: flip ? yBase + h : yBase,
        width: len,
        height: LINE_W,
        backgroundColor: line,
        transform: `rotate(${flip ? -angle : angle}deg)`,
        transformOrigin: flip ? '0 100%' : '0 0',
        pointerEvents: 'none',
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
  flip,
  font,
  realistic,
}: {
  diameter: number;
  piece: Piece;
  theme: GameTheme;
  flip?: boolean;
  font?: 'default' | 'lishu';
  realistic?: boolean;
}) {
  const style = theme.pieces[piece.side];
  const char = XIANGQI_CHARS[piece.side][piece.type] ?? '?';
  // 1. 黑体就是黑体：默认用无衬线黑体；隶书用内嵌隶书
  const fontFamily = font === 'lishu' ? '"ChessLishu", "LiSu", "STKaiti", "KaiTi", cursive' : '"Noto Sans SC", "Microsoft YaHei UI", "PingFang SC", "Heiti SC", sans-serif';
  return (
    <div
      style={{
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        background: realistic
          ? piece.side === 'w'
            ? 'radial-gradient(circle at 30% 30%, #fff8e8 0%, #f6e7c8 60%, #e8d0a0 100%)'
            : 'radial-gradient(circle at 30% 30%, #faf6e8 0%, #f1e8d2 60%, #d8cbb0 100%)'
          : style.fg,
        borderWidth: Math.max(1.5, diameter * 0.05),
        borderStyle: 'solid',
        borderColor: style.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: realistic ? `0 2px 4px ${style.shadow}, inset 0 1px 0 rgba(255,255,255,0.6)` : `0 1px 1.5px ${style.shadow}`,
        pointerEvents: 'none',
        transform: flip ? 'rotate(180deg)' : undefined,
      }}
    >
      <span
        style={{
          color: piece.side === 'w' ? '#A63A2B' : '#2B2721',
          fontSize: diameter * 0.56,
          fontWeight: 700,
          lineHeight: `${diameter * 0.62}px`,
          fontFamily,
          display: 'inline-block',
        }}
      >
        {char}
      </span>
    </div>
  );
}
