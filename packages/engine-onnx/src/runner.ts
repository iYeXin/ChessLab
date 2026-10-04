import type { EngineTurnRunner } from '@chessnext/game-session';
import type { RulesAdapter } from '@chessnext/rules-core';
import { buildModelInput, indexToIccs, moveToIndex, rankMoves, softmax3 } from './encoding';
import { allowsOpponentWin, findWinningMove } from './mate';
import {
  temperatureForPly,
  temperaturePreset,
  type TemperaturePreset,
  type TemperaturePresetId,
} from './temperature';
import type { InferenceResult, OnnxSession, RankedMove } from './types';

/**
 * How many top candidates get the "avoid being mated" check.
 * Layer 1 of the mate guard is exact and unbounded; only layer 2 is capped.
 */
export const MATE_GUARD_TOP_K = 10;

export interface InferArgs {
  session: OnnxSession;
  rules: RulesAdapter;
  preset: TemperaturePreset;
  /** Enable the mate guard. Strongly recommended (see mate.ts). */
  mateGuard: boolean;
  rng: () => number;
}

/**
 * One full model-driven move decision.
 *
 * Order of operations matters:
 *   1. the mate guard may win outright, before any inference;
 *   2. inference + temperature-scaled masked softmax produces candidates;
 *   3. unsafe candidates are filtered (bounded);
 *   4. sample from what remains.
 */
export async function inferPosition(args: InferArgs): Promise<InferenceResult> {
  const { session, rules, preset, mateGuard, rng } = args;
  const ply = rules.history().length;
  const empty: InferenceResult = {
    bestMove: -1,
    top: [],
    ranked: [],
    value: { win: 0, draw: 0, loss: 0 },
    backend: session.backend,
  };

  const input = buildModelInput(rules, ply);
  if (input.legalMoves.length === 0) return empty;

  // Layer 1 — immediate win, before burning an inference.
  if (mateGuard) {
    const win = findWinningMove(rules);
    if (win) {
      const idx = moveToIndex(win);
      const only: RankedMove[] = [{ move: idx, iccs: win, p: 1 }];
      return {
        bestMove: idx,
        top: only,
        ranked: only,
        value: { win: 1, draw: 0, loss: 0 },
        backend: session.backend,
      };
    }
  }

  const out = await session.run(input.planes);
  const temperature = temperatureForPly(ply, preset);
  const ranked = rankMoves(out.policy, input, temperature);
  if (ranked.length === 0) return { ...empty, value: softmax3(out.value) };

  // Layer 2 — drop candidates that allow an immediate loss.
  let pool: RankedMove[] = ranked;
  if (mateGuard && ranked.length > 1) {
    const safe = ranked.slice(0, MATE_GUARD_TOP_K).filter(c => !allowsOpponentWin(rules, c.iccs));
    if (safe.length > 0) pool = safe;
  }

  const chosen = weightedPick(pool, rng) ?? pool[0]!;
  return {
    bestMove: chosen.move,
    top: ranked.slice(0, 8),
    ranked,
    value: softmax3(out.value),
    backend: session.backend,
  };
}

function weightedPick(items: readonly RankedMove[], rng: () => number): RankedMove | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const it of items) total += it.p;
  if (!(total > 0)) return items[0]!;
  let roll = rng() * total;
  for (const it of items) {
    roll -= it.p;
    if (roll <= 0) return it;
  }
  return items[items.length - 1]!;
}

export interface OnnxRunnerOptions {
  session: OnnxSession;
  /** Fresh rules instance — the runner must never share mutable state. */
  createRules: (fen?: string) => RulesAdapter;
  temperaturePreset?: TemperaturePresetId;
  mateGuard?: boolean;
  rng?: () => number;
}

/**
 * `EngineTurnRunner` backed by an ONNX tier model.
 *
 * Stateless per request: it rebuilds the position from `fen` + `moves`, so the
 * same runner instance is safe for engine-vs-engine and for speculative use.
 */
export function createOnnxRunner(opts: OnnxRunnerOptions): EngineTurnRunner {
  const preset = temperaturePreset(opts.temperaturePreset ?? 'play');
  const mateGuard = opts.mateGuard ?? true;
  const rng = opts.rng ?? Math.random;

  return {
    profileId: 'onnx-tier',

    async requestMove({ fen, moves }) {
      const rules = opts.createRules(fen);
      for (const m of moves) rules.move(m);
      const result = await inferPosition({ session: opts.session, rules, preset, mateGuard, rng });
      return { bestmove: result.bestMove >= 0 ? indexToIccs(result.bestMove) : null };
    },

    cancel() {
      /* inference is short and not cancellable; nothing to abort */
    },

    async dispose() {
      /* the session is shared across runners and disposed by its owner */
    },
  };
}
