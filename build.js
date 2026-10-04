#!/usr/bin/env node
// ChessNext unified builder — Windows (NSIS) + Android (APK/AAB)
// Usage:
//   node build.js              // build both (Windows only on Windows)
//   node build.js --windows    // only Windows
//   node build.js --android    // only Android
//   node build.js --no-android // skip Android
//
// The Android signing key is a throwaway self-signed cert, generated on first
// build and gitignored. Override the credentials via env for a real release.
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { stageEngines, enginesStaged } from './scripts/stage-engines.mjs';

const root = resolve(import.meta.dirname ?? '.');
const tauriConf = JSON.parse(readFileSync(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'));
const version = tauriConf.version ?? '0.0.0';
const productName = tauriConf.productName ?? 'ChessNext';

const ANDROID_KEY_ALIAS = process.env.ANDROID_KEY_ALIAS ?? 'chessnext';
const ANDROID_KEY_PASSWORD = process.env.ANDROID_KEY_PASSWORD ?? 'chessnext-dev';
const ANDROID_KEYSTORE_PASSWORD = process.env.ANDROID_KEYSTORE_PASSWORD ?? ANDROID_KEY_PASSWORD;

const args = process.argv.slice(2);
const wantWindows = !args.includes('--android') && !args.includes('--no-windows');
const wantAndroid = !args.includes('--windows') && !args.includes('--no-android');

const distDir = join(root, 'dist');
mkdirSync(distDir, { recursive: true });

function log(msg) { console.log(`\n\x1b[36m[build]\x1b[0m ${msg}`); }
function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`Command failed: ${cmd} (exit ${r.status})`);
}

function findLatest(dir, pattern) {
  if (!existsSync(dir)) return null;
  const rx = new RegExp(pattern);
  let best = null;
  for (const name of readdirSync(dir)) {
    if (!rx.test(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (!best || st.mtimeMs > best.mtimeMs) best = { path: p, name, mtimeMs: st.mtimeMs };
  }
  return best;
}

// --- ensure the desktop engine is staged for Tauri resources (../engines) ---
// Shared with `pnpm dev` / `pnpm stage:engines`: Tauri's build script fails
// outright when a declared resource path is missing, so this must run before
// any tauri dev/build invocation.
const staged = stageEngines(msg => log(msg));
if (staged === 0 && wantWindows && process.platform === 'win32' && !enginesStaged()) {
  log('WARN: desktop engine missing at apps/desktop/engines — run pnpm fetch:engines first');
}

// --- frontend is built by tauri beforeBuildCommand, no need to prebuild ---

if (wantWindows) {
  if (process.platform !== 'win32') {
    log('Skipping Windows NSIS (not on Windows)');
  } else {
    log(`Building Windows NSIS ${productName} v${version} ...`);
    run('pnpm --filter desktop tauri build', { cwd: root });

    const nsisDir = join(root, 'apps/desktop/src-tauri/target/release/bundle/nsis');
    const exe = findLatest(nsisDir, /^ChessNext.*\.exe$/);
    if (!exe) throw new Error(`Windows exe not found in ${nsisDir}`);
    const outName = `ChessNext-${version}-windows-x64-setup.exe`;
    const outPath = join(distDir, outName);
    cpSync(exe.path, outPath);
    log(`Windows → ${outPath} (${(statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);

    // Portable (single exe + engines, no installer) — directly runnable
    const portableSrc = join(root, 'apps/desktop/src-tauri/target/release/chessnext.exe');
    const enginesSrc = join(root, 'apps/desktop/engines');
    if (existsSync(portableSrc) && existsSync(enginesSrc)) {
      const portableDir = join(distDir, `ChessNext-${version}-windows-x64-portable`);
      mkdirSync(portableDir, { recursive: true });
      const portableExe = join(portableDir, 'ChessNext.exe');
      cpSync(portableSrc, portableExe);
      const portableEngines = join(portableDir, 'engines');
      mkdirSync(portableEngines, { recursive: true });
      for (const f of readdirSync(enginesSrc)) {
        cpSync(join(enginesSrc, f), join(portableEngines, f));
      }
      log(`Portable folder → ${portableDir}`);

      // Zip it for single-file distribution
      try {
        const zipPath = join(distDir, `ChessNext-${version}-windows-x64-portable.zip`);
        // Use PowerShell Compress-Archive (available on Windows)
        execSync(`powershell -Command "Compress-Archive -Path '${portableDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`, { stdio: 'inherit' });
        log(`Portable ZIP → ${zipPath} (${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);
      } catch (e) {
        log(`WARN: zip failed: ${e.message}`);
      }

      // Also copy single exe to dist for users who just want the exe (needs engines folder next to it)
      const singleOut = join(distDir, `ChessNext-${version}-windows-x64-portable.exe`);
      cpSync(portableSrc, singleOut);
      log(`Portable EXE (needs engines/ next to it) → ${singleOut}`);
    } else {
      log(`WARN: portable not created — missing ${portableSrc} or ${enginesSrc}`);
    }
  }
}

if (wantAndroid) {
  log(`Building Android APK/AAB ${productName} v${version} ...`);

  // Ensure keystore exists (self-signed, generated locally and never committed)
  const ksPath = join(root, `apps/desktop/src-tauri/gen/android/${ANDROID_KEY_ALIAS}.jks`);
  if (!existsSync(ksPath)) {
    log('Generating self-signed keystore ...');
    mkdirSync(join(root, 'apps/desktop/src-tauri/gen/android'), { recursive: true });
    run(`keytool -genkeypair -v -keystore "${ksPath}" -storetype JKS -alias ${ANDROID_KEY_ALIAS} -keyalg RSA -keysize 2048 -validity 9125 -storepass ${ANDROID_KEYSTORE_PASSWORD} -keypass ${ANDROID_KEY_PASSWORD} -dname "CN=${productName},OU=Dev,O=${productName},C=CN"`);
  }

  // Ensure jniLibs (Tauri gen may be re-created on clean)
  const jniDir = join(root, 'apps/desktop/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a');
  if (!existsSync(join(jniDir, 'libpikafish.so'))) {
    log('Syncing jniLibs ...');
    mkdirSync(jniDir, { recursive: true });
    const srcDir = join(root, 'third_party/engines/android-arm64');
    if (existsSync(join(srcDir, 'libpikafish.so'))) {
      cpSync(join(srcDir, 'libpikafish.so'), join(jniDir, 'libpikafish.so'));
      // nnue as lib for nativeLibraryDir
      cpSync(join(srcDir, 'pikafish.nnue'), join(jniDir, 'libpikafish_nnue.so'));
      log('jniLibs synced');
    } else {
      log('WARN: third_party/engines/android-arm64 not found — run pnpm fetch:engines first');
    }
  }

  const env = {
    ...process.env,
    TAURI_ANDROID_KEYSTORE_PATH: ksPath,
    TAURI_ANDROID_KEYSTORE_PASSWORD: ANDROID_KEY_PASSWORD,
    TAURI_ANDROID_KEY_ALIAS: ANDROID_KEY_ALIAS,
    TAURI_ANDROID_KEY_PASSWORD: ANDROID_KEY_PASSWORD,
  };

  // Use Tauri's android build (will produce unsigned, we sign afterwards)
  run('pnpm --filter desktop tauri android build', { cwd: root, env });

  const apkDir = join(root, 'apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release');
  const unsigned = join(apkDir, 'app-universal-release-unsigned.apk');
  const signedOut = join(distDir, `ChessNext-${version}-android-universal.apk`);
  const aabIn = join(root, 'apps/desktop/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab');
  const aabOut = join(distDir, `ChessNext-${version}-android-universal.aab`);

  if (existsSync(unsigned)) {
    // Sign with apksigner (use 35 if 36 not found)
    let bt = process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'build-tools/36.1.0/apksigner.bat') : '';
    if (!existsSync(bt)) bt = join(process.env.ANDROID_HOME ?? '', 'build-tools/35.0.0/apksigner.bat');
    if (!existsSync(bt)) {
      // fallback: find any apksigner
      try {
        const found = execSync('where apksigner.bat', { encoding: 'utf8' }).trim().split('\n')[0]?.trim();
        if (found) bt = found;
      } catch {}
    }
    if (bt && existsSync(bt)) {
      log(`Signing APK → ${signedOut}`);
      run(`"${bt}" sign --ks "${ksPath}" --ks-pass pass:${ANDROID_KEYSTORE_PASSWORD} --ks-key-alias ${ANDROID_KEY_ALIAS} --key-pass pass:${ANDROID_KEY_PASSWORD} --in "${unsigned}" --out "${signedOut}" --verbose`);
      // verify
      try { execSync(`"${bt}" verify --verbose "${signedOut}"`, { stdio: 'inherit' }); } catch {}
      log(`Android APK → ${signedOut} (${(statSync(signedOut).size / 1024 / 1024).toFixed(1)} MB)`);
    } else {
      log(`apksigner not found, copying unsigned as ${signedOut}`);
      cpSync(unsigned, signedOut);
    }
  } else {
    log(`WARN: unsigned APK not found at ${unsigned} — maybe build produced a different flavor`);
    const alt = findLatest(apkDir, /\.apk$/);
    if (alt) {
      const outAlt = join(distDir, `ChessNext-${version}-android-${alt.name}`);
      cpSync(alt.path, outAlt);
      log(`Found alternative APK → ${outAlt}`);
    }
  }

  if (existsSync(aabIn)) {
    cpSync(aabIn, aabOut);
    log(`Android AAB → ${aabOut} (${(statSync(aabOut).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

log(`\nDone. Artifacts in ${distDir}:`);
for (const f of readdirSync(distDir)) {
  const p = join(distDir, f);
  try {
    const s = statSync(p);
    if (s.isFile()) console.log(`  ${f}  ${(s.size / 1024 / 1024).toFixed(1)} MB`);
  } catch {}
}
