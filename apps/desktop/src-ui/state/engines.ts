import { invoke } from '@tauri-apps/api/core';
import {
  PIKAFISH_PROFILE,
  UciEngineDriver,
  engineOptionsStrategy,
  hostWeakenedStrategy,
  type EngineProfile,
  type EngineTurnStrategy,
  type GoLimits,
  type UciOptionValue,
} from '@chessnext/engine-uci';
import { createOnnxRunner } from '@chessnext/engine-onnx';
import type {
  AssistEngineFactory,
  EngineRunnerFactory,
  EngineTurnRunner,
} from '@chessnext/game-session';
import type { Side } from '@chessnext/rules-core';
import { XiangqiRules } from '@chessnext/rules-xiangqi';
import { isOnnxOnly, resolveSideModes, type WatchModePlan } from './engine-mode-plan';
import { createTauriTransport } from '../transport/tauri';
import { tierForLevel } from './difficulty';
import { getTierSession } from './onnx';
import type { EngineMode, Mode2LevelOverride, Mode2Overrides, OnnxTemperatureId } from './settings';

/**
 * Engine wiring for every difficulty mode.
 *
 *  mode 1/2 — a Pikafish OS process driven over UCI (Rust bridge in
 *             `src-tauri/src/engines.rs`); the mode only changes the strategy
 *             object handed to `createUciRunner`.
 *  mode 3   — the research ONNX tier model, running inside the WebView.
 *
 * Process budget per game (modes 1/2): opponent (1) + assist (1) + hint (1, lazy).
 */

const ENGINE_ID = 'pikafish';

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
export async function platformOptions(): Promise<Record<string, UciOptionValue>> {
  const nnue = await resolveNnuePath();
  if (!nnue) return {};
  return { EvalFile: nnue };
}

const assistDrivers = new Map<string, UciEngineDriver>();
const gameDrivers = new Set<UciEngineDriver>();

async function driverForAssist(): Promise<UciEngineDriver> {
  const existing = assistDrivers.get(ENGINE_ID);
  if (existing && existing.isAlive) return existing;
  const profile: EngineProfile = PIKAFISH_PROFILE;
  const extra = await platformOptions();
  assistDrivers.delete(ENGINE_ID);
  const driver = new UciEngineDriver(profile);
  const transport = await createTauriTransport(ENGINE_ID);
  await driver.start(transport);
  if (Object.keys(extra).length > 0) await driver.setOptions(extra);
  await driver.newGame();
  assistDrivers.set(ENGINE_ID, driver);
  return driver;
}

async function createGameDriver(): Promise<UciEngineDriver> {
  const profile: EngineProfile = PIKAFISH_PROFILE;
  const extra = await platformOptions();
  const driver = new UciEngineDriver(profile);
  const transport = await createTauriTransport(ENGINE_ID);
  await driver.start(transport);
  if (Object.keys(extra).length > 0) await driver.setOptions(extra);
  await driver.newGame();
  gameDrivers.add(driver);
  // Remove from the set when quit
  const origQuit = driver.quit.bind(driver);
  driver.quit = async () => {
    gameDrivers.delete(driver);
    return origQuit();
  };
  return driver;
}

/** Only the numeric search-budget fields of a mode 2 override. */
function overrideLimits(o: Mode2LevelOverride): GoLimits | undefined {
  const limits: GoLimits = {};
  if (typeof o.movetimeMs === 'number') limits.movetimeMs = o.movetimeMs;
  if (typeof o.nodes === 'number') limits.nodes = o.nodes;
  if (typeof o.depth === 'number') limits.depth = o.depth;
  return Object.keys(limits).length > 0 ? limits : undefined;
}

export interface SessionEngineConfig {
  /** 人机 / 残局：单一引擎对手的棋力方案。 */
  engineMode: EngineMode;
  /**
   * 观战模式：红黑各自的棋力方案，可**异构**。
   *
   * 只有观战才传。人机 / 残局必须留空，否则这里的（默认 1）会盖掉
   * `engineMode` —— 曾经因此让「模式 3」的人机对局照样启动 Pikafish。
   */
  watchModes?: WatchModePlan;
  /** Mode 2 per-level custom values, keyed by engine level. */
  mode2?: Mode2Overrides;
  /** Mode 3 move-choice temperature preset. */
  onnxTemperature?: OnnxTemperatureId;
  /** Mode 3 mate guard. */
  onnxMateGuard?: boolean;
}

/**
 * Session-layer factories.
 *
 * The difficulty strategy is resolved **per side**, so 观战 can mix them
 * (e.g. Red on the engine's native options, Black on the ONNX tier model).
 * Each side already gets its own runner, so mixing costs nothing structurally.
 *
 * `analysisFactory` is only provided when at least one side runs a UCI engine:
 * the ONNX graph exposes policy + value only, with no deepening MultiPV stream
 * to drive an assist panel.
 */
export function makeSessionFactories(cfg: SessionEngineConfig): {
  engineRunnerFactory: EngineRunnerFactory;
  analysisFactory?: AssistEngineFactory;
} {
  const sideModes = resolveSideModes(cfg.engineMode, cfg.watchModes);
  const modeFor = (side: Side): EngineMode => (side === 'w' ? sideModes.w : sideModes.b);

  const createOnnx = async (strengthLevel: number): Promise<EngineTurnRunner> => {
    const tier = tierForLevel(strengthLevel);
    const session = await getTierSession(tier);
    return createOnnxRunner({
      session,
      createRules: fen => new XiangqiRules(fen),
      temperaturePreset: cfg.onnxTemperature ?? 'play',
      mateGuard: cfg.onnxMateGuard ?? true,
    });
  };

  const createUci = async (strengthLevel: number, mode: EngineMode): Promise<EngineTurnRunner> => {
    const driver = await createGameDriver();
    const { createUciRunner } = await import('@chessnext/game-session');
    return createUciRunner(driver, strategyFor(mode, cfg.mode2, strengthLevel));
  };

  const engineRunnerFactory: EngineRunnerFactory = async ({ strengthLevel, side }) => {
    const mode = modeFor(side);
    return mode === 3 ? createOnnx(strengthLevel) : createUci(strengthLevel, mode);
  };

  // Assist needs a UCI engine, so it is available unless EVERY side is ONNX.
  if (isOnnxOnly([sideModes.w, sideModes.b])) return { engineRunnerFactory };

  return {
    engineRunnerFactory,
    analysisFactory: async () => {
      const { createUciAssistEngine } = await import('@chessnext/game-session');
      const driver = await driverForAssist();
      return createUciAssistEngine(driver);
    },
  };
}

/** Strategy for one side at one strength level. */
function strategyFor(
  mode: EngineMode,
  overrides: Mode2Overrides | undefined,
  strengthLevel: number,
): EngineTurnStrategy {
  if (mode !== 2) return hostWeakenedStrategy();
  const override = overrides?.[String(strengthLevel)];
  if (!override) return engineOptionsStrategy();
  const limits = overrideLimits(override);
  return engineOptionsStrategy({ options: override.options, ...(limits ? { limits } : {}) });
}

/** Kill every spawned engine process (called when leaving a game screen). */
export async function shutdownEngines(): Promise<void> {
  for (const d of assistDrivers.values()) await d.quit().catch(() => undefined);
  assistDrivers.clear();
  for (const d of [...gameDrivers]) await d.quit().catch(() => undefined);
  gameDrivers.clear();
}

export { PIKAFISH_PROFILE };
