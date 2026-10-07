# Fonts

One family for the whole site: **G8321** by Coji Morishita — SIL OFL 1.1.
Three weights are committed here as `.woff2` (see `OFL-G8321.txt`) and declared
in `css/fonts.css`; they render identically on every host — local, Vercel,
GitHub Pages:

| File | Family | Used for | Licence |
|---|---|---|---|
| `g8321-100.woff2` | **G8321 Thin** | oversized display numerals (quiz grade, topic-card watermark, progress ring %, home stat strip) | SIL OFL 1.1 — © Coji Morishita |
| `g8321-400.woff2` | **G8321 Regular** | body copy, prose, labels — the site default | SIL OFL 1.1 — © Coji Morishita |
| `g8321-700.woff2` | **G8321 Bold** | headings, brand, buttons, nav, micro-labels | SIL OFL 1.1 — © Coji Morishita |

Titles (`fontFamily.title`) additionally lead with `fot-yuruka-std` — see the
optional licensed slot below. On machines without it, titles render G8321 Bold:
same family as the body, fully consistent everywhere.

## Optional: privately licensed faces (local machines only)

Some fonts cannot be redistributed — notably **FOT-Yuruka Std** (Fontworks),
which is a *paid* licence and must never be committed to a public repository.
This folder supports those faces locally with **zero console noise**:

1. Drop the font file here (`vendor/fonts/*.ttf` and `*.otf` are gitignored;
   `.woff2` is **not** — never commit a licensed font as woff2 either).
2. Run `bun run font:scan` — it rewrites `manifest.json`, mapping
   `fot-yuruka-*.ttf|woff2` to the family name `fot-yuruka-std`.
3. Keep the local `manifest.json` change out of the public repo:
   `git update-index --skip-worktree vendor/fonts/manifest.json`
   (undo anytime with `--no-skip-worktree`).
4. `js/common.js` reads `manifest.json`, registers each listed face through the
   `FontFace` API, and stamps `<html data-licensed-font="bundled|active|fallback">`.
   The title stack lists `fot-yuruka-std` first, so headings switch to it
   automatically — everything else stays G8321 by design.

The committed `manifest.json` ships with `"licensed": []`, so a fresh clone or
the deployed site performs no extra requests and logs nothing.

> A plain `@font-face { src: url(fot-yuruka-std.woff2) }` pointing at a
> gitignored file would 404 on every page load. The manifest + `FontFace`
> approach never issues that request unless the font is actually present.
