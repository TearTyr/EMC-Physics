/* Tailwind config — single source for screens, fonts and content scanning.
   screens match the component layer exactly: 640 / 900 / 1200.
   fontFamily: ONE family for the whole site — G8321 by Coji Morishita
   (SIL OFL 1.1), committed woff2 in 100 / 400 / 700, declared in css/fonts.css:
     title -> 'fot-yuruka-std' (private, local machines only) -> G8321
     sans  -> G8321 Regular 400 (body copy, labels)
     ui    -> G8321 (bold micro-labels / thin display numerals)
   On the public deploy titles fall back to G8321 Bold, so every host sees
   the same family throughout.
   blocklist protects hand-written component class names from being
   shadowed by generated utilities (it is a TOP-LEVEL option — inside
   `content` it is invalid and triggers the purge/content warning).    */
export default {
  content: ['./*.html', './topics/*.html', './js/quiz.js'],
  blocklist: ['container', 'collapse', 'resize', 'filter', 'transform',
              'table', 'ring', 'summary', 'content', 'order', 'grow', 'shrink'],
  theme: {
    screens: { sm: '640px', md: '900px', lg: '1200px' },
    extend: {
      fontFamily: {
        // multi-word family names MUST carry their own quotes: Tailwind joins
        // this array raw, and an unquoted multi-word ident with digits or
        // spaces is an invalid declaration that browsers DROP.
        title: ['fot-yuruka-std', 'G8321', '"Hiragino Maru Gothic ProN"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans:  ['G8321', '"Hiragino Maru Gothic ProN"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        ui:    ['G8321', '"Hiragino Maru Gothic ProN"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono:  ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace']
      }
    }
  }
};
