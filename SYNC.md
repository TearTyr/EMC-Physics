# EMC Lab sync pack - font system v2 (G8321 Bold + Lilita One) & repo cleanup

## 1. Extract
Copy this zip's contents over D:\VS\EMC-Physics (overwrite when asked).
Paths inside the zip mirror the repo root.

## 2. Delete these leftovers (dead or wrong for the project)
    del tools\subset_font.py
    del vendor\fonts\mochiy-pop-one-400.woff2
    del vendor\fonts\m-plus-rounded-1c-400.woff2
    rmdir /s /q server        rem old Express+MySQL backend; never ran on Vercel
    rmdir /s /q api           rem old serverless endpoints; /api/health currently
                              rem answers 200 on the live site, breaking the
                              rem "api returns 404" checklist item in TESTING.md
    git rm --cached package-lock.json   rem Bun-only project; already .gitignored
    del package-lock.json               rem but still TRACKED, so untrack it first
Your local licensed .ttf backups (incl. the paid Yuruka) stay where they are:
.gitignore now blocks vendor/fonts/*.ttf|*.otf, so they can never leak into
the public repo. The site no longer needs any of them.

## 3. Commit + push
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
If you re-import the (now public) repo as a NEW project instead: choose
Framework Preset = Other and leave Output Directory EMPTY in the wizard.
Do not type "public" - that instruction belonged to an ancient layout.

## 5. Verify locally before pushing
    bun install
    bun run check      rem 0 errors / 0 warnings
    bun run test       rem 207/207 assertions
    serve the folder over http and look: headings/buttons/labels in
    G8321 Bold, body copy in Lilita One; Network tab shows
    g8321-700.woff2 (~15 KB) + lilita-one-400.woff2 (~10 KB), no 404s.
