<#
.SYNOPSIS
    EMC Lab - repository cleanup automation (Windows PowerShell 5.1+ or PowerShell 7+).

.DESCRIPTION
    Automates the "delete these leftovers" step of SYNC.md, then goes further.
    It works in three phases so nothing is touched before you agree to it:

      PLAN     scan the repo, print every intended change, report health problems
      CONFIRM  one prompt (skipped by -Force, and there is no prompt in -DryRun)
      EXECUTE  delete (Recycle Bin by default), untrack, repair .gitignore

    What it cleans:
      * the dead Express/MySQL backend (server/) and the dead serverless endpoints
        (api/) whose /api/health still answers 200 on the live site,
      * tools/subset_font.py, bun.lockb, package-lock.json and the unused woff2 faces,
      * editor/OS junk: Thumbs.db, desktop.ini, .DS_Store, *.bak, *.orig, *.rej,
        *.tmp, *.swp, *~,
      * .gitignore rules that went missing (including vendor/fonts/*.ttf|*.otf).

    What it untracks but NEVER deletes:
      * your licensed .ttf/.otf backups - the purchased FOT-Yuruka Std stays on
        disk and can no longer be pushed to the public repo,
      * package-lock.json is untracked first, then deleted (Bun-only project).

    What it refuses to delete:
      * anything css/fonts.css references (parsed from the real url() list),
      * anything in the hard-protected list (css/site.css, bun.lock, the four
        committed OFL woff2 files, manifest.json, HTML pages, configs).

    What it reports (never silently "fixes"):
      * bun.lock at lockfileVersion 2 (Vercel bundles Bun 1.3.x and cannot read it),
      * a missing css/site.css, a stray public/ folder (the thing that makes the
        Vercel dashboard demand Output Directory = "public"), outputDirectory in
        vercel.json, tracked node_modules, tracked files over 1 MB, and private
        font binaries that are still reachable in git HISTORY.

.PARAMETER RepoPath
    Repository root. Defaults to the parent folder of this script (it lives in
    tools/), so running it from inside the repo needs no arguments.

.PARAMETER DryRun
    Plan and report only. Change nothing. There is no prompt in this mode.

.PARAMETER Force
    Skip the confirmation prompt (execute the plan immediately).

.PARAMETER Permanent
    Bypass the Recycle Bin and delete for real.

.PARAMETER SkipJunk
    Do not sweep Thumbs.db / desktop.ini / .DS_Store / *.bak / *.orig / ... .

.PARAMETER PurgeNodeModules
    Also delete node_modules so the next `bun install` proves bun.lock resolves
    exactly the way Vercel's will.

.PARAMETER Verify
    After cleaning, run: bun install, bun run check, bun run test.

.PARAMETER Commit
    Stage everything and commit with -CommitMessage.

.PARAMETER Push
    Push after committing (implies -Commit; sets the upstream if there is none).

.PARAMETER CheckLive
    Probe the deployment: /api/health must NOT be 200; the two committed woff2
    files, css/site.css and / must be 200.

.EXAMPLE
    .\tools\cleanup-repo.ps1 -DryRun

.EXAMPLE
    .\tools\cleanup-repo.ps1 -Verify -Commit -Push

.EXAMPLE
    .\tools\cleanup-repo.ps1 -RepoPath D:\VS\EMC-Physics -PurgeNodeModules -CheckLive -Force
#>

[CmdletBinding()]
param(
    [string]$RepoPath,
    [switch]$DryRun,
    [switch]$Force,
    [switch]$Permanent,
    [switch]$SkipJunk,
    [switch]$PurgeNodeModules,
    [switch]$Verify,
    [switch]$Commit,
    [switch]$Push,
    [switch]$CheckLive,
    [string]$CommitMessage = 'chore: drop dead backend (server/, api/), stale font tooling and npm lockfile',
    [string]$LiveUrl = 'https://emc-physics.vercel.app'
)

# Native commands (git, bun) write progress to stderr; that must not be fatal.
$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# 0. State + console helpers
# ---------------------------------------------------------------------------
$script:Queue     = New-Object System.Collections.ArrayList   # planned actions
$script:Removed   = New-Object System.Collections.ArrayList   # executed deletions
$script:Junk      = New-Object System.Collections.ArrayList   # executed junk deletions
$script:Untracked = New-Object System.Collections.ArrayList   # executed git rm --cached
$script:Failed    = New-Object System.Collections.ArrayList
$script:Warnings  = New-Object System.Collections.ArrayList
$script:Notes     = New-Object System.Collections.ArrayList
$script:GitOk     = $false

function Write-Section {
    param([string]$Text)
    Write-Host ''
    Write-Host ('=' * 74) -ForegroundColor DarkGray
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ('=' * 74) -ForegroundColor DarkGray
}
function Write-Ok      { param([string]$m) Write-Host "  [ok]    $m" -ForegroundColor Green }
function Write-Info    { param([string]$m) Write-Host "  [ .. ]  $m" -ForegroundColor Gray }
function Write-Problem { param([string]$m) Write-Host "  [!!]    $m" -ForegroundColor Yellow; [void]$script:Warnings.Add($m) }
function Write-Plan    { param([string]$m) Write-Host "  [plan]  $m" -ForegroundColor DarkCyan }
function Write-Act     { param([string]$m) Write-Host "  [del]   $m" -ForegroundColor Magenta }
function Write-GitAct  { param([string]$m) Write-Host "  [git]   $m" -ForegroundColor Blue }

function ConvertTo-Rel {
    param([string]$FullPath)
    return ($FullPath.Substring($RepoPath.Length).TrimStart('\', '/')) -replace '\\', '/'
}

function Add-QueuedAction {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('delete', 'junk', 'untrack', 'gitignore')][string]$Type,
        [Parameter(Mandatory = $true)][string]$Rel,
        [string]$Full = '',
        [string]$Kind = 'File',
        [string[]]$Extra = @()
    )
    [void]$script:Queue.Add([pscustomobject]@{
        Type  = $Type
        Rel   = $Rel
        Full  = $Full
        Kind  = $Kind
        Extra = $Extra
    })
}

# ---------------------------------------------------------------------------
# 1. Resolve and validate the repository
# ---------------------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    if ($PSScriptRoot) { $RepoPath = Split-Path -Parent $PSScriptRoot }
    else               { $RepoPath = (Get-Location).Path }
}
try {
    $RepoPath = (Resolve-Path -LiteralPath $RepoPath -ErrorAction Stop).ProviderPath
} catch {
    Write-Host "  [xx] Path not found: $RepoPath" -ForegroundColor Red
    Write-Host '       Re-run with -RepoPath D:\VS\EMC-Physics' -ForegroundColor Red
    exit 2
}

Write-Section 'EMC Lab repo cleanup'

$modeText = 'LIVE'
if ($DryRun) { $modeText = 'DRY RUN (plan only - nothing will be changed)' }
$delText = 'Recycle Bin (recoverable)'
if ($DryRun -or $Permanent) { $delText = 'permanent' }

Write-Host "  repo    : $RepoPath"
Write-Host "  mode    : $modeText"
Write-Host "  delete  : $delText"

if (-not (Test-Path -LiteralPath (Join-Path $RepoPath 'package.json'))) {
    Write-Host ''
    Write-Host "  [xx] $RepoPath does not look like the EMC Lab repo (no package.json)." -ForegroundColor Red
    exit 2
}

# --- Recycle Bin support (Windows only; falls back to a real delete elsewhere)
$script:UseRecycleBin = $false
if (-not $Permanent -and ($env:OS -eq 'Windows_NT')) {
    try {
        Add-Type -AssemblyName Microsoft.VisualBasic -ErrorAction Stop
        if ('Microsoft.VisualBasic.FileIO.FileSystem' -as [type]) { $script:UseRecycleBin = $true }
    } catch {
        $script:UseRecycleBin = $false
    }
}
if (-not $DryRun -and -not $script:UseRecycleBin -and -not $Permanent) {
    Write-Info 'Recycle Bin unavailable here - deletions will be permanent.'
}

# --- git availability / repo state ----------------------------------------
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    & git -C $RepoPath rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $script:GitOk = $true }
}

if (-not $script:GitOk) {
    Write-Problem 'Not a git working tree (or git is not on PATH) - skipping index/history work.'
    Write-Info    'File deletions still run; commit them yourself afterwards.'
} else {
    $branch = & git -C $RepoPath rev-parse --abbrev-ref HEAD 2>$null
    $dirty  = & git -C $RepoPath status --porcelain 2>$null
    Write-Host "  branch  : $branch"
    if ($dirty) {
        Write-Problem 'Uncommitted changes present - they will land in the same commit.'
        Write-Info    'Commit or stash first if you want this cleanup isolated.'
    } else {
        Write-Ok 'Working tree is clean.'
    }
}

# ---------------------------------------------------------------------------
# 2. Protected list (paths this script may NEVER delete)
# ---------------------------------------------------------------------------
$script:ProtectedPaths = New-Object 'System.Collections.Generic.HashSet[string]'

# 2a. Everything css/fonts.css actually references - parsed from the real url()s.
$fontsCss = Join-Path $RepoPath 'css/fonts.css'
if (Test-Path -LiteralPath $fontsCss) {
    try {
        $cssText = [System.IO.File]::ReadAllText($fontsCss)
        foreach ($m in [regex]::Matches($cssText, "url\(\s*['""]?([^'""\)]+)['""]?\s*\)")) {
            $u = $m.Groups[1].Value.Trim()
            if ($u -match '^(https?:)?//') { continue }
            if ($u -match '^data:') { continue }
            $rel = ($u -replace '^\.\./', '') -replace '^\./', ''
            [void]$script:ProtectedPaths.Add($rel.ToLowerInvariant())
        }
    } catch {
        Write-Problem "Could not parse css/fonts.css: $($_.Exception.Message)"
    }
}

# 2b. Explicit safety net.
$hardProtect = @(
    'css/site.css', 'css/input.css', 'css/fonts.css',
    'bun.lock', 'package.json', 'tailwind.config.js', 'vercel.json',
    'index.html', 'quiz.html', '.gitignore', 'README.md', 'TESTING.md',
    'PRESENTATION-NOTES.md',
    'vendor/fonts/g8321-700.woff2', 'vendor/fonts/lilita-one-400.woff2',
    'vendor/fonts/m-plus-rounded-1c-700.woff2', 'vendor/fonts/m-plus-rounded-1c-800.woff2',
    'vendor/fonts/manifest.json', 'vendor/fonts/ofl-g8321.txt',
    'vendor/fonts/readme.md', 'vendor/fonts/.gitkeep'
)
foreach ($p in $hardProtect) { [void]$script:ProtectedPaths.Add($p.ToLowerInvariant()) }

function Test-Protected {
    param([string]$RelPath)
    $n = $RelPath.ToLowerInvariant()
    if ($script:ProtectedPaths.Contains($n)) { return $true }
    # licensed local backups stay on disk forever - they are only ever untracked
    if ($n -like 'vendor/fonts/*.ttf' -or $n -like 'vendor/fonts/*.otf') { return $true }
    return $false
}

# ---------------------------------------------------------------------------
# 3. Planning helpers (nothing here touches the filesystem)
# ---------------------------------------------------------------------------
function Plan-Remove {
    param(
        [Parameter(Mandatory = $true)][string]$RelPath,
        [Parameter(Mandatory = $true)][ValidateSet('File', 'Dir')][string]$Kind,
        [Parameter(Mandatory = $true)][string]$Reason,
        [string]$Type = 'delete'
    )

    if (Test-Protected $RelPath) {
        Write-Host "  [xx]    REFUSING to delete protected path: $RelPath" -ForegroundColor Red
        return
    }

    $full = Join-Path $RepoPath ($RelPath -replace '/', [System.IO.Path]::DirectorySeparatorChar)

    if (-not (Test-Path -LiteralPath $full)) {
        Write-Info "$RelPath - already gone ($Reason)"
        return
    }

    Write-Plan "delete [$Kind] $RelPath   <- $Reason"
    Add-QueuedAction -Type $Type -Rel $RelPath -Full $full -Kind $Kind
}

function Plan-Untrack {
    param(
        [Parameter(Mandatory = $true)][string]$RelPath,
        [Parameter(Mandatory = $true)][string]$Reason
    )
    if (-not $script:GitOk) { return }

    $listed = & git -C $RepoPath ls-files -- $RelPath 2>$null
    if (-not $listed) {
        Write-Info "$RelPath is not tracked ($Reason)"
        return
    }
    Write-Plan "git rm --cached $RelPath   <- $Reason"
    Add-QueuedAction -Type 'untrack' -Rel $RelPath
}

# ---------------------------------------------------------------------------
# 4. PLAN: dead code and stale assets (SYNC.md section 2)
# ---------------------------------------------------------------------------
Write-Section 'PLAN 1/4 - dead code and stale assets'

$targets = @(
    @{ Path = 'server'; Kind = 'Dir';
       Reason = 'old Express+MySQL backend; never ran on Vercel' }
    @{ Path = 'api'; Kind = 'Dir';
       Reason = 'old serverless endpoints; /api/health still answers 200 live and breaks TESTING.md' }
    @{ Path = 'tools/subset_font.py'; Kind = 'File';
       Reason = 'subsetting was dropped when the paid faces left the design' }
    @{ Path = 'vendor/fonts/mochiy-pop-one-400.woff2'; Kind = 'File';
       Reason = 'unused face; not referenced by css/fonts.css' }
    @{ Path = 'vendor/fonts/m-plus-rounded-1c-400.woff2'; Kind = 'File';
       Reason = 'unused weight; the site ships 700/800 only' }
    @{ Path = 'bun.lockb'; Kind = 'File';
       Reason = 'binary lockfile; the committed text bun.lock is authoritative' }
)
$plannedPaths = @($targets | ForEach-Object { $_.Path.ToLowerInvariant() })

foreach ($t in $targets) {
    Plan-Remove -RelPath $t.Path -Kind $t.Kind -Reason $t.Reason
}

# Stragglers: older sync packs used slightly different names for the same junk.
$strayPatterns = @(
    'vendor/fonts/mochi*.woff2',
    'vendor/fonts/mochiy*.woff2',
    'vendor/fonts/m-plus-rounded-1c-400*.woff2',
    'vendor/fonts/*-m-plus-400*.woff2',
    'tools/subset_font*'
)
foreach ($pat in $strayPatterns) {
    $hits = Get-ChildItem -Path (Join-Path $RepoPath $pat) -File -Force -ErrorAction SilentlyContinue
    foreach ($h in $hits) {
        $rel = ConvertTo-Rel $h.FullName
        if ($plannedPaths -contains $rel.ToLowerInvariant()) { continue }
        Plan-Remove -RelPath $rel -Kind 'File' -Reason "matches stale pattern: $pat"
    }
}

if ($PurgeNodeModules) {
    $nmFull = Join-Path $RepoPath 'node_modules'
    if (Test-Path -LiteralPath $nmFull) {
        Write-Plan 'delete [Dir] node_modules   <- -PurgeNodeModules (bun install rebuilds it)'
        Add-QueuedAction -Type 'delete' -Rel 'node_modules' -Full $nmFull -Kind 'Dir'
    } else {
        Write-Info 'node_modules - already absent.'
    }
}

# ---------------------------------------------------------------------------
# 5. PLAN: untrack private / wrong-toolchain files (files stay on disk)
# ---------------------------------------------------------------------------
Write-Section 'PLAN 2/4 - untrack from the public repo (files stay on your disk)'

Plan-Untrack  -RelPath 'package-lock.json' -Reason 'Bun-only project; bun.lock is the one true lockfile'
Plan-Remove   -RelPath 'package-lock.json' -Kind 'File' -Reason 'npm lockfile in a Bun project'

if ($script:GitOk) {
    $trackedFonts = & git -C $RepoPath ls-files -- 'vendor/fonts/*.ttf' 'vendor/fonts/*.otf' 2>$null
    if ($trackedFonts) {
        foreach ($f in $trackedFonts) {
            if ([string]::IsNullOrWhiteSpace($f)) { continue }
            Plan-Untrack -RelPath $f -Reason 'licensed/private font binary must never sit in a public repo'
        }
    } else {
        Write-Ok 'No .ttf/.otf binaries are tracked under vendor/fonts.'
    }
}

# ---------------------------------------------------------------------------
# 6. PLAN: editor / OS junk (tree walk that skips dependency dirs)
# ---------------------------------------------------------------------------
$script:ExcludeDirs = @('node_modules', '.git', '.vercel', 'dist', 'build', '.next',
                        '.cache', '__pycache__', '.turbo', 'coverage')

function Get-RepoTree {
    param([string]$Dir)
    $files = New-Object System.Collections.ArrayList
    $dirs  = New-Object System.Collections.ArrayList
    $items = Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue
    foreach ($it in $items) {
        if ($it.PSIsContainer) {
            if ($script:ExcludeDirs -contains $it.Name) { continue }
            [void]$dirs.Add($it)
            $sub = Get-RepoTree -Dir $it.FullName
            foreach ($sf in $sub.Files) { [void]$files.Add($sf) }
            foreach ($sd in $sub.Dirs)  { [void]$dirs.Add($sd) }
        } else {
            [void]$files.Add($it)
        }
    }
    return @{ Files = $files; Dirs = $dirs }
}

if (-not $SkipJunk) {
    Write-Section 'PLAN 3/4 - editor and OS junk'

    $junkNames  = @('Thumbs.db', 'desktop.ini', '.DS_Store', 'ehthumbs.db')
    $junkSuffix = @('.bak', '.orig', '.rej', '.tmp', '.swp', '~')

    $tree     = Get-RepoTree -Dir $RepoPath
    $junkHits = New-Object System.Collections.ArrayList

    foreach ($f in $tree.Files) {
        $isJunk = ($junkNames -contains $f.Name)
        if (-not $isJunk) {
            foreach ($s in $junkSuffix) {
                if ($f.Name.EndsWith($s, [System.StringComparison]::OrdinalIgnoreCase)) { $isJunk = $true; break }
            }
        }
        if ($isJunk) { [void]$junkHits.Add($f) }
    }

    if ($junkHits.Count -eq 0) {
        Write-Ok 'No junk files found.'
    } else {
        foreach ($f in $junkHits) {
            $rel = ConvertTo-Rel $f.FullName
            if (Test-Protected $rel) {
                Write-Info "junk pattern matched a protected file - leaving it: $rel"
                continue
            }
            Write-Plan "delete junk $rel"
            Add-QueuedAction -Type 'junk' -Rel $rel -Full $f.FullName -Kind 'File'
        }
    }

    # Empty directories are reported only - git does not track them anyway.
    foreach ($d in $tree.Dirs) {
        $child = Get-ChildItem -LiteralPath $d.FullName -Force -ErrorAction SilentlyContinue
        if (-not $child) {
            $rel = ConvertTo-Rel $d.FullName
            Write-Info "empty directory (left alone): $rel"
            [void]$script:Notes.Add("empty dir: $rel")
        }
    }
}

# ---------------------------------------------------------------------------
# 7. PLAN: .gitignore repair
# ---------------------------------------------------------------------------
Write-Section 'PLAN 4/4 - .gitignore'

$giPath = Join-Path $RepoPath '.gitignore'
$requiredRules = @(
    'node_modules/', 'package-lock.json', '.vercel/',
    'vendor/fonts/*.ttf', 'vendor/fonts/*.otf',
    'Thumbs.db', 'desktop.ini', '.DS_Store', '*.log'
)

$giMissing = New-Object System.Collections.ArrayList
$giExists  = Test-Path -LiteralPath $giPath

if ($giExists) {
    $giText  = [System.IO.File]::ReadAllText($giPath)
    $giLines = @($giText -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })

    foreach ($rule in $requiredRules) {
        $bare = $rule.TrimEnd('/')
        $hit = $false
        foreach ($line in $giLines) {
            if ($line -eq $rule -or $line -eq $bare -or $line -eq "$bare/") { $hit = $true; break }
        }
        if (-not $hit) { [void]$giMissing.Add($rule) }
    }

    if ($giMissing.Count -eq 0) {
        Write-Ok 'All required ignore rules present - licensed fonts can never be pushed.'
    } else {
        Write-Plan "append missing .gitignore rules: $($giMissing -join ', ')"
        Add-QueuedAction -Type 'gitignore' -Rel '.gitignore' -Full $giPath -Extra $giMissing
    }
} else {
    Write-Problem '.gitignore is missing entirely - your licensed .ttf backups are exposed!'
    foreach ($rule in $requiredRules) { [void]$giMissing.Add($rule) }
    Write-Plan 'create .gitignore with the required rules'
    Add-QueuedAction -Type 'gitignore' -Rel '.gitignore' -Full $giPath -Extra $giMissing
}

# ---------------------------------------------------------------------------
# 8. Repo health report (read-only diagnostics)
# ---------------------------------------------------------------------------
Write-Section 'Repo health'

# 8a. bun.lock must stay at lockfileVersion 1 (Vercel bundles Bun 1.3.x).
$bunLock = Join-Path $RepoPath 'bun.lock'
if (Test-Path -LiteralPath $bunLock) {
    $bl = [System.IO.File]::ReadAllText($bunLock)
    $mm = [regex]::Match($bl, '"lockfileVersion"\s*:\s*(\d+)')
    if ($mm.Success) {
        if ($mm.Groups[1].Value -eq '1') {
            Write-Ok 'bun.lock is lockfileVersion 1 - readable by the Bun 1.3.x bundled on Vercel.'
        } else {
            Write-Problem "bun.lock is lockfileVersion $($mm.Groups[1].Value); Vercel's Bun 1.3.x cannot read it."
            Write-Info    'Fix: delete bun.lock, then regenerate with Bun 1.3.x (bun install) - not Bun >= 1.4.'
        }
    } else {
        Write-Problem 'bun.lock has no lockfileVersion field - corrupted, or is it the binary lock?'
    }
} else {
    Write-Problem 'bun.lock is missing - Vercel would resolve dependencies from scratch.'
}

# 8b. The committed Tailwind build must exist.
if (Test-Path -LiteralPath (Join-Path $RepoPath 'css/site.css')) {
    Write-Ok 'css/site.css (committed Tailwind build) is present.'
} else {
    Write-Problem 'css/site.css is missing - run: bun install ; bun run build:css'
}

# 8c. A public/ folder is what makes Vercel demand "Output Directory: public".
if (Test-Path -LiteralPath (Join-Path $RepoPath 'public')) {
    Write-Problem 'A public/ folder exists, but the site is served from the repo root.'
    Write-Info    'This is what makes the Vercel dashboard insist on Output Directory = "public".'
} else {
    Write-Ok 'No public/ folder (correct - static output is the repo root).'
}

# 8d. vercel.json must not pin an output directory.
$vj = Join-Path $RepoPath 'vercel.json'
if (Test-Path -LiteralPath $vj) {
    $vjText = [System.IO.File]::ReadAllText($vj)
    if ($vjText -match 'outputDirectory') {
        Write-Problem 'vercel.json pins outputDirectory - remove it. The fix belongs in the dashboard: CLEAR the field.'
    } else {
        Write-Ok 'vercel.json does not pin outputDirectory.'
    }
}

if ($script:GitOk) {
    # 8e. node_modules must never be tracked.
    $nm = & git -C $RepoPath ls-files -- 'node_modules/*' 2>$null | Select-Object -First 5
    if ($nm) {
        Write-Problem 'node_modules is tracked in git. Fix: git rm -r --cached node_modules'
    } else {
        Write-Ok 'node_modules is not tracked.'
    }

    # 8f. Licensed binaries reachable in HISTORY - .gitignore does not rewrite it.
    $hist = & git -C $RepoPath log --all --pretty=format: --name-only --diff-filter=A -- '*.ttf' '*.otf' 2>$null |
            Where-Object { $_ -and $_.Trim() } | Sort-Object -Unique
    if ($hist) {
        Write-Problem 'Private font binaries are still reachable in git HISTORY (a public repo exposes them):'
        foreach ($h in $hist) { Write-Host "              $h" -ForegroundColor Yellow }
        Write-Info    'Untracking is not enough. Purge with: git filter-repo --invert-paths --path <file>'
        Write-Info    'then force-push - or re-publish from a fresh repo and check the font licence terms.'
    } else {
        Write-Ok 'No .ttf/.otf was ever committed - history is clean.'
    }

    # 8g. Anything else unexpectedly large and tracked (-Force: dotfiles count).
    $big = @(& git -C $RepoPath ls-files 2>$null | ForEach-Object {
        $item = Get-Item -LiteralPath (Join-Path $RepoPath $_) -Force -ErrorAction SilentlyContinue
        if ($item -and -not $item.PSIsContainer -and $item.Length -gt 1MB) {
            [pscustomobject]@{ Path = $_; MB = [math]::Round($item.Length / 1MB, 2) }
        }
    })
    foreach ($b in $big) { Write-Problem "large tracked file: $($b.Path) ($($b.MB) MB)" }
}

# ---------------------------------------------------------------------------
# 9. CONFIRM  (the plan above has not changed anything yet)
# ---------------------------------------------------------------------------
if ($DryRun) {
    Write-Section 'Dry run complete'
    Write-Host "  $($script:Queue.Count) change(s) planned. Re-run without -DryRun to apply them." -ForegroundColor Cyan
} elseif ($script:Queue.Count -eq 0) {
    Write-Section 'Nothing to do'
    Write-Ok 'The repo is already clean - no changes were needed.'
} else {
    if (-not $Force) {
        Write-Section 'Confirm'
        Write-Host "  $($script:Queue.Count) change(s) will be applied to $RepoPath"
        if ($script:UseRecycleBin) {
            Write-Host '  Deleted files go to the Recycle Bin (pass -Permanent to skip that).'
        } else {
            Write-Host '  Deletions are PERMANENT on this machine (no Recycle Bin).' -ForegroundColor Yellow
        }
        $answer = Read-Host '  Proceed? [y/N]'
        if ($answer -notmatch '^\s*(y|yes)\s*$') {
            Write-Host ''
            Write-Host '  Aborted - nothing was changed.' -ForegroundColor Yellow
            exit 1
        }
    }

    # -----------------------------------------------------------------------
    # 10. EXECUTE
    # -----------------------------------------------------------------------
    Write-Section 'Executing'

    foreach ($a in $script:Queue) {
        switch ($a.Type) {

            'delete' {
                try {
                    if ($script:UseRecycleBin) {
                        if ($a.Kind -eq 'Dir') {
                            [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
                                $a.Full, 'OnlyErrorDialogs', 'SendToRecycleBin')
                        } else {
                            [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
                                $a.Full, 'OnlyErrorDialogs', 'SendToRecycleBin')
                        }
                    } elseif ($a.Kind -eq 'Dir') {
                        Remove-Item -LiteralPath $a.Full -Recurse -Force -ErrorAction Stop
                    } else {
                        Remove-Item -LiteralPath $a.Full -Force -ErrorAction Stop
                    }
                    Write-Act "deleted [$($a.Kind)] $($a.Rel)"
                    [void]$script:Removed.Add($a.Rel)
                } catch {
                    Write-Problem "could not delete $($a.Rel): $($_.Exception.Message)"
                    [void]$script:Failed.Add($a.Rel)
                }
            }

            'junk' {
                try {
                    if ($script:UseRecycleBin) {
                        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
                            $a.Full, 'OnlyErrorDialogs', 'SendToRecycleBin')
                    } else {
                        Remove-Item -LiteralPath $a.Full -Force -ErrorAction Stop
                    }
                    Write-Act "deleted junk: $($a.Rel)"
                    [void]$script:Junk.Add($a.Rel)
                } catch {
                    Write-Problem "could not delete junk $($a.Rel): $($_.Exception.Message)"
                    [void]$script:Failed.Add($a.Rel)
                }
            }

            'untrack' {
                & git -C $RepoPath rm --cached --quiet -- $a.Rel 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-GitAct "untracked $($a.Rel) (still on your disk)"
                    [void]$script:Untracked.Add($a.Rel)
                } else {
                    Write-Problem "git rm --cached failed for $($a.Rel)"
                    [void]$script:Failed.Add($a.Rel)
                }
            }

            'gitignore' {
                try {
                    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                    if ($giExists) {
                        $old     = [System.IO.File]::ReadAllText($a.Full)
                        $block   = @('', '# --- appended by tools/cleanup-repo.ps1 ---') + $a.Extra
                        $newText = $old.TrimEnd() + "`n" + ($block -join "`n") + "`n"
                    } else {
                        $newText = ($a.Extra -join "`n") + "`n"
                    }
                    [System.IO.File]::WriteAllText($a.Full, $newText, $utf8NoBom)
                    Write-Ok "updated .gitignore (+$($a.Extra.Count) rule(s))"
                    [void]$script:Removed.Add('.gitignore (updated)')
                } catch {
                    Write-Problem "could not update .gitignore: $($_.Exception.Message)"
                    [void]$script:Failed.Add('.gitignore')
                }
            }
        }
    }
}

# ---------------------------------------------------------------------------
# 11. Optional local verification
# ---------------------------------------------------------------------------
if ($Verify) {
    Write-Section 'Verify (bun)'
    $bunCmd = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bunCmd) {
        Write-Problem 'bun is not on PATH - skipping verification.'
    } elseif ($DryRun) {
        Write-Info 'Skipped in dry-run mode.'
    } else {
        Push-Location $RepoPath
        try {
            Write-Host '' ; Write-Host '  > bun install' -ForegroundColor Cyan
            & bun install
            if ($LASTEXITCODE -ne 0) { Write-Problem "bun install exited with $LASTEXITCODE" }

            Write-Host '' ; Write-Host '  > bun run check   (expect 0 errors / 0 warnings)' -ForegroundColor Cyan
            & bun run check
            if ($LASTEXITCODE -ne 0) { Write-Problem "bun run check exited with $LASTEXITCODE" }

            Write-Host '' ; Write-Host '  > bun run test    (expect 207/207 assertions)' -ForegroundColor Cyan
            & bun run test
            if ($LASTEXITCODE -ne 0) { Write-Problem "bun run test exited with $LASTEXITCODE" }
        } finally {
            Pop-Location
        }
    }
}

# ---------------------------------------------------------------------------
# 12. Commit / push
# ---------------------------------------------------------------------------
$doCommit = ([bool]$Commit -or [bool]$Push)

if ($doCommit -and -not $script:GitOk) {
    Write-Problem '-Commit/-Push requested but no git repo was detected.'
} elseif ($doCommit) {
    Write-Section 'Commit'
    if ($DryRun) {
        $tail = ''
        if ($Push) { $tail = ' ; git push' }
        Write-GitAct "would run: git add -A ; git commit -m `"$CommitMessage`"$tail"
    } else {
        & git -C $RepoPath add -A 2>$null | Out-Null
        $staged = & git -C $RepoPath diff --cached --name-only 2>$null
        if ($staged) {
            & git -C $RepoPath commit -m $CommitMessage 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-GitAct "committed: $CommitMessage"
                if ($Push) {
                    # No upstream yet (fresh clone / re-imported repo)? Set it on the fly.
                    $upstream = & git -C $RepoPath rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
                    if ($LASTEXITCODE -ne 0 -or -not $upstream) {
                        $curBranch = & git -C $RepoPath rev-parse --abbrev-ref HEAD 2>$null
                        Write-Info "no upstream for '$curBranch' - pushing with --set-upstream origin $curBranch"
                        $pushOut = & git -C $RepoPath push --set-upstream origin $curBranch 2>&1 | ForEach-Object { "$_" }
                    } else {
                        $pushOut = & git -C $RepoPath push 2>&1 | ForEach-Object { "$_" }
                    }
                    $pushExit = $LASTEXITCODE
                    foreach ($line in $pushOut) { Write-Host "            $line" -ForegroundColor DarkGray }
                    if ($pushExit -eq 0) { Write-GitAct 'pushed.' }
                    else { Write-Problem "git push failed (exit $pushExit)." }
                }
            } else {
                Write-Problem 'git commit failed - run `git status` and commit manually.'
            }
        } else {
            Write-Ok 'Nothing to commit.'
        }
    }
}

# ---------------------------------------------------------------------------
# 13. Optional live probe
# ---------------------------------------------------------------------------
if ($CheckLive) {
    Write-Section "Live probe: $LiveUrl"

    function Get-HttpStatus {
        param([string]$Url)
        try {
            $r = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
            return [int]$r.StatusCode
        } catch {
            $resp = $_.Exception.Response
            if ($resp) {
                try { return [int]$resp.StatusCode } catch { return -1 }
            }
            return -1
        }
    }

    $probes = @(
        @{ Url = "$LiveUrl/api/health";                        Want = 'not-200'; Label = '/api/health must be gone (expect 404)' }
        @{ Url = "$LiveUrl/vendor/fonts/g8321-700.woff2";      Want = '200';     Label = 'G8321 Bold woff2 (~15 KB)' }
        @{ Url = "$LiveUrl/vendor/fonts/lilita-one-400.woff2"; Want = '200';     Label = 'Lilita One woff2 (~10 KB)' }
        @{ Url = "$LiveUrl/css/site.css";                      Want = '200';     Label = 'committed Tailwind build' }
        @{ Url = "$LiveUrl/";                                  Want = '200';     Label = 'home page' }
    )

    foreach ($p in $probes) {
        $code = Get-HttpStatus -Url $p.Url
        $pass = $false
        if ($p.Want -eq '200')     { $pass = ($code -eq 200) }
        if ($p.Want -eq 'not-200') { $pass = ($code -ne 200 -and $code -ne -1) }
        if ($pass) { Write-Ok "$($p.Label): HTTP $code" }
        else       { Write-Problem "$($p.Label): HTTP $code (expected $($p.Want))" }
    }
    Write-Info 'A stale 200 on /api/health means api/ is still deployed: push the cleanup,'
    Write-Info 'then Vercel -> Deployments -> ... -> Redeploy with "Use existing Build Cache" unticked.'
}

# ---------------------------------------------------------------------------
# 14. Summary
# ---------------------------------------------------------------------------
Write-Section 'Summary'

$verb = 'planned'
if (-not $DryRun) { $verb = 'applied' }

Write-Host "  changes $verb : $($script:Queue.Count)"
Write-Host "    deletions        : $($script:Removed.Count)"
foreach ($r in $script:Removed)   { Write-Host "        - $r" -ForegroundColor DarkGray }
Write-Host "    junk swept       : $($script:Junk.Count)"
foreach ($j in $script:Junk)      { Write-Host "        - $j" -ForegroundColor DarkGray }
Write-Host "    untracked in git : $($script:Untracked.Count)"
foreach ($u in $script:Untracked) { Write-Host "        - $u" -ForegroundColor DarkGray }
Write-Host "    failed           : $($script:Failed.Count)"
foreach ($f in $script:Failed)    { Write-Host "        - $f" -ForegroundColor Red }

if ($DryRun) {
    Write-Host ''
    Write-Host '  Full plan (nothing was touched):' -ForegroundColor Cyan
    foreach ($a in $script:Queue) {
        switch ($a.Type) {
            'delete'    { Write-Host "      delete [$($a.Kind)] $($a.Rel)" -ForegroundColor DarkGray }
            'junk'      { Write-Host "      delete junk      $($a.Rel)" -ForegroundColor DarkGray }
            'untrack'   { Write-Host "      git rm --cached  $($a.Rel)" -ForegroundColor DarkGray }
            'gitignore' { Write-Host "      .gitignore +=    $($a.Extra -join ', ')" -ForegroundColor DarkGray }
        }
    }
}

Write-Host "  notes            : $($script:Notes.Count)"
Write-Host "  warnings         : $($script:Warnings.Count)"
foreach ($w in $script:Warnings) { Write-Host "      ! $w" -ForegroundColor Yellow }

Write-Host ''
if ($DryRun) {
    Write-Host '  DRY RUN complete. Re-run without -DryRun to apply.' -ForegroundColor Cyan
} else {
    Write-Host '  Cleanup applied.' -ForegroundColor Green
    if (-not $doCommit) {
        Write-Host '  Next: git add -A ; git commit -m "..." ; git push' -ForegroundColor Gray
    }
    Write-Host '  Then: Vercel -> Settings -> Build & Development Settings -> Output Directory' -ForegroundColor Gray
    Write-Host '        CLEAR the "public" value -> Save -> Redeploy without build cache.' -ForegroundColor Gray
}
Write-Host ''

if ($script:Failed.Count -gt 0) { exit 3 }
exit 0
