#!/usr/bin/env node
/* Toggle the Tailwind Play CDN tag across all six pages.
     node tools/switch-css.mjs cdn     default: CDN tag present (assignment
                                        wording: "Tailwind via CDN"); the
                                        committed css/site.css is authoritative
     node tools/switch-css.mjs built    remove the CDN tag for production-pure
                                        deployments (no in-browser compile, no
                                        console warning); site.css stays linked
   Idempotent. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2];
if (mode !== 'cdn' && mode !== 'built') { console.error('usage: switch-css.mjs [cdn|built]'); process.exit(1); }
const PAGES = ['index.html','quiz.html','topics/charges.html','topics/current.html','topics/magnetism.html','topics/induction.html'];
const TAG = '  <script defer src="https://cdn.tailwindcss.com"></script>\n';
let changed = 0;
for (const page of PAGES) {
  const file = join(ROOT, page);
  let s = readFileSync(file, 'utf8');
  const has = s.includes(TAG);
  if (mode === 'built' && has) { s = s.replace(TAG, ''); changed++; writeFileSync(file, s); }
  if (mode === 'cdn' && !has) {
    s = s.replace('  <link rel="stylesheet"', TAG + '  <link rel="stylesheet"', 1);
    changed++; writeFileSync(file, s);
  }
}
console.log(changed ? `${changed} page(s) switched to ${mode} mode.` : `all pages already in ${mode} mode.`);
