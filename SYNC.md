# EMC Lab sync pack v10 - the white line is dead (unstyled `<hr>` was falling back to Tailwind preflight's light border)

What changed in this pack:

  * **The bug.** A full-bleed ~1 px white/light line across the dark pages -
    on the home page between the "How to use this site" cards and "The four
    topics", and again above the footer colophon; the same stroke existed on
    the quiz and topic pages. The markup carries nine `<hr class="hr">`
    section/colophon dividers (3 home, 1 quiz, 1 per topic page footer +
    1 home footer), but **no `.hr` rule ever existed in `css/input.css`**.
    With no author rule, Tailwind's preflight styles every `<hr>`: the
    universal reset gives `border-color: #e5e7eb` (light grey) and the `hr`
    reset gives `border-top-width: 1px` - so each divider painted a 1 px
    LIGHT grey line straight onto the dark theme. That is the white line.
  * **The audit.** Every other stroke in the codebase was checked: header,
    cards, panels, tables, challenge strips, feedback dashes and disclosure
    summaries all set explicit dark tokens (`var(--line)` / `var(--line-soft)`),
    and the only light borders left are inside the `@media print` block where
    they belong. The unstyled `<hr>` was the single preflight leak.
  * **The fix (one rule, `@layer components` in `css/input.css`):**
        .hr { border: 0; border-top: 1px solid var(--line-soft); margin: 0; }
    Dividers now render as the site's own dark hairline (#26282f) - the same
    family as table row borders - instead of preflight light grey. Layout is
    untouched: preflight already zeroed `<hr>` margins and sections keep their
    3.4 rem rhythm, so nothing shifts by a pixel.
  * **Regression guards: smoke suite 217 -> 219 assertions.** (a) the compiled
    `css/site.css` must contain a `.hr` rule whose border-top uses the dark
    `var(--line-soft)` token; (b) every `<hr>` on all six pages must carry
    `class="hr"`, so a raw preflight-styled `<hr>` can never sneak back in.
  * **Verified with real tooling:** `check-links` 0 errors / 0 warnings;
    `smoke-test` 219/219; `perf-audit` all budgets met; headless Chrome at
    1440 px over all six pages reports computed `border-top-color:
    rgb(38, 40, 47)` @ 1 px for every one of the nine dividers with zero
    console errors; screenshots `shots/v10-divider-home.png` and
    `shots/v10-divider-footer.png` show the old white stroke gone.

## 1. Extract
Copy this zip's contents over D:\VS\EMC-Physics (overwrite when asked).
Paths inside the zip mirror the repo root.

Git Bash one-liner, if the zip is sitting in your Downloads folder:

    cd /d/VS/EMC-Physics
    tar -xf ~/Downloads/emc-sync-v10-full-repo.zip --strip-components=1   # zip has one top-level folder; Explorer works too

## 2. Verify locally before shipping
    bun install
    bun run build     # Tailwind -> css/site.css, then tools/build-public.mjs -> public/
    bun run check     # link/asset/id audit - expect 0 errors, 0 warnings
    bun run test      # headless smoke test - expect 219/219
    bun run perf      # per-page transfer budgets - expect all green

Eye check: open index.html - between "How to use this site" and "The four
topics", and above the footer copyright line, there must be NO light/white
line; at most a barely-visible dark hairline that matches the table borders.

## 3. Commit + push
    git add -A
    git commit -m "fix: style .hr dividers with the dark hairline token (unstyled hr showed preflight's light border as a white line)"
    git push

If `git push` dies with GitHub's `remote: Internal Server Error` again (that was
a GitHub-side 500, not your repo):

  1. First check nothing lives only on the server:
         git fetch origin
         git log --oneline HEAD..origin/main
     If that prints commits, DO NOT force - merge or back them up first.
  2. If it is empty, a normal retry usually lands. Three retries, then force the
     same payload (safe only because step 1 was empty):
         git push
         git push
         git config http.version HTTP/1.1 && git push
         git push --force-with-lease
     (`--force-with-lease`, never bare `--force`: it refuses if the remote moved.)
  3. Still 500ing? Check githubstatus.com, wait ~10 min, retry; quote the Request
     ID from the error to GitHub support if it persists.

## 4. The Vercel build fix ("No Output Directory named public found")
Still fixed IN THE REPO - no dashboard wrestling:

  * vercel.json pins "outputDirectory": "public"; per Vercel's docs the file
    OVERRIDES the dashboard setting, so a stale dashboard value cannot fail builds.
  * buildCommand is "bun run build" = build:css (Tailwind) + build:public
    (tools/build-public.mjs assembles public/ and verifies every local link).
  * public/ is gitignored - a build artifact, never committed.

Vercel rebuilds on push: bun install -> bun run build -> serves public/. If no
deployment starts: Deployments -> latest -> "..." -> Redeploy with "Use existing
Build Cache" UNTICKED.

## 5. After the deploy
    # Git Bash
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tools/cleanup-repo.ps1 -CheckLive
Expect: /api/health NOT 200, and g8321-400.woff2, g8321-700.woff2,
css/site.css and / all 200. Then re-run the suites against the repo:

    bun run check
    bun run test      # expect 219/219

Two spot checks worth doing by eye on the live site:

  * home page mid-scroll: no white/light horizontal line between sections or
    above the footer copyright - the dividers are dark hairlines now.
  * any topic page bottom: the colophon divider above "(c) 2026 EMC Lab" is
    dark, not light.

Reminder: untracking the .ttf files does NOT remove them from git history.
If the repo is public, the paid Yuruka binary is still downloadable from old
commits until you rewrite history (`tools/cleanup-repo.ps1` prints the exact
`git filter-repo` recipe when it finds them).

## Pack history
  * v10 - white-line fix: .hr dividers get the dark hairline rule, 219 assertions
  * v9 - one site-wide content column (topic width = home width), 217 assertions
  * v8 - 70% scoring rule, 4.6 energy answer, dead anchor, stat-strip fit, honest browser claims
  * v7 - blog-style reading rhythm, clean student copy, dropdown nav
  * v6 - G8321 single-family type system + licensed-face loader
  * v5 - Tailwind @layer pipeline, vercel.json output pin, bun.lock v1
  * v4 - repo cleanup tooling (cleanup-repo.ps1, build-public.mjs)
