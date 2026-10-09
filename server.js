#!/usr/bin/env node
// Tally server: serves the web app from ./public and keeps every list in one SQLite file.
// No npm packages needed, just Node 24 or newer (for the built-in `node:sqlite`).
//
// Usage: node server.js
// Settings (environment variables):
//   PORT          port to listen on (default 4175)
//   DATA_DIR      where tally.db lives (default ./data)
//   APP_PASSWORD  if set, the app asks for this password once per device
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import './public/shopping-core.js';

const ROOT = resolve(import.meta.dirname, 'public');
const PORT = Number(process.env.PORT) || 4175;
// SQLite can't lock files on a network share, which includes a WSL folder opened from Windows
// (\\wsl.localhost\...). Started that way, keep the data in a normal Windows folder instead.
const ON_SHARE = process.platform === 'win32' && import.meta.dirname.startsWith('\\\\');
const DATA_DIR = resolve(process.env.DATA_DIR || (ON_SHARE ? join(process.env.LOCALAPPDATA || homedir(), 'tally') : join(import.meta.dirname, 'data')));
const PASSWORD = process.env.APP_PASSWORD || '';
const COOKIE = 'tally_session';
const MAX_BODY = 256 * 1024;
const MAX_TEXT = 500;
const PEOPLE = ['jason', 'wah'];
const GROUPS = ['produce', 'bakery', 'dairy', 'meat', 'frozen', 'cupboard', 'drinks', 'household', 'other'];
const STORES = ['aldi', 'morrisons', 'lidl', 'tesco'];
const AISLES = ['produce', 'bakery', 'meat', 'dairy', 'frozen', 'tins', 'grains', 'breakfast', 'baking', 'sauces', 'snacks', 'drinks', 'household', 'toiletries', 'baby', 'pets', 'cupboard', 'other'];

// --- storage ------------------------------------------------------------------------------
mkdirSync(DATA_DIR, { recursive: true });
// The database used to be called checklist.db: keep any lists already in it.
if (!existsSync(join(DATA_DIR, 'tally.db')) && existsSync(join(DATA_DIR, 'checklist.db'))) {
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(join(DATA_DIR, `checklist.db${suffix}`))) renameSync(join(DATA_DIR, `checklist.db${suffix}`), join(DATA_DIR, `tally.db${suffix}`));
}
const db = new DatabaseSync(join(DATA_DIR, 'tally.db'));
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
  -- everything ever added to a shopping list: powers autofill, and remembers each item's usual quantity and group
  CREATE TABLE IF NOT EXISTS history (
    key TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    qty TEXT NOT NULL DEFAULT '',
    grp TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    last INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO meta (key, value) VALUES ('version', 1);
  CREATE TABLE IF NOT EXISTS purchases (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 1,
    first INTEGER NOT NULL, last INTEGER NOT NULL, interval_ms REAL
  );
`);

// Upgrades: databases made before a column existed get it added, with a safe default.
const hasColumn = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
if (!hasColumn('lists', 'kind')) db.exec(`ALTER TABLE lists ADD COLUMN kind TEXT NOT NULL DEFAULT 'todo'`);
// Lists made before owners existed belong to Jason and stay private to him.
if (!hasColumn('lists', 'owner')) db.exec(`ALTER TABLE lists ADD COLUMN owner TEXT NOT NULL DEFAULT 'jason'`);
if (!hasColumn('lists', 'shared')) db.exec(`ALTER TABLE lists ADD COLUMN shared INTEGER NOT NULL DEFAULT 0`);
if (!hasColumn('lists', 'grouping')) db.exec(`ALTER TABLE lists ADD COLUMN grouping TEXT NOT NULL DEFAULT 'aisle'`);
if (!hasColumn('lists', 'aisle_orders')) db.exec(`ALTER TABLE lists ADD COLUMN aisle_orders TEXT NOT NULL DEFAULT '{}'`);
if (!hasColumn('items', 'added_by')) db.exec(`ALTER TABLE items ADD COLUMN added_by TEXT`);
if (!hasColumn('items', 'done_by')) db.exec(`ALTER TABLE items ADD COLUMN done_by TEXT`);
if (!hasColumn('items', 'qty')) db.exec(`ALTER TABLE items ADD COLUMN qty TEXT NOT NULL DEFAULT ''`);
if (!hasColumn('items', 'grp')) db.exec(`ALTER TABLE items ADD COLUMN grp TEXT`);

// Items already on shopping lists count as history too, so autofill works from day one.
db.exec(`INSERT OR IGNORE INTO history (key, text, qty, grp, count, last)
  SELECT lower(trim(i.text)), i.text, i.qty, i.grp, 1, i.created FROM items i JOIN lists l ON l.id = i.list_id WHERE l.kind = 'shopping'`);

const sql = {
  version: db.prepare(`SELECT value FROM meta WHERE key = 'version'`),
  bump: db.prepare(`UPDATE meta SET value = value + 1 WHERE key = 'version'`),
  lists: db.prepare(`SELECT id, name, kind, owner, shared, theme, grouping, aisle_orders AS aisleOrders, created FROM lists ORDER BY created`),
  setGrouping: db.prepare(`UPDATE lists SET grouping = ? WHERE id = ?`),
  setAisleOrder: db.prepare(`UPDATE lists SET aisle_orders = json_set(aisle_orders, ?, json(?)) WHERE id = ?`),
  listItems: db.prepare(`SELECT id, text, done FROM items WHERE list_id = ?`),
  purchaseItem: db.prepare(`SELECT i.text, i.done, l.kind FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?`),
  purchases: db.prepare(`SELECT * FROM purchases`),
  purchase: db.prepare(`INSERT INTO purchases (key, first, last) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET interval_ms = ((count - 1) * COALESCE(interval_ms, 0) + excluded.last - last) / count, count = count + 1, last = excluded.last
    WHERE excluded.last - last >= 21600000`),
  items: db.prepare(`SELECT id, list_id AS listId, text, done, created, done_at AS doneAt, added_by AS addedBy, done_by AS doneBy, qty, grp FROM items ORDER BY created`),
  addList: db.prepare(`INSERT OR IGNORE INTO lists (id, name, kind, owner, shared, theme, created) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  setShared: db.prepare(`UPDATE lists SET shared = ? WHERE id = ?`),
  renameList: db.prepare(`UPDATE lists SET name = ? WHERE id = ?`),
  setTheme: db.prepare(`UPDATE lists SET theme = ? WHERE id = ?`),
  deleteList: db.prepare(`DELETE FROM lists WHERE id = ?`),
  addItem: db.prepare(`INSERT OR IGNORE INTO items (id, list_id, text, created, added_by, qty, grp) SELECT ?, id, ?, ?, ?, ?, ? FROM lists WHERE id = ?`),
  setQty: db.prepare(`UPDATE items SET qty = ? WHERE id = ?`),
  setGroup: db.prepare(`UPDATE items SET grp = ? WHERE id = ?`),
  listKind: db.prepare(`SELECT kind FROM lists WHERE id = ?`),
  shoppingItem: db.prepare(`SELECT i.text, i.qty, i.grp FROM items i JOIN lists l ON l.id = i.list_id WHERE i.id = ? AND l.kind = 'shopping'`),
  remember: db.prepare(`INSERT INTO history (key, text, qty, grp, count, last) VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET text = excluded.text, qty = excluded.qty, grp = excluded.grp, count = count + 1, last = excluded.last`),
  refine: db.prepare(`UPDATE history SET qty = ?, grp = ? WHERE key = ?`),
  history: db.prepare(`SELECT text, qty, grp, count, last FROM history ORDER BY last DESC LIMIT 800`),
  editItem: db.prepare(`UPDATE items SET text = ? WHERE id = ?`),
  checkItem: db.prepare(`UPDATE items SET done = ?, done_at = ?, done_by = ? WHERE id = ?`),
  deleteItem: db.prepare(`DELETE FROM items WHERE id = ?`),
  clearDone: db.prepare(`DELETE FROM items WHERE list_id = ? AND done = 1`),
};

const version = () => sql.version.get().value;

// Each phone only gets its own person's lists and the shared ones. This keeps lists tidy and apart;
// it is not a lock, because there are no sign-ins (a phone just says who it is).
function snapshot(who) {
  const lists = sql.lists.all()
    .filter((list) => list.shared === 1 || list.owner === who)
    .map((list) => ({ ...list, aisleOrders: JSON.parse(list.aisleOrders), shared: list.shared === 1, items: [] }));
  const byId = new Map(lists.map((list) => [list.id, list]));
  for (const item of sql.items.all()) byId.get(item.listId)?.items.push({ ...item, done: item.done === 1 });
  const purchases = new Map(sql.purchases.all().map((entry) => [entry.key, entry]));
  const history = sql.history.all().map((entry) => {
    const bought = purchases.get(ShoppingCore.key(entry.text));
    return { ...entry, purchaseCount: bought?.count ?? 0, lastPurchased: bought?.last ?? null, purchaseInterval: bought?.interval_ms ?? null };
  });
  return { version: version(), lists, history };
}

// The app sends changes as a queue of small operations, so edits made offline can be replayed later.
// Each one is safe to apply twice, and changes to things that were deleted elsewhere are skipped.
const id = (value) => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
const text = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '');
const qty = (value) => (typeof value === 'string' ? value.trim().slice(0, 40) : '');
const historyKey = (value) => ShoppingCore.key(text(value));
const group = (value) => (GROUPS.includes(value) ? value : null);
const person = (value) => (PEOPLE.includes(value) ? value : null);
const time = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : Date.now());

const OPS = {
  addList: (op) => id(op.id) && text(op.name) && sql.addList.run(op.id, text(op.name), op.kind === 'shopping' ? 'shopping' : 'todo', person(op.by) ?? 'jason', op.shared ? 1 : 0, Number(op.theme) || 0, time(op.at)),
  setShared: (op) => id(op.id) && sql.setShared.run(op.shared ? 1 : 0, op.id),
  setGrouping: (op) => id(op.id) && ['off', 'product', 'aisle', ...STORES].includes(op.grouping) && sql.setGrouping.run(op.grouping, op.id),
  setAisleOrder: (op) => {
    if (!id(op.id) || !STORES.includes(op.store) || !Array.isArray(op.order) || op.order.length > AISLES.length || op.order.some((item) => !AISLES.includes(item)) || new Set(op.order).size !== op.order.length) return;
    sql.setAisleOrder.run(`$.${op.store}`, JSON.stringify(op.order), op.id);
  },
  renameList: (op) => id(op.id) && text(op.name) && sql.renameList.run(text(op.name), op.id),
  setTheme: (op) => id(op.id) && Number.isInteger(op.theme) && op.theme >= 0 && sql.setTheme.run(op.theme, op.id),
  deleteList: (op) => id(op.id) && sql.deleteList.run(op.id),
  addItem: (op) => {
    if (!id(op.id) || !id(op.listId) || !text(op.text)) return;
    if (sql.listKind.get(op.listId)?.kind === 'shopping') {
      const same = sql.listItems.all(op.listId).find((item) => !item.done && historyKey(item.text) === historyKey(op.text));
      if (same) return; // Also prevents duplicates from two phones syncing offline.
    }
    const added = sql.addItem.run(op.id, text(op.text), time(op.at), person(op.by), qty(op.qty), group(op.grp), op.listId);
    if (added.changes && sql.listKind.get(op.listId)?.kind === 'shopping') sql.remember.run(historyKey(op.text), text(op.text), qty(op.qty), group(op.grp), time(op.at));
  },
  editItem: (op) => {
    if (!id(op.id) || !text(op.text)) return;
    sql.editItem.run(text(op.text), op.id);
    if (typeof op.qty === 'string') sql.setQty.run(qty(op.qty), op.id); // only when the edit includes a quantity
    if (typeof op.grp === 'string') sql.setGroup.run(group(op.grp), op.id);
    // A correction to a shopping item's quantity or group is remembered for next time.
    const item = sql.shoppingItem.get(op.id);
    if (item) sql.refine.run(item.qty, item.grp, historyKey(item.text));
  },
  checkItem: (op) => {
    if (!id(op.id)) return;
    const item = sql.purchaseItem.get(op.id);
    const at = time(op.at);
    if (op.done && item && !item.done && item.kind === 'shopping') sql.purchase.run(historyKey(item.text), at, at);
    sql.checkItem.run(op.done ? 1 : 0, op.done ? at : null, op.done ? person(op.by) : null, op.id);
  },
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
  announce();
}

// Phones keep one connection open (server-sent events). When something changes they're told the new
// version straight away and fetch it, so updates show up instantly instead of on the next check.
const listeners = new Set();
function announce() {
  const message = `data: ${JSON.stringify({ version: version() })}\n\n`;
  for (const res of listeners) res.write(message);
}
function listen(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\ndata: ${JSON.stringify({ version: version() })}\n\n`);
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
}
// A quiet line every so often stops proxies (like the Cloudflare tunnel) closing an idle connection.
setInterval(() => { for (const res of listeners) res.write(': still here\n\n'); }, 25_000).unref();

// --- optional password ----------------------------------------------------------------------
const sessionToken = PASSWORD ? createHmac('sha256', PASSWORD).update('tally-session-v1').digest('hex') : '';
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
  const who = person(req.headers['x-who']);

  if (path === '/api/events' && req.method === 'GET') return listen(req, res);
  if (path === '/api/state' && req.method === 'GET') {
    // Cheap polling: the app passes the version it has, and gets 204 if nothing changed.
    const since = Number(new URL(req.url, 'http://x').searchParams.get('since'));
    return since === version() ? send(res, 204) : send(res, 200, snapshot(who));
  }
  if (path === '/api/ops' && req.method === 'POST') {
    const { ops } = await readJson(req);
    if (!Array.isArray(ops) || ops.length > 500) return send(res, 400, { error: 'Expected a list of changes' });
    applyOps(ops);
    return send(res, 200, snapshot(who));
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
  console.log(`Tally on http://localhost:${PORT}${PASSWORD ? ' (password on)' : ''}`);
  console.log(`Lists saved in ${join(DATA_DIR, 'tally.db')}`);
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Stop whatever is using it, or pick another: PORT=4176 node server.js` : error.message);
  process.exit(1);
});
const stop = () => {
  for (const res of listeners) res.end();
  server.close(() => { db.close(); process.exit(0); });
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
