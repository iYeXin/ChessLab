import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Puzzle } from '@chesslab/puzzles';
import { themeFor } from '../theme/games';
import { ChessBoardView } from '../components/ChessBoardView';
import { XiangqiBoardView } from '../components/XiangqiBoardView';
import { HistoryModal, MoveListStrip, ResultOverlay, StatusBanner, TopBar, reasonText } from '../components/GameChrome';
import { useSettings } from '../state/settings';
import { useGameSession } from '../state/useGameSession';
import { makeSessionFactories, shutdownEngines } from '../state/engines';
import type { Piece, Side, Square } from '@chesslab/rules-core';
import { usePuzzleProgress } from '../state/puzzles';
import { playMoveSound } from '../game/sound';

const DIFF_LABEL = ['', '入门', '业余', '进阶', '大师', '特级'] as const;

export function PuzzleScreen(props: {
  puzzle: Puzzle;
  onBack(): void;
  onNext(): void;
  onPrev(): void;
  hasNext: boolean;
  hasPrev: boolean;
}) {
  const { puzzle } = props;
  const theme = themeFor(puzzle.gameType);
  const { settings } = useSettings();
  const { markSolved } = usePuzzleProgress();

  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(puzzle.rating);
  const [gameKey, setGameKey] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);

  const factories = useMemo(() => makeSessionFactories(puzzle.gameType), [puzzle.gameType]);

  const { state, actions, sessionRef } = useGameSession({
    gameKey,
    gameType: puzzle.gameType,
    mode: 'pve',
    humanSide: puzzle.sideToMove,
    difficulty,
    initialFen: puzzle.fen,
    factories,
  });

  const humanSide = puzzle.sideToMove;
  const orientation: Side = humanSide;

  const handleBack = useCallback(() => {
    void shutdownEngines().then(props.onBack);
  }, [props.onBack]);

  useEffect(() => {
    return () => {
      void shutdownEngines();
    };
  }, []);

  // Sync solved mark when human wins
  useEffect(() => {
    if (state.result && state.result.winner === humanSide) {
      markSolved(puzzle.id);
    }
  }, [state.result, humanSide, markSolved, puzzle.id]);

  // Sound on move
  const prevLenRef = useRef(0);
  const prevKeyRef = useRef(gameKey);
  useEffect(() => {
    if (prevKeyRef.current !== gameKey) {
      prevKeyRef.current = gameKey;
      prevLenRef.current = 0;
      return;
    }
    if (state.history.length > prevLenRef.current) playMoveSound();
    prevLenRef.current = state.history.length;
  }, [state.history.length, gameKey]);

  // Board sizing
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setAreaSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boardSize =
    areaSize.w > 0 && areaSize.h > 0 ? Math.max(160, Math.floor(Math.min(areaSize.w - 8, areaSize.h - 8, 560))) : 0;

  const targets = useMemo<ReadonlySet<Square>>(() => {
    const s = sessionRef.current;
    if (!s || !selected || state.result) return new Set();
    return new Set(s.rules.moves({ square: selected }).map(m => m.to as Square));
  }, [selected, state.result, state.history.length, state.turn]);

  const moveForTarget = useCallback(
    (from: Square, to: Square) => {
      const s = sessionRef.current;
      if (!s) return undefined;
      const cands = s.rules.moves({ square: from }).filter(m => m.to === to);
      return cands.find(m => m.promotion === 'q') ?? cands[0];
    },
    [sessionRef],
  );

  const handleSelectDifficulty = (d: 1 | 2 | 3 | 4 | 5) => {
    if (d === difficulty) return;
    setDifficulty(d);
    setSelected(null);
    setHint(null);
    setShowResult(false);
    setShowHistory(false);
    setGameKey(k => k + 1);
  };

  const handleRestart = useCallback(() => {
    setSelected(null);
    setHint(null);
    setShowResult(false);
    setShowHistory(false);
    setGameKey(k => k + 1);
  }, []);

  const onPressPoint = useCallback(
    (sq: Square) => {
      const s = sessionRef.current;
      if (!s || state.result) return;
      if (state.thinkingSide) return;
      if (state.turn !== humanSide) return;

      if (hint && sq === hint.to) {
        const mv = moveForTarget(hint.from, hint.to);
        if (mv) {
          setHint(null);
          setSelected(null);
          s.playHumanMove(mv.uci);
          return;
        }
      }
      if (hint) setHint(null);

      if (selected && targets.has(sq)) {
        const mv = moveForTarget(selected, sq);
        setSelected(null);
        if (mv) s.playHumanMove(mv.uci);
        return;
      }
      if (selected === sq) {
        setSelected(null);
        return;
      }
      const p: Piece | undefined = state.pieces[sq];
      if (p && p.side === humanSide) {
        const ms = s.rules.moves({ square: sq });
        setSelected(ms.length > 0 ? sq : null);
      } else {
        setSelected(null);
      }
    },
    [selected, targets, hint, state.result, state.turn, state.pieces, humanSide, state.thinkingSide, moveForTarget],
  );

  const onHint = useCallback(async () => {
    try {
      const mv = await actions.hint();
      if (mv) setHint({ from: mv.from as Square, to: mv.to as Square });
    } catch {}
  }, [actions]);

  const onUndo = useCallback(() => {
    setHint(null);
    setSelected(null);
    actions.undo();
  }, [actions]);

  const last = state.history[state.history.length - 1] ?? null;
  const lastFrom = (last ? last.uci.slice(0, 2) : null) as Square | null;
  const lastTo = (last ? last.uci.slice(2, 4) : null) as Square | null;

  const resultHeadline = (() => {
    if (!state.result) return '';
    if (state.result.winner === null) return '和棋';
    return state.result.winner === humanSide ? '胜利' : '失败';
  })();
  const resultDetail = state.result ? reasonText(state.result) : '';

  // Auto show result overlay
  useEffect(() => {
    if (state.result) {
      const t = setTimeout(() => setShowResult(true), 450);
      return () => clearTimeout(t);
    } else {
      setShowResult(false);
    }
  }, [state.result]);

  return (
    <div className={`${theme.gameType === 'chess' ? 'theme-chess' : 'theme-xiangqi'}`} style={{ height: '100%', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column' }}>
      <TopBar
        theme={theme}
        title={puzzle.title}
        subtitle={`${puzzle.gameType === 'chess' ? '国际象棋' : '中国象棋'} · ${DIFF_LABEL[difficulty]}`}
        onBack={handleBack}
        right={
          <span style={{ fontSize: 10, color: theme.textSecondary, paddingRight: 8 }}>
            {humanSide === 'w' ? (puzzle.gameType === 'xiangqi' ? '执红' : '执白') : '执黑'}
          </span>
        }
      />

      <StatusBanner
        theme={theme}
        turn={state.turn}
        humanSide={humanSide}
        thinkingSide={state.thinkingSide}
        check={state.check}
        bootError={state.bootError}
        result={state.result}
        gameType={puzzle.gameType}
      />

      {/* Difficulty selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.06)', backgroundColor: theme.surfaceAlt, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 11, color: theme.textSecondary, marginRight: 4 }}>难度</span>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            disabled={!!state.thinkingSide}
            onClick={() => handleSelectDifficulty(n as 1 | 2 | 3 | 4 | 5)}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: difficulty === n ? 700 : 400,
              backgroundColor: difficulty === n ? theme.accent : theme.surface,
              color: difficulty === n ? '#fff' : theme.textPrimary,
              border: `1px solid ${difficulty === n ? theme.accent : theme.surfaceAlt}`,
              opacity: state.thinkingSide ? 0.5 : 1,
            }}
          >
            {DIFF_LABEL[n]}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: theme.textSecondary }}>{puzzle.themes.slice(0, 2).join(' · ')}</span>
      </div>

      <div ref={areaRef} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {boardSize > 0 &&
          (puzzle.gameType === 'chess' ? (
            <ChessBoardView
              size={boardSize}
              orientation={orientation}
              pieces={state.pieces}
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
          ) : (
            <XiangqiBoardView
              size={boardSize}
              orientation={orientation}
              pieces={state.pieces}
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
          ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', backgroundColor: theme.surface, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <Ctrl label="悔棋" onPress={onUndo} disabled={state.history.length === 0 || !!state.result} theme={theme} />
        <Ctrl label="提示" onPress={() => void onHint()} disabled={!!state.result || !!state.thinkingSide} theme={theme} />
        <Ctrl label="认输" onPress={() => actions.resign()} disabled={!!state.result} tone="danger" theme={theme} />
        <Ctrl label="重开" onPress={handleRestart} theme={theme} />
      </div>

      {/* Bottom history / nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', backgroundColor: theme.surfaceAlt, gap: 8 }}>
        <button type="button" disabled={!props.hasPrev} onClick={props.onPrev} style={{ opacity: props.hasPrev ? 1 : 0.35, color: theme.textSecondary, fontSize: 11 }}>
          ← 上一题
        </button>
        <button type="button" onClick={() => setShowHistory(true)} style={{ color: theme.textSecondary, fontSize: 11, flex: 1, textAlign: 'center' as const }}>
          着法 {state.history.length} 步 · 点击查看
        </button>
        <button type="button" disabled={!props.hasNext} onClick={props.onNext} style={{ opacity: props.hasNext ? 1 : 0.35, color: theme.textSecondary, fontSize: 11 }}>
          下一题 →
        </button>
      </div>

      {showHistory ? <HistoryModal theme={theme} history={state.history} gameType={puzzle.gameType} xiangqiNotation={settings.xiangqiNotation} onClose={() => setShowHistory(false)} /> : null}

      <ResultOverlay
        visible={!!state.result && showResult}
        theme={theme}
        headline={resultHeadline}
        detail={resultDetail}
        history={state.history}
        gameType={puzzle.gameType}
        xiangqiNotation={settings.xiangqiNotation}
        onNewGame={handleRestart}
        onClose={() => setShowResult(false)}
      />
    </div>
  );
}

function Ctrl(props: { label: string; onPress(): void; disabled?: boolean; tone?: 'danger'; theme: ReturnType<typeof themeFor> }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onPress}
      style={{
        flex: 1,
        padding: '10px 0',
        borderRadius: 10,
        backgroundColor: props.tone === 'danger' ? props.theme.surface : props.theme.surface,
        border: `1px solid ${props.tone === 'danger' ? props.theme.danger : props.theme.surfaceAlt}`,
        opacity: props.disabled ? 0.4 : 1,
      }}
    >
      <span style={{ color: props.tone === 'danger' ? props.theme.danger : props.theme.textPrimary, fontWeight: 600, fontSize: 12 }}>{props.label}</span>
    </button>
  );
}
