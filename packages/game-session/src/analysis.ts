import type { EngineInfo, GoLimits, UciEngineDriver } from '@chesslab/engine-uci';
import type { MoveUci } from '@chesslab/rules-core';

/**
 * Assisted-play analysis ("辅助着棋") backend.
 *
 * Design constraints:
 * - Runs on its OWN engine process, never the opponent's: a UCI engine has a
 *   single search thread of control, so sharing would stall either side; and
 *   hint strength must stay maximal regardless of the opponent's level.
 * - Uses `go infinite` + `stop` so lines keep deepening between user moves.
 * - MultiPV yields N candidate moves ranked by the engine; consumers render
 *   arrows / an eval bar from these snapshots.
 */

export interface AssistLine {
  /** 1 = engine's first choice. */
  multipv: number;
  depth: number;
  /** First move of the principal variation (coordinate notation). */
  uci: MoveUci | null;
  scoreCp?: number;
  scoreMate?: number;
  pv: MoveUci[];
}

/** Latest known lines, ordered by multipv (best first). */
export type AssistSnapshot = AssistLine[];

export interface AssistEngine {
  /**
   * (Re)start analysis on a position. Supersedes any running search and
   * resets accumulated lines.
   *
   * Power model:
   * - no budget        -> `go infinite` (continuous load; caller owns duty
   *                        cycle via stop()/suspend)
   * - budgetMs         -> finite `go movetime` burst, engine stops itself
   * - maxDepth         -> finite `go depth`
   *
   * `moves` carries the plies that led from `fen` to the live position —
   * without it the engine is repetition-blind (it would score a position
   * that already occurred twice as if it were fresh).
   */
  begin(
    fen: string,
    opts?: { multiPv?: number; budgetMs?: number; maxDepth?: number; moves?: readonly MoveUci[] },
  ): void;
  /** Halt the current search and clear lines. */
  stop(): void;
  onLines(cb: (lines: AssistSnapshot) => void): () => void;
  dispose(): Promise<void>;
}

export type AssistEngineFactory = () => Promise<AssistEngine>;

/** Default implementation over a live UCI driver. */
export function createUciAssistEngine(driver: UciEngineDriver): AssistEngine {
  let gen = 0;
  const listeners = new Set<(lines: AssistSnapshot) => void>();
  const latest = new Map<number, AssistLine>();

  const publish = (): void => {
    const lines = [...latest.values()].sort((a, b) => a.multipv - b.multipv);
    for (const cb of [...listeners]) cb(lines);
  };

  return {
    async begin(fen, opts) {
      const myGen = ++gen;
      latest.clear();
      publish();

      const multiPv = Math.max(1, opts?.multiPv ?? 1);
      await driver.setOptions({ MultiPV: multiPv });
      if (myGen !== gen) return; // superseded while options were applied

      // Finite budgets keep the CPU duty-cycled (mobile-friendly); without a
      // budget the search runs infinitely and the caller owns pausing.
      const limits: GoLimits =
        opts?.budgetMs !== undefined
          ? { movetimeMs: Math.max(50, opts.budgetMs) }
          : opts?.maxDepth !== undefined
            ? { depth: opts.maxDepth }
            : { infinite: true };

      // Settles on bestmove (finite) or stop() (infinite). Stale results are
      // dropped through generation checks.
      void driver
        .search({ fen, moves: opts?.moves }, limits, (info: EngineInfo) => {
          if (myGen !== gen || info.multipv === undefined) return;
          const prev = latest.get(info.multipv);
          if (prev && (info.depth ?? 0) < (prev.depth ?? 0)) return;
          latest.set(info.multipv, {
            multipv: info.multipv,
            depth: info.depth ?? 0,
            uci: info.pv[0] ?? null,
            ...(info.scoreCp !== undefined ? { scoreCp: info.scoreCp } : {}),
            ...(info.scoreMate !== undefined ? { scoreMate: info.scoreMate } : {}),
            pv: info.pv,
          });
          publish();
        })
        .catch(() => undefined); // death/supersede — surfaced via driver events
    },

    stop() {
      gen += 1;
      driver.stop();
      latest.clear();
      publish();
    },

    onLines(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    async dispose() {
      this.stop();
      await driver.quit();
    },
  };
}
