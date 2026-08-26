#!/usr/bin/env node
/**
 * bump-version.mjs — 统一 bump 全仓版本
 * 用法:
 *   node scripts/bump-version.mjs 0.3.3
 *   node scripts/bump-version.mjs --check   # 校验各处版本是否一致
 *
 * 覆盖文件（共 12 处）:
 *   - package.json (root)
 *   - apps/desktop/package.json
 *   - apps/desktop/src-tauri/tauri.conf.json
 *   - apps/desktop/src-tauri/Cargo.toml
 *   - packages/{engine-process,engine-uci,game-session,persistence,puzzles,rules-chess,rules-core,rules-xiangqi}/package.json
 *
 * 约定:
 *   - 版本格式 semver: x.y.z
 *   - Cargo.toml 仅改 [package] version
 *   - tauri.conf.json 仅改 version 字段
 *   - 执行后需 pnpm install 更新锁文件（可选 --no-frozen-lockfile）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('.', import.meta.url).pathname, '..', '..');
if (process.platform === 'win32' && root.startsWith('/')) {
  // file URL on Windows yields /E:/... -> strip leading slash
}

function actualRoot() {
  // robust root resolution for Windows: scripts/bump-version.mjs -> ../../
  return resolve(join(import.meta.dirname ?? '.', '..'));
}

const ROOT = actualRoot();

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const files = [
  'package.json',
  'apps/desktop/package.json',
  'apps/desktop/src-tauri/tauri.conf.json',
  'apps/desktop/src-tauri/Cargo.toml',
  'packages/engine-process/package.json',
  'packages/engine-uci/package.json',
  'packages/game-session/package.json',
  'packages/persistence/package.json',
  'packages/puzzles/package.json',
  'packages/rules-chess/package.json',
  'packages/rules-core/package.json',
  'packages/rules-xiangqi/package.json',
];

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}
function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function bumpCargoToml(p, version) {
  let s = readFileSync(p, 'utf8');
  // Only replace [package] version = "..."
  // Cargo.toml may have multiple version fields (dependencies), so scope to [package] block
  const before = s;
  s = s.replace(
    /(\[package\][^\[]*?version\s*=\s*")[^"]+(")/s,
    `$1${version}$2`
  );
  if (s === before) throw new Error(`Cargo.toml version not found in ${p}`);
  writeFileSync(p, s, 'utf8');
}

function getVersions() {
  const map = new Map();
  for (const rel of files) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) continue;
    let v;
    if (rel.endsWith('Cargo.toml')) {
      const s = readFileSync(abs, 'utf8');
      const m = s.match(/\[package\][^\[]*?version\s*=\s*"([^"]+)"/s);
      v = m?.[1] ?? null;
    } else {
      const j = readJson(abs);
      v = j.version ?? null;
    }
    map.set(rel, v);
  }
  return map;
}

function check() {
  const m = getVersions();
  const uniq = new Set(m.values());
  console.log('Versions:');
  for (const [f, v] of m) console.log(`  ${v ?? '∅'}\t${f}`);
  if (uniq.size === 1) {
    console.log(`\n✓ All ${m.size} files consistent at ${[...uniq][0]}`);
    process.exit(0);
  } else {
    console.error(`\n✗ Inconsistent versions: ${[...uniq].join(', ')}`);
    process.exit(1);
  }
}

function bump(version) {
  if (!VERSION_RE.test(version)) {
    console.error(`Invalid semver: ${version}`);
    process.exit(1);
  }
  console.log(`Bumping to ${version} ...`);
  for (const rel of files) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      console.warn(`skip missing ${rel}`);
      continue;
    }
    if (rel.endsWith('Cargo.toml')) {
      bumpCargoToml(abs, version);
      console.log(`  Cargo.toml  ${rel}`);
    } else if (rel.endsWith('tauri.conf.json')) {
      const j = readJson(abs);
      j.version = version;
      writeJson(abs, j);
      console.log(`  tauri.conf  ${rel}`);
    } else {
      const j = readJson(abs);
      j.version = version;
      writeJson(abs, j);
      console.log(`  package.json ${rel}`);
    }
  }
  console.log(`\n✓ Bumped ${files.length} files to ${version}`);
  console.log(`Next: pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm test`);
}

const arg = process.argv[2];
if (!arg || arg === '--help' || arg === '-h') {
  console.log('Usage: node scripts/bump-version.mjs <x.y.z> | --check');
  process.exit(0);
}
if (arg === '--check') check();
else bump(arg);
