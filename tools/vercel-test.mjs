#!/usr/bin/env node
/* ==========================================================================
   EMC Lab — Vercel serverless-function contract test
   File: tools/vercel-test.mjs        run:  npm run test:vercel

   Invokes the api/ handlers directly with mocked req/res (no deployment
   needed). Without a MYSQL_URL in the environment the functions must fail
   SAFE: 503 with a helpful message, because Vercel's filesystem is
   ephemeral and the JSON-file driver is therefore refused there. The
   website treats that as "no sync server" and stays local-only.
   ========================================================================== */
import health from '../api/health.js';
import progress from '../api/progress/[id].js';

let pass = 0; const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`   \u2713 ${name}`); }
  else { fails.push(name); console.log(`   \u2717 ${name} ${extra}`); }
};
const mock = (method, query = {}, body = undefined) => {
  const res = {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; }
  };
  return { req: { method, query, body, url: '/api' }, res };
};

console.log('\n\u2500'.repeat(60));
console.log('EMC Lab — Vercel function contract (no database configured)');
console.log('\u2500'.repeat(60));

let m = mock('GET');
await health(m.req, m.res);
ok('GET /api/health -> 503 without a database', m.res.statusCode === 503);
ok('health explains how to enable sync', /MYSQL_URL/.test(m.res.body.error || ''), JSON.stringify(m.res.body));

m = mock('GET', { id: 'user-1' });
await progress(m.req, m.res);
ok('GET /api/progress/:id -> 503 without a database', m.res.statusCode === 503);

m = mock('PUT', { id: 'user-1' }, { quizBest: 80 });
await progress(m.req, m.res);
ok('PUT -> 503 without a database (never silently drops data)', m.res.statusCode === 503);

m = mock('GET', { id: '../etc' });
await progress(m.req, m.res);
ok('malformed id -> 400 even before the store is touched', m.res.statusCode === 400);

m = mock('DELETE', { id: 'user-1' });
await progress(m.req, m.res);
ok('unsupported method -> 405 with Allow header', m.res.statusCode === 405 && m.res.headers.Allow === 'GET, PUT');

console.log('\u2500'.repeat(60));
console.log(fails.length ? `\u274C ${fails.length} failed` : `\u2705 All ${pass} Vercel-function assertions passed.`);
console.log('\u2500'.repeat(60) + '\n');
process.exit(fails.length ? 1 : 0);
