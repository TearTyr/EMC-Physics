# EMC Lab sync pack - font system v2 (G8321 Bold + Lilita One) & repo cleanup

## 1. Extract
Copy this zip's contents over D:\VS\EMC-Physics (overwrite when asked).
Paths inside the zip mirror the repo root.

Git Bash one-liner, if the zip is sitting in your Downloads folder:

    cd /d/VS/EMC-Physics
    tar -xf ~/Downloads/emc-sync-fonts-v2.zip     # bsdtar reads zip; Explorer works too

Then check the script is really there before you run anything:

    ls -l tools/cleanup-repo.ps1

If that prints "No such file or directory", the zip was never extracted into the
repo - fix that first, because nothing below can run without the file.

## 2. Clean the leftovers - ONE COMMAND
The cleanup is scripted. Pick the block for the shell you are ACTUALLY in, and
run it from the repo root.

### 2a. Git Bash / MSYS  <-- forward slashes only
A backslash is an escape character in bash. So `tools\cleanup-repo.ps1` reaches
PowerShell as the single mangled word `toolscleanup-repo.ps1` and you get:

    The argument 'toolscleanup-repo.ps1' to the -File parameter does not exist.

Same reason `cd D:\VS\EMC-Physics` fails as `cd: D:VSEMC-Physics: No such file
or directory`. Use forward slashes (and `/d/...` for absolute paths):

    cd /d/VS/EMC-Physics
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tools/cleanup-repo.ps1 -DryRun
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tools/cleanup-repo.ps1

`pwsh` can replace `powershell.exe` if you have PowerShell 7 installed.
An absolute repo path here must be POSIX style: -RepoPath /d/VS/EMC-Physics.

### 2b. PowerShell / Windows Terminal / cmd
    cd D:\VS\EMC-Physics
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\cleanup-repo.ps1 -DryRun
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\cleanup-repo.ps1

    # inside PowerShell you can also just dot-source it:
    .\tools\cleanup-repo.ps1 -DryRun

### 2c. What the run does
The -DryRun command only prints the plan (it changes nothing). The second asks
for confirmation, then:

  * deletes   server\ , api\ , tools\subset_font.py , bun.lockb ,
              package-lock.json , vendor\fonts\mochiy-pop-one-400.woff2 ,
              vendor\fonts\m-plus-rounded-1c-400.woff2 , plus OS/editor junk
              (Thumbs.db, desktop.ini, .DS_Store, *.bak, *.orig, ...)
              -> into the Recycle Bin, so it is all recoverable
              -> add -Permanent to delete for real
  * untracks  package-lock.json and any tracked .ttf/.otf under vendor/fonts
              (the files STAY on your disk - your paid Yuruka backup is never
              deleted, it just can no longer be pushed to the public repo)
  * repairs   .gitignore if the vendor/fonts/*.ttf|*.otf rules went missing
  * refuses   to delete anything css/fonts.css references or anything protected
              (css/site.css, bun.lock, the committed OFL woff2 faces, configs)
  * reports   bun.lock at lockfileVersion 2, a missing css/site.css, a stray
              public/ folder or outputDirectory in vercel.json (the two causes of
              the Vercel "No Output Directory named public" error), tracked
              node_modules, files >1 MB, and licensed fonts still sitting in
              git HISTORY (untracking does not rewrite history - the script says
              how to purge it)

Useful switches:
    -DryRun            plan only, change nothing
    -Force             skip the y/N prompt
    -PurgeNodeModules  also delete node_modules (then bun install proves the lock)
    -SkipJunk          leave Thumbs.db/*.bak/etc alone
    -Verify            run bun install / bun run check / bun run test afterwards
    -Commit -Push      git add -A + commit + push (sets upstream if missing)
    -CheckLive         probe the deployment (/api/health must NOT be 200;
                       g8321-700.woff2, lilita-one-400.woff2, css/site.css must be)
    -RepoPath <dir>    clean a repo other than the one the script lives in

Typical full run:

    # Git Bash
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tools/cleanup-repo.ps1 -Verify -Commit -Push

    # PowerShell
    .\tools\cleanup-repo.ps1 -Verify -Commit -Push

Exit codes: 0 clean - 1 you aborted at the prompt - 2 not the EMC Lab repo /
bad path - 3 a step failed.

Manual equivalent, if you would rather type it (same result, no safety checks).
In Git Bash use `rm -rf server api` / `rm tools/subset_font.py` instead of del/rmdir:

    del tools\subset_font.py
    del vendor\fonts\mochiy-pop-one-400.woff2
    del vendor\fonts\m-plus-rounded-1c-400.woff2
    rmdir /s /q server        rem old Express+MySQL backend; never ran on Vercel
    rmdir /s /q api           rem old serverless endpoints; /api/health currently
                              rem answers 200 on the live site, breaking the
                              rem "api returns 404" checklist item in TESTING.md
    git rm --cached package-lock.json   rem Bun-only project; already .gitignored
    del package-lock.json               rem but still TRACKED, so untrack it first
    git rm --cached vendor\fonts\*.ttf  rem keep licensed binaries out of the public repo

Your local licensed .ttf backups (incl. the paid Yuruka) stay where they are:
.gitignore blocks vendor/fonts/*.ttf|*.otf, so they can never leak into the
public repo. The site no longer needs any of them.

## 3. Commit + push (skipped if you used -Commit -Push)
    git add -A
    git commit -m "fonts: committed OFL G8321 Bold + Lilita One; drop Yuruka, dead backend, stray lockfile"
    git push

## 4. Fix the Vercel build ("No Output Directory named public found")
The error is NOT in vercel.json (no outputDirectory there) and NOT in the
repo (there is no public/ folder) - it is a saved PROJECT SETTING:
  vercel.com -> your project -> Settings -> Build & Development Settings
  -> Output Directory shows "public" -> Edit (pencil) -> CLEAR the field
     so it is completely empty -> Save.
Then: Deployments -> latest -> "..." menu -> Redeploy (untick
"Use existing Build Cache"). Build order afterwards: bun install ->
bun run build:css -> static output served straight from the repo root.

## 5. After the deploy
    # Git Bash
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tools/cleanup-repo.ps1 -CheckLive
Expect: /api/health NOT 200, and g8321-700.woff2, lilita-one-400.woff2,
css/site.css and / all 200. Then re-run the site suites:

    bun run check    # link/asset audit - expect 0 errors, 0 warnings
    bun run test     # headless smoke test - expect 207/207

Reminder: untracking the .ttf files does NOT remove them from git history.
Your repo is public, so the paid Yuruka binary is still downloadable from old
commits until you rewrite history (the script prints the exact
`git filter-repo` recipe when it finds them).
