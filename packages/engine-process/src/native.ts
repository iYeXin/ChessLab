import type { EngineTransport } from '@chesslab/engine-uci';
import type { ChessEnginesNativeModule, TransportFactory } from './index';

/**
 * Transport backed by the native ChessEngines module (Android / Windows).
 *
 * The native side spawns the engine binary as an OS process and streams its
 * stdout line-by-line over the RN bridge:
 *   - Android : ProcessBuilder on <nativeLibraryDir>/lib<name>.so (W^X-safe)
 *   - Windows : CreateProcess with pipes
 * Events are fanned out by handle so several engines can run concurrently.
 */
export function createNativeTransportFactory(native: ChessEnginesNativeModule): TransportFactory {
  const emitter = requireEventEmitter();

  return async (spec): Promise<EngineTransport> => {
    const handle = await native.startEngine({
      command: spec.command,
      args: spec.args,
      cwd: spec.cwd,
    });

    const lineHandlers = new Set<(line: string) => void>();
    const errorHandlers = new Set<(err: Error) => void>();

    let exitResolve!: (code: number | null) => void;
    const exited = new Promise<number | null>(resolve => {
      exitResolve = resolve;
    });
    exited.catch(() => undefined);

    const lineSub = emitter.addListener('chessEngineLine', (ev: { handle: number; line: string }) => {
      if (ev.handle !== handle) return;
      for (const h of lineHandlers) h(ev.line);
    });
    const exitSub = emitter.addListener('chessEngineExit', (ev: { handle: number; code: number | null }) => {
      if (ev.handle !== handle) return;
      lineSub.remove();
      exitSub.remove();
      exitResolve(ev.code ?? null);
    });

    return {
      write(line: string): void {
        // Fire-and-forget is fine; the bridge preserves ordering per handle.
        void Promise.resolve(native.writeLine(handle, line)).catch(err => {
          for (const h of errorHandlers) h(err instanceof Error ? err : new Error(String(err)));
        });
      },
      kill(): void {
        try {
          void Promise.resolve(native.stopEngine(handle)).catch(() => undefined);
        } catch {
          /* already gone */
        }
        // Safety net in case the native exit event never arrives.
        const t: any = setTimeout(() => exitResolve(null), 500);
        if (typeof t?.unref === 'function') t.unref();
      },
      exited,
      onLine(handler: (line: string) => void): void {
        lineHandlers.add(handler);
      },
      onIOError(handler: (err: Error) => void): void {
        errorHandlers.add(handler);
      },
    };
  };
}

interface EmitterLike {
  addListener(event: string, handler: (payload: any) => void): { remove(): void };
}

function requireEventEmitter(): EmitterLike {
  try {
    const rn = require('react-native');
    if (!rn.NativeModules?.ChessEngines) throw new Error('native module not linked');
    return new rn.NativeEventEmitter(rn.NativeModules.ChessEngines) as EmitterLike;
  } catch (err) {
    throw new Error(`ChessEngines event emitter unavailable: ${String(err)}`);
  }
}
