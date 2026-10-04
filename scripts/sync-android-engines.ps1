# Copies the fetched engine binary into the Android app so it gets packaged.
#
# Android 10+ (targetSdk>=29) forbids exec() from the writable app home dir
# (W^X), BUT allows exec from the app's nativeLibraryDir. The trick:
#   - name the binary lib<name>.so and place it in jniLibs/<abi>/
#   - enable legacy packaging so it is EXTRACTED to disk at install time
#   - at runtime exec <nativeLibraryDir>/lib<name>.so
#
# The NNUE does NOT ride along this way: it is a raw data blob, and Android only
# guarantees extraction of real ELF objects from lib/. It travels as a frontend
# asset instead (`apps/desktop/public/pikafish.nnue`, staged by build.js) and the
# Rust side materialises it into the app data dir as `pikafish.nnue`.
#
# NOTE: `node build.js` performs the same sync inline before building, so this
# script is the manual/standalone entry point (`pnpm sync:jniLibs`).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Engines = Join-Path $Root "third_party\engines\android-arm64"
$Jni = Join-Path $Root "apps\desktop\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"

if (-not (Test-Path $Engines)) {
    throw "run scripts/fetch-engines.ps1 first ($Engines missing)"
}
New-Item -ItemType Directory -Force -Path $Jni | Out-Null

$pf = Join-Path $Engines "libpikafish.so"

if (Test-Path $pf) { Copy-Item $pf (Join-Path $Jni "libpikafish.so") -Force; Write-Host "copied libpikafish.so" }
else { Write-Warning "missing $pf" }

# Drop a stale NNUE copy from older layouts: it costs 17 MB in every APK and the
# runtime no longer reads it.
$staleNnue = Join-Path $Jni "libpikafish_nnue.so"
if (Test-Path $staleNnue) { Remove-Item $staleNnue -Force; Write-Host "removed stale libpikafish_nnue.so" }

Write-Host ""
Write-Host "Remember: gen/android/app/build.gradle.kts needs packaging { jniLibs { useLegacyPackaging = true } }"

Write-Host ""
Write-Host "Remember: gen/android/app/build.gradle.kts needs packaging { jniLibs { useLegacyPackaging = true } }"
