#!/usr/bin/env node
/**
 * tools/build-public.mjs — assemble the Vercel output directory (public/).
 *
 * Why this exists
 * ---------------
 * The Vercel project has Output Directory = "public" stored in the dashboard.
 * vercel.json now pins "outputDirectory": "public" too (per Vercel's docs the
 * vercel.json value overrides the dashboard setting), and this script makes
 * that promise true: after `bun run build` a fresh public/ folder contains the
 * complete static site, so the build can never fail with
 * "No Output Directory named 'public' found after the Build completed".
 *
 * What it does
 * ------------
 *  1. deletes any previous public/ (always a clean rebuild),
 *  2. copies the runtime allow-list into it:
 *       index.html, quiz.html, topics/, css/, js/, vendor/
 *       + the three docs the pages link to (README/TESTING/PRESENTATION-NOTES),
 *  3. prunes dev-only files that ride inside copied dirs (css/input.css, .gitkeep),
 *  4. verifies every required asset exists AND every local href/src in every
 *     copied .html resolves inside public/ — a broken deploy fails the build
 *     here instead of shipping a broken site,
 *  5. prints a size/file-count summary. Exit 0 = deployable, 1 = broken.
 *
 * public/ is gitignored: it is a build artifact, never committed.
 * Run it via `bun run build:public` (or `bun run build` = build:css + this).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'public');

/* ------------------------------------------------------------------ config */

// Single files copied from the repo root (pages + the docs they link to).
const COPY_FILES = [
  'index.html',
  'quiz.html',
  'README.md',
  'TESTING.md',
  'PRESENTATION-NOTES.md',
];

// Whole directories copied recursively.
const COPY_DIRS = ['topics', 'css', 'js', 'vendor'];

// Dev-only files that live inside copied dirs but must not ship.
const PRUNE = ['css/input.css', 'vendor/fonts/.gitkeep'];

// Assets that MUST exist in public/ afterwards (fail the build otherwise).
const MUST_EXIST = [
  'index.html',
  'quiz.html',
  'css/site.css',
  'css/fonts.css',
  'js/common.js',
  'js/quiz.js',
  'topics/charges.html',
  'topics/current.html',
  'topics/magnetism.html',
  'topics/induction.html',
  'vendor/katex/katex.min.js',
  'vendor/katex/katex.min.css',
  'vendor/fonts/g8321-100.woff2',
  'vendor/fonts/g8321-400.woff2',
  'vendor/fonts/g8321-700.woff2',
  'vendor/fonts/manifest.json',
];

/* ------------------------------------------------------------------- steps */

const errors = [];

// 1. clean slate -------------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 2. copy ---------------------------------------------------------------------
for (const rel of COPY_FILES) {
  const src = join(repoRoot, rel);
  if (!existsSync(src)) {
    errors.push(`missing source file: ${rel}`);
    continue;
  }
  cpSync(src, join(outDir, rel));
}
for (const rel of COPY_DIRS) {
  const src = join(repoRoot, rel);
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    errors.push(`missing source directory: ${rel}/`);
    continue;
  }
  cpSync(src, join(outDir, rel), { recursive: true });
}

// 3. prune dev-only riders ------------------------------------------------------
for (const rel of PRUNE) {
  rmSync(join(outDir, rel), { force: true });
}

// 4a. required assets -----------------------------------------------------------
for (const rel of MUST_EXIST) {
  if (!existsSync(join(outDir, rel))) errors.push(`required asset missing in public/: ${rel}`);
}

// 4b. every local link inside every copied page must resolve in public/ ---------
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const REF_RE = /(?:href|src)\s*=\s*"([^"]+)"/gi;
let pages = 0;
let refs = 0;
for (const file of walk(outDir)) {
  if (!file.toLowerCase().endsWith('.html')) continue;
  pages++;
  const html = readFileSync(file, 'utf8');
  const pageDir = dirname(file);
  for (const m of html.matchAll(REF_RE)) {
    let ref = m[1].trim();
    if (/^(https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref)) continue; // external / inline / fragment
    refs++;
    ref = ref.split('#')[0].split('?')[0];
    if (!ref) continue; // pure fragment after stripping
    const target = ref.startsWith('/')
      ? join(outDir, normalize(ref))                       // root-absolute
      : resolve(pageDir, normalize(ref));                  // relative to the page
    if (!existsSync(target)) {
      errors.push(`broken reference in public/${file.slice(outDir.length + 1).split(sep).join('/')}: "${m[1]}"`);
    }
  }
}

// 5. report ----------------------------------------------------------------------
let files = 0;
let bytes = 0;
for (const f of walk(outDir)) {
  files++;
  bytes += statSync(f).size;
}

const kb = (n) => `${(n / 1024).toFixed(n < 1024 * 1024 ? 1 : 0)} KB`;
console.log(`build:public -> public/  (${files} files, ${kb(bytes)}, ${pages} pages checked, ${refs} local refs verified)`);

if (errors.length) {
  console.error(`\nbuild:public FAILED with ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('build:public OK — output directory is deployable.');
