import { invoke } from '@tauri-apps/api/core';
import {
  PIKAFISH_PROFILE,
  STOCKFISH_PROFILE,
  UciEngineDriver,
  getProfile,
  type EngineProfile,
  type UciOptionValue,
} from '@chesslab/engine-uci';
import type { AssistEngineFactory, EngineRunnerFactory } from '@chesslab/game-session';
import type { GameType } from '@chesslab/rules-core';
import { createTauriTransport } from '../transport/tauri';

/**
 * Tauri desktop engine wiring (Phase W2).
 *
 * Mirrors `apps/chessapp/src/state/engines.ts` but uses the Tauri process
 * bridge (`engines.rs`) instead of the RN TurboModule.
 *
 * Process budget per game: opponent (1) + assist (1) + hint (1, lazy).
 */

let nnuePathPromise: Promise<string | null> | null = null;

async function resolveNnuePath(): Promise<string | null> {
  if (!nnuePathPromise) {
    nnuePathPromise = (async () => {
      try {
        const p = await invoke<string | null>('engine_nnue_path');
        return p ?? null;
      } catch {
        return null;
      }
    })();
  }
  return nnuePathPromise;
}

/** Extra options required before first search (Pikafish NNUE path). */
export async function platformOptionsFor(
  profileId: 'stockfish' | 'pikafish',
): Promise<Record<string, UciOptionValue>> {
  if (profileId !== 'pikafish') return {};
  const nnue = await resolveNnuePath();
  if (!nnue) return {};
  return { EvalFile: nnue };
}

const assistDrivers = new Map<string, UciEngineDriver>();
const gameDrivers = new Set<UciEngineDriver>();

async function driverForAssist(profileId: 'stockfish' | 'pikafish'): Promise<UciEngineDriver> {
  const key = `${profileId}:assist`;
  const existing = assistDrivers.get(key);
  if (existing && existing.isAlive) return existing;
  const profile: EngineProfile = getProfile(profileId);
  const extra = await platformOptionsFor(profileId);
  assistDrivers.delete(key);
  const driver = new UciEngineDriver(profile);
  const transport = await createTauriTransport(profileId);
  await driver.start(transport);
  if (Object.keys(extra).length > 0) await driver.setOptions(extra);
  await driver.newGame();
  assistDrivers.set(key, driver);
  return driver;
}

async function createGameDriver(profileId: 'stockfish' | 'pikafish'): Promise<UciEngineDriver> {
  const profile: EngineProfile = getProfile(profileId);
  const extra = await platformOptionsFor(profileId);
  const driver = new UciEngineDriver(profile);
  const transport = await createTauriTransport(profileId);
  await driver.start(transport);
  if (Object.keys(extra).length > 0) await driver.setOptions(extra);
  await driver.newGame();
  gameDrivers.add(driver);
  // Remove from set when quit
  const origQuit = driver.quit.bind(driver);
  driver.quit = async () => {
    gameDrivers.delete(driver);
    return origQuit();
  };
  return driver;
}

function profileIdFor(gameType: GameType): 'stockfish' | 'pikafish' {
  return gameType === 'chess' ? 'stockfish' : 'pikafish';
}

/** Session-layer factories bound to this game type. */
export function makeSessionFactories(gameType: GameType): {
  engineRunnerFactory: EngineRunnerFactory;
  analysisFactory: AssistEngineFactory;
} {
  const pid = profileIdFor(gameType);

  return {
    engineRunnerFactory: async () => {
      const driver = await createGameDriver(pid);
      const { createUciRunner } = await import('@chesslab/game-session');
      return createUciRunner(driver);
    },
    analysisFactory: async () => {
      const { createUciAssistEngine } = await import('@chesslab/game-session');
      const driver = await driverForAssist(pid);
      return createUciAssistEngine(driver);
    },
  };
}

/** Kill every spawned engine process (called when leaving a game screen). */
export async function shutdownEngines(): Promise<void> {
  for (const d of assistDrivers.values()) await d.quit().catch(() => undefined);
  assistDrivers.clear();
  for (const d of [...gameDrivers]) await d.quit().catch(() => undefined);
  gameDrivers.clear();
}

export { PIKAFISH_PROFILE, STOCKFISH_PROFILE };
