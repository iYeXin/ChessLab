/**
 * Real-engine smoke test (Node).
 *
 * Verifies the full backend path against the actual binary:
 *   handshake -> options -> position/go -> info stream -> bestmove
 * for Pikafish (xiangqi).
 *
 * Usage:
 *   pnpm fetch:engines        # downloads + extracts into third_party/engines
 *   pnpm smoke:engines
 *
 * Paths may also be given via env: CHESS_PIKAFISH, CHESS_PIKAFISH_NNUE.
 */
import { existsSync } from 'node:fs';
import { parseManifest } from './engine-paths';
import { NodeProcessTransport } from './node-transport';
import { PIKAFISH_PROFILE, UciEngineDriver } from '../packages/engine-uci/src';
import { XiangqiRules } from '../packages/rules-xiangqi/src';

async function main(): Promise<number> {
  const manifest = parseManifest();
  const pikafishPath = process.env.CHESS_PIKAFISH ?? manifest.pikafishPath ?? null;
  const pikafishNnue = process.env.CHESS_PIKAFISH_NNUE ?? manifest.pikafishNnuePath ?? null;

  let failures = 0;

  if (pikafishPath && existsSync(pikafishPath)) {
    try {
      const driver = new UciEngineDriver(PIKAFISH_PROFILE);
      await driver.start(new NodeProcessTransport({ command: pikafishPath }));
      console.log(`[pf] engine: ${driver.name}`);

      if (!driver.availableOptions.has('EvalFile')) {
        throw new Error('Pikafish should expose an EvalFile option');
      }
      if (pikafishNnue) {
        console.log(`[pf] EvalFile will be provided by host: ${pikafishNnue}`);
        await driver.setOptions({ EvalFile: pikafishNnue });
      } else {
        console.warn('[pf] no NNUE path configured; engine falls back to its default search order');
      }
      await driver.newGame();

      const rules = new XiangqiRules();
      const legal = new Set(rules.moves().map(m => m.uci));
      if (legal.size !== 44) throw new Error(`expected 44 legal opening moves, got ${legal.size}`);

      let sawInfo = false;
      const res = await driver.search({ fen: rules.fen() }, { movetimeMs: 1200 }, info => {
        if (info.depth !== undefined && !sawInfo) {
          sawInfo = true;
          console.log(`[pf] first info: depth ${info.depth}`);
        }
      });
      console.log(`[pf] bestmove: ${res.bestmove}`);
      if (!res.bestmove || !legal.has(res.bestmove)) {
        throw new Error(`bestmove ${res.bestmove} not among the 44 legal opening moves`);
      }
      if (!sawInfo) throw new Error('no info lines received');
      await driver.quit();
      console.log('[pf] OK');

      // ---- mode 2: native strength options ---------------------------------
      // The "engine options" difficulty mode is only viable if this binary
      // really exposes UCI_LimitStrength / UCI_Elo / Skill Level.
      const driver2 = new UciEngineDriver(PIKAFISH_PROFILE);
      await driver2.start(new NodeProcessTransport({ command: pikafishPath }));
      if (pikafishNnue) await driver2.setOptions({ EvalFile: pikafishNnue });
      await driver2.newGame();

      for (const opt of ['UCI_LimitStrength', 'UCI_Elo', 'Skill Level', 'MultiPV']) {
        if (!driver2.availableOptions.has(opt)) {
          throw new Error(`expected option '${opt}' on Pikafish ${pikafishPath}`);
        }
      }
      const eloDef = driver2.availableOptions.get('UCI_Elo');
      console.log(
        `[pf] mode2 options OK: UCI_Elo ${eloDef?.min ?? '?'}..${eloDef?.max ?? '?'}, ` +
          `Skill Level 0..20, native limiting available`,
      );

      const rules2 = new XiangqiRules();
      const openingFen = rules2.fen();
      const searchAt = async (elo: number): Promise<string | null> => {
        // Exactly what engineOptionsStrategy() plans for a level.
        await driver2.setOptions({ UCI_LimitStrength: true, UCI_Elo: elo, MultiPV: 1 });
        const r = await driver2.search({ fen: openingFen }, { movetimeMs: 800 });
        return r.bestmove;
      };
      const minElo = eloDef?.min ?? 1350;
      const maxElo = eloDef?.max ?? 2850;
      const weak = await searchAt(minElo);
      const strong = await searchAt(maxElo);
      console.log(`[pf] mode2 elo ${minElo} -> ${weak}   elo ${maxElo} -> ${strong}`);
      for (const mv of [weak, strong]) {
        if (!mv || !legal.has(mv)) throw new Error(`mode2 produced an illegal bestmove: ${mv}`);
      }
      await driver2.quit();
      console.log('[pf] mode2 OK');
    } catch (err) {
      failures += 1;
      console.error(`[pf] FAILED: ${String(err)}`);
    }
  } else {
    console.warn('[pf] binary not found — set CHESS_PIKAFISH or run `pnpm fetch:engines`');
    failures += 1;
  }

  return failures === 0 ? 0 : 1;
}

main().then(code => process.exit(code));
