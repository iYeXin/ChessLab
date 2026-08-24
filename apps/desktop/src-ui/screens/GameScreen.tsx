import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameType, Piece, Side, Square } from '@chesslab/rules-core';
import { themeClassFor, themeFor } from '../theme/games';
import { ChessBoardView } from '../components/ChessBoardView';
import { XiangqiBoardView } from '../components/XiangqiBoardView';
import {
  AssistPanel,
  ControlsBar,
  MoveListStrip,
  ResultOverlay,
  StatusBanner,
  TopBar,
  type ControlDef,
} from '../components/GameChrome';
import { useGameSession } from '../state/useGameSession';
import { makeSessionFactories, shutdownEngines } from '../state/engines';

/**
 * DOM port of apps/chessapp/src/screens/GameScreen.tsx.
 * Phase W2: Tauri engine bridge enabled — human vs engine with full
 * hint/assist. Falls back to local two-player if the engine fails to spawn.
 */

const DIFF_LABEL = ['', '入门', '业余', '进阶', '大师', '特级'] as const;

export function GameScreen(props: {
  gameType: GameType;
  humanSide: Side;
  difficulty: 1 | 2 | 3 | 4 | 5;
  onExit(): void;
}) {
  const theme = themeFor(props.gameType);
  const [gameKey, setGameKey] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const factories = useMemo(() => makeSessionFactories(props.gameType), [props.gameType]);
  const { state, actions, capabilities, sessionRef } = useGameSession({
    gameKey,
    gameType: props.gameType,
    humanSide: props.humanSide,
    difficulty: props.difficulty,
    factories,
  });

  const handleExit = useCallback(() => {
    void shutdownEngines().then(props.onExit);
  }, [props.onExit]);

  // Ensure engines are cleaned up when the screen unmounts for any reason
  // (not only via the Back button).
  useEffect(() => {
    return () => {
      void shutdownEngines();
    };
  }, []);

  // ---- board sizing (RN used useWindowDimensions) --------------------------
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const en of entries) {
        setAreaSize({ w: en.contentRect.width, h: en.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const boardSize =
    areaSize.w > 0 && areaSize.h > 0
      ? Math.max(160, Math.floor(Math.min(areaSize.w - 8, areaSize.h - 8, 720)))
      : 0;

  // ---- tap-to-move ---------------------------------------------------------
  const [selected, setSelected] = useState<Square | null>(null);
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);
  const targets = useMemo<ReadonlySet<Square>>(() => {
    const session = sessionRef.current;
    if (!session || !selected || state.result) return new Set();
    return new Set(session.rules.moves({ square: selected }).map(m => m.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, state.history.length, state.result, state.turn]);

  /** Pick the move for a tapped destination; prefer queen promotion. */
  const moveForTarget = useCallback(
    (from: Square, to: Square) => {
      const session = sessionRef.current;
      if (!session) return undefined;
      const candidates = session.rules.moves({ square: from }).filter(m => m.to === to);
      return candidates.find(m => m.promotion === 'q') ?? candidates[0];
    },
    [sessionRef],
  );

  const onPressPoint = useCallback(
    (sq: Square) => {
      const session = sessionRef.current;
      if (!session || state.result) return;
      if (state.turn !== props.humanSide && capabilities.engineOpponent) return; // engine thinking
      setHint(null);

      if (selected && targets.has(sq)) {
        const mv = moveForTarget(selected, sq);
        setSelected(null);
        if (mv) session.playHumanMove(mv.uci);
        return;
      }
      if (selected === sq) {
        setSelected(null); // tap same square to deselect
        return;
      }
      const p: Piece | undefined = state.pieces[sq];
      if (p && p.side === props.humanSide) {
        setSelected(session.rules.moves({ square: sq }).length > 0 ? sq : null);
      } else if (!capabilities.engineOpponent) {
        // Local mode: either side may be picked up.
        setSelected(session.rules.moves({ square: sq }).length > 0 ? sq : null);
      } else {
        setSelected(null);
      }
    },
    [selected, targets, state.turn, state.result, state.pieces, props.humanSide, capabilities.engineOpponent, moveForTarget],
  );

  const onHint = useCallback(async () => {
    const mv = await actions.hint();
    if (mv) setHint({ from: mv.from, to: mv.to });
  }, [actions]);

  const onUndo = useCallback(() => {
    setHint(null);
    setSelected(null);
    actions.undo();
  }, [actions]);

  const controls: ControlDef[] = [
    { label: '悔棋', onPress: onUndo, disabled: state.history.length === 0 || !!state.result },
    {
      label: actions.assistOn ? '辅助·开' : '辅助·关',
      active: actions.assistOn,
      disabled: !capabilities.assist,
      onPress: () =>
        actions.assistOn || !capabilities.assist
          ? undefined
          : void actions.enableAssist(),
    },
    {
      label: '提示',
      onPress: () => void onHint(),
      disabled: !!state.result || !capabilities.hints,
    },
    { label: '认输', tone: 'danger', onPress: () => actions.resign(), disabled: !!state.result },
  ];

  const lastEntry = state.history[state.history.length - 1] ?? null;
  const lastFrom = (lastEntry ? lastEntry.uci.slice(0, 2) : null) as Square | null;
  const lastTo = (lastEntry ? lastEntry.uci.slice(2, 4) : null) as Square | null;

  const resultHeadline =
    state.result === null
      ? ''
      : state.result.winner === null
        ? '和棋'
        : state.result.winner === props.humanSide
          ? '胜利'
          : '失败';

  return (
    <div className={themeClassFor(props.gameType)} style={{ height: '100%', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column' }}>
      <TopBar
        theme={theme}
        title={theme.displayName}
        subtitle={
          capabilities.engineOpponent
            ? `${DIFF_LABEL[props.difficulty]} · ${props.gameType === 'chess' ? 'STOCKFISH 18' : 'PIKAFISH'}`
            : `本地双人对局 · ${DIFF_LABEL[props.difficulty]}`
        }
        onBack={handleExit}
        right={
          <span style={{ color: theme.textSecondary, fontSize: 10, paddingRight: 8 }}>
            {props.gameType === 'chess'
              ? props.humanSide === 'w'
                ? '执白'
                : '执黑'
              : props.humanSide === 'w'
                ? '执红'
                : '执黑'}
          </span>
        }
      />

      <StatusBanner
        theme={theme}
        turn={state.turn}
        humanSide={capabilities.engineOpponent ? props.humanSide : state.turn}
        thinkingSide={state.thinkingSide}
        check={state.check}
        bootError={state.bootError}
        result={state.result}
      />

      <div
        ref={areaRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {boardSize > 0 &&
          (props.gameType === 'chess' ? (
            <ChessBoardView
              size={boardSize}
              orientation={props.humanSide}
              pieces={state.pieces}
              theme={theme}
              {...{
                selected,
                targets,
                hint,
                lastFrom,
                lastTo,
              }}
              onPressPoint={p => onPressPoint(`${p.file}${p.rank}`)}
            />
          ) : (
            <XiangqiBoardView
              size={boardSize}
              orientation={props.humanSide}
              pieces={state.pieces}
              theme={theme}
              selected={selected}
              targets={targets}
              lastFrom={lastFrom}
              lastTo={lastTo}
              hint={hint}
              onPressPoint={p => onPressPoint(`${p.file}${p.rank}`)}
            />
          ))}
      </div>

      {actions.assistOn && capabilities.assist ? (
        <AssistPanel theme={theme} lines={state.assistLines} historyLast={lastEntry} />
      ) : null}

      <ControlsBar theme={theme} controls={controls} />
      <MoveListStrip theme={theme} history={state.history} />

      <ResultOverlay
        visible={!!state.result && showResult}
        theme={theme}
        headline={resultHeadline}
        detail=""
        onNewGame={() => {
          setShowResult(false);
          setSelected(null);
          setHint(null);
          setGameKey(k => k + 1);
        }}
        onClose={() => setShowResult(false)}
      />
      {/* Auto-show the overlay once a result arrives. */}
      <ResultAutoShow resultArrived={!!state.result} onShow={() => setShowResult(true)} />
    </div>
  );
}

function ResultAutoShow(props: { resultArrived: boolean; onShow(): void }) {
  React.useEffect(() => {
    if (props.resultArrived) {
      const t = setTimeout(props.onShow, 450);
      return () => clearTimeout(t);
    }
  }, [props.resultArrived]);
  return null;
}
