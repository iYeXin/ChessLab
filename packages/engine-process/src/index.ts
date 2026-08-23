import type { EngineTransport } from '@chesslab/engine-uci';

/** How to spawn an engine binary on this platform. */
export interface EngineSpawnSpec {
  /** Absolute or PATH-resolvable path to the executable. */
  command: string;
  args?: readonly string[];
  cwd?: string;
}

export type TransportFactory = (spec: EngineSpawnSpec) => Promise<EngineTransport>;

/**
 * Resolve a transport factory for the current runtime:
 * 1. React Native + native ChessEngines module -> OS process managed natively
 *    (Android: ProcessBuilder from nativeLibraryDir; Windows: CreateProcess).
 * 2. Plain Node (unit tests, CI smoke runs, desktop dev tools) -> child_process.
 *
 * The WASM/Web Worker transport is intentionally absent until the web target
 * exists; requesting it explicitly will throw a descriptive error.
 */
export async function resolveTransportFactory(): Promise<TransportFactory> {
  const rn = tryRequireReactNative();
  if (rn && typeof rn.Platform !== 'undefined') {
    const native = tryRequireNativeModule(rn);
    if (native) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createNativeTransportFactory } = require('./native') as typeof import('./native');
      return createNativeTransportFactory(native);
    }
    throw new Error(
      `Native engine bridge unavailable on platform '${String(rn.Platform.OS)}'. ` +
        'Did the native ChessEngines module get linked into this build?',
    );
  }
  const { createNodeTransportFactory } = await import('./node');
  return createNodeTransportFactory();
}

function tryRequireReactNative(): any | null {
  try {
    return require('react-native');
  } catch {
    return null;
  }
}

function tryRequireNativeModule(rn: any): ChessEnginesNativeModule | null {
  try {
    const mod = rn.NativeModules?.ChessEngines;
    return mod ?? null;
  } catch {
    return null;
  }
}

/** Shape of the Kotlin/C++ native module bridged over the RN bridge. */
export interface ChessEnginesNativeModule {
  startEngine(spec: {
    command: string;
    args?: readonly string[];
    cwd?: string;
  }): Promise<number>;
  writeLine(handle: number, line: string): Promise<void> | void;
  stopEngine(handle: number): Promise<void> | void;
}
