import { Platform } from 'react-native';
import {
  PIKAFISH_PROFILE,
  STOCKFISH_PROFILE,
  UciEngineDriver,
  getProfile,
  type EngineProfile,
  type UciOptionValue,
} from '@chesslab/engine-uci';
import {
  resolveTransportFactory,
  type EngineSpawnSpec,
} from '@chesslab/engine-process';
import type { AssistEngineFactory, EngineRunnerFactory } from '@chesslab/game-session';
import type { GameType } from '@chesslab/rules-core';
import NativeChessEngines from '../../spec/NativeChessEngines';

/**
 * App-side engine wiring: resolves binary paths per platform, spawns drivers
 * and adapts them to the session-layer factories.
 *
 * Process budget per game: opponent (1) + assist (1) + hint (1, lazy).
 * Each is a separate OS process because a UCI engine allows a single
 * active search — see docs/01-tech-selection.md §5.
 */

interface NativeDirs {
  /** Directory containing engine executables for THIS platform. */
  enginesDir: string | null;
  isNative: boolean;
}

let dirsPromise: Promise<NativeDirs> | null = null;

async function resolveDirs(): Promise<NativeDirs> {
  if (!dirsPromise) {
    dirsPromise = (async () => {
      try {
        if (Platform.OS === 'windows') {
          return { enginesDir: await NativeChessEngines.getEnginesDir(), isNative: true };
        }
        return {
          enginesDir: await NativeChessEngines.getNativeLibraryDir(),
          isNative: true,
        };
      } catch (e) {
        console.warn('[engines] dir resolution failed:', String(e));
        return { enginesDir: null, isNative: false };
      }
    })();
  }
  return dirsPromise;
}

export async function spawnSpecFor(
  profileId: 'stockfish' | 'pikafish',
): Promise<EngineSpawnSpec> {
  const profile = getProfile(profileId);
  const { enginesDir } = await resolveDirs();
  if (!enginesDir) {
    throw new Error(
      'Engine binaries unavailable — engines directory could not be resolved. ' +
        'Expected engines next to the app binary.',
    );
  }
  if (Platform.OS === 'android') {
    // W^X-safe: binaries packaged as lib*.so inside nativeLibraryDir.
    return { command: `${enginesDir}/lib${profile.binaryName}.so` };
  }
  if (Platform.OS === 'windows') {
    return { command: `${enginesDir}\\${profile.binaryName}.exe` };
  }
  return { command: `${enginesDir}/${profile.binaryName}` };
}

/** Extra options required before first search (Pikafish NNUE path). */
export async function platformOptionsFor(
  profileId: 'stockfish' | 'pikafish',
): Promise<Record<string, UciOptionValue>> {
  if (profileId !== 'pikafish') return {};
  const { enginesDir, isNative } = await resolveDirs();
  if (!enginesDir || !isNative) return {};
  const nnue =
    Platform.OS === 'android'
      ? `${enginesDir}/libpikafish_nnue.so`
      : `${enginesDir}\\pikafish.nnue`;
  return { EvalFile: nnue };
}

const drivers = new Map<string, UciEngineDriver>();

/**
 * scope: 'game' (opponent + hints, serialized safely) or 'assist' (dedicated,
 * because an infinite search must never block hint/opponent requests).
 */
async function driverFor(
  profileId: 'stockfish' | 'pikafish',
  scope: 'game' | 'assist',
): Promise<UciEngineDriver> {
  const key = `${profileId}:${scope}`;
  const existing = drivers.get(key);
  if (existing && existing.isAlive) return existing;

  const profile: EngineProfile = getProfile(profileId);
  const factory = await resolveTransportFactory(NativeChessEngines);
  const spec = await spawnSpecFor(profileId);
  const extra = await platformOptionsFor(profileId);

  // Fresh process after a crash.
  drivers.delete(key);
  const driver = new UciEngineDriver(profile);
  const transport = await factory(spec);
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

export { STOCKFISH_PROFILE, PIKAFISH_PROFILE };
