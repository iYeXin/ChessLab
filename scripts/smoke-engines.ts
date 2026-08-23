/**
 * Real-engine smoke test (Node).
 *
 * Verifies the full backend path against actual binaries:
 *   handshake -> options -> position/go -> info stream -> bestmove
 * for both Stockfish (chess) and Pikafish (xiangqi).
 *
 * Usage:
 *   pnpm fetch:engines        # downloads + extracts into third_party/engines
 *   pnpm smoke:engines
 *
 * Paths may also be given via env: CHESS_STOCKFISH, CHESS_PIKAFISH,
 * CHESS_PIKAFISH_NNUE.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifest } from './engine-paths';
import { NodeProcessTransport } from '../packages/engine-process/src/node';
import {
  PIKAFISH_PROFILE,
  STOCKFISH_PROFILE,
  UciEngineDriver,
} from '../packages/engine-uci/src';
import { ChessRules } from '../packages/rules-chess/src';
import { XiangqiRules } from '../packages/rules-xiangqi/src';

async function main(): Promise<number> {
  const manifest = parseManifest();
  const stockfishPath =
    process.env.CHESS_STOCKFISH ?? manifest.stockfishPath ?? null;
  const pikafishPath = process.env.CHESS_PIKAFISH ?? manifest.pikafishPath ?? null;
  const pikafishNnue = process.env.CHESS_PIKAFISH_NNUE ?? manifest.pikafishNnuePath ?? null;

  let failures = 0;

  // ---- Stockfish -----------------------------------------------------------
  if (stockfishPath && existsSync(stockfishPath)) {
    try {
      const driver = new UciEngineDriver(STOCKFISH_PROFILE);
      await driver.start(new NodeProcessTransport({ command: stockfishPath }));
      console.log(`[sf] engine: ${driver.name}`);
      await driver.newGame();

      const rules = new ChessRules();
      rules.move('e2e4');
      rules.move('e7e5');

      // Mate in one from the classic R+K vs K edge case.
      const mateFen = 'k7/8/1K6/8/8/8/8/7R w - - 0 1';
      let sawInfo = false;
      const res = await driver.search(
        { fen: mateFen },
        { movetimeMs: 1500 },
        info => {
          if (info.depth !== undefined && !sawInfo) {
            sawInfo = true;
            console.log(`[sf] first info: depth ${info.depth}`);
          }
        },
      );
      console.log(`[sf] bestmove: ${res.bestmove} ponder: ${res.ponder ?? '-'}`);
      if (!res.bestmove || !mateFenLegal(mateFen, res.bestmove)) throw new Error('illegal bestmove');
      if (!sawInfo) throw new Error('no info lines received');
      if (!driver.availableOptions.has('UCI_Elo')) {
        throw new Error('expected UCI_Elo option on Stockfish 18');
      }
      await driver.quit();
      console.log('[sf] OK');
    } catch (err) {
      failures += 1;
      console.error(`[sf] FAILED: ${String(err)}`);
    }
  } else {
    console.warn('[sf] binary not found — set CHESS_STOCKFISH or run `pnpm fetch:engines`');
    failures += 1;
  }

  // ---- Pikafish ------------------------------------------------------------
  if (pikafishPath && existsSync(pikafishPath)) {
    try {
      const driver = new UciEngineDriver(PIKAFISH_PROFILE);
      await driver.start(new NodeProcessTransport({ command: pikafishPath }));
      console.log(`[pf] engine: ${driver.name}`);
      expectEvalFileAware(driver, pikafishNnue);

      const rules = new XiangqiRules();
      const legal = new Set(rules.moves().map(m => m.uci));
      const res = await driver.search(
        { fen: rules.fen() },
        { movetimeMs: 800 },
        undefined,
      );
      console.log(`[pf] bestmove: ${res.bestmove}`);
      if (!res.bestmove || !legal.has(res.bestmove)) {
        throw new Error(`bestmove ${res.bestmove} not among the 44 legal opening moves`);
      }
      await driver.quit();
      console.log('[pf] OK');
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

function expectEvalFileAware(driver: UciEngineDriver, nnuePath: string | null): void {
  if (!driver.availableOptions.has('EvalFile')) {
    throw new Error('Pikafish should expose an EvalFile option');
  }
  if (nnuePath) {
    console.log(`[pf] EvalFile will be provided by host: ${nnuePath}`);
  } else {
    console.warn('[pf] no NNUE path configured; engine falls back to its default search order');
  }
}

function mateFenLegal(fen: string, uci: string): boolean {
  const rules = new ChessRules(fen);
  return rules.moves().some(m => m.uci === uci);
}

main().then(code => process.exit(code));
