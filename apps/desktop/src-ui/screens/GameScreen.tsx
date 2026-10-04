import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Piece, Side, Square } from '@chessnext/rules-core';
import { XIANGQI_THEME, THEME_CLASS } from '../theme/games';
import { XiangqiBoardView } from '../components/XiangqiBoardView';
import {
  AssistPanel,
  ControlsBar,
  HistoryModal,
  MoveListStrip,
  ResultOverlay,
  StatusBanner,
  TopBar,
  reasonText,
  type ControlDef,
} from '../components/GameChrome';
import { useGameSession, type StartConfig } from '../state/useGameSession';
import { makeSessionFactories, shutdownEngines } from '../state/engines';
import { useSettings } from '../state/settings';
import { playMoveSound } from '../game/sound';

const DIFF_LABEL = ['', '入门', '业余', '进阶', '大师', '特级'] as const;

export function GameScreen(props: { cfg: StartConfig; onExit(): void }) {
  const { cfg } = props;
  const theme = XIANGQI_THEME;
  const { settings } = useSettings();
  const [gameKey, setGameKey] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const isWatch = cfg.mode === 'eve';
  const factories = useMemo(
    () =>
      makeSessionFactories({
        engineMode: settings.engineMode,
        // Only 观战 gets per-side modes; otherwise the single engine opponent
        // must follow the mode the player actually chose.
        ...(isWatch
          ? { watchModes: { white: settings.engineModeWhite, black: settings.engineModeBlack } }
          : {}),
        mode2: settings.mode2,
        onnxTemperature: settings.onnxTemperature,
        onnxMateGuard: settings.onnxMateGuard,
      }),
    [
      isWatch,
      settings.engineMode,
      settings.engineModeWhite,
      settings.engineModeBlack,
      settings.mode2,
      settings.onnxTemperature,
      settings.onnxMateGuard,
    ],
  );

  const { state, actions, capabilities, sessionRef } = useGameSession({
    gameKey,
    mode: cfg.mode,
    humanSide: cfg.humanSide,
    difficulty: cfg.difficulty,
    difficultySecond: cfg.difficultySecond,
    stepMode: cfg.stepMode,
    autoDelayMs: cfg.autoDelayMs ?? settings.autoDelayMs,
    factories: cfg.mode === 'pvp' ? undefined : factories,
  });

  const handleExit = useCallback(() => {
    void shutdownEngines().then(props.onExit);
  }, [props.onExit]);

  useEffect(() => {
    return () => {
      void shutdownEngines();
    };
  }, []);

  // 落子音效：历史步数增加时播放
  const prevHistoryLenRef = useRef(0);
  const prevGameKeyRef = useRef(gameKey);
  useEffect(() => {
    if (prevGameKeyRef.current !== gameKey) {
      prevGameKeyRef.current = gameKey;
      prevHistoryLenRef.current = 0;
      return;
    }
    if (state.history.length > prevHistoryLenRef.current) {
      playMoveSound();
    }
    prevHistoryLenRef.current = state.history.length;
  }, [state.history.length, gameKey]);

  // Orientation: for pve use humanSide, for pvp/eve use 'w' (red/white at bottom) but allow flip via settings? Keep simple.
  const orientation: Side = cfg.mode === 'pve' ? cfg.humanSide : 'w';

  // ---- board sizing
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

  // ---- tap-to-move
  const [selected, setSelected] = useState<Square | null>(null);
  const [hint, setHint] = useState<{ from: Square; to: Square } | null>(null);
  const targets = useMemo<ReadonlySet<Square>>(() => {
    const session = sessionRef.current;
    if (!session || !selected || state.result) return new Set();
    return new Set(session.rules.moves({ square: selected }).map(m => m.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, state.history.length, state.result, state.turn]);

  const moveForTarget = useCallback(
    (from: Square, to: Square) => {
      const session = sessionRef.current;
      if (!session) return undefined;
      // Xiangqi has no promotion: at most one legal move per from→to pair.
      return session.rules.moves({ square: from }).find(m => m.to === to);
    },
    [sessionRef],
  );

  const onPressPoint = useCallback(
    (sq: Square) => {
      const session = sessionRef.current;
      if (!session || state.result) return;

      // Item 7: engine vs engine step mode - no human moves
      if (capabilities.isEngineVsEngine) return;

      // Item 4: hint click to move - if hint exists and user taps hint destination, play it
      if (hint && sq === hint.to) {
        const mv = moveForTarget(hint.from, hint.to);
        if (mv) {
          setHint(null);
          setSelected(null);
          session.playHumanMove(mv.uci);
          return;
        }
      }

      // In pvp, both sides are human; in pve, only humanSide can move when it's their turn
      const isHumanTurn = cfg.mode === 'pvp' ? true : state.turn === cfg.humanSide;
      if (!isHumanTurn && capabilities.engineOpponent) return; // engine thinking, block
      // For pvp, we don't block on turn check beyond human turn - already handled
      // Clear hint on any interaction (but preserve for hint-move case above)
      if (hint) setHint(null);

      if (selected && targets.has(sq)) {
        const mv = moveForTarget(selected, sq);
        setSelected(null);
        if (mv) session.playHumanMove(mv.uci);
        return;
      }
      if (selected === sq) {
        setSelected(null);
        return;
      }
      const p: Piece | undefined = state.pieces[sq];
      // Determine if this piece belongs to player who can move now
      const sideToMove = state.turn;
      const canPickThisSide = cfg.mode === 'pvp' ? p?.side === sideToMove : p?.side === cfg.humanSide && sideToMove === cfg.humanSide;
      // For pvp, allow picking side to move; for pve, only humanSide
      if (cfg.mode === 'pvp') {
        if (p && p.side === sideToMove) {
          setSelected(session.rules.moves({ square: sq }).length > 0 ? sq : null);
        } else {
          setSelected(null);
        }
      } else {
        if (p && p.side === cfg.humanSide && sideToMove === cfg.humanSide) {
          setSelected(session.rules.moves({ square: sq }).length > 0 ? sq : null);
        } else if (!capabilities.engineOpponent) {
          // fallback for local mode without engine (should not happen)
          setSelected(session.rules.moves({ square: sq }).length > 0 ? sq : null);
        } else {
          setSelected(null);
        }
      }
    },
    [selected, targets, state.turn, state.result, state.pieces, cfg, capabilities, moveForTarget, hint],
  );

  const onHint = useCallback(async () => {
    try {
      const mv = await actions.hint();
      if (mv) setHint({ from: mv.from as Square, to: mv.to as Square });
    } catch {
      // hint engine failed (boot timeout / death) — stay silent, button stays usable
    }
  }, [actions]);

  const onUndo = useCallback(() => {
    setHint(null);
    setSelected(null);
    actions.undo();
  }, [actions]);

  const onStep = useCallback(() => {
    const ok = actions.step();
    if (!ok && state.result) {
      // no-op when game over
    }
  }, [actions, state.result]);

  const onTogglePause = useCallback(() => {
    actions.togglePause();
  }, [actions]);

  // Item 8: 观战实时分析 — auto enable when eve
  useEffect(() => {
    if (cfg.mode === 'eve' && capabilities.assist && !actions.assistOn && !state.result) {
      // Use pauseOnOpponentTurn:false so analysis runs even while engines think
      void actions
        .enableAssist()
        .then(() => {
          // override to keep running during engine thinking
          sessionRef.current?.enableAssist({ multiPv: 3, budgetMs: 1500, pauseOnOpponentTurn: false }).catch(() => {});
        })
        .catch(() => {}); // engine boot failure must not surface as unhandled rejection
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.mode, capabilities.assist, state.result]);

  // Controls: adapt for mode
  const controls: ControlDef[] = useMemo(() => {
    if (capabilities.isEngineVsEngine) {
      if (capabilities.isStepMode) {
        const canStep = !state.result && !state.thinkingSide;
        return [
          { label: '下一步', onPress: onStep, disabled: !canStep },
          { label: '悔棋', onPress: onUndo, disabled: state.history.length === 0 || !!state.result },
          { label: '认输', tone: 'danger', onPress: () => actions.resign(), disabled: !!state.result },
        ];
      }
      // auto eve - with pause and delay
      const isPaused = (actions as any).isPaused as boolean | undefined;
      return [
        { label: isPaused ? '继续' : '暂停', onPress: onTogglePause, disabled: !!state.result },
        { label: '悔棋', onPress: onUndo, disabled: state.history.length === 0 || !!state.result },
        { label: actions.assistOn ? '分析·开' : '分析·关', active: actions.assistOn, onPress: () => (actions.assistOn ? actions.disableAssist() : void actions.enableAssist().catch(() => {})), disabled: !capabilities.assist },
        { label: '认输', tone: 'danger', onPress: () => actions.resign(), disabled: !!state.result },
      ];
    }
    // pve / pvp
    return [
      { label: '悔棋', onPress: onUndo, disabled: state.history.length === 0 || !!state.result },
      {
        label: actions.assistOn ? '辅助·开' : '辅助·关',
        active: actions.assistOn,
        disabled: !capabilities.assist || cfg.mode === 'pvp',
        onPress: () => (actions.assistOn || !capabilities.assist ? undefined : void actions.enableAssist().catch(() => {})),
      },
      { label: '提示', onPress: () => void onHint(), disabled: !!state.result || !capabilities.hints },
      { label: '认输', tone: 'danger', onPress: () => actions.resign(), disabled: !!state.result },
    ];
  }, [capabilities, actions, onUndo, onHint, onStep, state.history.length, state.result, state.thinkingSide, cfg.mode]);

  const lastEntry = state.history[state.history.length - 1] ?? null;
  const lastFrom = (lastEntry ? lastEntry.uci.slice(0, 2) : null) as Square | null;
  const lastTo = (lastEntry ? lastEntry.uci.slice(2, 4) : null) as Square | null;

  const winnerSide = state.result?.winner ?? null;
  const sideWinLabel =
    winnerSide === null ? '和棋' : winnerSide === 'w' ? '红方胜' : '黑方胜';
  const resultHeadline =
    state.result === null
      ? ''
      : cfg.mode === 'pve'
        ? winnerSide === null
          ? '和棋'
          : winnerSide === cfg.humanSide
            ? '胜利'
            : '失败'
        : sideWinLabel;
  const resultDetail = state.result ? reasonText(state.result) : '';

  // Subtitle logic per mode
  const subtitle = (() => {
    if (cfg.mode === 'pvp') return '双人对局';
    if (cfg.mode === 'eve') {
      const d1 = DIFF_LABEL[cfg.difficulty];
      const d2 = DIFF_LABEL[cfg.difficultySecond ?? cfg.difficulty];
      return `观战 ${d1} vs ${d2} ${cfg.stepMode ? '· 步进' : '· 自动'}`;
    }
    return `${DIFF_LABEL[cfg.difficulty]} · PIKAFISH`;
  })();

  const humanSideLabel = (() => {
    if (cfg.mode === 'pvp') return '双人';
    if (cfg.mode === 'eve') return '观战';
    return cfg.humanSide === 'w' ? '执红' : '执黑';
  })();

  // Move history rendering policy - item 3+4: hiddenDuringPlay uses modal, not inline
  const showInlineStrip = settings.moveHistoryMode === 'always' || settings.moveHistoryMode === 'compact';
  const moveStripHistory = useMemo(() => {
    if (settings.moveHistoryMode === 'compact' && !state.result) {
      return state.history.slice(-10); // 5 pairs during play
    }
    return state.history;
  }, [state.history, settings.moveHistoryMode, state.result]);

  // Traditional notation is generated on the fly inside MoveListStrip/HistoryModal.

  return (
    <div className={THEME_CLASS} style={{ height: '100%', backgroundColor: theme.bg, display: 'flex', flexDirection: 'column' }}>
      <TopBar
        theme={theme}
        title={theme.displayName}
        subtitle={subtitle}
        onBack={handleExit}
        right={<span style={{ color: theme.textSecondary, fontSize: 10, paddingRight: 8 }}>{humanSideLabel}</span>}
      />

      <StatusBanner
        theme={theme}
        turn={state.turn}
        humanSide={cfg.mode === 'pvp' ? state.turn : cfg.humanSide}
        thinkingSide={state.thinkingSide}
        check={state.check}
        bootError={state.bootError}
        result={state.result}
        isWatch={cfg.mode === 'eve'}
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
        {boardSize > 0 && (
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
        )}
      </div>

      {/* Assist area: fixed height to avoid jitter in 双机 */}
      <div style={{ height: 38, minHeight: 38, margin: '0 var(--sp-l)', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        {actions.assistOn && !state.result ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <AssistPanel theme={theme} lines={state.assistLines} historyLast={lastEntry} active />
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </div>

      <ControlsBar theme={theme} controls={controls} />

      {showInlineStrip ? (
        <MoveListStrip theme={theme} history={moveStripHistory} xiangqiNotation={settings.xiangqiNotation} />
      ) : (
        <div style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceAlt }}>
          <button type="button" onClick={() => setShowFullHistory(true)} style={{ color: theme.textSecondary, fontSize: 11, padding: '6px 12px' }}>
            {state.result ? `查看着法记录（${state.history.length}步）` : `着法 ${state.history.length} 步 · 点击查看`}
          </button>
        </div>
      )}

      {showFullHistory ? <HistoryModal theme={theme} history={state.history} xiangqiNotation={settings.xiangqiNotation} onClose={() => setShowFullHistory(false)} /> : null}

      <ResultOverlay
        visible={!!state.result && showResult}
        theme={theme}
        headline={resultHeadline}
        detail={resultDetail}
        history={state.history}
        xiangqiNotation={settings.xiangqiNotation}
        onNewGame={() => {
          setShowResult(false);
          setSelected(null);
          setHint(null);
          setShowFullHistory(false);
          setGameKey(k => k + 1);
        }}
        onClose={() => setShowResult(false)}
      />
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
