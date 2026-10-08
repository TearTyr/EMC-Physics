# EMC Lab sync pack v9 - one content column on every page (topic pages no longer thin)

What changed in this pack:

  * **Topic pages now read as wide as the home page.** Until v8 the article text
    sat in a 700 px ribbon (`--measure`) while the home page used the full frame
    and a 980 px hero canvas - side by side the topic pages looked thin. There
    is now ONE content column for the whole site: `--column: 1060 px` (1020 px
    of content between the 20 px gutters). Topic prose, callouts, equations,
    sim panels, the quiz head AND the home hero canvas + stat strip all end at
    exactly the same left/right edges (verified in headless Chrome at 1440 px
    and 2048 px: every box measured l=211/r=1229 at 1440, l=515/r=1533 at 2048).
  * **Home hero canvas + stat strip grew 980 -> 1020 px** so they line up with
    the topic column edge-for-edge (`max-width: calc(var(--column) - 2.5rem)`).
    The 1280 px frame (`--maxw`) is unchanged and still carries the nav, footer
    and the multi-card grids on the home page.
  * **Intro paragraphs fill the column.** The 58ch cap on `.lede` now applies
    only to the centred home hero; topic/quiz heads let the intro run the full
    column so the masthead does not look ragged next to wide cards.
  * **Article rhythm untouched:** line-height 1.85, ~4.2 rem of air above every
    numbered heading, ~2.2 rem around equations/callouts/figures/disclosures,
    "+" disclosures for supplementary blocks. Only the column width changed.
  * **Smoke suite grew from 214 to 217 assertions**: the compiled CSS must ship
    `--column: 1060px` driving `.wrap-narrow` + `.wrap-sim`, the hero canvas and
    stat strip must both carry the aligning calc(), and the old `--measure`
    variable must be gone from both source and compiled CSS.
  * Mobile (375 px) unchanged in behaviour: everything stacks in the same
    20 px-gutter column, hamburger nav intact, zero console errors.

## 1. Extract
Copy this zip's contents over D:\VS\EMC-Physics (overwrite when asked).
Paths inside the zip mirror the repo root.

Git Bash one-liner, if the zip is sitting in your Downloads folder:

    cd /d/VS/EMC-Physics
    tar -xf ~/Downloads/emc-sync-v9-full-repo.zip --strip-components=1   # zip has one top-level folder; Explorer works too

## 2. Verify locally before shipping
    bun install
    bun run build     # Tailwind -> css/site.css, then tools/build-public.mjs -> public/
    bun run check     # link/asset/id audit - expect 0 errors, 0 warnings
    bun run test      # headless smoke test - expect 217/217
    bun run perf      # per-page transfer budgets - expect all green

Eye check: open index.html and any topic side by side at >=1100 px width - the
hero canvas and the topic text/cards must start and end on the same verticals.

## 3. Commit + push
    git add -A
    git commit -m "layout: one 1060px content column site-wide (topic pages match home width)"
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
    bun run test      # expect 217/217

Two spot checks worth doing by eye on the live site:

  * home and any topic at desktop width: the hero canvas and the topic column
    share the same left/right edges (no thin ribbon anywhere).
  * quiz page on a phone-width window: the four header stats sit 2x2, and after
    submitting, the "Score by topic" bars show unclipped short labels.

Reminder: untracking the .ttf files does NOT remove them from git history.
If the repo is public, the paid Yuruka binary is still downloadable from old
commits until you rewrite history (`tools/cleanup-repo.ps1` prints the exact
`git filter-repo` recipe when it finds them).

## Pack history
  * v9 - one site-wide content column (topic width = home width), 217 assertions
  * v8 - 70% scoring rule, 4.6 energy answer, dead anchor, stat-strip fit, honest browser claims
  * v7 - blog-style reading rhythm, clean student copy, dropdown nav
  * v6 - G8321 single-family type system + licensed-face loader
  * v5 - Tailwind @layer pipeline, vercel.json output pin, bun.lock v1
  * v4 - repo cleanup tooling (cleanup-repo.ps1, build-public.mjs)
