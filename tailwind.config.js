/* Tailwind config — single source for screens, fonts and content scanning.
   screens match the component layer exactly: 640 / 900 / 1200.
   fontFamily mirrors the specified type system:
     title -> fot-yuruka-std (licensed TTF via manifest)   [bold/titles]
     sans  -> LilitaOne-Regular (your TTF, woff2 fallback) [normal text]
     ui    -> G8321 (your Yuruka weight family)            [UI, labels]      */
export default {
  content: {
    files: ['./*.html', './topics/*.html', './js/quiz.js'],
    blocklist: ['container', 'collapse', 'resize', 'filter', 'transform',
                'table', 'ring', 'summary', 'content', 'order', 'grow', 'shrink']
  },
  theme: {
    screens: { sm: '640px', md: '900px', lg: '1200px' },
    extend: {
      fontFamily: {
        title: ['fot-yuruka-std', 'G8321', 'Mochiy Pop One', 'Hiragino Maru Gothic ProN', 'Segoe UI', 'system-ui', 'sans-serif'],
        sans:  ['LilitaOne-Regular', 'Lilita One', 'M PLUS Rounded 1c', 'Segoe UI', 'system-ui', 'sans-serif'],
        ui:    ['G8321', 'fot-yuruka-std', 'M PLUS Rounded 1c', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono:  ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace']
      }
    }
  }
};
