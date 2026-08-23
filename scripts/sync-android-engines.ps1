# Copies fetched engine binaries into the Android app so they get packaged.
#
# Android 10+ (targetSdk>=29) forbids exec() from the writable app home dir
# (W^X), BUT allows exec from the app's nativeLibraryDir. The trick:
#   - name each binary lib<name>.so and place it in jniLibs/<abi>/
#   - enable legacy packaging so it is EXTRACTED to disk at install time
#   - at runtime exec <nativeLibraryDir>/lib<name>.so
#
# Pikafish's NNUE file rides along the same way (as libpikafish_nnue.so):
# nativeLibraryDir is a readable directory, so EvalFile can point there.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Engines = Join-Path $Root "third_party\engines\android-arm64"
$App = Join-Path $Root "apps\chessapp\android\app\src\main"
$Jni = Join-Path $App "jniLibs\arm64-v8a"

if (-not (Test-Path $Engines)) {
    throw "run scripts/fetch-engines.ps1 first ($Engines missing)"
}
New-Item -ItemType Directory -Force -Path $Jni | Out-Null

$sf = Join-Path $Engines "libstockfish.so"
$pf = Join-Path $Engines "libpikafish.so"
$nnue = Join-Path $Engines "pikafish.nnue"

if (Test-Path $sf) { Copy-Item $sf (Join-Path $Jni "libstockfish.so") -Force; Write-Host "copied libstockfish.so" }
else { Write-Warning "missing $sf" }

if (Test-Path $pf) { Copy-Item $pf (Join-Path $Jni "libpikafish.so") -Force; Write-Host "copied libpikafish.so" }
else { Write-Warning "missing $pf" }

if (Test-Path $nnue) { Copy-Item $nnue (Join-Path $Jni "libpikafish_nnue.so") -Force; Write-Host "copied libpikafish_nnue.so" }
else { Write-Warning "missing $nnue (Pikafish will need EvalFile set another way)" }

Write-Host ""
Write-Host "Remember: android/app/build.gradle.kts needs packaging { jniLibs { useLegacyPackaging = true } }"
