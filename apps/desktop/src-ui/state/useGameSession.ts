import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistLine,
  GameSession,
  type AssistEngineFactory,
  type EngineRunnerFactory,
} from '@chesslab/game-session';
import {
  type GameResult,
  type HistoryEntry,
  type LegalMove,
  type MoveUci,
  type Piece,
  type Side,
  type Square,
} from '@chesslab/rules-core';
import { ChessRules } from '@chesslab/rules-chess';
import { XiangqiRules } from '@chesslab/rules-xiangqi';
import { CHESS_FILES, CHESS_RANKS, XQ_FILES, XQ_RANKS } from '../game/boards';
import type { GameType } from '@chesslab/rules-core';

/**
 * Port of apps/chessapp/src/state/useGameSession.ts.
 *
 * Engine factories are injected by the caller (Phase W2):
 * `apps/desktop/src-ui/state/engines.ts` supplies Tauri-transport factories
 * and the hook behaves exactly like the RN version. When factories are
 * omitted the session falls back to local two-player mode.
 */

const ALL_SQUARES: Record<GameType, string[]> = {
  chess: CHESS_FILES.flatMap(f => CHESS_RANKS.map(r => `${f}${r}`)),
  xiangqi: XQ_FILES.flatMap(f => XQ_RANKS.map(r => `${f}${r}`)),
};

export interface SessionUiState {
  pieces: Record<Square, Piece>;
  turn: Side;
  history: readonly HistoryEntry[];
  result: GameResult | null;
  /** Side whose engine is thinking (null = idle/human). */
  thinkingSide: Side | null;
  check: boolean;
  assistLines: AssistLine[];
  bootError: string | null;
}

export interface SessionActions {
  playMove(uci: MoveUci): boolean;
  undo(): void;
  resign(): void;
  hint(): Promise<LegalMove | null>;
  enableAssist(): Promise<void>;
  disableAssist(): void;
  /** For 观战步进 mode: advance one engine ply */
  step(): boolean;
}

export type GameMode = 'pve' | 'pvp' | 'eve';

/** Feature availability derived from injected factories (drives UI disabling). */
export interface SessionCapabilities {
  hints: boolean;
  assist: boolean;
  engineOpponent: boolean;
  isEngineVsEngine: boolean;
  isStepMode: boolean;
}

const DIFFICULTY_LEVELS = [2, 6, 10, 14, 18] as const;

export function levelForDifficulty(difficulty: 1 | 2 | 3 | 4 | 5): number {
  return DIFFICULTY_LEVELS[difficulty - 1] ?? 10;
}

/**
 * Binds a GameSession to React state. A new session is created whenever
 * `gameKey` changes (new game / new config).
 */
export function useGameSession(args: {
  gameKey: number;
  gameType: GameType;
  mode: GameMode;
  humanSide: Side;
  difficulty: 1 | 2 | 3 | 4 | 5;
  difficultySecond?: 1 | 2 | 3 | 4 | 5;
  stepMode?: boolean;
  autoDelayMs?: number;
  /** Initial position FEN; omit for standard start position. */
  initialFen?: string;
  /** W2: Tauri transport factories; omit for local two-player mode. */
  factories?: {
    engineRunnerFactory: EngineRunnerFactory;
    analysisFactory?: AssistEngineFactory;
  };
}): {
  state: SessionUiState;
  actions: SessionActions & { assistOn: boolean; isPaused: boolean; togglePause(): void };
  capabilities: SessionCapabilities;
  sessionRef: React.RefObject<GameSession | null>;
} {
  const { gameKey, gameType, mode, humanSide, difficulty, difficultySecond, stepMode, autoDelayMs, initialFen, factories } = args;

  const [state, setState] = useState<SessionUiState>({
    pieces: {},
    turn: 'w',
    history: [],
    result: null,
    thinkingSide: null,
    check: false,
    assistLines: [],
    bootError: null,
  });
  const [assistOn, setAssistOn] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const sessionRef = useRef<GameSession | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsub: (() => void) | null = null;
    setState(s => ({ ...s, bootError: null }));

    const profileId = gameType === 'chess' ? 'stockfish' : 'pikafish';
    const autoPlay = !(mode === 'eve' && stepMode);

    const playerFor = (side: Side) => {
      if (mode === 'pvp') return { kind: 'human', side } as const;
      if (mode === 'eve') {
        if (!factories) return { kind: 'human', side } as const;
        const lvl = side === 'w' ? levelForDifficulty(difficulty) : levelForDifficulty(difficultySecond ?? difficulty);
        return { kind: 'engine', side, profileId, strengthLevel: lvl } as const;
      }
      // pve
      if (!factories || side === humanSide) return { kind: 'human', side } as const;
      return {
        kind: 'engine',
        side,
        profileId,
        strengthLevel: levelForDifficulty(difficulty),
      } as const;
    };

    const rules = gameType === 'chess' ? new ChessRules(initialFen) : new XiangqiRules(initialFen);
    const session = new GameSession({
      rules,
      white: playerFor('w'),
      black: playerFor('b'),
      autoPlay,
      autoDelayMs: autoDelayMs ?? 0,
      ...(factories ? { engineRunnerFactory: factories.engineRunnerFactory, analysisFactory: factories.analysisFactory } : {}),
    });
    sessionRef.current = session;

    const snapshot = () => {
      const pieces: Record<Square, Piece> = {};
      for (const sq of ALL_SQUARES[gameType]) {
        const p = session.rules.pieceAt(sq);
        if (p) pieces[sq] = p;
      }
      setState(s => ({
        ...s,
        pieces,
        turn: session.rules.turn(),
        history: [...session.rules.history()],
        result: session.finalResult ?? s.result,
        check: session.rules.isCheck(),
      }));
    };

    unsub = session.subscribe(e => {
      if (disposed) return;
      switch (e.kind) {
        case 'started':
        case 'move':
        case 'turn': {
          // In stepMode, don't auto-show thinking; wait for explicit step()
          const isEngineTurn = session.currentPlayerConfig()?.kind === 'engine';
          const thinking = e.kind === 'turn' && isEngineTurn && session.autoPlay ? (e.side as Side) : null;
          setState(s => ({ ...s, thinkingSide: thinking }));
          snapshot();
          break;
        }
        case 'thinking':
          setState(s => ({ ...s, thinkingSide: e.side }));
          break;
        case 'result':
          setState(s => ({ ...s, result: e.result, thinkingSide: null }));
          break;
        case 'assist':
          setState(s => ({ ...s, assistLines: e.lines }));
          break;
        case 'error':
          setState(s => ({ ...s, bootError: e.error.message }));
          break;
        default:
          break;
      }
    });

    // Initial board snapshot must not depend on engine startup succeeding.
    snapshot();

    void session.start().catch(err => {
      setState(s => ({
        ...s,
        bootError: err instanceof Error ? err.message : String(err),
      }));
    });

    // Browser lifecycle ↔ session suspend/resume (RN used AppState; doc §4.4).
    const onVisibility = () => {
      if (document.hidden) session.suspend();
      else session.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      unsub?.();
      void session.dispose();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  // Sync auto delay / pause to session
  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.setAutoDelayMs(autoDelayMs ?? 0);
    }
  }, [autoDelayMs]);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.setAutoPaused(isPaused);
    }
  }, [isPaused]);

  const actions = useMemo<SessionActions & { isPaused: boolean; togglePause(): void }>(
    () => ({
      playMove: uci => sessionRef.current?.playHumanMove(uci) ?? false,
      undo: () => sessionRef.current?.undo(),
      resign: () => {
        const s = sessionRef.current;
        if (!s) return;
        const toResign = mode === 'eve' ? (s.rules.turn() as Side) : humanSide;
        s.resign(toResign);
      },
      hint: async () => (await sessionRef.current?.hint()) ?? null,
      enableAssist: async () => {
        await sessionRef.current?.enableAssist({ multiPv: 2, budgetMs: 1200 });
        setAssistOn(true);
      },
      disableAssist: () => {
        sessionRef.current?.disableAssist();
        setAssistOn(false);
        setState(s => ({ ...s, assistLines: [] }));
      },
      step: () => sessionRef.current?.step() ?? false,
      get isPaused() {
        return isPaused;
      },
      togglePause: () => setIsPaused(v => !v),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [humanSide, mode, isPaused],
  );

  const capabilities: SessionCapabilities = useMemo(
    () => ({
      hints: mode === 'pve' && !!factories?.engineRunnerFactory,
      assist: mode !== 'pvp' && !!factories?.analysisFactory,
      engineOpponent: mode === 'pve' && !!factories,
      isEngineVsEngine: mode === 'eve',
      isStepMode: !!(mode === 'eve' && stepMode),
    }),
    [factories, mode, stepMode],
  );

  return {
    state,
    actions: { ...actions, assistOn },
    capabilities,
    sessionRef,
  };
}
