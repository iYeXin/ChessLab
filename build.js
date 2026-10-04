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
import { existsSync, mkdirSync, cpSync, readdirSync, statSync, rmSync } from 'node:fs';
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
// The engine is arm64-only, so an arm64-v8a APK is both smaller (~1/3) and the
// only one whose modes 1/2 can actually run.
const wantArm64Only = !args.includes('--no-arm64');

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

  // Ensure jniLibs (Tauri gen may be re-created on clean).
  // NOTE: only the engine *executable* goes here — Android cannot exec from the
  // writable app dir, so it must live in nativeLibraryDir. The engine is
  // arm64-only (Pikafish publishes no armv7/x86 Android builds), so those ABIs in
  // the universal APK cannot run modes 1/2.
  //
  // The NNUE is NOT shipped here: it is a raw data blob, and Android only
  // guarantees extraction of real ELF objects under lib/. It travels as a
  // frontend asset instead (staged below) and is materialised into the app data
  // dir by `android_nnue` in src-tauri/src/engines.rs.
  const jniDir = join(root, 'apps/desktop/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a');
  {
    const srcDir = join(root, 'third_party/engines/android-arm64');
    if (existsSync(join(srcDir, 'libpikafish.so'))) {
      // Always copy: a re-fetched engine (e.g. a different CPU variant) must
      // actually take effect instead of being shadowed by a stale jniLibs file.
      mkdirSync(jniDir, { recursive: true });
      cpSync(join(srcDir, 'libpikafish.so'), join(jniDir, 'libpikafish.so'));
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

  // The engine needs its NNUE as a real, readable file named `pikafish.nnue`.
  //
  // Two delivery routes, chosen per artifact:
  //   - arm64-only APK  -> embedded frontend asset (materialised into the app
  //     data dir by `android_nnue`). Robust: it does not depend on Android
  //     extracting a non-ELF blob out of lib/.
  //   - universal APK   -> `libpikafish_nnue.so` in jniLibs. A frontend asset is
  //     embedded into EVERY abi's Rust library, so the net would be duplicated
  //     4x (+52 MB); jniLibs keeps it to one copy.
  const publicNnue = join(root, 'apps/desktop/public/pikafish.nnue');
  const nnueSrc = join(root, 'third_party/engines/android-arm64/pikafish.nnue');
  const jniNnue = join(jniDir, 'libpikafish_nnue.so');

  function stageNnueAsset(on) {
    if (on) {
      if (existsSync(nnueSrc)) {
        cpSync(nnueSrc, publicNnue);
        log('Staged pikafish.nnue into public/ (embedded asset)');
      } else {
        log('WARN: third_party/engines/android-arm64/pikafish.nnue missing — engine will have no net');
      }
    } else {
      rmSync(publicNnue, { force: true });
    }
  }

  function stageNnueLib(on) {
    if (on) {
      if (existsSync(nnueSrc)) {
        cpSync(nnueSrc, jniNnue);
        log('Staged libpikafish_nnue.so into jniLibs (single copy)');
      }
    } else {
      rmSync(jniNnue, { force: true });
    }
  }

  // Gradle always writes to apk/universal/release, whatever the target set is,
  // so sign immediately after each build.
  const apkDir = join(root, 'apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release');
  const unsigned = join(apkDir, 'app-universal-release-unsigned.apk');

  function findApksigner() {
    let bt = process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'build-tools/36.1.0/apksigner.bat') : '';
    if (!existsSync(bt)) bt = join(process.env.ANDROID_HOME ?? '', 'build-tools/35.0.0/apksigner.bat');
    if (!existsSync(bt)) {
      try {
        const found = execSync('where apksigner.bat', { encoding: 'utf8' }).trim().split('\n')[0]?.trim();
        if (found) bt = found;
      } catch {}
    }
    return existsSync(bt) ? bt : null;
  }
  const apksigner = findApksigner();

  /** Build for `targets` (empty array = every ABI) and sign into dist/. */
  function buildAndroidApk(targets, suffix) {
    const targetArgs = targets.length ? ` --target ${targets.join(' ')}` : '';
    log(`Building Android APK (${targets.length ? targets.join(', ') : 'all ABIs'}) ...`);
    run(`pnpm --filter desktop tauri android build --apk${targetArgs}`, { cwd: root, env });

    const signedOut = join(distDir, `ChessNext-${version}-android-${suffix}.apk`);
    if (!existsSync(unsigned)) {
      log(`WARN: unsigned APK not found at ${unsigned}`);
      return null;
    }
    if (apksigner) {
      run(`"${apksigner}" sign --ks "${ksPath}" --ks-pass pass:${ANDROID_KEYSTORE_PASSWORD} --ks-key-alias ${ANDROID_KEY_ALIAS} --key-pass pass:${ANDROID_KEY_PASSWORD} --in "${unsigned}" --out "${signedOut}"`);
    } else {
      log('apksigner not found, copying unsigned APK');
      cpSync(unsigned, signedOut);
    }
    log(`Android APK (${suffix}) → ${signedOut} (${(statSync(signedOut).size / 1024 / 1024).toFixed(1)} MB)`);
    return signedOut;
  }

  // 1) universal: every ABI, plus the AAB for store delivery.
  //    The net rides in jniLibs here to keep it to a single copy.
  stageNnueAsset(false);
  stageNnueLib(true);
  buildAndroidApk([], 'universal');
  const aabIn = join(root, 'apps/desktop/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab');
  if (existsSync(aabIn)) {
    const aabOut = join(distDir, `ChessNext-${version}-android-universal.aab`);
    cpSync(aabIn, aabOut);
    log(`Android AAB → ${aabOut} (${(statSync(aabOut).size / 1024 / 1024).toFixed(1)} MB)`);
  }

  // 2) arm64-v8a only: the engine's only supported ABI, roughly a third the size.
  //    The net travels as an embedded asset so it cannot be lost to lib/ filtering.
  if (wantArm64Only) {
    stageNnueLib(false);
    stageNnueAsset(true);
    buildAndroidApk(['aarch64'], 'arm64');
  } else {
    log('Skipping arm64-v8a-only APK (--no-arm64)');
  }

  // Clean up whatever is left staged.
  stageNnueAsset(false);
  stageNnueLib(false);
}

log(`\nDone. Artifacts in ${distDir}:`);
for (const f of readdirSync(distDir)) {
  const p = join(distDir, f);
  try {
    const s = statSync(p);
    if (s.isFile()) console.log(`  ${f}  ${(s.size / 1024 / 1024).toFixed(1)} MB`);
  } catch {}
}
