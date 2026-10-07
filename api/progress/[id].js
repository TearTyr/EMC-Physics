/* ==========================================================================
   Vercel serverless function — progress record (same contract as bundled servers)
   File: api/progress/[id].js      routes: GET|PUT /api/progress/:id

   Behaviour is identical to server/index.js and server/bun-server.js because
   the merge rule, sanitising and id validation all live in server/lib.js:
     * GET  -> { id, payload } | 404 | 503 (no database configured)
     * PUT  -> server-side merge (topic union, max score, deduped history)
   ========================================================================== */
import { makeStore, mergeRecords, sanitise, ID_RE } from '../../server/lib.js';

let storePromise;
const getStore = () => (storePromise ??= makeStore({ fileFallback: false }));

export default async function handler(req, res) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!ID_RE.test(id || '')) return res.status(400).json({ error: 'invalid id' });
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const store = await getStore();
  if (!store) {
    return res.status(503).json({ error: 'Set MYSQL_URL (or DB_*) in the Vercel environment to enable sync.' });
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const payload = await store.get(id);
    if (!payload) return res.status(404).json({ error: 'no record yet' });
    return res.status(200).json({ id, payload });
  }

  const incoming = sanitise(req.body);
  if (!incoming) return res.status(400).json({ error: 'malformed body' });
  const merged = mergeRecords(await store.get(id), incoming);
  await store.put(id, merged);
  return res.status(200).json({ id, payload: merged });
}
