# vendor/fonts

## Self-hosted open fonts (already here, committed)
mochiy-pop-one-400.woff2 and m-plus-rounded-1c-{400,700,800}.woff2 are SIL Open
Font License faces downloaded from Google Fonts and served locally, so the
cute maru-gothic look works on every host with no CDN.

## Your licensed faces: FOT-Yuruka Std + Lilita One
Recognised file names (any case):
  * G8321-*.ttf or fot-yuruka-*.ttf  -> family "FOT-Yuruka Std"
      weight is read from the name: Thin 100, Light 300, Regular 400,
      Medium 500, SemiBold 600, Bold 700, ExtraBold 800, Black 900
  * LilitaOne-*.ttf                  -> family "Lilita One" (display face)
  * anything else                    -> ignored (open faces stay in charge)

Steps:
1. Drop the .ttf files into THIS folder.
2. npm run font:scan        (rewrites manifest.json; duplicates at the same
                            family+weight are resolved in favour of the
                            larger, more complete file)
3. git add vendor/fonts && git commit -m "fonts" && git push

js/common.js registers every manifest entry through the FontFace API at boot;
the console prints one info line per activated face. Roles: Lilita One on the
hero/topic titles and score grade, FOT-Yuruka Std on headings/body/buttons,
M PLUS Rounded 1c on small labels. Locally, test over http - Chrome blocks
custom fonts on file://.

If the file is absent (or a clone lacks it), the site silently falls back to
the open fonts above - there is never a broken state or a console error.

Licensing: only push the .ttf if your Fontworks licence permits redistribution
(private repo / classroom Vercel is usually fine; public repos check first).
