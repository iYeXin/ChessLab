#!/usr/bin/env node
/**
 * Stages the runtime assets that mode 3 (the ONNX tier models) needs:
 *
 *   apps/desktop/public/ort/*.wasm|*.mjs   <- onnxruntime-web runtime
 *   apps/desktop/public/models/tier_T{n}/model_fp16.onnx  <- T1..T5
 *
 * Both destinations are gitignored: they are large binaries that should not
 * live in git, but they MUST be present before `vite build` / `tauri build`
 * for mode 3 to work offline (there is no CDN fallback by design).
 *
 * Usage:
 *   pnpm fetch:assets
 *   TIER_MODELS_DIR=D:/somewhere/export pnpm fetch:assets
 *
 * Model source defaults to the sibling research checkout (../ChineseChess/export).
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'apps/desktop/public');

function log(msg) {
  console.log(`[assets] ${msg}`);
}

function copyIfExists(src, dst, label) {
  if (!existsSync(src)) return false;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  log(`staged ${label} (${(statSync(dst).size / 1024 / 1024).toFixed(2)} MB)`);
  return true;
}

// ---------------------------------------------------------------------------
// 1) onnxruntime-web runtime
// ---------------------------------------------------------------------------
// The WASM binaries are fetched at runtime from `ort.env.wasm.wasmPaths`, so
// they must be served next to index.html. We ship the two variants we use:
//   - plain     : the wasm execution provider
//   - jsep      : the WebGPU execution provider
function stageOrt() {
  let dist;
  try {
    dist = join(root, 'apps/desktop/node_modules/onnxruntime-web/dist');
    if (!existsSync(dist)) throw new Error('not found');
  } catch {
    log('WARN onnxruntime-web is not installed — run `pnpm install` first');
    return 0;
  }

  const wanted = [
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm',
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
  ];
  let n = 0;
  for (const name of wanted) {
    if (copyIfExists(join(dist, name), join(publicDir, 'ort', name), `ort/${name}`)) n += 1;
  }
  const missing = wanted.filter(w => !existsSync(join(publicDir, 'ort', w)));
  if (missing.length) log(`WARN missing ORT runtime files: ${missing.join(', ')}`);
  return n;
}

// ---------------------------------------------------------------------------
// 2) T1..T5 tier models
// ---------------------------------------------------------------------------
function stageModels() {
  const src = resolve(
    process.env.TIER_MODELS_DIR ?? join(root, '..', 'ChineseChess', 'export'),
  );
  if (!existsSync(src)) {
    log(`WARN tier model source not found: ${src}`);
    log('     set TIER_MODELS_DIR to the research `export/` directory');
    return 0;
  }

  let n = 0;
  for (const tier of [1, 2, 3, 4, 5]) {
    const from = join(src, `tier_T${tier}`, 'model_fp16.onnx');
    const to = join(publicDir, 'models', `tier_T${tier}`, 'model_fp16.onnx');
    if (copyIfExists(from, to, `models/tier_T${tier}/model_fp16.onnx`)) n += 1;
    else log(`WARN missing ${from}`);
  }

  // tiers.json documents the ladder; ship it for provenance if present.
  copyIfExists(join(src, 'tiers.json'), join(publicDir, 'models', 'tiers.json'), 'models/tiers.json');
  return n;
}

const ort = stageOrt();
const models = stageModels();
log(`done: ${ort} ORT file(s), ${models}/5 tier model(s)`);
if (models < 5) {
  log('mode 3 will report a load error until all five tiers are staged');
}
