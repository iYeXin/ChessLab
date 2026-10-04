import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { EngineTransport } from '@chessnext/engine-uci';

/**
 * Tauri transport for UCI engines (Phase W2).
 *
 * Each engine is a separate OS process managed by `src-tauri/src/engines.rs`.
 * Lines are streamed via `engine://line/<id>` events, exit via `engine://exit/<id>`.
 */
export async function createTauriTransport(profile: string): Promise<EngineTransport> {
  const id = await invoke<number>('spawn_engine', { profile });

  let lineHandler: ((line: string) => void) | null = null;
  let errorHandler: ((err: Error) => void) | null = null;
  let exitResolve: ((code: number | null) => void) | null = null;

  const lineEvent = `engine://line/${id}`;
  const exitEvent = `engine://exit/${id}`;

  const unlistenLine: UnlistenFn = await listen<{ line: string }>(lineEvent, event => {
    lineHandler?.(event.payload.line);
  });

  const unlistenExit: UnlistenFn = await listen<{ code: number | null }>(exitEvent, event => {
    exitResolve?.(event.payload.code);
    try {
      unlistenLine();
    } catch {}
    try {
      unlistenExit();
    } catch {}
  });

  const exited = new Promise<number | null>(resolve => {
    exitResolve = resolve;
  });

  return {
    write(line: string) {
      void invoke('engine_write', { id, line }).catch(err => {
        errorHandler?.(new Error(String(err)));
      });
    },
    kill() {
      void invoke('engine_stop', { id }).catch(() => undefined);
      try {
        unlistenLine();
      } catch {}
      try {
        unlistenExit();
      } catch {}
      exitResolve?.(null);
    },
    get exited() {
      return exited;
    },
    onLine(handler: (line: string) => void) {
      lineHandler = handler;
    },
    onIOError(handler: (err: Error) => void) {
      errorHandler = handler;
    },
  };
}
