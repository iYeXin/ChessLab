# Fetches the pinned engine binary for development/testing:
#   - Pikafish 2023-03-05 (.zip, all platforms in one archive)
#
# Why this version: it is the last Pikafish release that still exposes the
# `Skill Level` spin option (0..20), which the "engine options" difficulty mode
# drives directly. Later releases dropped it. Its NNUE is also small (~18 MB).
#
# Layout produced (never committed):
#   third_party/engines/
#     windows-x64/pikafish/pikafish-avx2.exe (+ pikafish.nnue)
#     android-arm64/libpikafish.so (+ pikafish.nnue)
#     .engines.json            <- manifest consumed by scripts/smoke-engines.ts
#
# GPL note: this is an unmodified upstream binary. The exact version is
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

# ---------------- Pikafish ----------------
$pfVersion = "2023-03-05"
$pfZip = Join-Path $TempDir "Pikafish.$pfVersion.zip"
Get-Asset "https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-$pfVersion/Pikafish.$pfVersion.zip" $pfZip

# Extract to a staging dir: the archive holds AUTHORS / Android / Linux / MacOS /
# Windows / pikafish.nnue at its root.
$stage = Join-Path $TempDir "pikafish-$pfVersion"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$extracted = $false
try {
  Expand-Archive -Force -Path $pfZip -DestinationPath $stage
  $extracted = $true
} catch {
  Write-Warning "Expand-Archive failed ($($_.Exception.Message)); trying unzip/tar"
}
if (-not $extracted) {
  $unzip = Get-Command unzip -ErrorAction SilentlyContinue
  if ($unzip) {
    try { & unzip -oq $pfZip -d $stage; if ($LASTEXITCODE -eq 0) { $extracted = $true } } catch {}
  }
}
if (-not $extracted) {
  try { tar -xf $pfZip -C $stage; if ($LASTEXITCODE -eq 0) { $extracted = $true } } catch {}
}
if (-not $extracted) { throw "failed to extract $pfZip (need Expand-Archive, unzip or tar)" }

$allExtracted = Get-ChildItem $stage -Recurse

# ---- Windows x64 ----
$pfWinDir = Join-Path $Dest "windows-x64/pikafish"
New-Item -ItemType Directory -Force -Path $pfWinDir | Out-Null

$pfWin = $allExtracted | Where-Object { $_.FullName -match "[/\\]Windows[/\\]pikafish-avx2\.exe$" } | Select-Object -First 1
if (-not $pfWin) {
  $pfWin = $allExtracted | Where-Object { $_.FullName -match "[/\\]Windows[/\\]pikafish\.exe$" } | Select-Object -First 1
}
if (-not $pfWin) {
  $pfWin = $allExtracted | Where-Object { $_.Name -like "pikafish*.exe" } | Select-Object -First 1
}
if (-not $pfWin) { throw "no pikafish windows exe found in archive" }
$pfWinDest = Join-Path $pfWinDir "pikafish-avx2.exe"
Copy-Item $pfWin.FullName $pfWinDest -Force
# Unblock-File is Windows-only; guard by OS check to avoid "does not support Linux" on Ubuntu runners
$onWindows = $IsWindows
if ($null -eq $onWindows) { $onWindows = $env:OS -eq 'Windows_NT' }
if ($onWindows) {
  try { Unblock-File $pfWinDest -ErrorAction SilentlyContinue } catch {}
}

$pfNnue = $allExtracted | Where-Object { $_.Extension -eq ".nnue" } | Select-Object -First 1
if (-not $pfNnue) { throw "no pikafish.nnue found in archive" }
Copy-Item $pfNnue.FullName (Join-Path $pfWinDir "pikafish.nnue") -Force

# ---- Android arm64 ----
# Android 10+ forbids exec() from the writable app dir; the .so naming +
# nativeLibraryDir trick is handled by build.js / sync-android-engines.ps1.
#
# Use the PLAIN armv8 build, not `pikafish-armv8-dotprod`: the dotprod variant is
# compiled with ARMv8.2-A FEAT_DotProd, and on a CPU without it the engine dies
# with SIGILL right after spawn (which the UI reports as「引擎进程异常退出」).
# The plain build runs on every arm64 device; the speed difference is irrelevant
# for a difficulty-limited opponent.
$pfAndroidDir = Join-Path $Dest "android-arm64"
New-Item -ItemType Directory -Force -Path $pfAndroidDir | Out-Null

$pfAnd = $allExtracted |
    Where-Object { -not $_.PSIsContainer -and $_.FullName -match "[/\\]Android[/\\]pikafish-armv8$" } |
    Select-Object -First 1
if (-not $pfAnd) {
  # Some archives only carry the dotprod build; take it rather than nothing.
  Write-Warning "plain android pikafish-armv8 not found; falling back to dotprod (needs ARMv8.2)"
  $pfAnd = $allExtracted |
      Where-Object { -not $_.PSIsContainer -and $_.FullName -match "[/\\]Android[/\\]pikafish-armv8-dotprod$" } |
      Select-Object -First 1
}
if ($pfAnd) {
  Copy-Item $pfAnd.FullName (Join-Path $pfAndroidDir "libpikafish.so") -Force
} else {
  Write-Warning "android arm64 pikafish binary not found inside archive"
}
Copy-Item $pfNnue.FullName (Join-Path $pfAndroidDir "pikafish.nnue") -Force

# ---------------- Manifest ----------------
$manifest = [ordered]@{
    version          = $pfVersion
    pikafishPath     = (Join-Path $pfWinDir "pikafish-avx2.exe")
    pikafishNnuePath = (Join-Path $pfWinDir "pikafish.nnue")
}
$manifest | ConvertTo-Json | Set-Content (Join-Path $Dest ".engines.json")

Write-Host ""
Write-Host "Done. Pikafish $pfVersion under $Dest"
Write-Host ($manifest | ConvertTo-Json)
