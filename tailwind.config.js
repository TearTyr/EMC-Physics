/* Tailwind config — single source for screens, fonts and content scanning.
   screens match the component layer exactly: 640 / 900 / 1200.
   fontFamily mirrors the two-font type system (both committed OFL woff2,
   declared in css/fonts.css — they render identically on every host):
     title -> G8321 Bold 700          [headings, brand, strong text]
     sans  -> LilitaOne-Regular 400   [body copy]
     ui    -> G8321 Bold 700          [buttons, labels, chips]
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
        // this array raw, and an unquoted `M PLUS Rounded 1c` is an invalid
        // declaration (ident can't start with a digit) that browsers DROP.
        title: ['G8321', '"M PLUS Rounded 1c"', '"Hiragino Maru Gothic ProN"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        sans:  ['LilitaOne-Regular', '"Lilita One"', '"M PLUS Rounded 1c"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        ui:    ['G8321', '"M PLUS Rounded 1c"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono:  ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace']
      }
    }
  }
};
