import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Puzzle } from '@chesslab/puzzles';
import { themeFor } from '../theme/games';
import { ChessBoardView } from '../components/ChessBoardView';
import { XiangqiBoardView } from '../components/XiangqiBoardView';
import { TopBar } from '../components/GameChrome';
import { useSettings } from '../state/settings';
import { ChessRules } from '@chesslab/rules-chess';
import { XiangqiRules } from '@chesslab/rules-xiangqi';
import type { Piece, Square, Side } from '@chesslab/rules-core';
import { usePuzzleProgress } from '../state/puzzles';
import { playMoveSound } from '../game/sound';

export function PuzzleScreen(props: { puzzle: Puzzle; onBack(): void; onNext(): void; onPrev(): void; hasNext: boolean; hasPrev: boolean }) {
  const { puzzle } = props;
  const theme = themeFor(puzzle.gameType);
  const { settings } = useSettings();
  const { markSolved } = usePuzzleProgress();

  // 规则实例
  const rulesRef = useRef<ReturnType<typeof createRules> | null>(null);
  function createRules() {
    return puzzle.gameType === 'chess' ? new ChessRules(puzzle.fen) : new XiangqiRules(puzzle.fen);
  }
  const [boardKey, setBoardKey] = useState(0);
  const rules = useMemo(() => {
    // boardKey 变化时重建
    void boardKey;
    const r = createRules();
    rulesRef.current = r;
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, boardKey]);

  // 派生状态
  const [pieces, setPieces] = useState<Record<Square, Piece>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [status, setStatus] = useState<'playing' | 'solved' | 'wrong'>('playing');
  const [wrongFlash, setWrongFlash] = useState(false);
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);

  const orientation: Side = puzzle.sideToMove;

  const refreshBoard = useCallback(() => {
    const r = rulesRef.current!;
    const allSq = r.gameType === 'chess'
      ? Array.from({ length: 8 }, (_, i) => String.fromCharCode(97 + i)).flatMap(f => Array.from({ length: 8 }, (_, j) => `${f}${j + 1}`))
      : Array.from({ length: 9 }, (_, i) => String.fromCharCode(97 + i)).flatMap(f => Array.from({ length: 10 }, (_, j) => `${f}${j}`));
    const next: Record<Square, Piece> = {};
    for (const sq of allSq) {
      const p = r.pieceAt(sq);
      if (p) next[sq] = p;
    }
    setPieces(next);
    setHistory([...r.history()].map(h => h.uci));
  }, []);

  useEffect(() => {
    refreshBoard();
    setStatus('playing');
    setHint(null);
    setSelected(null);
    setWrongFlash(false);
  }, [puzzle.id, boardKey, refreshBoard]);

  // 棋盘尺寸
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const en of entries) setAreaSize({ w: en.contentRect.width, h: en.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boardSize = areaSize.w > 0 && areaSize.h > 0 ? Math.max(160, Math.floor(Math.min(areaSize.w - 8, areaSize.h - 8, 560))) : 0;

  const targets = useMemo<ReadonlySet<Square>>(() => {
    if (!selected || status !== 'playing') return new Set();
    const r = rulesRef.current!;
    return new Set(r.moves({ square: selected }).map(m => m.to as Square));
  }, [selected, status, history.length]);

  const moveForTarget = useCallback((from: Square, to: Square) => {
    const r = rulesRef.current!;
    const cands = r.moves({ square: from }).filter(m => m.to === to);
    return cands.find(m => m.promotion === 'q') ?? cands[0];
  }, []);

  const onPressPoint = useCallback(
    (sq: Square) => {
      if (status !== 'playing') return;
      const r = rulesRef.current!;
      // hint 已显示时，点提示目标直接走
      if (hint && sq === hint.to) {
        const mv = moveForTarget(hint.from, hint.to);
        if (mv) {
          handleMove(mv.uci);
          return;
        }
      }
      if (hint) setHint(null);

      if (selected && targets.has(sq)) {
        const mv = moveForTarget(selected, sq);
        setSelected(null);
        if (mv) handleMove(mv.uci);
        return;
      }
      if (selected === sq) {
        setSelected(null);
        return;
      }
      const p = r.pieceAt(sq);
      if (p && p.side === puzzle.sideToMove) {
        const ms = r.moves({ square: sq });
        setSelected(ms.length > 0 ? sq : null);
      } else {
        setSelected(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, targets, hint, puzzle.sideToMove, status],
  );

  const handleMove = (uci: string) => {
    const r = rulesRef.current!;
    const expected = puzzle.solution[0]?.toLowerCase();
    const isCorrect = expected ? uci.toLowerCase() === expected : false;

    const applied = r.move(uci);
    if (!applied) return;
    playMoveSound();
    refreshBoard();

    if (isCorrect) {
      setStatus('solved');
      markSolved(puzzle.id);
      // 成功后轻微震动（若支持）
      try {
        // @ts-ignore
        navigator.vibrate?.(40);
      } catch {}
    } else {
      setStatus('wrong');
      setWrongFlash(true);
      setTimeout(() => setWrongFlash(false), 600);
      // 1s 后自动回退到初始
      setTimeout(() => {
        const fresh = createRules();
        rulesRef.current = fresh;
        refreshBoard();
        setStatus('playing');
        setSelected(null);
      }, 900);
    }
  };

  const onHint = () => {
    const sol = puzzle.solution[0];
    if (!sol) return;
    const from = sol.slice(0, 2) as Square;
    const to = sol.slice(2, 4) as Square;
    setHint({ from, to });
  };

  const onReset = () => {
    setBoardKey(k => k + 1);
  };

  const onShowSolution = () => {
    onHint();
    // 2s 后自动走解法演示（小而美：只演示一步）
    setTimeout(() => {
      const sol = puzzle.solution[0];
      if (sol) handleMove(sol);
    }, 600);
  };

  const last = history[history.length - 1] ?? null;
  const lastFrom = last ? (last.slice(0, 2) as Square) : null;
  const lastTo = last ? (last.slice(2, 4) as Square) : null;

  const diffStars = '★'.repeat(puzzle.rating) + '☆'.repeat(5 - puzzle.rating);

  return (
    <div className={`${theme.gameType === 'chess' ? 'theme-chess' : 'theme-xiangqi'}`} style={{ height: '100%', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column' }}>
      <TopBar theme={theme} title={puzzle.title} subtitle={`${puzzle.gameType === 'chess' ? '国际象棋' : '中国象棋'} · ${diffStars}`} onBack={props.onBack} right={<span style={{ fontSize: 10, color: theme.textSecondary, paddingRight: 8 }}>{puzzle.themes[0]}</span>} />

      {/* 状态条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', backgroundColor: wrongFlash ? 'rgba(163,59,49,0.08)' : status === 'solved' ? 'rgba(62,124,79,0.08)' : 'transparent', borderBottom: '1px solid rgba(0,0,0,0.06)', transition: 'background 160ms' }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: status === 'solved' ? theme.ok : status === 'wrong' ? theme.danger : theme.accent, transition: 'background 160ms' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: status === 'solved' ? theme.ok : status === 'wrong' ? theme.danger : theme.textPrimary, flex: 1 }}>
          {status === 'solved' ? '解开了！✓' : status === 'wrong' ? '再试一次' : `${puzzle.sideToMove === 'w' ? (puzzle.gameType === 'xiangqi' ? '红' : '白') : '黑'}先 · 找最佳着`}
        </span>
        {puzzle.description ? <span style={{ fontSize: 10, color: theme.textSecondary, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{puzzle.description}</span> : null}
      </div>

      <div ref={areaRef} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {boardSize > 0 &&
          (puzzle.gameType === 'chess' ? (
            <div style={{ transform: wrongFlash ? 'translateX(0)' : undefined, animation: wrongFlash ? 'puzzle-shake 380ms ease' : undefined }}>
              <ChessBoardView
                size={boardSize}
                orientation={orientation}
                pieces={pieces}
                theme={theme}
                selected={selected}
                targets={settings.showLegalTargets ? targets : new Set()}
                hint={hint}
                lastFrom={lastFrom}
                lastTo={lastTo}
                flipOpponentPieces={settings.flipOpponentPieces}
                polished={settings.chessBoardStyle === 'polished'}
                onPressPoint={p => onPressPoint(`${p.file}${p.rank}`)}
              />
            </div>
          ) : (
            <div style={{ transform: wrongFlash ? 'translateX(0)' : undefined, animation: wrongFlash ? 'puzzle-shake 380ms ease' : undefined }}>
              <XiangqiBoardView
                size={boardSize}
                orientation={orientation}
                pieces={pieces}
                theme={theme}
                selected={selected}
                targets={settings.showLegalTargets ? targets : new Set()}
                lastFrom={lastFrom}
                lastTo={lastTo}
                hint={hint}
                flipOpponentPieces={settings.flipOpponentPieces}
                xiangqiFont={settings.xiangqiFont}
                xiangqiTexture={settings.xiangqiTexture}
                onPressPoint={p => onPressPoint(`${p.file}${p.rank}`)}
              />
            </div>
          ))}
      </div>

      {/* 控制条 */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', backgroundColor: theme.surface, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <Ctrl label="提示" onPress={onHint} disabled={status === 'solved'} theme={theme} />
        <Ctrl label="重置" onPress={onReset} theme={theme} />
        <Ctrl label="解答" onPress={onShowSolution} disabled={status === 'solved'} theme={theme} />
        {status === 'solved' ? (
          <button type="button" onClick={props.hasNext ? props.onNext : props.onBack} style={{ flex: 1.2, padding: '10px 0', borderRadius: 10, backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#FFF8EE', fontWeight: 800, fontSize: 13 }}>{props.hasNext ? '下一题 →' : '返回列表'}</span>
          </button>
        ) : (
          <button type="button" onClick={props.onBack} style={{ flex: 1, padding: '10px 0', borderRadius: 10, backgroundColor: theme.surfaceAlt, border: `1px solid ${theme.accentSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: theme.textPrimary, fontWeight: 600, fontSize: 12 }}>返回</span>
          </button>
        )}
      </div>

      {/* 底部导航 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px 12px', backgroundColor: theme.surfaceAlt }}>
        <button type="button" disabled={!props.hasPrev} onClick={props.onPrev} style={{ opacity: props.hasPrev ? 1 : 0.35, color: theme.textSecondary, fontSize: 11 }}>
          ← 上一题
        </button>
        <span style={{ color: theme.textSecondary, fontSize: 10, letterSpacing: 1 }}>{puzzle.id}</span>
        <button type="button" disabled={!props.hasNext} onClick={props.onNext} style={{ opacity: props.hasNext ? 1 : 0.35, color: theme.textSecondary, fontSize: 11 }}>
          下一题 →
        </button>
      </div>

      <style>{`@keyframes puzzle-shake { 0%,100%{ transform: translateX(0)} 20%{transform: translateX(-6px)} 40%{transform: translateX(6px)} 60%{transform: translateX(-4px)} 80%{transform: translateX(4px)} }`}</style>
    </div>
  );
}

function Ctrl(props: { label: string; onPress(): void; disabled?: boolean; theme: ReturnType<typeof themeFor> }) {
  return (
    <button type="button" disabled={props.disabled} onClick={props.onPress} style={{ flex: 1, padding: '10px 0', borderRadius: 10, backgroundColor: props.theme.surface, border: `1px solid ${props.theme.surfaceAlt}`, opacity: props.disabled ? 0.4 : 1 }}>
      <span style={{ color: props.theme.textPrimary, fontWeight: 600, fontSize: 12 }}>{props.label}</span>
    </button>
  );
}
