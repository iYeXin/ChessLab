import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { GameType, Piece, Side, Square } from '@chesslab/rules-core';
import { themeFor } from '../theme/games';
import { ChessBoardView, emptyLayer } from '../components/chess/ChessBoardView';
import { XiangqiBoardView } from '../components/xiangqi/XiangqiBoardView';
import {
  AssistPanel,
  ControlsBar,
  MoveListStrip,
  ResultOverlay,
  StatusBanner,
  TopBar,
  type ControlDef,
} from '../components/common/GameChrome';
import { useGameSession } from '../state/useGameSession';
import { shutdownEngines } from '../state/engines';

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
  const { state, actions, sessionRef } = useGameSession({
    gameKey,
    gameType: props.gameType,
    humanSide: props.humanSide,
    difficulty: props.difficulty,
  });

  const win = useWindowDimensions();
  // Reserve chrome heights (top/status/controls/movelist + paddings).
  const boardSize = Math.floor(Math.min(win.width - 28, win.height - 300));

  // ---- tap-to-move ---------------------------------------------------------
  const [selected, setSelected] = useState<Square | null>(null);
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);
  const targets = useMemo<ReadonlySet<Square>>(() => {
    const session = sessionRef.current;
    if (!session || !selected || state.result) return new Set();
    return new Set(session.rules.moves({ square: selected }).map(m => m.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, state.history.length, state.result, state.turn]);

  const onPressPoint = useCallback(
    (sq: Square) => {
      const session = sessionRef.current;
      if (!session || state.result) return;
      if (state.turn !== props.humanSide) return; // engine thinking / their move
      setHint(null);

      if (selected && targets.has(sq)) {
        const mv = session.rules.moves({ square: selected }).find(m => m.to === sq);
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
      } else {
        setSelected(null);
      }
    },
    [selected, targets, state.turn, state.result, state.pieces, props.humanSide],
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
      onPress: () => (actions.assistOn ? actions.disableAssist() : void actions.enableAssist()),
    },
    { label: '提示', onPress: () => void onHint(), disabled: !!state.result },
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
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar
        theme={theme}
        title={theme.displayName}
        subtitle={`${DIFF_LABEL[props.difficulty]} · ${props.gameType === 'chess' ? 'STOCKFISH 18' : 'PIKAFISH'}`}
        onBack={() => {
          void shutdownEngines().then(props.onExit);
        }}
        right={
          <Text style={{ color: theme.textSecondary, fontSize: 10, paddingRight: 8 }}>
            {props.gameType === 'chess'
              ? props.humanSide === 'w'
                ? '执白'
                : '执黑'
              : props.humanSide === 'w'
                ? '执红'
                : '执黑'}
          </Text>
        }
      />

      <StatusBanner
        theme={theme}
        turn={state.turn}
        humanSide={props.humanSide}
        thinkingSide={state.thinkingSide}
        check={state.check}
        bootError={state.bootError}
        result={state.result}
      />

      <View style={styles.boardArea}>
        {props.gameType === 'chess' ? (
          <ChessBoardView
            size={boardSize}
            orientation={props.humanSide}
            pieces={state.pieces}
            theme={theme}
            {...emptyLayer()}
            selected={selected}
            targets={targets}
            hint={hint}
            lastFrom={lastFrom}
            lastTo={lastTo}
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
        )}
      </View>

      {actions.assistOn ? (
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
    </SafeAreaView>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
