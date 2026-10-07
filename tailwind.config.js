/* Tailwind build config — the compiled output (css/site.css) is committed, so
   no build step is needed to deploy; `npm run build:css` regenerates it.
   content scans markup + the one script that injects utility classes
   (js/quiz.js); blocklist stops ordinary prose words that happen to match
   utility names from being generated. Screens match styles.css: 640/900/1200. */
export default {
  content: {
    files: ['./*.html', './topics/*.html', './js/quiz.js'],
    blocklist: ['container', 'collapse', 'resize', 'filter', 'transform',
                'table', 'ring', 'summary', 'content', 'order', 'grow', 'shrink']
  },
  theme: {
    screens: { sm: '640px', md: '900px', lg: '1200px' }
  }
};
