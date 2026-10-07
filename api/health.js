/* ==========================================================================
   Vercel serverless function — liveness + driver report
   File: api/health.js      route: GET /api/health

   Mirrors the bundled Express/Bun servers so js/sync.js works unchanged on
   Vercel. On serverless the filesystem is ephemeral, so the JSON-file driver
   is unavailable: sync on Vercel requires a MySQL connection string in the
   project environment (MYSQL_URL, or DB_HOST/DB_USER/DB_PASS/DB_NAME).
   Without it this endpoint answers 503 and the website silently stays in
   local-only mode — nothing breaks.
   ========================================================================== */
import { makeStore } from '../server/lib.js';

let storePromise;
const getStore = () => (storePromise ??= makeStore({ fileFallback: false }));

export default async function handler(req, res) {
  const store = await getStore();
  if (!store) {
    return res.status(503).json({
      ok: false,
      service: 'emc-lab-sync',
      error: 'Set MYSQL_URL (or DB_*) in the Vercel project environment to enable sync.'
    });
  }
  res.status(200).json({ ok: true, driver: store.driver, runtime: 'vercel', service: 'emc-lab-sync' });
}
