#!/usr/bin/env node
/* ==========================================================================
   EMC Lab - register licensed font cuts in vendor/fonts/manifest.json
   File: tools/add-font.mjs         run:  npm run font:scan

   Scans vendor/fonts/ for *.ttf and maps file names to (family, weight):
     G8321-*.ttf / fot-yuruka-*  -> 'FOT-Yuruka Std'  (G8321 is Yuruka's code)
         Thin 100, Light 300, Regular 400, Medium 500, SemiBold 600,
         Bold 700, ExtraBold 800, Black 900
     LilitaOne-*                 -> 'Lilita One'     (display face, 400)
   The manifest is COMMITTED, so deployments know exactly which faces exist;
   js/common.js registers each entry through the FontFace API. Families that
   are absent simply fall back - never a 404, never an error.
   ========================================================================== */
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const WEIGHTS = [
  ['thin', 100], ['extralight', 200], ['light', 300], ['regular', 400],
  ['medium', 500], ['semibold', 600], ['bold', 700], ['extrabold', 800],
  ['black', 900], ['heavy', 900]
];
function familyOf(file) {
  const f = file.toLowerCase();
  if (f.startsWith('g8321') || f.includes('yuruka')) return 'FOT-Yuruka Std';
  if (f.includes('lilita')) return 'Lilita One';
  return null;                       // unknown ttf: ignored on purpose
}
function weightOf(file) {
  const f = file.toLowerCase().replace(/\.ttf$/, '');
  // match longest token first so "extrabold" wins over "bold"
  const hit = WEIGHTS.filter(([t]) => f.includes(t)).sort((a, b) => b[0].length - a[0].length)[0];
  if (hit) return hit[1];
  return 400;
}

const dir = join(dirname(new URL(import.meta.url).pathname), '..', 'vendor', 'fonts');
import { statSync } from 'node:fs';
const cuts = readdirSync(dir)
  .filter(f => f.toLowerCase().endsWith('.ttf'))
  .map(f => ({ family: familyOf(f), file: f, weight: weightOf(f), size: statSync(join(dir, f)).size }))
  .filter(e => e.family);
// two cuts claiming the same family+weight (e.g. fot-yuruka-std.ttf AND
// G8321-Regular.ttf): keep the LARGER file - more complete character coverage
const best = new Map();
for (const c of cuts) {
  const key = c.family + '@' + c.weight;
  if (!best.has(key) || c.size > best.get(key).size) best.set(key, c);
}
const licensed = [...best.values()]
  .map(({ family, file, weight }) => ({ family, file, weight }))
  .sort((a, b) => (a.family + a.weight).localeCompare(b.family + b.weight));

writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ licensed }, null, 2) + '\n');
if (licensed.length) {
  console.log(`registered ${licensed.length} licensed face(s):`);
  licensed.forEach(l => console.log(`   ${l.family} ${l.weight}  <-  ${l.file}`));
} else {
  console.log('no recognised .ttf files in vendor/fonts/ - manifest cleared;');
  console.log('the site will use the bundled open fonts (Mochiy Pop One / M PLUS Rounded 1c).');
}
console.log('next: git add vendor/fonts && git commit -m "fonts" && git push');
