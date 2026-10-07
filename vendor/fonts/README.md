# vendor/fonts

## The site's fonts — committed, OFL, identical on every host
| file | family | role | licence |
|---|---|---|---|
| `g8321-700.woff2` | **G8321 Bold** | titles, headings, brand, UI labels/buttons | SIL OFL 1.1 — Coji Morishita (full text: `OFL-G8321.txt`) |
| `lilita-one-400.woff2` | **Lilita One** | body copy | SIL OFL 1.1 — Juan Pablo del Peral / Huerta Tipográfica |
| `m-plus-rounded-1c-700.woff2`, `m-plus-rounded-1c-800.woff2` | M PLUS Rounded 1c | last-resort fallback behind G8321 | SIL OFL 1.1 — M+ FONTS PROJECT |

They are declared in `css/fonts.css` and lead the stacks in `tailwind.config.js`
(`title`/`ui` → G8321, `sans` → Lilita One), so local dev, Vercel and a
friend's laptop all render the exact same type. Total payload ≈ 71 KB.
G8321 source: https://github.com/coz-m/G8321_FONTS (official webfont build).

Because both faces are freely redistributable, nothing here depends on a
private licence any more — the old paid FOT-Yuruka Std slot is unused.

## Optional slot for privately licensed faces
Bought a font you may **not** redistribute? It can still style the site
**on your machine only**:
1. Drop the `.ttf` here — `.gitignore` keeps `vendor/fonts/*.ttf|*.otf` out
   of the repo, so a paid face can never leak into a public push.
2. `bun run font:scan` — rewrites `manifest.json` (recognises `fot-yuruka-*`;
   teach it other names in `tools/add-font.mjs → familyOf()`).
3. Put the family first in the stack you want it on (`tailwind.config.js`),
   then `bun run build:css` and commit the config + `manifest.json`.

`js/common.js` registers every manifest entry through the FontFace API at
boot and logs `[EMC] licensed font active: …`; `<html>` gets
`data-licensed-font="active"`. Visitors without the file silently see the
committed OFL faces above — never a 404, never an error.

## Notes
- Serve the folder over http when testing (e.g. `bunx serve`) — Chrome
  blocks custom fonts on `file://`.
- Keep woff2 files small: convert any big TTF with
  `pip install fonttools brotli`, then `TTFont(...).flavor = 'woff2'`.
