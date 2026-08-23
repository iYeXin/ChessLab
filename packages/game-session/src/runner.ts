import type {
  EngineInfo,
  GoLimits,
  UciOptionValue,
  UciEngineDriver,
} from '@chesslab/engine-uci';
import { computeStrengthOptions, pickThinkTimeMs } from '@chesslab/engine-uci';
import type { MoveUci } from '@chesslab/rules-core';

/**
 * Engine turn execution, decoupled from transports so sessions can be tested
 * with scripted fakes. One runner serves one player for one game.
 */
export interface EngineTurnRunner {
  readonly profileId: string;
  requestMove(args: {
    fen: string;
    moves: readonly MoveUci[];
    level: number;
    clock?: { remainingMs?: number; incrementMs?: number };
    onInfo?: (info: EngineInfo) => void;
  }): Promise<{ bestmove: MoveUci | null }>;
  /** Invalidate any in-flight request and stop the underlying search. */
  cancel(): void;
  dispose(): Promise<void>;
}

export type EngineRunnerFactory = (args: {
  profileId: string;
  strengthLevel: number;
}) => Promise<EngineTurnRunner> | EngineTurnRunner;

/**
 * Default runner over a live UCI driver (Stockfish / Pikafish).
 * Generation counters make cancel() safe even while a bridge round-trip is
 * in flight: stale resolutions are dropped by the caller checking gen.
 */
export function createUciRunner(
  driver: UciEngineDriver,
  options?: Record<string, UciOptionValue>,
): EngineTurnRunner {
  let currentGen = 0;

  return {
    get profileId(): string {
      return driver.id;
    },

    async requestMove({ fen, moves, level, clock, onInfo }) {
      const gen = currentGen + 1;

      const strength = computeStrengthOptions(
        driver.profile,
        driver.availableOptions as ReadonlyMap<string, unknown>,
        level,
      );
      if (Object.keys(strength).length > 0) await driver.setOptions(strength);

      // If cancel() happened while we were applying strength options, bail out
      // before issuing another `go` to a cancelled request.
      if (gen <= currentGen) return { bestmove: null };
      currentGen = gen;

      const limits: GoLimits = { movetimeMs: pickThinkTimeMs(level, clock) };

      return await new Promise<{ bestmove: MoveUci | null }>((resolve, reject) => {
        driver
          .search({ fen, moves }, limits, info => {
            if (gen === currentGen) onInfo?.(info);
          })
          .then(
            r => {
              if (gen === currentGen) resolve(r);
            },
            e => {
              if (gen === currentGen) reject(e instanceof Error ? e : new Error(String(e)));
            },
          );
      });
    },

    cancel() {
      currentGen += 1;
      driver.stop();
    },

    async dispose() {
      this.cancel();
      await driver.quit();
    },
  };
}
