#!/usr/bin/env node
/* ==========================================================================
   EMC Lab — swap the Tailwind delivery mode across all six pages
       node tools/switch-css.mjs cdn     (default; assignment requirement)
       node tools/switch-css.mjs built   (use css/tailwind.generated.css)

   CDN mode   : <script src="https://cdn.tailwindcss.com"> + inline config,
                plus css/tailwind-fallback.css for offline rendering.
   Built mode : no CDN at all; css/tailwind.generated.css (npm run build:css)
                carries the compiled utilities AND Preflight, so the offline
                fallback sheet is no longer needed.
   Idempotent: running the same mode twice changes nothing.
   ========================================================================== */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2];
if (mode !== 'cdn' && mode !== 'built') {
  console.error('usage: node tools/switch-css.mjs [cdn|built]');
  process.exit(1);
}
if (mode === 'built' && !existsSync(join(ROOT, 'css/tailwind.generated.css'))) {
  console.error('css/tailwind.generated.css missing — run `npm run build:css` first.');
  process.exit(1);
}

const PAGES = ['index.html', 'quiz.html', 'topics/charges.html', 'topics/current.html',
  'topics/magnetism.html', 'topics/induction.html'];

const CDN_BLOCK = / *<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\n(?: *<script>[\s\S]*?<\/script>\n)?/;

let changed = 0;
for (const page of PAGES) {
  const file = join(ROOT, page);
  const pre = page.startsWith('topics/') ? '../' : '';
  let s = readFileSync(file, 'utf8');
  const before = s;

  if (mode === 'built') {
    s = s.replace(CDN_BLOCK, '');
    s = s.replace(`<link rel="stylesheet" href="${pre}css/tailwind-fallback.css">`,
                  `<link rel="stylesheet" href="${pre}css/tailwind.generated.css">`);
  } else {
    if (!/cdn\.tailwindcss\.com/.test(s)) {
      const cfg = `  <script src="https://cdn.tailwindcss.com"></script>\n` +
        `  <script>if (window.tailwind) { tailwind.config = { theme: { extend: { colors: { brand: { DEFAULT: '#22d3ee', deep: '#0e1a2e', line: '#1e2f4d' } } } } }; }</script>\n`;
      s = s.replace(`  <link rel="stylesheet" href="${pre}css/styles.css">`,
                    cfg + `  <link rel="stylesheet" href="${pre}css/styles.css">`);
    }
    s = s.replace(`<link rel="stylesheet" href="${pre}css/tailwind.generated.css">`,
                  `<link rel="stylesheet" href="${pre}css/tailwind-fallback.css">`);
  }

  if (s !== before) { writeFileSync(file, s); changed++; console.log('switched', page); }
}
console.log(changed ? `${changed} page(s) now use the ${mode} Tailwind path.`
                   : `all pages already on the ${mode} path.`);
