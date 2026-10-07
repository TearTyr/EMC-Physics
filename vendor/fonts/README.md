# vendor/fonts

## Self-hosted open fonts (already here, committed)
mochiy-pop-one-400.woff2 and m-plus-rounded-1c-{400,700,800}.woff2 are SIL Open
Font License faces downloaded from Google Fonts and served locally, so the
cute maru-gothic look works on every host with no CDN.

## Your licensed face: FOT-Yuruka Std
1. Copy your file into THIS folder as exactly:  fot-yuruka-std.ttf
   (optional Bold cut:                            fot-yuruka-std-bold.ttf)
2. Commit and push it:
       git add vendor/fonts/fot-yuruka-std.ttf && git commit -m "add licensed Yuruka" && git push
3. Done. js/common.js probes for the file at boot and, when present, makes it
   the primary face on every page via the FontFace API. No CSS editing needed.

If the file is absent (or a clone lacks it), the site silently falls back to
the open fonts above - there is never a broken state or a console error.

Licensing: only push the .ttf if your Fontworks licence permits redistribution
(private repo / classroom Vercel is usually fine; public repos check first).
