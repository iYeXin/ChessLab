#!/usr/bin/env node
// ChessLab unified builder — Windows (NSIS) + Android (APK/AAB)
// Usage:
//   node build.js              // build both (Windows only on Windows)
//   node build.js --windows    // only Windows
//   node build.js --android    // only Android
//   node build.js --no-android // skip Android
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const root = resolve(import.meta.dirname ?? '.');
const tauriConf = JSON.parse(readFileSync(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'));
const version = tauriConf.version ?? '0.0.0';
const productName = tauriConf.productName ?? 'ChessLab';

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

// --- frontend is built by tauri beforeBuildCommand, no need to prebuild ---

if (wantWindows) {
  if (process.platform !== 'win32') {
    log('Skipping Windows NSIS (not on Windows)');
  } else {
    log(`Building Windows NSIS ${productName} v${version} ...`);
    run('pnpm --filter desktop tauri build', { cwd: root });

    const nsisDir = join(root, 'apps/desktop/src-tauri/target/release/bundle/nsis');
    const exe = findLatest(nsisDir, /^ChessLab.*\.exe$/);
    if (!exe) throw new Error(`Windows exe not found in ${nsisDir}`);
    const outName = `ChessLab-${version}-windows-x64-setup.exe`;
    const outPath = join(distDir, outName);
    cpSync(exe.path, outPath);
    log(`Windows → ${outPath} (${(statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

if (wantAndroid) {
  log(`Building Android APK/AAB ${productName} v${version} ...`);

  // Ensure keystore exists (self-signed)
  const ksPath = join(root, 'apps/desktop/src-tauri/gen/android/chesslab.jks');
  if (!existsSync(ksPath)) {
    log('Generating self-signed keystore ...');
    mkdirSync(join(root, 'apps/desktop/src-tauri/gen/android'), { recursive: true });
    run(`keytool -genkeypair -v -keystore "${ksPath}" -storetype JKS -alias chesslab -keyalg RSA -keysize 2048 -validity 9125 -storepass chesslab123 -keypass chesslab123 -dname "CN=ChessLab,OU=Dev,O=ChessLab,L=Shenzhen,S=Guangdong,C=CN"`);
  }

  // Ensure jniLibs (Tauri gen may be re-created on clean)
  const jniDir = join(root, 'apps/desktop/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a');
  if (!existsSync(join(jniDir, 'libstockfish.so'))) {
    log('Syncing jniLibs ...');
    mkdirSync(jniDir, { recursive: true });
    const srcDir = join(root, 'third_party/engines/android-arm64');
    if (existsSync(join(srcDir, 'libstockfish.so'))) {
      cpSync(join(srcDir, 'libstockfish.so'), join(jniDir, 'libstockfish.so'));
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
    TAURI_ANDROID_KEYSTORE_PASSWORD: 'chesslab123',
    TAURI_ANDROID_KEY_ALIAS: 'chesslab',
    TAURI_ANDROID_KEY_PASSWORD: 'chesslab123',
  };

  // Use Tauri's android build (will produce unsigned, we sign afterwards)
  run('pnpm --filter desktop tauri android build', { cwd: root, env });

  const apkDir = join(root, 'apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/release');
  const unsigned = join(apkDir, 'app-universal-release-unsigned.apk');
  const signedOut = join(distDir, `ChessLab-${version}-android-universal.apk`);
  const aabIn = join(root, 'apps/desktop/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab');
  const aabOut = join(distDir, `ChessLab-${version}-android-universal.aab`);

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
      run(`"${bt}" sign --ks "${ksPath}" --ks-pass pass:chesslab123 --ks-key-alias chesslab --key-pass pass:chesslab123 --in "${unsigned}" --out "${signedOut}" --verbose`);
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
      const outAlt = join(distDir, `ChessLab-${version}-android-${alt.name}`);
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
