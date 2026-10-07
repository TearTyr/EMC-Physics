#!/usr/bin/env node
/* ==========================================================================
   EMC Lab — optional sync-server test
   File: tools/server-test.mjs

   Boots server/index.js on a spare port with the zero-config JSON driver
   (no MySQL needed) and exercises the API contract the client relies on:

     * GET  /api/health          -> 200 { ok, driver }
     * PUT  /api/progress/:id    -> 200, server-side merge
     * GET  /api/progress/:id    -> 200 with the merged record
     * GET  unknown id           -> 404
     * PUT/GET malformed id      -> 400

   Run:  npm run test:server      (needs: npm install)
   ========================================================================== */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { rm } from 'node:fs/promises';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const PORT = 8199;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0; const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`   \u2713 ${name}`); }
  else { fails.push(name); console.log(`   \u2717 ${name} ${extra}`); }
};

// start with a clean JSON store so results are reproducible
await rm(resolve(ROOT, 'server/data/progress.json'), { force: true });

// `node tools/server-test.mjs bun` exercises the Bun server instead of Node
const useBun = process.argv[2] === 'bun';
const child = spawn(useBun ? 'bun' : process.execPath,
  [resolve(ROOT, useBun ? 'server/bun-server.js' : 'server/index.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
child.stderr.on('data', d => process.stderr.write(d));

const waitReady = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return r.json();
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server did not become ready');
};

try {
  const health = await waitReady();
  console.log('\n\u2500'.repeat(60));
  console.log(`EMC Lab — sync server test (runtime: ${health.runtime || 'node'}, driver: ${health.driver})`);
  console.log('\u2500'.repeat(60));
  ok('health endpoint reports ok', health.ok === true);

  const id = 'test-user-1';
  const put = async body => fetch(`${BASE}/api/progress/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });

  // first device: studied topic 1, scored 60%
  let r = await put({ topics: { charges: true }, quizBest: 60, quizAttempts: 1, quizLast: 60,
    quizHistory: [{ pct: 60, at: '2026-01-01T10:00:00Z' }] });
  ok('PUT creates a record', r.status === 200);
  let rec = (await r.json()).payload;
  ok('record echoes the score', rec.quizBest === 60);

  // second device: worse score but a new topic and a new attempt
  r = await put({ topics: { current: true }, quizBest: 40, quizAttempts: 2, quizLast: 40,
    quizHistory: [{ pct: 40, at: '2026-01-02T10:00:00Z' }] });
  rec = (await r.json()).payload;
  ok('quizBest keeps the maximum (60, not 40)', rec.quizBest === 60);
  ok('topics are unioned', rec.topics.charges === true && rec.topics.current === true);
  ok('attempts keep the maximum', rec.quizAttempts === 2);
  ok('histories concatenate in order', rec.quizHistory.length === 2 && rec.quizHistory[1].pct === 40);

  // GET returns the same merged record
  r = await fetch(`${BASE}/api/progress/${id}`);
  ok('GET returns 200 for a known id', r.status === 200);
  ok('GET payload matches', (await r.json()).payload.quizBest === 60);

  // unknown id -> 404, malformed id -> 400
  r = await fetch(`${BASE}/api/progress/nobody-here`);
  ok('unknown id -> 404', r.status === 404);
  r = await fetch(`${BASE}/api/progress/..%2Fetc`);   // encoded, so it reaches the route
  ok('path-traversal id rejected -> 400', r.status === 400);
  r = await put({ quizBest: 999 });
  rec = (await r.json()).payload;
  ok('out-of-range scores are clamped to 100', rec.quizBest === 100);
  r = await put('not json object');
  ok('malformed body -> 400', r.status === 400);

  // the server also hosts the site
  r = await fetch(BASE + '/index.html');
  ok('server hosts the website', r.status === 200 && (await r.text()).includes('EMC Lab'));

  console.log('\u2500'.repeat(60));
  console.log(fails.length ? `\u274C ${fails.length} failed` : `\u2705 All ${pass} server assertions passed.`);
  console.log('\u2500'.repeat(60));
} catch (e) {
  console.error('server test error:', e.message);
  fails.push(e.message);
} finally {
  child.kill('SIGTERM');
}
process.exit(fails.length ? 1 : 0);
