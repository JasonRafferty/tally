import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../public/shopping-core.js';

test('shopping quantity controls count units and preserve pack sizes', () => {
  assert.equal(ShoppingCore.stepQuantity('', 1), '×2');
  assert.equal(ShoppingCore.stepQuantity('×2', 1), '×3');
  assert.equal(ShoppingCore.stepQuantity('3', -1), '×2');
  assert.equal(ShoppingCore.stepQuantity('×1', -1), '×1');
  assert.equal(ShoppingCore.stepQuantity('500g', 1), '500g ×2');
  assert.equal(ShoppingCore.stepQuantity('500g ×2', -1), '500g');
  assert.equal(ShoppingCore.stepQuantity('2L', 1), '2L ×2');
});

test('normalisation and typo matching retain distinct products', () => {
  assert.equal(ShoppingCore.key(' MILK '), ShoppingCore.key('milk'));
  assert.equal(ShoppingCore.key('washing-up liquid'), ShoppingCore.key('dish soap'));
  assert.equal(ShoppingCore.key('yogurt'), ShoppingCore.key('yoghurt'));
  assert.notEqual(ShoppingCore.key('milk'), ShoppingCore.key('oat milk'));
  assert.equal(ShoppingCore.distance('mlik', 'milk'), 1);
  assert.equal(ShoppingCore.distance('bananna', 'banana'), 1);
});

test('shared settings, offline duplicates and regular purchases persist', async (t) => {
  const data = await mkdtemp(join(tmpdir(), 'tally-shopping-test-'));
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), DATA_DIR: data, APP_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => { if (String(chunk).includes('Tally on')) { clearTimeout(timer); resolve(); } });
    });
  };
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM'); await exited;
  };
  t.after(async () => { await stop(); await rm(data, { recursive: true, force: true }); });
  await start();
  const base = `http://127.0.0.1:${port}`;
  const post = async (ops) => {
    const res = await fetch(`${base}/api/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Who': 'jason' }, body: JSON.stringify({ ops }) });
    assert.equal(res.status, 200); return res.json();
  };
  let state = await post([
    { type: 'addList', id: 'shared', name: 'Weekly shop', kind: 'shopping', shared: true, by: 'jason' },
    { type: 'setGrouping', id: 'shared', grouping: 'aldi' },
    { type: 'setAisleOrder', id: 'shared', store: 'aldi', order: ['bakery', 'produce'] },
    { type: 'addItem', id: 'milk', listId: 'shared', text: 'Milk' },
    { type: 'addItem', id: 'offline-milk', listId: 'shared', text: ' MILK ', by: 'wah' },
    { type: 'addItem', id: 'oat', listId: 'shared', text: 'Oat milk' },
    { type: 'addItem', id: 'soap', listId: 'shared', text: 'Washing-up liquid' },
    { type: 'addItem', id: 'alias', listId: 'shared', text: 'Dish soap' },
  ]);
  assert.equal(state.lists[0].items.length, 3);
  const first = Date.now() - 21 * 86400000;
  for (let trip = 0; trip < 3; trip++) {
    state = await post([{ type: 'checkItem', id: 'milk', done: false }, { type: 'checkItem', id: 'milk', done: true, at: first + trip * 7 * 86400000 }]);
  }
  state = await post([{ type: 'checkItem', id: 'milk', done: true, at: Date.now() }]);
  const milk = state.history.find((entry) => entry.text === 'Milk');
  assert.equal(milk.purchaseCount, 3);
  assert.equal(milk.purchaseInterval, 7 * 86400000);
  state = await post([{ type: 'setAisleOrder', id: 'shared', store: 'aldi', order: ['not-an-aisle'] }]);
  assert.deepEqual(state.lists[0].aisleOrders.aldi, ['bakery', 'produce']);
  await stop(); await start();
  state = await (await fetch(`${base}/api/state`, { headers: { 'X-Who': 'wah' } })).json();
  assert.equal(state.lists[0].grouping, 'aldi');
  assert.deepEqual(state.lists[0].aisleOrders.aldi, ['bakery', 'produce']);
  assert.equal(state.history.find((entry) => entry.text === 'Milk').purchaseCount, 3);
  const integrated = { requestId: 'simmer-retry', expectedVersion: state.version, ops: [{ type: 'editItem', id: 'oat', text: 'Oat milk', qty: '1100 ml' }], result: { listId: 'shared', count: 1 } };
  const integration = (body) => fetch(`${base}/api/integrations/simmer`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Who': 'jason' }, body: JSON.stringify(body) });
  assert.equal((await integration(integrated)).status, 200);
  await stop(); await start();
  const replay = await integration(integrated); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), integrated.result);
  const after = await (await fetch(`${base}/api/state`, { headers: { 'X-Who': 'jason' } })).json();
  assert.equal(after.version, integrated.expectedVersion + 1);
  assert.equal(after.lists[0].items.find(i => i.id === 'oat').qty, '1100 ml');
  assert.equal((await integration({ ...integrated, requestId: 'stale-send' })).status, 409);
  assert.equal((await integration({ ...integrated, ops: [{ type: 'editItem', id: 'oat', text: 'Oat milk', qty: '2 l' }] })).status, 409);
});
