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

const drivers = new Map<string, UciEngineDriver>();

async function driverFor(
  profileId: 'stockfish' | 'pikafish',
  scope: 'game' | 'assist',
): Promise<UciEngineDriver> {
  const key = `${profileId}:${scope}`;
  const existing = drivers.get(key);
  if (existing && existing.isAlive) return existing;

  const profile: EngineProfile = getProfile(profileId);
  const extra = await platformOptionsFor(profileId);

  drivers.delete(key);
  const driver = new UciEngineDriver(profile);
  const transport = await createTauriTransport(profileId);
  await driver.start(transport);
  if (Object.keys(extra).length > 0) await driver.setOptions(extra);
  await driver.newGame();
  drivers.set(key, driver);
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
      const driver = await driverFor(pid, 'game');
      const { createUciRunner } = await import('@chesslab/game-session');
      return createUciRunner(driver);
    },
    analysisFactory: async () => {
      const { createUciAssistEngine } = await import('@chesslab/game-session');
      const driver = await driverFor(pid, 'assist');
      return createUciAssistEngine(driver);
    },
  };
}

/** Kill every spawned engine process (called when leaving a game screen). */
export async function shutdownEngines(): Promise<void> {
  for (const d of drivers.values()) await d.quit().catch(() => undefined);
  drivers.clear();
}

export { PIKAFISH_PROFILE, STOCKFISH_PROFILE };
