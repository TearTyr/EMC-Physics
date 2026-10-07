#!/usr/bin/env node
/* ==========================================================================
   EMC Lab - performance audit (dev tool, needs puppeteer installed anywhere)
   File: tools/perf-audit.mjs     run:  node tools/perf-audit.mjs [baseUrl]

   Serves the project (python3 http.server) or uses your URL, then asserts the
   project's performance budgets on every page:
     * zero render-blocking scripts (everything is defer)
     * local transfer (excluding font payloads) under 500 KB per page
     * raw-TTF font payload under 500 KB (convert big TTFs to woff2 instead)
   Prints a per-page table of transfer, DOMContentLoaded and font bytes.
   ========================================================================== */
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const PAGES = ['index.html', 'topics/charges.html', 'topics/current.html',
  'topics/magnetism.html', 'topics/induction.html', 'quiz.html'];

import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.json': 'application/json', '.md': 'text/markdown', '.sql': 'text/plain' };

/* gzip like a real host (Vercel serves brotli), so transfer numbers are honest */
function serve(port) {
  return http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    let f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f += '.html';
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    const raw = fs.readFileSync(f);
    const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
    if (/gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|svg/.test(type)) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip' });
      return res.end(zlib.gzipSync(raw, { level: 6 }));
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(raw);
  }).listen(port);
}

let base = process.argv[2];
let server = null;
if (!base) {
  server = serve(8241);
  base = 'http://127.0.0.1:8241';
  await new Promise(r => setTimeout(r, 600));
}

let puppeteer;
try { puppeteer = (await import('puppeteer')).default; }
catch { try { puppeteer = (await import('/tmp/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js')).default; }
        catch { console.log('puppeteer not found - install it to run the audit'); server?.close(); process.exit(0); } }

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 120000,
  timeout: 90000,
  dumpio: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
         '--single-process', '--no-zygote', '--disable-background-networking']
});
async function newPage() {
  for (let i = 0; i < 3; i++) {
    try { return await browser.newPage(); }
    catch (e) { await new Promise(r => setTimeout(r, 1500)); }
  }
  throw new Error('could not open a page');
}
const fails = [];
console.log('\npage                      transfer   fonts    DCL     blocking-scripts');
console.log('─'.repeat(72));
for (const path of PAGES) {
  const page = await newPage();
  await page.setCacheEnabled(false);   // honest per-page transfer numbers
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${base}/${path}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const m = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const fonts = res.filter(r => r.initiatorType === 'font' || /\.(woff2?|ttf|otf)$/.test(r.name));
    const fontBytes = fonts.reduce((a, r) => a + (r.transferSize || 0), 0);
    const ttf = fonts.filter(f => /\.ttf($|\?)/i.test(f.name)).reduce((a, r) => a + (r.transferSize || 0), 0);
    const total = res.reduce((a, r) => a + (r.transferSize || 0), 0);
    const blocking = [...document.querySelectorAll('script[src]')].filter(s => !s.defer && !s.async).length;
    const nav = performance.getEntriesByType('navigation')[0];
    return { total, fontBytes, ttf, blocking, dcl: Math.round(nav ? nav.domContentLoadedEventEnd : 0) };
  });
  const kb = n => (n / 1024).toFixed(0).padStart(6) + 'K';
  console.log(`${path.padEnd(24)} ${kb(m.total)}  ${kb(m.fontBytes)}  ${(m.dcl + 'ms').padStart(6)}  ${m.blocking}`);
  if (m.blocking > 0) fails.push(`${path}: ${m.blocking} render-blocking script(s)`);
  if (m.total - m.fontBytes > 500 * 1024) fails.push(`${path}: non-font transfer ${((m.total - m.fontBytes) / 1024).toFixed(0)} KB > 500 KB budget`);
  if (m.ttf > 500 * 1024) fails.push(`${path}: raw TTF payload ${(m.ttf / 1024).toFixed(0)} KB - convert to woff2 (pip install fonttools brotli)`);
  await page.close();
}
await browser.close();
server?.close();
console.log('─'.repeat(72));
if (fails.length) { console.log('❌ BUDGET FAILURES:'); fails.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log('✅ all performance budgets met');
