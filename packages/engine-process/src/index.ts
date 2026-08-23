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
 * React Native + native ChessEngines module -> OS process managed natively
 * (Android: ProcessBuilder from nativeLibraryDir; Windows: CreateProcess).
 *
 * NOTE: the Node.js child_process transport lives in ./node.ts and is used
 * DIRECTLY by tests, CI smoke runs and dev tooling — it is intentionally NOT
 * imported here so bundlers never pull `node:child_process` into an app.
 *
 * The WASM/Web Worker transport is intentionally absent until the web target
 * exists; requesting it explicitly will throw a descriptive error.
 */
export async function resolveTransportFactory(): Promise<TransportFactory> {
  const rn = tryRequireReactNative();
  if (rn && typeof rn.Platform !== 'undefined') {
    const native = tryRequireNativeModule(rn);
    if (native) {
      // Lazy require keeps the native-only module out of Node test bundles.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createNativeTransportFactory } = require('./native') as typeof import('./native');
      return createNativeTransportFactory(native);
    }
    throw new Error(
      `Native engine bridge unavailable on platform '${String(rn.Platform.OS)}'. ` +
        'Did the native ChessEngines module get linked into this build?',
    );
  }
  throw new Error(
    'No engine transport for this runtime. ' +
      'In Node contexts use createNodeTransportFactory from ./node directly.',
  );
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
