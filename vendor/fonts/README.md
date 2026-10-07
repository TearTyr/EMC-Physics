# vendor/fonts — your licensed FOT-Yuruka Std goes here

1. Copy your file into **this folder** with this exact name:
   `fot-yuruka-std.ttf`
2. Open `css/styles.css`, scroll to the very bottom — the big banner that
   says **"YOUR FONT GOES HERE"** — and uncomment the `@font-face` block.
3. Reload the site. Headings and body text now render in Yuruka everywhere.

## Licensing note
FOT-Yuruka Std is a commercial Fontworks face. If your licence does not allow
redistribution, **do not push the .ttf to a public repository** (add
`vendor/fonts/*.ttf` to `.gitignore` before committing). The website is built
to degrade gracefully: on any machine without the file, the free rounded
fallbacks (Mochiy Pop One / M PLUS Rounded 1c / system maru gothic) render
instead, so sharing the repo without the font is always safe — and your
Vercel deploy will simply use the fallbacks unless you deploy the font too.

## Optional Bold cut
If you also own `FOT-Yuruka Std Bold`, save it as `fot-yuruka-std-bold.ttf`
here and uncomment the second `@font-face` block in `css/styles.css`.
Without it, the browser synthesises bold from the Regular face, which looks
fine in this design.
