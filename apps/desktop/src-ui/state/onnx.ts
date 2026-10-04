import type { OnnxOutputs, OnnxSession, TierId } from '@chessnext/engine-onnx';
import { tierModelPath } from '@chessnext/engine-onnx';

/**
 * Loads the research tier models (T1–T5) with onnxruntime-web inside the
 * WebView.
 *
 * Backend order is fixed: **webgpu first, then wasm** (the wasm runtime is
 * bundled locally so the app stays fully offline — there is no CDN fallback).
 *
 * Sessions are cached per tier: they hold ~5 MB of weights each and model load
 * is the slow part, so the same session is reused across games and both sides
 * of an engine-vs-engine match.
 */

/** Where `scripts/fetch-assets.mjs` stages the runtime. */
const ORT_WASM_PATH = '/ort/';

type OrtModule = typeof import('onnxruntime-web');

let ortPromise: Promise<OrtModule> | null = null;

async function loadOrt(): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web').then(ort => {
      // onnxruntime-web fetches its .wasm from here at first inference.
      ort.env.wasm.wasmPaths = ORT_WASM_PATH;
      return ort;
    });
  }
  return ortPromise;
}

const sessions = new Map<TierId, Promise<OnnxSession>>();

function wrapSession(
  ort: OrtModule,
  session: import('onnxruntime-web').InferenceSession,
  backend: string,
): OnnxSession {
  const inputName = session.inputNames?.[0] ?? 'planes';
  return {
    backend,
    async run(planes: Float32Array): Promise<OnnxOutputs> {
      const tensor = new ort.Tensor('float32', planes, [1, 17, 10, 9]);
      const out = await session.run({ [inputName]: tensor });
      const policy = out.policy?.data as Float32Array | undefined;
      const value = out.value?.data as Float32Array | undefined;
      if (!policy || !value) {
        throw new Error(
          `unexpected model outputs (got ${Object.keys(out).join(', ') || 'none'})`,
        );
      }
      return { policy, value };
    },
    dispose(): void {
      try {
        (session as unknown as { release?: () => void }).release?.();
      } catch {
        /* already released */
      }
    },
  };
}

async function createSession(tier: TierId): Promise<OnnxSession> {
  const ort = await loadOrt();
  const url = tierModelPath(tier);
  const order = ['webgpu', 'wasm'] as const;

  let lastError: unknown;
  for (const backend of order) {
    try {
      const session = await ort.InferenceSession.create(url, {
        executionProviders: [backend],
        graphOptimizationLevel: 'all',
      });
      return wrapSession(ort, session, backend);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `无法加载档位模型 ${url}（已尝试 webgpu → wasm）。` +
      `请先运行 \`pnpm fetch:assets\` 准备模型与 onnxruntime 运行时。` +
      `原始错误：${String(lastError)}`,
  );
}

export function getTierSession(tier: TierId): Promise<OnnxSession> {
  let p = sessions.get(tier);
  if (!p) {
    p = createSession(tier);
    sessions.set(tier, p);
  }
  return p;
}

/** Preload without awaiting (the modal shows readiness). */
export function preloadTierSession(tier: TierId): void {
  void getTierSession(tier).catch(() => undefined);
}

export async function disposeTierSessions(): Promise<void> {
  for (const p of sessions.values()) {
    try {
      (await p).dispose();
    } catch {
      /* ignore */
    }
  }
  sessions.clear();
}
