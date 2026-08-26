# Fetches pinned engine binaries for development/testing:
#   - Stockfish 18  (official GitHub release assets)
#   - Pikafish 2026-01-02 (single .7z with all platforms; extracted via bsdtar)
#
# Layout produced (never committed):
#   third_party/engines/
#     windows-x64/stockfish/stockfish.exe
#     windows-x64/pikafish/pikafish-avx2.exe (+ pikafish.nnue)
#     android-arm64/libstockfish.so
#     android-arm64/libpikafish.so (+ pikafish.nnue)
#     .engines.json            <- manifest consumed by smoke-engines.ts
#
# GPL note: these are unmodified upstream binaries. The exact versions are
# recorded here; ship COPYING text + source links with any distribution.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Root "third_party/engines"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
# Cross-platform temp dir (Windows: $env:TEMP, Linux/macOS: $env:TMPDIR or /tmp)
$TempDir = $env:TEMP
if (-not $TempDir) { $TempDir = $env:TMP }
if (-not $TempDir) { $TempDir = $env:TMPDIR }
if (-not $TempDir) { $TempDir = [System.IO.Path]::GetTempPath() }
$TempDir = $TempDir.TrimEnd('/\')

function Get-Asset([string]$Url, [string]$OutFile) {
    Write-Host "-> $Url"
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -MaximumRedirection 10
    if (-not (Test-Path $OutFile)) { throw "download failed: $Url" }
}

# ---------------- Stockfish ----------------
$sfDir = Join-Path $Dest "windows-x64/stockfish"
New-Item -ItemType Directory -Force -Path $sfDir | Out-Null
$sfZip = Join-Path $TempDir "stockfish-sf_18.zip"

try {
    # Preferred build: AVX2. Fallbacks below keep older CPUs working.
    Get-Asset "https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-windows-x86-64-avx2.zip" $sfZip
} catch {
    Write-Warning "avx2 asset missing, trying plain x86-64"
    Get-Asset "https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-windows-x86-64.zip" $sfZip
}
Expand-Archive -Force -Path $sfZip -DestinationPath $sfDir
# The zip contains a `stockfish/` folder with sources; flatten the exe out.
$sfExe = Get-ChildItem $sfDir -Recurse -Filter "stockfish*.exe" | Select-Object -First 1
if (-not $sfExe) { throw "no stockfish exe inside downloaded zip" }
Copy-Item $sfExe.FullName (Join-Path $sfDir "stockfish.exe") -Force
if (Get-Command Unblock-File -ErrorAction SilentlyContinue) {
  Unblock-File (Join-Path $sfDir "stockfish.exe") -ErrorAction SilentlyContinue
}

# Android arm64 build (for jniLibs sync); prefer the faster dotprod variant.
$sfAndroidTar = Join-Path $TempDir "stockfish-android-armv8-dotprod.tar"
try {
    Get-Asset "https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-android-armv8-dotprod.tar" $sfAndroidTar
} catch {
    Write-Warning "dotprod asset missing, falling back to plain armv8"
    Get-Asset "https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-android-armv8.tar" $sfAndroidTar
}
$sfAndroidDir = Join-Path $Dest "android-arm64"
New-Item -ItemType Directory -Force -Path $sfAndroidDir | Out-Null
tar -xf $sfAndroidTar -C $sfAndroidDir
# The tarball nests everything under stockfish/<binary> plus sources; pick the
# executable FILE (not a directory!) matching the binary name.
$sfSoSrc = Get-ChildItem $sfAndroidDir -Recurse -File |
    Where-Object { $_.Name -match "^stockfish-android-armv8" } |
    Select-Object -First 1
if ($sfSoSrc) {
    Copy-Item $sfSoSrc.FullName (Join-Path $sfAndroidDir "libstockfish.so") -Force
    Write-Host "android arm64 engine: $(Join-Path $sfAndroidDir 'libstockfish.so') ($([math]::Round($sfSoSrc.Length/1MB)) MB)"
} else {
    Write-Warning "android stockfish binary not found inside tarball"
}

# ---------------- Pikafish ----------------
$pfVersion = "2026-01-02"
$pf7z = Join-Path $TempDir "Pikafish.$pfVersion.7z"
Get-Asset "https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-$pfVersion/Pikafish.$pfVersion.7z" $pf7z

$pfBase = Join-Path $Dest "windows-x64\pikafish"
$pfAndroidDir = Join-Path $Dest "android-arm64"
New-Item -ItemType Directory -Force -Path $pfBase, $pfAndroidDir | Out-Null

# bsdtar reads .7z fine on Windows 10+.
tar -xf $pf7z -C $pfBase
$allExtracted = Get-ChildItem $pfBase -Recurse

$pfNnue = $allExtracted | Where-Object { $_.Extension -eq ".nnue" } | Select-Object -First 1
# Archive layout: Windows\pikafish-avx2.exe, Android\pikafish-armv8[-dotprod], pikafish.nnue
$pfWin = $allExtracted |
    Where-Object { $_.FullName -match "\\Windows\\pikafish-avx2\.exe$" } |
    Select-Object -First 1
if (-not $pfWin) {
    $pfWin = $allExtracted | Where-Object { $_.Name -like "pikafish*.exe" } | Select-Object -First 1
}
if (-not $pfWin) { throw "no pikafish windows exe found in archive" }
$pfWinDest = Join-Path $pfBase "pikafish-avx2.exe"
if ($pfWin.FullName -ne $pfWinDest) { Copy-Item $pfWin.FullName $pfWinDest -Force }

if ($pfNnue) {
  $pfNnueDestWin = Join-Path $pfBase "pikafish.nnue"
  if ($pfNnue.FullName -ne $pfNnueDestWin) { Copy-Item $pfNnue.FullName $pfNnueDestWin -Force }
}

# Android binaries live in the same archive; prefer dotprod when present.
$pfAnd = $allExtracted |
    Where-Object { -not $_.PSIsContainer -and $_.FullName -match "\\Android\\pikafish-armv8-dotprod$" } | Select-Object -First 1
if (-not $pfAnd) {
    $pfAnd = $allExtracted |
        Where-Object { -not $_.PSIsContainer -and $_.FullName -match "\\Android\\pikafish-armv8$" } | Select-Object -First 1
}
if ($pfAnd) {
  $pfAndDest = Join-Path $pfAndroidDir "libpikafish.so"
  if ($pfAnd.FullName -ne $pfAndDest) { Copy-Item $pfAnd.FullName $pfAndDest -Force }
}
if ($pfNnue) {
  $pfNnueDestAnd = Join-Path $pfAndroidDir "pikafish.nnue"
  if ($pfNnue.FullName -ne $pfNnueDestAnd) { Copy-Item $pfNnue.FullName $pfNnueDestAnd -Force }
}

# ---------------- Manifest ----------------
$manifest = [ordered]@{
    stockfishPath   = if ($sfExe) { $sfExe.FullName } else { $null }
    pikafishPath    = (Join-Path $pfBase "pikafish-avx2.exe")
    pikafishNnuePath = if ($pfNnue) { (Join-Path $pfBase "pikafish.nnue") } else { $null }
}
$manifest | ConvertTo-Json | Set-Content (Join-Path $Dest ".engines.json")

Write-Host ""
Write-Host "Done. Engines under $Dest"
Write-Host ($manifest | ConvertTo-Json)
