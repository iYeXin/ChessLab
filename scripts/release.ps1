#Requires -Version 5.1
param(
  [Parameter(Mandatory=$true, HelpMessage="New version, e.g. 0.3.3")]
  [string]$Version,

  [string]$Remote = "origin",
  [string]$Branch = "master",
  [switch]$SkipPush
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Version = $Version.Trim().TrimStart("v")
if ($Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$') {
  throw "Invalid semver: $Version"
}
$Tag = "v$Version"

Write-Host "`n[release] Bumping to $Version ($Tag) ..." -ForegroundColor Cyan

# 1) Bump
& node scripts/bump-version.mjs $Version
if ($LASTEXITCODE -ne 0) { throw "bump-version failed" }

# 2) Install & verify
Write-Host "`n[release] pnpm install ..." -ForegroundColor Cyan
& pnpm install --no-frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

Write-Host "`n[release] typecheck ..." -ForegroundColor Cyan
& pnpm typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }

Write-Host "`n[release] tests ..." -ForegroundColor Cyan
& pnpm test
if ($LASTEXITCODE -ne 0) { throw "tests failed" }

# 3) Update CHANGELOG placeholder if missing
$changelog = "CHANGELOG.md"
if (Test-Path $changelog) {
  $content = Get-Content $changelog -Raw
  if ($content -notmatch "\[$Version\]") {
    Write-Warning "CHANGELOG.md has no [$Version] entry — please add it before tagging."
    $answer = Read-Host "Continue without changelog entry? (y/N)"
    if ($answer -ne "y") { throw "Aborted: update CHANGELOG.md first" }
  }
}

# 4) Commit
Write-Host "`n[release] Committing ..." -ForegroundColor Cyan
& git add -A
& git status --porcelain

$commitMsg = "release($Version): bump to $Version"
& git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { throw "git commit failed (nothing to commit?)" }

# 5) Tag
Write-Host "`n[release] Tagging $Tag ..." -ForegroundColor Cyan
$existing = & git tag --list $Tag
if ($existing) { throw "Tag $Tag already exists" }
& git tag -a $Tag -m "ChessNext $Tag"

if ($SkipPush) {
  Write-Host "`n[release] --SkipPush: not pushing. Run manually:" -ForegroundColor Yellow
  Write-Host "  git push $Remote $Branch"
  Write-Host "  git push $Remote $Tag"
  Write-Host "  gh release create $Tag --generate-notes  # or wait for Actions"
  exit 0
}

# 6) Push (triggers GitHub Actions Release workflow)
Write-Host "`n[release] Pushing to $Remote ..." -ForegroundColor Cyan
& git push $Remote $Branch
if ($LASTEXITCODE -ne 0) { throw "git push branch failed" }
& git push $Remote $Tag
if ($LASTEXITCODE -ne 0) { throw "git push tag failed" }

Write-Host "`n[release] Done. GitHub Actions will build and publish Release $Tag" -ForegroundColor Green
Write-Host "  Watch: https://github.com/$(git config --get remote.origin.url | ForEach-Object { $_ -replace '.*github.com[:/](.+?)(\.git)?$','$1' })/actions" -ForegroundColor DarkGray

# 7) Optional: gh release view (if gh authenticated)
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
  Write-Host "`n[release] gh CLI detected: you can also manually create a release with:" -ForegroundColor DarkGray
  Write-Host "  gh release view $Tag --web"
}

