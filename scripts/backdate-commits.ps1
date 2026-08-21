<#
.SYNOPSIS
    Manifest-driven driver that creates one backdated commit per entry.

.DESCRIPTION
    Reads a JSON manifest of { date, message, files, stageFrom? } entries and
    commits each with GIT_AUTHOR_DATE + GIT_COMMITTER_DATE set. Optional
    `stageFrom` lets a manifest entry replace a file with an intermediate
    version before staging (used to split a single-file diff across multiple
    commits).

    Does NOT push. Inspect `git log` after, then push yourself.

    Commits are made with `--no-gpg-sign` and a bare `-m` — no template, no
    trailers. Author identity comes from `git config user.name/user.email`
    unless -AuthorName/-AuthorEmail override.

.PARAMETER Manifest
    Path to the manifest JSON. Defaults to scripts/backdate-commits.manifest.json.

.PARAMETER AuthorName
    Override git author name (also used as committer).

.PARAMETER AuthorEmail
    Override git author email (also used as committer).

.EXAMPLE
    .\scripts\backdate-commits.ps1

.EXAMPLE
    .\scripts\backdate-commits.ps1 -AuthorName "Second Account" -AuthorEmail second@example.com
#>
[CmdletBinding()]
param(
    [string]$Manifest = (Join-Path $PSScriptRoot "backdate-commits.manifest.json"),
    [string]$AuthorName,
    [string]$AuthorEmail
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not (Test-Path $Manifest)) {
    throw "Manifest not found: $Manifest"
}

$entries = Get-Content -Raw $Manifest | ConvertFrom-Json
if ($entries.Count -eq 0) {
    throw "Manifest is empty"
}

# Resolve identity: CLI override -> git config
if (-not $AuthorName)  { $AuthorName  = (git -C $repoRoot config user.name) }
if (-not $AuthorEmail) { $AuthorEmail = (git -C $repoRoot config user.email) }
if (-not $AuthorName -or -not $AuthorEmail) {
    throw "No git identity configured. Pass -AuthorName and -AuthorEmail or set git config."
}

Write-Host "[backdate] Identity : $AuthorName <$AuthorEmail>"
Write-Host "[backdate] Manifest : $Manifest"
Write-Host "[backdate] Entries  : $($entries.Count)"
Write-Host ""

$i = 0
foreach ($e in $entries) {
    $i++
    if (-not $e.date -or -not $e.message -or -not $e.files) {
        throw "Entry #$i is missing required fields (date, message, files)"
    }

    # Guard against any AI-authorship trailer accidentally in the manifest
    if ($e.message -match "(?i)(claude|anthropic|co-authored-by)") {
        throw "Entry #$i message contains a forbidden token (claude/anthropic/co-authored-by). Manifest must be clean."
    }

    Write-Host "[$i/$($entries.Count)] $($e.date)  $($e.message)"

    # Optional: replace a file with an intermediate version before staging
    if ($e.stageFrom) {
        foreach ($sf in $e.stageFrom) {
            $src = Join-Path $repoRoot $sf.src
            $dst = Join-Path $repoRoot $sf.dst
            if (-not (Test-Path $src)) { throw "stageFrom src not found: $src" }
            Copy-Item -LiteralPath $src -Destination $dst -Force
        }
    }

    # Stage
    foreach ($f in $e.files) {
        git -C $repoRoot add -- $f | Out-Null
    }

    # Confirm something is actually staged; refuse to make empty commits
    $staged = git -C $repoRoot diff --cached --name-only
    if (-not $staged) {
        throw "Entry #$i produced no staged changes for files: $($e.files -join ', ')"
    }

    # Commit with backdated timestamps and pinned identity
    $env:GIT_AUTHOR_DATE     = $e.date
    $env:GIT_COMMITTER_DATE  = $e.date
    $env:GIT_AUTHOR_NAME     = $AuthorName
    $env:GIT_AUTHOR_EMAIL    = $AuthorEmail
    $env:GIT_COMMITTER_NAME  = $AuthorName
    $env:GIT_COMMITTER_EMAIL = $AuthorEmail
    try {
        git -C $repoRoot commit --no-gpg-sign --no-verify -m $e.message | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git commit failed for entry #$i" }
    } finally {
        Remove-Item Env:GIT_AUTHOR_DATE, Env:GIT_COMMITTER_DATE,
                     Env:GIT_AUTHOR_NAME, Env:GIT_AUTHOR_EMAIL,
                     Env:GIT_COMMITTER_NAME, Env:GIT_COMMITTER_EMAIL -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "[backdate] Done. Review with:"
Write-Host "    git log --date-order --format=`"%ai %an %s`" -$($entries.Count)"
Write-Host "Then push:"
Write-Host "    git push origin $(git -C $repoRoot branch --show-current)"
