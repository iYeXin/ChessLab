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
import { PIKAFISH_PROFILE, UciEngineDriver, engineOptionPresetForLevel } from '../packages/engine-uci/src';
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

      // ---- mode 2: engine-option strength (Skill Level) ---------------------
      // Mode 2 drives the engine's own `Skill Level`, so verify the binary
      // exposes it and that the shipped preset really reaches both ends.
      const driver2 = new UciEngineDriver(PIKAFISH_PROFILE);
      await driver2.start(new NodeProcessTransport({ command: pikafishPath }));
      if (pikafishNnue) await driver2.setOptions({ EvalFile: pikafishNnue });
      await driver2.newGame();

      for (const opt of ['Skill Level', 'Mate Threat Depth']) {
        if (!driver2.availableOptions.has(opt)) {
          throw new Error(`expected option '${opt}' on Pikafish ${pikafishPath}`);
        }
      }
      const skillDef = driver2.availableOptions.get('Skill Level');
      console.log(`[pf] mode2 option OK: Skill Level ${skillDef?.min ?? '?'}..${skillDef?.max ?? '?'}`);

      const rules2 = new XiangqiRules();
      const openingFen = rules2.fen();
      const searchAtLevel = async (level: number) => {
        // Exactly what engineOptionsStrategy() plans for a level.
        const preset = engineOptionPresetForLevel(level);
        await driver2.setOptions(preset.options);
        const r = await driver2.search({ fen: openingFen }, preset.limits);
        return { skill: preset.options['Skill Level'], bestmove: r.bestmove };
      };
      const weak = await searchAtLevel(2); // 入门  -> Skill 0
      const strong = await searchAtLevel(18); // 特级 -> Skill 20
      console.log(`[pf] mode2 skill ${weak.skill} -> ${weak.bestmove}   skill ${strong.skill} -> ${strong.bestmove}`);
      if (weak.skill !== 0 || strong.skill !== 20) {
        throw new Error(`mode2 skill mapping off: ${weak.skill} / ${strong.skill}`);
      }
      for (const mv of [weak.bestmove, strong.bestmove]) {
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
