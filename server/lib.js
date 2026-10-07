/* ==========================================================================
   EMC Lab — sync-server shared logic
   File: server/lib.js

   Imported by BOTH server implementations so they can never drift apart:
     * server/index.js      — Node + Express   (npm run server)
     * server/bun-server.js — Bun.serve        (npm run server:bun)

   Contains the storage adapters (MySQL or zero-config JSON file), the
   server-side merge rule, and request sanitising. Pure Node-API code that
   Bun implements compatibly (node:fs, node:path, dynamic mysql2 import).
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOPICS = ['charges', 'current', 'magnetism', 'induction'];
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;          // no traversal, no surprises
export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = path.resolve(LIB_DIR, '..');

/* --------------------------------------------------------------- storage */
/**
 * @returns {Promise<{driver:string,
 *   get:(id:string)=>Promise<object|null>,
 *   put:(id:string,payload:object)=>Promise<void>}>}
 */
export async function makeStore({ fileFallback = true } = {}) {
  if (process.env.MYSQL_URL || process.env.DB_HOST) {
    const mysql = (await import('mysql2/promise')).default;
    const pool = process.env.MYSQL_URL
      ? mysql.createPool(process.env.MYSQL_URL)
      : mysql.createPool({
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 3306),
          user: process.env.DB_USER || 'emc',
          password: process.env.DB_PASS || '',
          database: process.env.DB_NAME || 'emc_lab',
          connectionLimit: 5
        });
    await pool.query(`CREATE TABLE IF NOT EXISTS progress (
        user_id    VARCHAR(64) PRIMARY KEY,
        payload    JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
    return {
      driver: 'mysql',
      async get(id) {
        const [rows] = await pool.query('SELECT payload FROM progress WHERE user_id = ?', [id]);
        if (!rows.length) return null;
        const p = rows[0].payload;
        return typeof p === 'string' ? JSON.parse(p) : p;
      },
      async put(id, payload) {
        await pool.query(
          `INSERT INTO progress (user_id, payload) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
          [id, JSON.stringify(payload)]
        );
      }
    };
  }

  // On serverless platforms (Vercel) the filesystem is ephemeral/read-only, so
  // the file driver is refused unless explicitly allowed (local runtimes).
  if (!fileFallback) return null;

  // zero-config driver: one JSON file beside the server
  const file = path.join(LIB_DIR, 'data', 'progress.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  return {
    driver: 'json-file',
    async get(id) { return load()[id] ?? null; },
    async put(id, payload) {
      const db = load();
      db[id] = payload;
      fs.writeFileSync(file, JSON.stringify(db, null, 2));
    }
  };
}

/* ----------------------------------------------------------------- merge */
/** Union topics, max the scores, concatenate + de-duplicate the history. */
export function mergeRecords(a, b) {
  const out = {
    topics: Object.assign({}, a?.topics || {}),
    quizBest: Math.max(Number(a?.quizBest) || 0, Number(b?.quizBest) || 0),
    quizAttempts: Math.max(Number(a?.quizAttempts) || 0, Number(b?.quizAttempts) || 0),
    quizLast: Number(b?.quizLast) || Number(a?.quizLast) || 0,
    quizHistory: [].concat(a?.quizHistory || [], b?.quizHistory || []),
    updatedAt: new Date().toISOString()
  };
  for (const t of TOPICS) if (b?.topics && b.topics[t]) out.topics[t] = true;
  const seen = new Set();
  out.quizHistory = out.quizHistory
    .filter(h => h && typeof h === 'object' && !seen.has(h.at + ':' + h.pct) && (seen.add(h.at + ':' + h.pct), true))
    .sort((x, y) => String(x.at).localeCompare(String(y.at)))
    .slice(-20);
  return out;
}

/** Clamp/shape an untrusted request body into a valid record. */
export function sanitise(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const topics = {};
  for (const t of TOPICS) topics[t] = !!(body.topics && body.topics[t]);
  const history = Array.isArray(body.quizHistory)
    ? body.quizHistory
        .filter(h => h && typeof h.pct === 'number')
        .map(h => ({ pct: Math.max(0, Math.min(100, Math.round(h.pct))), at: String(h.at || '') }))
        .slice(-20)
    : [];
  return {
    topics,
    quizBest: Math.max(0, Math.min(100, Number(body.quizBest) || 0)),
    quizAttempts: Math.max(0, Math.min(100000, Number(body.quizAttempts) || 0)),
    quizLast: Math.max(0, Math.min(100, Number(body.quizLast) || 0)),
    quizHistory: history
  };
}

/* ---------------------------------------------------------- cache policy */
/**
 * Repeat-visit speed-up that is runtime-independent: HTML is always
 * revalidated, while immutable-by-convention assets (css/js/svg/md) may be
 * cached for an hour. Both servers apply this.
 */
export function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '') return 'no-cache';
  return 'public, max-age=3600';
}
