/* ==========================================================================
   EMC Lab — optional progress-sync server (Node + Express flavour)
   File: server/index.js          run with:  npm run server

   The website works perfectly WITHOUT this file: progress lives in
   localStorage. This server exists for courses that want progress mirrored
   across machines (lab PCs, home laptop). All logic lives in server/lib.js
   and is shared with the Bun flavour (server/bun-server.js).

     GET  /api/health            -> { ok, driver, runtime }
     GET  /api/progress/:id      -> { id, payload } | 404
     PUT  /api/progress/:id      -> server-side merge, echoes the record
     everything else             -> the static website

   Run with Node (this file) or with Bun:
     npm run server        # node + express
     npm run server:bun    # bun.serve, no express needed
   ========================================================================== */
import express from 'express';
import { makeStore, mergeRecords, sanitise, ID_RE, SITE_ROOT, cacheControlFor } from './lib.js';

const PORT = Number(process.env.PORT || 8080);
const store = await makeStore();

const app = express();
app.use(express.json({ limit: '64kb' }));

/* ------------------------------------------------------------------- API */
app.get('/api/health', (req, res) =>
  res.json({ ok: true, driver: store.driver, runtime: 'node', service: 'emc-lab-sync' }));

app.get('/api/progress/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'invalid id' });
  const payload = await store.get(req.params.id);
  if (!payload) return res.status(404).json({ error: 'no record yet' });
  res.json({ id: req.params.id, payload });
});

app.put('/api/progress/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'invalid id' });
  const incoming = sanitise(req.body);
  if (!incoming) return res.status(400).json({ error: 'malformed body' });
  const merged = mergeRecords(await store.get(req.params.id), incoming);
  await store.put(req.params.id, merged);
  res.json({ id: req.params.id, payload: merged });
});

// malformed JSON bodies: answer 400 quietly instead of dumping a stack trace
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid json' });
  next(err);
});

/* -------------------------------------------------------- static website */
app.use(express.static(SITE_ROOT, {
  extensions: ['html'],
  setHeaders: (res, filePath) => res.setHeader('Cache-Control', cacheControlFor(filePath))
}));

app.listen(PORT, () => {
  console.log(`EMC Lab sync server (node/express) on http://localhost:${PORT}  driver=${store.driver}`);
  console.log('Serving the site from', SITE_ROOT);
});
