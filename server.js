#!/usr/bin/env node
// Checklist server: serves the web app from ./public and keeps every list in one SQLite file.
// No npm packages needed, just Node 24 or newer (for the built-in `node:sqlite`).
//
// Usage: node server.js
// Settings (environment variables):
//   PORT          port to listen on (default 4175)
//   DATA_DIR      where checklist.db lives (default ./data)
//   APP_PASSWORD  if set, the app asks for this password once per device
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, 'public');
const PORT = Number(process.env.PORT) || 4175;
// SQLite can't lock files on a network share, which includes a WSL folder opened from Windows
// (\\wsl.localhost\...). Started that way, keep the data in a normal Windows folder instead.
const ON_SHARE = process.platform === 'win32' && import.meta.dirname.startsWith('\\\\');
const DATA_DIR = resolve(process.env.DATA_DIR || (ON_SHARE ? join(process.env.LOCALAPPDATA || homedir(), 'checklist') : join(import.meta.dirname, 'data')));
const PASSWORD = process.env.APP_PASSWORD || '';
const COOKIE = 'checklist_session';
const MAX_BODY = 256 * 1024;
const MAX_TEXT = 500;

// --- storage ------------------------------------------------------------------------------
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'checklist.db'));
try {
  db.exec('PRAGMA journal_mode = WAL');
} catch (error) {
  if (error.errcode !== 5) throw error; // 5 = SQLITE_BUSY, "database is locked"
  console.error(`Can't lock the database in ${DATA_DIR}.\n`
    + 'Either another copy of the server is already running, or the folder is on a network share.\n'
    + 'Stop the other copy, or set DATA_DIR to a folder on this computer\'s own disk.');
  process.exit(1);
}
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    theme INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL,
    done_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS items_by_list ON items(list_id);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
  INSERT OR IGNORE INTO meta (key, value) VALUES ('version', 1);
`);

// Upgrades: databases made before a column existed get it added, with a safe default.
const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
if (!hasColumn('lists', 'kind')) db.exec(`ALTER TABLE lists ADD COLUMN kind TEXT NOT NULL DEFAULT 'todo'`);

const sql = {
  version: db.prepare(`SELECT value FROM meta WHERE key = 'version'`),
  bump: db.prepare(`UPDATE meta SET value = value + 1 WHERE key = 'version'`),
  lists: db.prepare(`SELECT id, name, kind, theme, created FROM lists ORDER BY created`),
  items: db.prepare(`SELECT id, list_id AS listId, text, done, created, done_at AS doneAt FROM items ORDER BY created`),
  addList: db.prepare(`INSERT OR IGNORE INTO lists (id, name, kind, theme, created) VALUES (?, ?, ?, ?, ?)`),
  renameList: db.prepare(`UPDATE lists SET name = ? WHERE id = ?`),
  setTheme: db.prepare(`UPDATE lists SET theme = ? WHERE id = ?`),
  deleteList: db.prepare(`DELETE FROM lists WHERE id = ?`),
  addItem: db.prepare(`INSERT OR IGNORE INTO items (id, list_id, text, created) SELECT ?, id, ?, ? FROM lists WHERE id = ?`),
  editItem: db.prepare(`UPDATE items SET text = ? WHERE id = ?`),
  checkItem: db.prepare(`UPDATE items SET done = ?, done_at = ? WHERE id = ?`),
  deleteItem: db.prepare(`DELETE FROM items WHERE id = ?`),
  clearDone: db.prepare(`DELETE FROM items WHERE list_id = ? AND done = 1`),
};

const version = () => sql.version.get().value;

function snapshot() {
  const lists = sql.lists.all().map((list) => ({ ...list, items: [] }));
  const byId = new Map(lists.map((list) => [list.id, list]));
  for (const item of sql.items.all()) byId.get(item.listId)?.items.push({ ...item, done: item.done === 1 });
  return { version: version(), lists };
}

// The app sends changes as a queue of small operations, so edits made offline can be replayed later.
// Each one is safe to apply twice, and changes to things that were deleted elsewhere are skipped.
const id = (value) => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
const text = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '');
const time = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : Date.now());

const OPS = {
  addList: (op) => id(op.id) && text(op.name) && sql.addList.run(op.id, text(op.name), op.kind === 'shopping' ? 'shopping' : 'todo', Number(op.theme) || 0, time(op.at)),
  renameList: (op) => id(op.id) && text(op.name) && sql.renameList.run(text(op.name), op.id),
  setTheme: (op) => id(op.id) && Number.isInteger(op.theme) && op.theme >= 0 && sql.setTheme.run(op.theme, op.id),
  deleteList: (op) => id(op.id) && sql.deleteList.run(op.id),
  addItem: (op) => id(op.id) && id(op.listId) && text(op.text) && sql.addItem.run(op.id, text(op.text), time(op.at), op.listId),
  editItem: (op) => id(op.id) && text(op.text) && sql.editItem.run(text(op.text), op.id),
  checkItem: (op) => id(op.id) && sql.checkItem.run(op.done ? 1 : 0, op.done ? time(op.at) : null, op.id),
  deleteItem: (op) => id(op.id) && sql.deleteItem.run(op.id),
  clearDone: (op) => id(op.listId) && sql.clearDone.run(op.listId),
};

function applyOps(ops) {
  db.exec('BEGIN');
  try {
    for (const op of ops) OPS[op?.type]?.(op);
    sql.bump.run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// --- optional password ----------------------------------------------------------------------
const sessionToken = PASSWORD ? createHmac('sha256', PASSWORD).update('checklist-session-v1').digest('hex') : '';
const sameText = (a, b) => {
  const [x, y] = [a, b].map((value) => createHash('sha256').update(String(value)).digest());
  return timingSafeEqual(x, y);
};
function signedIn(req) {
  if (!PASSWORD) return true;
  const cookie = (req.headers.cookie || '').split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`));
  return Boolean(cookie) && sameText(cookie.slice(COOKIE.length + 1), sessionToken);
}
function sessionCookie(req) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  return `${COOKIE}=${sessionToken}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}

// --- http -----------------------------------------------------------------------------------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, code, body, headers = {}) {
  const json = body !== undefined && typeof body !== 'string';
  res.writeHead(code, { 'Cache-Control': 'no-store', ...(json && { 'Content-Type': 'application/json' }), ...headers });
  res.end(json ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Too large'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
  catch { throw Object.assign(new Error('Bad JSON'), { status: 400 }); }
}

async function api(req, res, path) {
  if (path === '/api/login' && req.method === 'POST') {
    const { password } = await readJson(req);
    if (!PASSWORD) return send(res, 204);
    if (!sameText(password ?? '', PASSWORD)) {
      await new Promise((done) => setTimeout(done, 800)); // slow down guessing
      return send(res, 401, { error: 'Wrong password' });
    }
    return send(res, 204, undefined, { 'Set-Cookie': sessionCookie(req) });
  }
  if (!signedIn(req)) return send(res, 401, { error: 'Sign in first' });

  if (path === '/api/state' && req.method === 'GET') {
    // Cheap polling: the app passes the version it has, and gets 204 if nothing changed.
    const since = Number(new URL(req.url, 'http://x').searchParams.get('since'));
    return since === version() ? send(res, 204) : send(res, 200, snapshot());
  }
  if (path === '/api/ops' && req.method === 'POST') {
    const { ops } = await readJson(req);
    if (!Array.isArray(ops) || ops.length > 500) return send(res, 400, { error: 'Expected a list of changes' });
    applyOps(ops);
    return send(res, 200, snapshot());
  }
  return send(res, 404, { error: 'Not found' });
}

async function staticFile(req, res, path) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '');
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : decodeURIComponent(path)));
  if (!file.startsWith(ROOT)) return send(res, 404, 'Not found');
  try {
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    const body = await readFile(file);
    // Revalidate every load, like App Drawer, so updates reach the installed app straight away.
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    await (path.startsWith('/api/') ? api(req, res, path) : staticFile(req, res, path));
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Checklist on http://localhost:${PORT}${PASSWORD ? ' (password on)' : ''}`);
  console.log(`Lists saved in ${join(DATA_DIR, 'checklist.db')}`);
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop whatever is using it, or pick another: PORT=4176 node server.js` : error.message);
  process.exit(1);
});
const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
