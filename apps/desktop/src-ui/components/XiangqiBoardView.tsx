import React, { useMemo } from 'react';
import type { Piece, Square } from '@chessnext/rules-core';
import { XIANGQI_CHARS, type GameTheme } from '../theme/games';
import { boardPoints, keyOf, XQ_FILES, type BoardPoint } from '../game/boards';

/**
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
  const points = useMemo(() => boardPoints(orientation), [orientation]);

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
  // 棋盘不需要渐变：始终平板色，立体感交给棋子
  const boardBg = faceColor;

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
        boxShadow: undefined,
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
        {(['楚河', '漢界'] as const).map(t => (
          <span
            key={t}
            style={{
              color: theme.board.riverText,
              fontSize: Math.floor(cellY * 0.58),
              fontWeight: 700,
              letterSpacing: 8,
              opacity: 0.82,
              fontFamily: xiangqiFont === 'lishu' ? '"ChessLishu", "LiSu", "STKaiti", cursive' : '"Noto Serif SC", "STZhongsong", "SimSun", serif',
              transform: orientation === 'w' ? undefined : 'scaleX(-1)',
              textShadow: '0 1px 0 rgba(255,255,255,0.4)',
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
        const isLastFrom = props.lastFrom === sq;
        const isLastTo = props.lastTo === sq;
        const isHint = props.hint && (props.hint.from === sq || props.hint.to === sq);
        const isLast = isLastFrom || isLastTo;

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
            {/* base highlight for selection / hint / target */}
            {(isTarget || isSelected || !!isHint) && (
              <div
                style={{
                  position: 'absolute',
                  width: disc * 1.02,
                  height: disc * 1.02,
                  borderRadius: disc,
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: isHint ? theme.highlight.hint : theme.highlight.selected,
                  backgroundColor: isTarget ? theme.highlight.targetDot : theme.highlight.selected,
                }}
              />
            )}
            {/* last move: start (lighter) and target (stronger ring + dot) */}
            {isLastFrom && !isSelected && !isHint ? (
              <div
                style={{
                  position: 'absolute',
                  width: disc * 1.02,
                  height: disc * 1.02,
                  borderRadius: disc,
                  backgroundColor: theme.highlight.lastMoveFrom,
                }}
              />
            ) : null}
            {isLastTo && !isSelected && !isHint ? (
              <>
                <div
                  style={{
                    position: 'absolute',
                    width: disc * 1.08,
                    height: disc * 1.08,
                    borderRadius: disc,
                    border: `2.5px solid ${theme.highlight.hint}`,
                    backgroundColor: theme.highlight.lastMoveTo,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    width: disc * 0.22,
                    height: disc * 0.22,
                    borderRadius: disc,
                    backgroundColor: theme.highlight.hint,
                    border: '1px solid white',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
                  }}
                />
              </>
            ) : null}
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
  const fontFamily = font === 'lishu' ? '"ChessLishu", "LiSu", "STKaiti", "KaiTi", cursive' : '"Noto Sans SC", "Microsoft YaHei UI", "PingFang SC", "Heiti SC", sans-serif';
  // 隶书时字形更大
  const fontSize = font === 'lishu' ? diameter * 0.62 : diameter * 0.54;
  if (!realistic) {
    return (
      <div
        style={{
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: style.fg,
          borderWidth: Math.max(1.5, diameter * 0.05),
          borderStyle: 'solid',
          borderColor: style.border,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 1px 1.5px ${style.shadow}`,
          pointerEvents: 'none',
          transform: flip ? 'rotate(180deg)' : undefined,
        }}
      >
        <span style={{ color: piece.side === 'w' ? '#A63A2B' : '#2B2721', fontSize, fontWeight: 700, lineHeight: `${diameter * 0.62}px`, fontFamily, display: 'inline-block' }}>{char}</span>
      </div>
    );
  }
  // 立体结构：外圈厚度 + 顶面 + 高光，不是阴影堆砌
  const edgeColor = piece.side === 'w' ? '#8a5a2a' : '#2a2a2a';
  return (
    <div
      style={{
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        position: 'relative',
        backgroundColor: style.fg,
        borderWidth: Math.max(1.2, diameter * 0.045),
        borderStyle: 'solid',
        borderColor: style.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 结构性立体：内阴影作厚度，外阴影作投影，顶部高光用伪元素
        boxShadow: `0 1.5px 3px ${style.shadow}, inset 0 1.5px 0 rgba(255,255,255,0.65), inset 0 -1.5px 0 rgba(0,0,0,0.12)`,
        pointerEvents: 'none',
        transform: flip ? 'rotate(180deg)' : undefined,
        overflow: 'hidden',
      }}
    >
      {/* 顶部高光带 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '12%',
          right: '12%',
          height: '38%',
          borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* 边缘厚度暗部 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: diameter / 2,
          boxShadow: `inset 0 -2px 3px rgba(0,0,0,0.18)`,
          pointerEvents: 'none',
        }}
      />
      <span style={{ color: piece.side === 'w' ? '#A63A2B' : '#2B2721', fontSize, fontWeight: 700, lineHeight: `${diameter * 0.62}px`, fontFamily, display: 'inline-block', zIndex: 1 }}>{char}</span>
    </div>
  );
}
