#!/usr/bin/env node
/* ==========================================================================
   EMC Lab - register OPTIONAL licensed font cuts in vendor/fonts/manifest.json
   File: tools/add-font.mjs         run:  bun run font:scan

   The site's own fonts (G8321 Bold + Lilita One, both SIL OFL) are committed
   woff2 files declared in css/fonts.css - they never go through the manifest.
   This scanner is only for PRIVATELY licensed faces you may not redistribute;
   they stay on your machine (.gitignore blocks vendor/fonts/*.ttf|otf):
     fot-yuruka-*.ttf/.woff2 -> family 'fot-yuruka-std'
         weight is read from the name: Thin 100, Light 300, Regular 400,
         Medium 500, SemiBold 600, Bold 700, ExtraBold 800, Black 900
     everything else         -> ignored (edit familyOf() to add a mapping)
   js/common.js registers each manifest entry through the FontFace API at
   boot; families that are absent simply fall back - never a 404, no errors.
   To actually SEE a registered face, put its family first in the matching
   stack in tailwind.config.js, then run: bun run build:css
   ========================================================================== */
import { readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const WEIGHTS = [
  ['thin', 100], ['extralight', 200], ['light', 300], ['regular', 400],
  ['medium', 500], ['semibold', 600], ['bold', 700], ['extrabold', 800],
  ['black', 900], ['heavy', 900]
];
function familyOf(file) {
  const f = file.toLowerCase();
  if (f.includes('yuruka')) return 'fot-yuruka-std';
  return null;   // committed OFL faces + unknown files: ignored on purpose
}
function weightOf(file) {
  const f = file.toLowerCase().replace(/\.(ttf|woff2|otf)$/, '');
  // match longest token first so "extrabold" wins over "bold"
  const hit = WEIGHTS.filter(([t]) => f.includes(t)).sort((a, b) => b[0].length - a[0].length)[0];
  if (hit) return hit[1];
  return 400;
}

const dir = join(dirname(new URL(import.meta.url).pathname), '..', 'vendor', 'fonts');
const cuts = readdirSync(dir)
  .filter(f => /\.(ttf|woff2|otf)$/i.test(f))
  .map(f => ({ family: familyOf(f), file: f, weight: weightOf(f), size: statSync(join(dir, f)).size }))
  .filter(e => e.family);
// All alternates for one family+weight are kept (e.g. a subset woff2 AND the
// full ttf): the loader registers the first entry that actually loads.
const licensed = cuts
  .map(({ family, file, weight }) => ({ family, file, weight }))
  .sort((a, b) => {
    const k = (a.family + a.weight).localeCompare(b.family + b.weight);
    return k !== 0 ? k : (a.file.endsWith('.woff2') ? -1 : 1);   // woff2 first
  });

writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ licensed }, null, 2) + '\n');
if (licensed.length) {
  console.log(`registered ${licensed.length} licensed face(s):`);
  licensed.forEach(l => console.log(`   ${l.family} ${l.weight}  <-  ${l.file}`));
  console.log('note: put the family first in a tailwind.config.js stack to use it, then bun run build:css');
} else {
  console.log('no licensed cuts in vendor/fonts/ - manifest cleared.');
  console.log('the site uses its committed OFL face: G8321 (Thin numerals / Regular body / Bold headings+UI).');
}
console.log('reminder: *.ttf/*.otf stay local (.gitignore); only manifest.json is committed.');
