/* ==========================================================================
   EMC Lab — optional progress-sync server (Bun flavour)
   File: server/bun-server.js     run with:  npm run server:bun

   Identical behaviour to server/index.js (same API, same merge rules, same
   static hosting and cache policy — all shared through server/lib.js) but
   built directly on Bun.serve + Bun.file: no Express, no body-parser, and
   static files are streamed with sendfile()-style zero-copy where the OS
   allows it. This is the fastest way to serve the module in this repo.

   Bun is OPTIONAL. Everything here also runs on plain Node via index.js,
   so choosing Bun is a performance/deployment choice, never a requirement.

   Why this does not change the website itself: the browser executes the
   same bytes either way. Bun speeds up serving, installs and tooling — see
   README §"Using Bun" for measured numbers.
   ========================================================================== */
import path from 'node:path';
import { makeStore, mergeRecords, sanitise, ID_RE, SITE_ROOT, cacheControlFor } from './lib.js';

const PORT = Number(process.env.PORT || 8080);
const store = await makeStore();

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    /* ------------------------------------------------------------ API --- */
    if (p === '/api/health') {
      return json({ ok: true, driver: store.driver, runtime: 'bun', service: 'emc-lab-sync' });
    }

    const m = p.match(/^\/api\/progress\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!ID_RE.test(id)) return json({ error: 'invalid id' }, 400);

      if (req.method === 'GET' || req.method === 'HEAD') {
        const payload = await store.get(id);
        if (!payload) return json({ error: 'no record yet' }, 404);
        return json({ id, payload });
      }
      if (req.method === 'PUT') {
        let body = null;
        try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
        const incoming = sanitise(body);
        if (!incoming) return json({ error: 'malformed body' }, 400);
        const merged = mergeRecords(await store.get(id), incoming);
        await store.put(id, merged);
        return json({ id, payload: merged });
      }
      return json({ error: 'method not allowed' }, 405);
    }
    if (p.startsWith('/api/')) return json({ error: 'not found' }, 404);

    /* --------------------------------------------- static website --- */
    let rel = p === '/' ? '/index.html' : p;
    let filePath = path.join(SITE_ROOT, path.normalize(rel));
    // refuse anything that escapes the site root
    if (!filePath.startsWith(SITE_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });

    let file = Bun.file(filePath);
    if (!(await file.exists()) && !path.extname(filePath)) {
      file = Bun.file(filePath + '.html');          // /topics/charges -> charges.html
    }
    if (!(await file.exists())) return new Response('Not found', { status: 404 });

    return new Response(file, {
      headers: {
        'Content-Type': file.type,
        'Cache-Control': cacheControlFor(file.name || filePath)
      }
    });
  }
});

console.log(`EMC Lab sync server (bun) on http://localhost:${server.port}  driver=${store.driver}`);
console.log('Serving the site from', SITE_ROOT);
