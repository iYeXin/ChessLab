import type {
  EngineInfo,
  EngineTurnStrategy,
  UciEngineDriver,
} from '@chessnext/engine-uci';
import { choosePikafishMove } from '@chessnext/engine-uci';
import type { MoveUci, Side } from '@chessnext/rules-core';

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
    /**
     * Optional veto for randomized MultiPV alternatives (host-weakened mode
     * only). The engine's own bestmove is never vetoed. Used to keep the
     * variety randomizer out of repetition loops.
     */
    guardCandidate?: (mv: MoveUci) => boolean;
  }): Promise<{ bestmove: MoveUci | null }>;
  /** Invalidate any in-flight request and stop the underlying search. */
  cancel(): void;
  dispose(): Promise<void>;
}

export type EngineRunnerFactory = (args: {
  profileId: string;
  strengthLevel: number;
  /**
   * Which side this runner plays. Lets the host pick a different difficulty
   * strategy per side, so 观战 can run heterogeneous setups (e.g. Red on the
   * engine's native options while Black uses the ONNX tier model).
   */
  side: Side;
}) => Promise<EngineTurnRunner> | EngineTurnRunner;

/**
 * Default runner over a live UCI driver (Pikafish).
 *
 * The difficulty policy is injected as an `EngineTurnStrategy` so the same
 * runner serves every mode:
 *   - `hostWeakenedStrategy()`  — search-budget + near-equal randomisation
 *   - `engineOptionsStrategy(o)` — the engine's own strength options, verbatim
 *
 * Generation counters make cancel() safe even while a bridge round-trip is in
 * flight: stale resolutions are dropped by the caller checking gen.
 */
export function createUciRunner(
  driver: UciEngineDriver,
  strategy: EngineTurnStrategy,
): EngineTurnRunner {
  let currentGen = 0;

  return {
    get profileId(): string {
      return driver.id;
    },

    async requestMove({ fen, moves, level, clock, onInfo, guardCandidate }) {
      const gen = currentGen + 1;
      const plan = strategy.plan({ level, clock });

      // Apply the strategy's options (MultiPV breadth included) and confirm.
      if (Object.keys(plan.options).length > 0) await driver.setOptions(plan.options);

      if (gen <= currentGen) return { bestmove: null };
      currentGen = gen;

      const spec = plan.spec;
      // Only collect MultiPV infos when the strategy actually wants to choose
      // among near-equal alternatives; otherwise the engine's bestmove stands.
      const infos = spec.multiPv > 1 ? new Map<number, EngineInfo>() : null;

      return await new Promise<{ bestmove: MoveUci | null }>((resolve, reject) => {
        driver
          .search({ fen, moves }, spec.limits, info => {
            if (gen !== currentGen) return;
            if (infos && info.multipv !== undefined) {
              const prev = infos.get(info.multipv);
              if (!prev || (info.depth ?? 0) >= (prev.depth ?? 0)) infos.set(info.multipv, info);
            }
            onInfo?.(info);
          })
          .then(
            r => {
              if (gen !== currentGen) return;
              if (infos && r.bestmove) {
                const chosen = choosePikafishMove(infos, r.bestmove, spec, Math.random, guardCandidate);
                resolve({ bestmove: chosen });
              } else {
                resolve(r);
              }
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
