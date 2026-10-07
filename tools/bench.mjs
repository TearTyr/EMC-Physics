#!/usr/bin/env node
/* ==========================================================================
   EMC Lab — static-serving benchmark: Node+Express vs Bun.serve
   File: tools/bench.mjs        run:  npm run bench   (needs: npm install, bun)

   Boots both server flavours on spare ports, then hammers them with the same
   mixed workload (home page, a topic page, one JS and one CSS asset) and
   reports throughput and latency percentiles.

   Honest scope: this measures SERVER throughput only. The browser executes
   identical bytes either way, so client-side performance is unchanged — the
   real browser-side wins in this project are the asset cache headers both
   servers send, and the library fallbacks that avoid blocked-CDN stalls.
   ========================================================================== */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const PATHS = ['/index.html', '/topics/induction.html', '/js/common.js', '/css/styles.css'];
const TOTAL = 1200, CONC = 30;

async function start(cmd, args, port) {
  const child = spawn(cmd, args, { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return child; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  child.kill(); throw new Error(`${cmd} did not become ready on ${port}`);
}

async function bench(base) {
  for (const p of PATHS) await fetch(base + p);            // warm-up (excluded)
  const lat = []; let next = 0;
  const t0 = performance.now();
  const worker = async () => {
    for (;;) {
      const n = next++;
      if (n >= TOTAL) return;
      const s = performance.now();
      const r = await fetch(base + PATHS[n % PATHS.length]);
      await r.arrayBuffer();
      lat.push(performance.now() - s);
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  const dt = performance.now() - t0;
  lat.sort((a, b) => a - b);
  const q = f => lat[Math.min(lat.length - 1, Math.floor(TOTAL * f))].toFixed(1);
  return { rps: Math.round(TOTAL / (dt / 1000)), p50: q(0.5), p95: q(0.95), p99: q(0.99) };
}

console.log(`\nBenchmarking ${TOTAL} requests at concurrency ${CONC} (mixed HTML/JS/CSS)…\n`);
const results = {};
const servers = [];
try {
  servers.push(await start(process.execPath, [resolve(ROOT, 'server/index.js')], 8201));
  results['node + express'] = await bench('http://127.0.0.1:8201');
  try {
    servers.push(await start('bun', [resolve(ROOT, 'server/bun-server.js')], 8202));
    results['bun.serve'] = await bench('http://127.0.0.1:8202');
  } catch (e) {
    console.log('bun unavailable, skipping:', e.message);
  }
} finally {
  servers.forEach(s => s.kill('SIGTERM'));
}

console.log('runtime            req/s     p50(ms)   p95(ms)   p99(ms)');
console.log('─'.repeat(58));
for (const [k, v] of Object.entries(results)) {
  console.log(`${k.padEnd(18)} ${String(v.rps).padEnd(9)} ${v.p50.padEnd(9)} ${v.p95.padEnd(9)} ${v.p99}`);
}
const [a, b] = Object.values(results);
if (a && b) console.log(`\nbun.serve served ${((b.rps / a.rps - 1) * 100).toFixed(0)}% more requests/sec than node+express on this machine.`);
console.log('');
