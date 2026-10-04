#!/usr/bin/env node
/**
 * Stage the fetched engine into `apps/desktop/engines/` so it can be bundled as
 * a Tauri resource (`tauri.conf.json > bundle > resources: ["../engines"]`).
 *
 * Why this must exist: that directory is gitignored, and Tauri's build script
 * FAILS outright when a declared resource path is missing
 * ("resource path `..\engines` doesn't exist"). So both `tauri dev` and
 * `tauri build` need it present — a fresh clone would otherwise be unable to
 * start until someone ran a full `node build.js`.
 *
 * Usage: node scripts/stage-engines.mjs
 *        (also imported by build.js so there is a single implementation)
 */
import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Copy the pinned engine (exe + NNUE) into the desktop resources directory. */
export function stageEngines(log = console.log) {
  const dstDir = join(root, 'apps/desktop/engines');
  const srcDir = join(root, 'third_party/engines/windows-x64/pikafish');
  const candidates = [
    [join(srcDir, 'pikafish-avx2.exe'), join(dstDir, 'pikafish.exe')],
    [join(srcDir, 'pikafish.nnue'), join(dstDir, 'pikafish.nnue')],
  ];

  let synced = 0;
  for (const [src, dst] of candidates) {
    if (existsSync(src)) {
      mkdirSync(dstDir, { recursive: true });
      cpSync(src, dst);
      synced += 1;
    }
  }

  // Fallback: any pikafish exe when the avx2 build is absent.
  if (!existsSync(join(dstDir, 'pikafish.exe')) && existsSync(srcDir)) {
    const alt = readdirSync(srcDir).find(f => f.toLowerCase().endsWith('.exe'));
    if (alt) {
      mkdirSync(dstDir, { recursive: true });
      cpSync(join(srcDir, alt), join(dstDir, 'pikafish.exe'));
      synced += 1;
    }
  }

  if (synced > 0) log(`[engines] staged ${synced} file(s) → ${dstDir}`);
  return synced;
}

/** True when the resources directory already holds what Tauri needs. */
export function enginesStaged() {
  const dstDir = join(root, 'apps/desktop/engines');
  return existsSync(dstDir) && statSync(dstDir).isDirectory() && readdirSync(dstDir).length > 0;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const n = stageEngines();
  if (n === 0) {
    console.log(
      '[engines] nothing to stage — run `pnpm fetch:engines` first, or create a placeholder:\n' +
        "  mkdir -p apps/desktop/engines && echo placeholder > apps/desktop/engines/.keep",
    );
  }
}
