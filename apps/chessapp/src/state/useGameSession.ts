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
import { makeSessionFactories } from './engines';
import { CHESS_FILES, CHESS_RANKS, XQ_FILES, XQ_RANKS } from '../game/boards';
import type { GameType } from '@chesslab/rules-core';

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
  humanSide: Side;
  difficulty: 1 | 2 | 3 | 4 | 5;
}): {
  state: SessionUiState;
  actions: SessionActions & { assistOn: boolean };
  result: GameResult | null;
  thinkingSide: Side | null;
  assistLines: AssistLine[];
  sessionRef: React.MutableRefObject<GameSession | null>;
} {
  const { gameKey, gameType, humanSide, difficulty } = args;

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
  const sessionRef = useRef<GameSession | null>(null);
  const thinkingRef = useRef<Side | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsub: (() => void) | null = null;
    let assistUnsub: (() => void) | null = null;
    setState(s => ({ ...s, bootError: null }));

    const factories = makeSessionFactories(gameType);
    const level = levelForDifficulty(difficulty);
    const profileId = gameType === 'chess' ? 'stockfish' : 'pikafish';

    const playerFor = (side: Side) =>
      side === humanSide
        ? ({ kind: 'human', side } as const)
        : ({ kind: 'engine', side, profileId, strengthLevel: level } as const);

    const session = new GameSession({
      rules: gameType === 'chess' ? new ChessRules() : new XiangqiRules(),
      white: playerFor('w'),
      black: playerFor('b'),
      engineRunnerFactory: factories.engineRunnerFactory,
      analysisFactory: factories.analysisFactory,
    });
    sessionRef.current = session;

    const snapshot = () => {
      const pieces: Record<Square, Piece> = {};
      // Enumerate all board points via the rules' moves superset is wrong;
      // instead scan squares from history-independent geometry provided by UI.
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
        case 'turn':
          thinkingRef.current =
            e.kind === 'turn' && session.currentPlayerConfig()?.kind === 'engine'
              ? e.side
              : null;
          setState(s => ({ ...s, thinkingSide: thinkingRef.current }));
          snapshot();
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

    void session.start().catch(err => {
      setState(s => ({
        ...s,
        bootError: err instanceof Error ? err.message : String(err),
      }));
    });

    return () => {
      disposed = true;
      unsub?.();
      void session.dispose();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  const actions = useMemo<SessionActions>(
    () => ({
      playMove: uci => sessionRef.current?.playHumanMove(uci) ?? false,
      undo: () => sessionRef.current?.undo(),
      resign: () => {
        const s = sessionRef.current;
        if (!s) return;
        s.resign(humanSide);
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [humanSide],
  );

  return {
    state,
    actions: { ...actions, assistOn },
    result: state.result,
    thinkingSide: state.thinkingSide,
    assistLines: state.assistLines,
    /** Live session for interaction-time queries (legal moves per square). */
    sessionRef,
  };
}
