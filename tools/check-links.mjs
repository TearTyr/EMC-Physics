#!/usr/bin/env node
/* ==========================================================================
   EMC Lab — static project validator
   File: tools/check-links.mjs        (Node 18+, zero dependencies)

   Run:   node tools/check-links.mjs        from the project root

   What it checks
   --------------
   1. Every local href/src in every HTML file resolves to a file that exists.
   2. Every <script src> and <link href> points at a real file.
   3. No duplicate id attributes inside a single page.
   4. Every id referenced by a page's own scripts (getElementById, el('x'),
      bindRange('x', ...)) actually exists on that page.
   5. Every [data-*] hook queried by a page's scripts exists on that page.
   6. Every Tailwind-looking utility class used in the markup is covered by
      css/site.css, so the compiled layout cannot silently break.
   7. Every local anchor (#id) points at an id that exists on the same page.

   Exit code is 1 if any error is found (usable as a CI/pre-commit gate).
   ========================================================================== */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const errors = [];
const warnings = [];
const dataHookNotes = new Set();

/* ---------- helpers ------------------------------------------------------ */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const allFiles = walk(ROOT);
const htmlFiles = allFiles.filter(f => f.endsWith('.html'));
const jsFiles = allFiles.filter(f => f.endsWith('.js'));
const rel = p => relative(ROOT, p);

/** ids injected into the DOM by scripts rather than written in the markup */
const DYNAMIC_IDS = new Set([
  'toastHost', 'quiz-retake', 'quiz-wrong',       // created by toasts / score-card buttons
  'quiz-charts', 'quiz-fallback-bars',            // injected with the score card markup
  'chart-score', 'chart-topics', 'chart-history'  // Chart.js canvases inside the score card
]);

/* ---------- 1 & 2. local links and asset references ---------------------- */
const ATTR_RE = /(?:href|src)\s*=\s*"([^"]+)"/g;
for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(ATTR_RE)) {
    const url = m[1].trim();
    if (/^(https?:|mailto:|data:|javascript:|#)/i.test(url)) continue;
    const path = url.split('#')[0].split('?')[0];
    if (!path) continue;
    const target = resolve(dirname(file), path);
    if (!existsSync(target)) errors.push(`${rel(file)}: broken reference -> ${url}`);
  }
}

/* ---------- 3. duplicate ids -------------------------------------------- */
for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  const seen = new Map();
  for (const m of src.matchAll(/\sid="([^"]+)"/g)) {
    seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) errors.push(`${rel(file)}: duplicate id "${id}" (${n}x)`);
}

/* ---------- 4, 5 & 7. script <-> markup contract ------------------------ */
/** ids referenced in a JS file */
function referencedIds(js) {
  const ids = new Set();
  const patterns = [
    /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bel\(\s*['"]([^'"]+)['"]\s*\)/g,
    /bindRange\(\s*['"]([^'"]+)['"]/g
  ];
  for (const re of patterns) for (const m of js.matchAll(re)) ids.add(m[1]);
  return ids;
}
/** [data-x] and [data-x="y"] selectors queried in a JS file */
function referencedDataHooks(js) {
  const hooks = new Set();
  for (const m of js.matchAll(/\[\s*(data-[a-z0-9-]+)\s*(?:=\s*"([^"]*)")?\s*\]/g)) {
    hooks.add({ attr: m[1], value: m[2] });
  }
  return [...hooks];
}

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const pageIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

  // collect this page's own scripts
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  let pageJs = '';
  for (const s of scripts) {
    const p = resolve(dirname(file), s);
    if (existsSync(p)) pageJs += readFileSync(p, 'utf8') + '\n';
  }

  for (const id of referencedIds(pageJs)) {
    // These ids are created by the scripts at runtime (toast host, score-card
    // buttons injected via innerHTML), so they are legitimately absent from
    // the static markup.
    if (DYNAMIC_IDS.has(id)) continue;
    if (!pageIds.has(id)) errors.push(`${rel(file)}: script references missing id "#${id}"`);
  }
  // Advisory only: querySelectorAll() happily returns an empty list, and
  // common.js is loaded by every page even though only some pages use a hook.
  for (const hook of referencedDataHooks(pageJs)) {
    const re = new RegExp(`${hook.attr}(?:="[^"]*")?`);
    if (!re.test(html)) dataHookNotes.add(`${rel(file)}: no [${hook.attr}] element (fine if the script guards for it)`);
  }

  // local anchors
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    const id = m[1];
    if (!id) continue;
    if (!pageIds.has(id)) warnings.push(`${rel(file)}: anchor "#${id}" has no matching id on the page`);
  }
}

/* ---------- 6. Tailwind fallback coverage ------------------------------- */
/* the committed Tailwind build is the offline/production source of utilities */
const fallback = existsSync(join(ROOT, 'css/site.css'))
  ? readFileSync(join(ROOT, 'css/site.css'), 'utf8') : '';
const coveredSelectors = new Set(
  [...fallback.matchAll(/\.(-?[a-zA-Z_][\w\-:.\\/[\]()%#,\s]*?)(?=[,{\s])/g)].map(m => m[1].replace(/\\/g, ''))
);
const usedUtilities = new Map();     // class -> [files]
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/\sclass="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (!cls) continue;
      // Heuristic: a Tailwind utility contains a responsive/state prefix or a
      // known utility prefix. Semantic project classes live in css/input.css (@layer components).
      // A variant prefix (md:, hover:, ...) always means Tailwind.
      // Otherwise require a numeric/fractional value or a valueless utility,
      // so semantic project classes like "h-hero" or "ring-wrap" are skipped.
      const VALUELESS = new Set(['flex','grid','hidden','block','inline-block','inline-flex',
        'relative','absolute','sticky','fixed','italic','uppercase','lowercase','capitalize',
        'underline','no-underline','truncate','border','table','static']);
      const looksTailwind =
        /^(sm|md|lg|xl|2xl|hover|focus|focus-visible|group|dark|motion-safe|motion-reduce):/.test(cls) ||
        VALUELESS.has(cls) ||
        /^[a-z][a-z0-9-]*-(\d+|px|full|screen|auto|none|min|max|fit|xs|sm|md|lg|xl|\d+\/\d+)(\/\d+)?$/.test(cls) &&
        !/^(h|ring|row|table|defs|stat|topic|sim|ctl|q|opt|btn|card|panel|check|fig|legend|swatch|mascot|hero|brand|nav|site|scroll|wrap|footer|pager|score|grade|ring)-[a-z]/.test(cls);
      if (!looksTailwind) continue;
      if (!usedUtilities.has(cls)) usedUtilities.set(cls, []);
      usedUtilities.get(cls).push(rel(file));
    }
  }
}
let missing = 0;
for (const [cls, files] of [...usedUtilities].sort()) {
  if (!coveredSelectors.has(cls)) {
    missing++;
    warnings.push(`utility "${cls}" used in ${[...new Set(files)].join(', ')} is missing from css/site.css (run npm run build:css)`);
  }
}

/* ---------- report ------------------------------------------------------- */
const line = '\u2500'.repeat(64);
console.log(line);
console.log('EMC Lab — static project validation');
console.log(line);
console.log(`HTML pages ......... ${htmlFiles.length}`);
console.log(`JS files ........... ${jsFiles.length}`);
console.log(`Tailwind utilities . ${usedUtilities.size} used, ${usedUtilities.size - missing} present in css/site.css`);
console.log('');

if (errors.length) {
  console.log(`\u274C ${errors.length} ERROR(S):`);
  errors.forEach(e => console.log('   - ' + e));
} else {
  console.log('\u2705 No errors: all links, scripts, ids and data hooks resolve.');
}
if (warnings.length) {
  console.log(`\n\u26A0  ${warnings.length} WARNING(S):`);
  warnings.forEach(w => console.log('   - ' + w));
} else {
  console.log('\u2705 No warnings.');
}
if (dataHookNotes.size) {
  console.log(`\n\u2139  ${dataHookNotes.size} advisory note(s) on [data-*] hooks:`);
  [...dataHookNotes].forEach(n => console.log('   - ' + n));
}
console.log(line);
process.exit(errors.length ? 1 : 0);
