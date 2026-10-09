// List colours: exactly App Drawer's tile gradients. Lists store the index.
const THEMES = [
  ['#4ade80', '#15803d'],
  ['#f59e0b', '#c2410c'],
  ['#7b4dff', '#2fa6ff'],
  ['#60a5fa', '#1d4ed8'],
  ['#818cf8', '#6d28d9'],
  ['#4ade80', '#0891b2'],
  ['#334155', '#0f172a'],
];

const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/></svg>';
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
const POLL_MS = 4000;
const HOLD_MS = 500;
const INSTALL_SNOOZE_DAYS = 14;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

const $ = (selector) => document.querySelector(selector);
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep going in memory */ } },
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const themeOf = (list) => THEMES[(list?.theme ?? 0) % THEMES.length];
// Two people share this app. Each phone says which one it is, and that decides which lists it shows.
const PEOPLE = { jason: { name: 'Jason', initial: 'J' }, wah: { name: 'Wah', initial: 'W' } };
let me = PEOPLE[store.get('tally-me', null)] ? store.get('tally-me', null) : null;
const otherPerson = () => (me === 'jason' ? 'wah' : 'jason');
const ownerOf = (list) => (PEOPLE[list?.owner] ? list.owner : 'jason'); // older lists belong to Jason
const visible = (list) => Boolean(list.shared) || ownerOf(list) === me;
const nameOf = (by) => (by === me ? 'You' : PEOPLE[by]?.name ?? 'Someone');
const kindOf = (list) => (list?.kind === 'shopping' ? 'shopping' : 'todo');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- data ----------------------------------------------------------------------------------
// `server` is the last copy the server sent. `outbox` holds changes not yet saved there.
// What's on screen is the server copy with the outbox replayed on top, so the app works offline.
let server = store.get('tally-server', { version: 0, lists: [], history: [] });
let outbox = store.get('tally-outbox', []);
let lists = [];
let loaded = server.version > 0;

const OPS = {
  addList: (all, op) => { if (!all.some((l) => l.id === op.id)) all.push({ id: op.id, name: op.name, kind: op.kind === 'shopping' ? 'shopping' : 'todo', owner: PEOPLE[op.by] ? op.by : 'jason', shared: Boolean(op.shared), theme: op.theme, created: op.at, items: [] }); },
  renameList: (all, op) => { const list = all.find((l) => l.id === op.id); if (list) list.name = op.name; },
  setShared: (all, op) => { const list = all.find((l) => l.id === op.id); if (list) list.shared = Boolean(op.shared); },
  setTheme: (all, op) => { const list = all.find((l) => l.id === op.id); if (list) list.theme = op.theme; },
  deleteList: (all, op) => { const i = all.findIndex((l) => l.id === op.id); if (i >= 0) all.splice(i, 1); },
  addItem: (all, op) => {
    const list = all.find((l) => l.id === op.listId);
    if (list && !list.items.some((item) => item.id === op.id)) list.items.push({ id: op.id, listId: op.listId, text: op.text, qty: op.qty ?? '', grp: op.grp ?? '', done: false, created: op.at, doneAt: null, addedBy: op.by ?? null, doneBy: null });
  },
  editItem: (all, op) => { const item = findItem(all, op.id); if (item) { item.text = op.text; if (typeof op.qty === 'string') item.qty = op.qty; if (typeof op.grp === 'string') item.grp = op.grp; } },
  checkItem: (all, op) => { const item = findItem(all, op.id); if (item) Object.assign(item, { done: op.done, doneAt: op.done ? op.at : null, doneBy: op.done ? op.by ?? null : null }); },
  deleteItem: (all, op) => { for (const list of all) list.items = list.items.filter((item) => item.id !== op.id); },
  clearDone: (all, op) => { const list = all.find((l) => l.id === op.listId); if (list) list.items = list.items.filter((item) => !item.done); },
};
function findItem(all, itemId) {
  for (const list of all) { const item = list.items.find((i) => i.id === itemId); if (item) return item; }
  return null;
}
function rebuild() {
  lists = structuredClone(server.lists);
  for (const op of outbox) OPS[op.type]?.(lists, op);
}

// Make a change: show it straight away, then save it to the server in the background.
function change(...ops) {
  const at = Date.now();
  for (const op of ops) outbox.push({ at, by: me, ...op });
  store.set('tally-outbox', outbox);
  rebuild();
  push();
}

// --- sync ----------------------------------------------------------------------------------
let pushing = false;
let online = true;

async function request(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(me && { 'X-Who': me }), ...options?.headers } });
  if (res.status === 401) { askForPassword(); throw new Error('signed out'); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function accept(snapshot) {
  server = snapshot;
  loaded = true;
  store.set('tally-server', server);
  rebuild();
}

let lastPull = 0;
async function pull() {
  if (!me) return;
  lastPull = Date.now();
  if (pushing || outbox.length) return push();
  try {
    const snapshot = await request(`/api/state?since=${server.version}`);
    online = true;
    if (snapshot && !pushing && !outbox.length) { accept(snapshot); renderSoon(); }
  } catch { online = false; }
  showStatus();
}

async function push() {
  if (!me || pushing || !outbox.length) return showStatus();
  pushing = true;
  showStatus();
  const batch = outbox.slice(0, 200);
  try {
    const snapshot = await request('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: batch }) });
    online = true;
    outbox = outbox.slice(batch.length);
    store.set('tally-outbox', outbox);
    accept(snapshot);
    renderSoon();
  } catch {
    online = false;
  }
  pushing = false;
  if (online && outbox.length) push();
  else showStatus();
}

function showStatus() {
  const el = $('#status');
  const [state, label] = !online ? ['down', outbox.length ? 'Offline · saved on this device' : 'Offline']
    : pushing || outbox.length ? ['saving', 'Saving']
    : !loaded ? ['checking', 'Loading']
    : ['ok', statusLine()];
  el.dataset.state = state;
  $('#status-text').textContent = label;
}

function statusLine() {
  const list = currentList();
  if (list) {
    const left = list.items.filter((item) => !item.done).length;
    return list.items.length ? (left ? `${left} left of ${list.items.length}` : 'All done') : 'Synced';
  }
  const shown = lists.filter((l) => kindOf(l) === view && visible(l));
  const left = shown.reduce((sum, l) => sum + l.items.filter((item) => !item.done).length, 0);
  return shown.length ? (view === 'shopping' ? `${left} to buy` : `${plural(left, 'item')} to do`) : 'Synced';
}

// --- views ---------------------------------------------------------------------------------
const route = () => decodeURIComponent(location.hash.match(/^#\/list\/(.+)$/)?.[1] ?? '');
const currentList = () => lists.find((list) => list.id === route());
let shownIds = null; // item ids already on screen, so only new ones animate in
let shownList = null;
let doneOpen = store.get('tally-done-open', true);
// Pinned lists are kept per device, like App Drawer's pins: newest pin first.
let pins = store.get('tally-pins', []);
const isPinned = (list) => pins.includes(list.id);
function setPinned(listId, pinned) {
  pins = pins.filter((p) => p !== listId);
  if (pinned) pins.unshift(listId);
  store.set('tally-pins', pins);
}
// Which type of list the home screen shows. Swipe or tap the switch to change it.
let view = store.get('tally-kind', 'todo') === 'shopping' ? 'shopping' : 'todo';
const sortedLists = () => {
  const mine = lists.filter((list) => kindOf(list) === view && !list.shared && visible(list));
  return [
    ...pins.map((p) => mine.find((list) => list.id === p)).filter(Boolean),
    ...mine.filter((list) => !isPinned(list)),
  ];
};
function setView(next) {
  if (next === view) return;
  const forward = next === 'shopping';
  const content = $('#home-content');
  const width = content.getBoundingClientRect().width;
  const outgoing = !REDUCED_MOTION.matches ? content.cloneNode(true) : null;
  const dragged = Number(content.dataset.drag || 0);
  content.getAnimations().forEach((animation) => animation.cancel());
  content.style.transform = '';
  delete content.dataset.drag;
  if (outgoing) {
    outgoing.removeAttribute('id');
    outgoing.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    outgoing.inert = true;
    outgoing.setAttribute('aria-hidden', 'true');
    Object.assign(outgoing.style, { position: 'absolute', top: `${content.offsetTop}px`, left: `${content.offsetLeft}px`, width: `${width}px`, pointerEvents: 'none' });
    document.body.append(outgoing);
  }
  stopSelecting();
  view = next;
  store.set('tally-kind', view);
  document.body.classList.remove('slide-in', 'slide-back', 'intro');
  render();
  if (outgoing) {
    const direction = forward ? -1 : 1;
    const options = { duration: 320, easing: 'cubic-bezier(.22,.8,.25,1)' };
    outgoing.animate([{ transform: `translateX(${dragged}px)`, opacity: 1 }, { transform: `translateX(${direction * (width + 24)}px)`, opacity: 0 }], options).finished.finally(() => outgoing.remove());
    content.animate([{ transform: `translateX(${-direction * (width + 24) + dragged}px)`, opacity: .5 }, { transform: 'translateX(0)', opacity: 1 }], options);
  }
}

function render() {
  clearTimeout(renderTimer);
  const list = currentList();
  if (route() && !list && loaded) { location.replace('#/'); return; }
  // Opening a list puts you in its type, so Back lands on the right view.
  if (list && kindOf(list) !== view) { view = kindOf(list); store.set('tally-kind', view); }
  document.body.dataset.view = list ? 'list' : 'home';
  document.body.dataset.kind = view;
  for (const button of document.querySelectorAll('[data-set-view]')) button.setAttribute('aria-checked', button.dataset.setView === view);
  const [a, b] = list ? themeOf(list) : THEMES[0];
  document.documentElement.style.setProperty('--ga', a);
  document.documentElement.style.setProperty('--gb', b);
  $('#title').textContent = list ? list.name : selected ? `${selected.size} selected` : view === 'shopping' ? 'Shopping' : 'To-do';
  document.title = list ? `${list.name} · Tally` : 'Tally';
  if (list) renderList(list); else renderHome();
  renderSuggestions();
  showStatus();
}

// Ticking an item fills the circle first, then the list re-sorts a moment later.
let renderTimer;
let holdUntil = 0;
function scheduleRender(delay = 0) {
  clearTimeout(renderTimer);
  holdUntil = Date.now() + delay;
  renderTimer = setTimeout(render, delay);
}
// Saving or syncing re-draws the list, but never in the middle of a tick animation.
const renderSoon = () => scheduleRender(Math.max(0, holdUntil - Date.now()));

// The latest change on a shared list: who added or ticked what, and when.
function latestActivity(list) {
  const events = list.items.flatMap((item) => [
    { at: item.created, by: item.addedBy, verb: 'added', text: item.text },
    ...(item.done && item.doneAt ? [{ at: item.doneAt, by: item.doneBy, verb: 'ticked', text: item.text }] : []),
  ]);
  if (!events.length) return { at: list.created, html: 'No items yet' };
  const last = events.reduce((a, b) => (b.at > a.at ? b : a));
  return { at: last.at, html: `<em>${escapeHtml(nameOf(last.by))}</em> ${last.verb} ${escapeHtml(last.text)}` };
}
function ago(at) {
  const minutes = Math.floor((Date.now() - at) / 60000);
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}

function renderHome() {
  shownList = null;
  $('#lists').classList.toggle('selecting', Boolean(selected));
  updateSelectBar();

  const together = lists.filter((list) => kindOf(list) === view && list.shared).map((list) => ({ list, activity: latestActivity(list) })).sort((x, y) => y.activity.at - x.activity.at);
  $('#together-wrap').hidden = !together.length;
  $('#together').innerHTML = together.map(({ list, activity }, i) => {
    const left = list.items.filter((item) => !item.done).length;
    const picked = selected?.has(list.id);
    return `<button type="button" class="card${picked ? ' selected' : ''}" ${selected ? `aria-pressed="${picked}"` : ''} data-list="${escapeHtml(list.id)}" style="--delay:${60 + i * 35}ms">
      <span class="duo" aria-hidden="true"><b class="j">J</b><b class="w">W</b></span>
      <span class="copy"><b>${escapeHtml(list.name)}</b><small>${activity.html}</small></span>
      <span class="side"><span class="ago">${ago(activity.at)}</span>${list.items.length ? (left ? `<span class="count">${left} left</span>` : '<span class="count all-done">Done</span>') : ''}</span>
    </button>`;
  }).join('');

  const shown = sortedLists();
  $('#lists').innerHTML = shown.map((list, i) => {
    const [a, b] = themeOf(list);
    const left = list.items.filter((item) => !item.done).length;
    const total = list.items.length;
    const pct = total ? Math.round(((total - left) / total) * 100) : 0;
    const count = total && !left ? '<span class="count all-done">Done</span>' : `<span class="count">${left} left</span>`;
    const pinned = isPinned(list);
    // A pinned list shows its next few items, so you can see what's on it without opening it.
    const next = pinned ? list.items.filter((item) => !item.done).sort((x, y) => y.created - x.created).slice(0, 3) : [];
    const picked = selected?.has(list.id);
    return `<button type="button" class="tile${pinned ? ' pinned' : ''}${picked ? ' selected' : ''}" ${selected ? `aria-pressed="${picked}"` : ''} data-list="${escapeHtml(list.id)}" style="--ga:${a};--gb:${b};--delay:${60 + (together.length + i) * 35}ms">
      <span class="icon">${listIcon(list)}</span>
      <span class="corner">${pinned ? `<span class="pin-mark" aria-label="Pinned">${PIN}</span>` : ''}${total ? count : ''}</span>
      <span class="copy"><b>${escapeHtml(list.name)}</b><small>${!total ? 'Empty' : total - left ? `${total - left} of ${total} done` : plural(total, 'item')}</small>
        ${next.length ? `<span class="peek">${next.map((item) => `<span>${escapeHtml(item.text)}</span>`).join('')}</span>` : ''}</span>
      <span class="bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      <span class="select-mark" aria-hidden="true">${TICK}</span>
    </button>`;
  }).join('') + `<button type="button" class="tile new" data-new-list style="--delay:${60 + (together.length + shown.length) * 35}ms">
      <span class="icon">${PLUS}</span>
      <span class="copy"><b>New list</b><small>${view === 'shopping' ? (shown.length || together.length ? 'Groceries, hardware…' : 'Start a shopping list') : (shown.length || together.length ? 'Chores, work, plans…' : 'Start your first list')}</small></span>
    </button>`;

  $('#who-line').innerHTML = me ? `You’re <b>${PEOPLE[me].name}</b> · <button type="button" data-switch-who>Switch</button>` : '';
}

function itemRow(item, fresh, shared) {
  const by = shared && PEOPLE[item.addedBy] ? `<span class="by ${item.addedBy === 'wah' ? 'w' : 'j'}" title="Added by ${PEOPLE[item.addedBy].name}">${PEOPLE[item.addedBy].initial}</span>` : '';
  return `<li class="item${item.done ? ' is-done' : ''}${fresh ? ' arrive' : ''}" data-item="${escapeHtml(item.id)}">
    <button type="button" class="check" role="checkbox" aria-checked="${item.done}" data-toggle>
      <span class="box">${TICK}</span><span class="item-main"><span class="item-text">${escapeHtml(item.text)}</span>${item.qty ? `<span class="qty">${escapeHtml(item.qty)}</span>` : ''}</span>
    </button>${by}
    <button type="button" class="edit" data-edit aria-label="Edit ${escapeHtml(item.text)}">${PENCIL}</button>
  </li>`;
}

// Shopping lists are split under group headings, in the order you walk the shop.
const groupOf = (item) => (GROUP_IDS.has(item.grp) ? item.grp : guessGroup(item.text));
function groupedRows(items, fresh, shared) {
  return GROUPS.map((group) => {
    const inGroup = items.filter((item) => groupOf(item) === group.id);
    return inGroup.length ? `<li class="group-head" role="presentation" data-flip="head-${group.id}"><span>${group.name}</span><small>${inGroup.length}</small></li>${inGroup.map((item) => itemRow(item, fresh(item), shared)).join('')}` : '';
  }).join('');
}

// After the list re-draws, rows that moved glide from where they were to where they are now,
// so a ticked item travels down to Done instead of vanishing and reappearing.
function flipPositions() {
  const before = new Map();
  for (const el of document.querySelectorAll('#list [data-item], #list [data-flip]')) before.set(el.dataset.item ?? el.dataset.flip, el.getBoundingClientRect().top);
  return () => {
    if (REDUCED_MOTION.matches) return;
    for (const el of document.querySelectorAll('#list [data-item], #list [data-flip]')) {
      const was = before.get(el.dataset.item ?? el.dataset.flip);
      const moved = was === undefined ? 0 : was - el.getBoundingClientRect().top;
      if (Math.abs(moved) > 1) el.animate([{ transform: `translateY(${moved}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  };
}

function renderList(list) {
  const glide = shownList === list.id ? flipPositions() : null;
  try { drawList(list); } finally { glide?.(); }
}
function drawList(list) {
  if (shownList !== list.id) { shownIds = null; shownList = list.id; }
  const fresh = (item) => shownIds && !shownIds.has(item.id) && !REDUCED_MOTION.matches;
  const todo = list.items.filter((item) => !item.done).sort((x, y) => y.created - x.created);
  const done = list.items.filter((item) => item.done).sort((x, y) => (y.doneAt ?? 0) - (x.doneAt ?? 0));
  $('#todo').innerHTML = kindOf(list) === 'shopping' ? groupedRows(todo, fresh, list.shared) : todo.map((item) => itemRow(item, fresh(item), list.shared)).join('');
  $('#done').innerHTML = doneOpen ? done.map((item) => itemRow(item, fresh(item), list.shared)).join('') : '';
  $('#done-head').hidden = !done.length;
  $('#done-count').textContent = `Done (${done.length})`;
  $('#done-toggle').setAttribute('aria-expanded', doneOpen);
  const pct = list.items.length ? Math.round((done.length / list.items.length) * 100) : 0;
  $('#top-bar').style.width = `${pct}%`;
  $('#empty').textContent = list.items.length ? (todo.length ? '' : 'Everything’s ticked off.') : 'Nothing here yet. Add your first item above.';
  shownIds = new Set(list.items.map((item) => item.id));
}

// Ticking the last item: a short buzz, a confetti burst from the tick, and a message.
function celebrate(anchor) {
  navigator.vibrate?.([12, 50, 12]);
  showToast('All done');
  if (!anchor || REDUCED_MOTION.matches) return;
  const rect = anchor.getBoundingClientRect();
  const root = getComputedStyle(document.documentElement);
  const colours = [root.getPropertyValue('--ga').trim(), root.getPropertyValue('--gb').trim(), '#121826'];
  const burst = document.createElement('div');
  burst.className = 'burst';
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  for (let i = 0; i < 20; i++) {
    const piece = document.createElement('i');
    const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 60 + Math.random() * 70;
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance - 20}px`);
    piece.style.setProperty('--turn', `${Math.round(Math.random() * 360)}deg`);
    piece.style.setProperty('--c', colours[i % colours.length]);
    piece.style.animationDelay = `${Math.round(Math.random() * 70)}ms`;
    burst.append(piece);
  }
  document.body.append(burst);
  setTimeout(() => burst.remove(), 1100);
}

// Slide between all lists and one list. Opening a list adds a history entry, so Back returns home.
let lastView = null;
function onRoute() {
  const next = route() ? 'list' : 'home';
  if (lastView && lastView !== next && !REDUCED_MOTION.matches) {
    document.body.classList.remove('slide-in', 'slide-back', 'intro');
    void document.body.offsetWidth;
    document.body.classList.add(next === 'list' ? 'slide-in' : 'slide-back');
  }
  lastView = next;
  render();
  window.scrollTo(0, 0);
}
function openList(listId) {
  location.hash = `#/list/${encodeURIComponent(listId)}`;
  history.replaceState({ fromHome: true }, ''); // mark the new entry, so the back button can just go back
}
function goHome() { if (history.state?.fromHome) history.back(); else location.hash = '#/'; }
window.addEventListener('hashchange', onRoute);

// --- selecting lists: hold one, then tap more, to delete or pin them together ------------------
let selected = null; // a Set of list ids while selecting
const selectBar = $('#select-bar');

function startSelecting(listId) {
  selected = new Set([listId]);
  history.pushState({ selecting: true }, ''); // so the phone's back gesture just ends selecting
  render();
}
function stopSelecting() {
  if (!selected) return;
  selected = null;
  if (history.state?.selecting) history.back();
  render();
}
function toggleSelected(listId) {
  if (selected.has(listId)) selected.delete(listId); else selected.add(listId);
  if (!selected.size) stopSelecting(); else render();
}
window.addEventListener('popstate', () => { if (selected && !history.state?.selecting) { selected = null; render(); } });

function updateSelectBar() {
  selectBar.hidden = !selected;
  document.body.classList.toggle('is-selecting', Boolean(selected));
  if (!selected) return;
  const chosen = lists.filter((list) => selected.has(list.id));
  selectBar.querySelector('[data-select-pin]').hidden = chosen.some((list) => list.shared); // shared lists live under Together
  selectBar.querySelector('[data-select-pin]').textContent = chosen.every(isPinned) ? 'Unpin' : 'Pin';
  selectBar.querySelector('[data-select-edit]').hidden = chosen.length !== 1;
  selectBar.querySelector('[data-select-delete]').textContent = chosen.length > 1 ? `Delete ${chosen.length}` : 'Delete';
}

selectBar.addEventListener('click', (event) => {
  const chosen = lists.filter((list) => selected?.has(list.id));
  if (event.target.closest('[data-select-cancel]')) return stopSelecting();
  if (event.target.closest('[data-select-pin]')) {
    const pin = !chosen.every(isPinned);
    for (const list of [...chosen].reverse()) setPinned(list.id, pin);
    stopSelecting();
    showToast(pin ? `Pinned ${chosen.length > 1 ? plural(chosen.length, 'list') : 'to the top'}` : 'Unpinned');
    return;
  }
  if (event.target.closest('[data-select-edit]')) { stopSelecting(); if (chosen[0]) listMenu(chosen[0]); return; }
  if (event.target.closest('[data-select-delete]')) deleteLists(chosen);
});

function deleteLists(chosen) {
  if (!chosen.length) return;
  const saved = structuredClone(chosen);
  const savedPins = [...pins];
  for (const list of chosen) setPinned(list.id, false);
  change(...chosen.map((list) => ({ type: 'deleteList', id: list.id })));
  if (selected) stopSelecting();
  else if (route() && chosen.some((list) => list.id === route())) goHome();
  else render();
  const label = saved.length > 1 ? plural(saved.length, 'list') : `“${saved[0].name}”`;
  showToast(`Deleted ${label}`, () => {
    change(...saved.flatMap(restoreList));
    pins = savedPins;
    store.set('tally-pins', pins);
    render();
  });
}

// --- sheets ----------------------------------------------------------------------------------
const editSheet = $('#edit-sheet');
const editForm = $('#edit-form');
let sheetActions = null;

// `theme` and `pinned` are only passed for lists: they show the colour swatches and the pin switch.
const swatches = $('#swatches');
const pinToggle = $('#pin-toggle');
const shareToggle = $('#share-toggle');
const qtyField = $('#edit-qty');
const groupField = $('#edit-grp');
groupField.innerHTML = GROUPS.map((group) => `<option value="${group.id}">${group.name}</option>`).join('');
function openSheet({ title, value = '', placeholder = '', qty, group, theme, pinned, shared, onSave, onDelete }) {
  sheetActions = { onSave, onDelete };
  $('#edit-title').textContent = title;
  editForm.text.value = value;
  editForm.text.placeholder = placeholder;
  editSheet.querySelector('[data-sheet-delete]').hidden = !onDelete;
  swatches.hidden = theme === undefined;
  swatches.innerHTML = THEMES.map(([a, b], i) => `<button type="button" role="radio" aria-checked="${i === theme}" aria-label="Colour ${i + 1}" data-theme="${i}" style="--ga:${a};--gb:${b}">${TICK}</button>`).join('');
  pinToggle.hidden = pinned === undefined;
  pinToggle.setAttribute('aria-pressed', Boolean(pinned));
  qtyField.hidden = qty === undefined;
  qtyField.value = qty ?? '';
  groupField.hidden = group === undefined;
  if (group !== undefined) groupField.value = group;
  shareToggle.hidden = shared === undefined;
  shareToggle.setAttribute('aria-pressed', Boolean(shared));
  $('#share-title').textContent = me ? `Share with ${PEOPLE[otherPerson()].name}` : 'Share';
  editSheet.showModal();
  // On phones, only pop the keyboard up straight away when typing is the point.
  if (!value || !window.matchMedia('(pointer: coarse)').matches) editForm.text.focus();
  if (value && document.activeElement === editForm.text) editForm.text.select();
}
swatches.addEventListener('click', (event) => {
  const swatch = event.target.closest('[data-theme]');
  if (!swatch) return;
  for (const other of swatches.children) other.setAttribute('aria-checked', other === swatch);
});
pinToggle.addEventListener('click', () => pinToggle.setAttribute('aria-pressed', pinToggle.getAttribute('aria-pressed') !== 'true'));
shareToggle.addEventListener('click', () => shareToggle.setAttribute('aria-pressed', shareToggle.getAttribute('aria-pressed') !== 'true'));
editForm.addEventListener('submit', () => {
  const value = editForm.text.value.trim();
  const theme = Number(swatches.querySelector('[aria-checked="true"]')?.dataset.theme);
  // A switch that isn't on show for this sheet reports nothing, so it can't change anything.
  const on = (button) => (button.hidden ? undefined : button.getAttribute('aria-pressed') === 'true');
  if (value) sheetActions?.onSave(value, { theme, pinned: on(pinToggle), shared: on(shareToggle), qty: qtyField.hidden ? undefined : qtyField.value.trim(), group: groupField.hidden ? undefined : groupField.value });
});
editSheet.querySelector('[data-sheet-cancel]').addEventListener('click', () => editSheet.close());
editSheet.querySelector('[data-sheet-delete]').addEventListener('click', () => { editSheet.close(); sheetActions?.onDelete(); });
// tap outside the panel to close
editSheet.addEventListener('click', (event) => { if (event.target === editSheet) editSheet.close(); });

function newList() {
  const shopping = view === 'shopping';
  openSheet({ title: shopping ? 'New shopping list' : 'New to-do list', placeholder: shopping ? 'e.g. Groceries' : 'e.g. Chores', theme: nextTheme(), shared: false, onSave: (name, { theme, shared }) => {
    const listId = newId();
    change({ type: 'addList', id: listId, name, kind: view, shared, theme });
    openList(listId);
    setTimeout(() => $('#add-input').focus(), 50);
  } });
}

// A new list gets a random colour, just not the same as the list made before it.
function nextTheme() {
  const last = lists.at(-1)?.theme % THEMES.length;
  const choices = THEMES.map((_, i) => i).filter((i) => i !== last);
  return choices[Math.floor(Math.random() * choices.length)];
}

function listMenu(list) {
  const pinned = isPinned(list);
  const theme = list.theme % THEMES.length;
  const mine = ownerOf(list) === me; // only the person who made a list can share or unshare it
  openSheet({ title: 'Edit list', value: list.name, theme, pinned: list.shared ? undefined : pinned, shared: mine ? Boolean(list.shared) : undefined, onSave: (name, options) => {
    const ops = [];
    if (name !== list.name) ops.push({ type: 'renameList', id: list.id, name });
    if (options.theme !== theme) ops.push({ type: 'setTheme', id: list.id, theme: options.theme });
    if (options.shared !== undefined && options.shared !== Boolean(list.shared)) {
      ops.push({ type: 'setShared', id: list.id, shared: options.shared });
      if (options.shared) setPinned(list.id, false); // shared lists live under Together, not as pinned tiles
      showToast(options.shared ? `Shared with ${PEOPLE[otherPerson()].name}` : 'Not shared any more');
    }
    if (ops.length) change(...ops);
    if (options.pinned !== undefined && options.pinned !== pinned && !options.shared) {
      setPinned(list.id, options.pinned);
      showToast(options.pinned ? 'Pinned to the top' : 'Unpinned');
    }
    render();
  }, onDelete: () => deleteLists([list]) });
}

function deleteItemWithUndo(item) {
  const saved = { ...item };
  change({ type: 'deleteItem', id: item.id });
  render();
  showToast('Item deleted', () => { change(...restoreItems([saved])); render(); });
}

function itemMenu(item) {
  const shopping = kindOf(lists.find((list) => list.id === item.listId)) === 'shopping';
  openSheet({ title: 'Edit item', value: item.text, qty: shopping ? item.qty ?? '' : undefined, group: shopping ? groupOf(item) : undefined, onSave: (text, { qty, group }) => {
    change({ type: 'editItem', id: item.id, text, ...(qty !== undefined && { qty }), ...(group !== undefined && { grp: group }) });
    render();
  }, onDelete: () => deleteItemWithUndo(item) });
}

// Undo puts things back with their original ids and dates.
const restoreItems = (items) => items.flatMap((item) => [
  { type: 'addItem', id: item.id, listId: item.listId, text: item.text, qty: item.qty, grp: item.grp, by: item.addedBy, at: item.created },
  ...(item.done ? [{ type: 'checkItem', id: item.id, done: true, by: item.doneBy, at: item.doneAt }] : []),
]);
const restoreList = (list) => [{ type: 'addList', id: list.id, name: list.name, kind: kindOf(list), by: ownerOf(list), shared: Boolean(list.shared), theme: list.theme, at: list.created }, ...restoreItems(list.items)];

// --- who's this: asked once per phone, and again if you tap Switch ---------------------------
const whoSheet = $('#who-sheet');
function askWho() {
  if (whoSheet.open) return;
  whoSheet.showModal();
  document.activeElement?.blur(); // don't highlight the first button as if it were already chosen
}
whoSheet.addEventListener('cancel', (event) => { if (!me) event.preventDefault(); });
whoSheet.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-who]');
  if (!choice) { if (event.target === whoSheet && me) whoSheet.close(); return; }
  if (choice.dataset.who !== me) {
    me = choice.dataset.who;
    store.set('tally-me', me);
    // Forget the other person's lists, then fetch this person's.
    server = { version: 0, lists: [] };
    loaded = false;
    store.set('tally-server', server);
    selected = null;
    rebuild();
    pull();
    connectLive();
  }
  whoSheet.close();
  render();
});

// --- sign in (only when the server has APP_PASSWORD set) -----------------------------------
const loginSheet = $('#login-sheet');
const loginForm = $('#login-form');
function askForPassword() {
  if (loginSheet.open) return;
  editSheet.close();
  loginSheet.showModal();
}
loginSheet.addEventListener('cancel', (event) => event.preventDefault());
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#login-error').textContent = '';
  const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: loginForm.password.value }) }).catch(() => null);
  if (!res) { $('#login-error').textContent = 'Can’t reach the server.'; return; }
  if (!res.ok) { $('#login-error').textContent = 'That password didn’t work.'; loginForm.password.select(); return; }
  loginForm.reset();
  loginSheet.close();
  pull();
  connectLive();
});

// --- toast with undo -------------------------------------------------------------------------
const toast = $('#toast');
let toastTimer;
let undoAction = null;
function showToast(text, undo) {
  $('#toast-text').textContent = text;
  undoAction = undo;
  $('#toast-undo').hidden = !undo;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); undoAction = null; }, undo ? 5000 : 1800);
}
$('#toast-undo').addEventListener('click', () => {
  undoAction?.();
  undoAction = null;
  toast.classList.remove('show');
});

// --- events ----------------------------------------------------------------------------------
// Shopping lists pull a quantity out of what you type: "2 milk", "milk x2", "500g pasta", "milk 2L".
const UNIT = '(?:kg|g|l|ml|lb|oz|packs?|pk|tins?|cans?|bottles?|loaves|loaf|bags?|boxes|box|dozen)';
function parseQuantity(input) {
  const text = input.trim();
  let match = text.match(/^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i); // milk x2
  if (match) return { text: match[1].trim(), qty: `×${match[2]}` };
  match = text.match(/^(\d+(?:\.\d+)?)\s*[x×]\s+(.+)$/i); // 2x milk
  if (match) return { text: match[2].trim(), qty: `×${match[1]}` };
  match = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?\\s*${UNIT})(?:\\s+of)?\\s+(.+)$`, 'i')) // 500g pasta, 2 packs rice
    || text.match(/^(\d+(?:\.\d+)?)\s+(.+)$/); // 2 milk
  if (match) return { text: match[2].trim(), qty: match[1].replace(/\s+/g, ' ').trim() };
  match = text.match(new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?\\s*${UNIT})$`, 'i')); // milk 2L
  if (match) return { text: match[1].trim(), qty: match[2].replace(/\s+/g, ' ').trim() };
  return { text, qty: '' };
}

const addForm = $('#add-form');
const addInput = $('#add-input');
const suggestBox = $('#suggest');
const itemKey = (text) => text.trim().toLowerCase().replace(/\s+/g, ' ');

// Everything bought before: the server's history, plus items on shopping lists that haven't reached it yet.
function knownItems() {
  const known = new Map((server.history ?? []).map((entry) => [itemKey(entry.text), entry]));
  for (const list of lists) {
    if (kindOf(list) !== 'shopping') continue;
    for (const item of list.items) if (!known.has(itemKey(item.text))) known.set(itemKey(item.text), { text: item.text, qty: item.qty ?? '', grp: item.grp, count: 1 });
  }
  for (const text of ['Milk', 'Bread', 'Eggs', 'Butter', 'Cheese', 'Yoghurt', 'Bananas', 'Apples', 'Oranges', 'Strawberries', 'Potatoes', 'Onions', 'Carrots', 'Tomatoes', 'Lettuce', 'Broccoli', 'Mushrooms', 'Chicken', 'Beef', 'Salmon', 'Rice', 'Pasta', 'Noodles', 'Flour', 'Sugar', 'Salt', 'Olive oil', 'Coffee', 'Tea', 'Cereal', 'Oats', 'Baked beans', 'Tinned tomatoes', 'Toilet roll', 'Kitchen roll', 'Washing up liquid', 'Laundry detergent', 'Bin bags', 'Toothpaste', 'Shampoo']) {
    if (!known.has(itemKey(text))) known.set(itemKey(text), { text, qty: '', grp: guessGroup(text), count: 0, staple: true });
  }
  return [...known.values()];
}

// Suggestions for what's typed: names that start with it first, then names with a word that does.
// Items already waiting on this list are left out. A ticked one can be brought back instead.
function suggestionsFor(list, typed) {
  const waiting = new Set(list.items.filter((item) => !item.done).map((item) => itemKey(item.text)));
  const query = itemKey(typed.replace(new RegExp(`^\\d+(?:\\.\\d+)?(?:\\s*${UNIT})?(?:\\s+of)?\\s+`, 'i'), ''));
  const pool = knownItems().filter((entry) => !waiting.has(itemKey(entry.text)));
  if (!query) return pool.filter((entry) => !entry.staple).slice(0, 10);
  const starts = (entry) => itemKey(entry.text).startsWith(query);
  const wordStarts = (entry) => itemKey(entry.text).split(' ').some((word) => word.startsWith(query));
  const byCount = (a, b) => b.count - a.count;
  return [...pool.filter(starts).sort(byCount), ...pool.filter((entry) => !starts(entry) && wordStarts(entry)).sort(byCount)].slice(0, 8);
}

function renderSuggestions() {
  const list = currentList();
  const typed = addInput.value.trim();
  const show = list && kindOf(list) === 'shopping' && document.activeElement === addInput;
  const found = show ? suggestionsFor(list, typed) : [];
  suggestBox.hidden = !found.length;
  suggestBox.innerHTML = found.length ? `${typed ? '' : '<span class="suggest-label">Buy again</span>'}${found.map((entry, i) => `<button type="button" data-suggest="${i}">${escapeHtml(entry.text)}${entry.qty ? `<small>${escapeHtml(entry.qty)}</small>` : ''}</button>`).join('')}` : '';
  suggestBox.found = found;
}

function addToList(list, name, qty, grp) {
  const shopping = kindOf(list) === 'shopping';
  if (shopping) name = name.charAt(0).toUpperCase() + name.slice(1);
  const brought = shopping && list.items.find((item) => item.done && itemKey(item.text) === itemKey(name));
  if (brought) change({ type: 'checkItem', id: brought.id, done: false }); // already on the list, ticked: put it back
  else change({ type: 'addItem', id: newId(), listId: list.id, text: name, qty, ...(shopping && { grp: GROUP_IDS.has(grp) ? grp : guessGroup(name) }) });
}

addInput.addEventListener('input', () => { addForm.classList.toggle('has-text', addInput.value.trim() !== ''); renderSuggestions(); });
addInput.addEventListener('focus', () => { document.body.classList.add('typing'); renderSuggestions(); });
addInput.addEventListener('blur', () => setTimeout(() => { // after a tap on a suggestion has landed
  if (document.activeElement !== addInput) document.body.classList.remove('typing');
  renderSuggestions();
}, 150));
addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const list = currentList();
  const text = addInput.value.trim();
  if (!list || !text) return;
  const shopping = kindOf(list) === 'shopping';
  const parsed = shopping ? parseQuantity(text) : { text, qty: '' };
  const name = shopping ? parsed.text.charAt(0).toUpperCase() + parsed.text.slice(1) : parsed.text;
  // Typing something you've bought before fills in its usual quantity and group.
  const usual = shopping ? knownItems().find((entry) => itemKey(entry.text) === itemKey(name)) : null;
  addToList(list, usual?.text ?? name, parsed.qty || usual?.qty || '', usual?.grp);
  addInput.value = '';
  addForm.classList.remove('has-text');
  render();
  addInput.focus(); // keep the keyboard up for the next item
  renderSuggestions();
});
// Tapping a suggestion adds it without taking the keyboard away.
suggestBox.addEventListener('pointerdown', (event) => { if (event.target.closest('button')) event.preventDefault(); });
suggestBox.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-suggest]');
  const list = currentList();
  const entry = chip && suggestBox.found?.[Number(chip.dataset.suggest)];
  if (!entry || !list) return;
  const prefix = addInput.value.trim().match(new RegExp(`^(\\d+(?:\\.\\d+)?(?:\\s*${UNIT})?)(?:\\s+of)?\\s+`, 'i'));
  addToList(list, entry.text, prefix ? prefix[1] : entry.qty, entry.grp);
  addInput.value = '';
  addForm.classList.remove('has-text');
  render();
  addInput.focus();
  renderSuggestions();
});

document.addEventListener('click', (event) => {
  if (held) { held = false; event.preventDefault(); return; }
  const target = event.target;
  if (target.closest('[data-switch-who]')) return askWho();
  const switchTo = target.closest('[data-set-view]');
  if (switchTo) return setView(switchTo.dataset.setView);
  const tile = target.closest('[data-list]');
  if (tile && selected) return toggleSelected(tile.dataset.list);
  if (tile) { openList(tile.dataset.list); return; }
  if (target.closest('[data-new-list]')) return selected ? stopSelecting() : newList();
  if (target.closest('[data-go-home]')) return goHome();
  if (target.closest('[data-list-menu]')) { const list = currentList(); if (list) listMenu(list); return; }
  if (target.closest('[data-clear-done]')) {
    const list = currentList();
    const done = list.items.filter((item) => item.done).map((item) => ({ ...item }));
    change({ type: 'clearDone', listId: list.id });
    render();
    showToast(`Cleared ${plural(done.length, 'item')}`, () => { change(...restoreItems(done)); render(); });
    return;
  }
  if (target.closest('#done-toggle')) { doneOpen = !doneOpen; store.set('tally-done-open', doneOpen); render(); return; }
  const row = target.closest('[data-item]');
  if (!row) return;
  const item = findItem(lists, row.dataset.item);
  if (!item) return;
  if (target.closest('[data-edit]')) return itemMenu(item);
  if (target.closest('[data-toggle]')) {
    const done = !item.done;
    row.classList.add(done ? 'ticking' : 'unticking');
    row.classList.toggle('is-done', done);
    row.querySelector('[data-toggle]').setAttribute('aria-checked', done);
    navigator.vibrate?.(8);
    change({ type: 'checkItem', id: item.id, done });
    showStatus();
    // The circle pops and the line draws across, then the row slides away and the list re-sorts.
    if (done && currentList()?.items.every((entry) => entry.done)) celebrate(row.querySelector('.box'));
    scheduleRender(REDUCED_MOTION.matches ? 0 : 420);
  }
});

// Press and hold a list tile or an item to rename or delete it, like holding a tile in App Drawer.
let hold = null;
let held = false;
document.addEventListener('pointerdown', (event) => {
  const target = event.target.closest('[data-list], [data-item]');
  if (!target || event.button > 0) return;
  held = false;
  hold = { x: event.clientX, y: event.clientY, timer: setTimeout(() => {
    held = true;
    navigator.vibrate?.(12);
    if (target.dataset.list) { if (selected) toggleSelected(target.dataset.list); else startSelecting(target.dataset.list); }
    else { const item = findItem(lists, target.dataset.item); if (item) itemMenu(item); }
  }, HOLD_MS) };
});
const cancelHold = () => { if (hold) clearTimeout(hold.timer); hold = null; };
document.addEventListener('pointerup', cancelHold);
document.addEventListener('pointercancel', cancelHold);
document.addEventListener('pointermove', (event) => { if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10) cancelHold(); });
document.addEventListener('contextmenu', (event) => { if (event.target.closest('[data-list], [data-item]')) event.preventDefault(); });
// iOS Safari only shows :active press styles when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// Swipe sideways on the home screen to switch between To-do and Shopping.
let swipe = null;
document.addEventListener('touchstart', (event) => {
  const t = event.touches[0];
  const blocked = document.body.dataset.view !== 'home' || selected || event.touches.length > 1 || event.target.closest('dialog, .select-bar, .install');
  swipe = blocked ? null : { x: t.clientX, y: t.clientY, at: performance.now(), horizontal: false };
}, { passive: true });
document.addEventListener('touchmove', (event) => {
  if (!swipe) return;
  const dx = event.touches[0].clientX - swipe.x;
  const dy = event.touches[0].clientY - swipe.y;
  if (!swipe.horizontal && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) swipe.horizontal = true;
  if (!swipe.horizontal) return;
  event.preventDefault();
  cancelHold();
  const blocked = (view === 'todo' && dx > 0) || (view === 'shopping' && dx < 0);
  const distance = blocked ? dx * .18 : dx;
  $('#home-content').dataset.drag = distance;
  if (!REDUCED_MOTION.matches) $('#home-content').style.transform = `translateX(${distance}px)`;
}, { passive: false });
function resetSwipe() {
  const content = $('#home-content');
  const from = content.style.transform || 'none';
  content.style.transform = '';
  delete content.dataset.drag;
  if (!REDUCED_MOTION.matches) content.animate([{ transform: from }, { transform: 'translateX(0)' }], { duration: 200, easing: 'ease-out' });
  swipe = null;
}
document.addEventListener('touchend', (event) => {
  if (!swipe) return;
  const t = event.changedTouches[0];
  const dx = t.clientX - swipe.x;
  const dy = t.clientY - swipe.y;
  const velocity = Math.abs(dx) / Math.max(1, performance.now() - swipe.at);
  const next = dx < 0 ? 'shopping' : 'todo';
  if ((Math.abs(dx) < 60 && !(Math.abs(dx) > 25 && velocity > .4)) || Math.abs(dx) < Math.abs(dy) * 1.5 || next === view) { resetSwipe(); return; }
  held = true; // Suppress the tile click generated at the end of a swipe.
  swipe = null;
  setView(next);
}, { passive: true });
document.addEventListener('touchcancel', resetSwipe);

// Swipe an item left to delete it. It follows your finger with red behind it; let go past a third
// of the way (or flick it) and it slides off, the gap closes, and Undo appears. A short swipe springs back.
let itemSwipe = null;
document.addEventListener('touchstart', (event) => {
  const row = event.target.closest('.item');
  itemSwipe = row && event.touches.length === 1 && !event.target.closest('dialog') ? { row, x: event.touches[0].clientX, y: event.touches[0].clientY, at: performance.now(), horizontal: false, dx: 0 } : null;
}, { passive: true });
document.addEventListener('touchmove', (event) => {
  if (!itemSwipe) return;
  const dx = event.touches[0].clientX - itemSwipe.x;
  const dy = event.touches[0].clientY - itemSwipe.y;
  if (!itemSwipe.horizontal && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { itemSwipe = null; return; }
  if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) itemSwipe.horizontal = true;
  if (!itemSwipe.horizontal) return;
  event.preventDefault();
  cancelHold();
  itemSwipe.dx = dx < 0 ? dx : dx * 0.15; // only left deletes; right just gives a little
  itemSwipe.row.classList.add('swiping');
  itemSwipe.row.style.transform = `translateX(${itemSwipe.dx}px)`;
}, { passive: false });
function finishItemSwipe(cancelled = false) {
  if (!itemSwipe) return;
  const { row, horizontal, dx, at } = itemSwipe;
  itemSwipe = null;
  if (!horizontal) return;
  held = true; // the touch ending shouldn't also tick the item
  const flicked = dx < -40 && Math.abs(dx) / Math.max(1, performance.now() - at) > 0.5;
  if (!cancelled && (dx < -row.offsetWidth * 0.35 || flicked)) { swipeAway(row); return; }
  row.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  row.style.transform = '';
  row.classList.remove('swiping');
}
function swipeAway(row) {
  const item = findItem(lists, row.dataset.item);
  if (!item) return;
  if (REDUCED_MOTION.matches) { deleteItemWithUndo(item); return; }
  const height = row.offsetHeight;
  row.style.pointerEvents = 'none';
  row.animate([{ transform: row.style.transform || 'translateX(0)' }, { transform: `translateX(${-row.offsetWidth - 40}px)` }], { duration: 170, easing: 'ease-in', fill: 'forwards' }).finished
    .then(() => {
      row.style.overflow = 'hidden';
      return row.animate([{ height: `${height}px`, minHeight: `${height}px`, marginBottom: '0px' }, { height: '0px', minHeight: '0px', marginBottom: '-8px' }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).finished;
    })
    .then(() => deleteItemWithUndo(item));
}
document.addEventListener('touchend', () => finishItemSwipe(), { passive: true });
document.addEventListener('touchcancel', () => finishItemSwipe(true), { passive: true });

// Keep dialogs inside the visible area when a phone's keyboard opens.
function updateViewport() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--visible-height', `${height}px`);
  document.documentElement.style.setProperty('--visible-top', `${viewport?.offsetTop ?? 0}px`);
  // How much of the bottom of the screen the keyboard covers, so things can sit just above it.
  document.documentElement.style.setProperty('--keyboard-inset', `${Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0))}px`);
  document.body.classList.toggle('keyboard-open', height < window.innerHeight - 120);
}
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);
window.addEventListener('resize', updateViewport);
updateViewport();

document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected && !editSheet.open) stopSelecting(); });

// pinned header: add a soft shadow once the page scrolls under it
new IntersectionObserver(([entry]) => $('.top').classList.toggle('stuck', !entry.isIntersecting)).observe($('#top-sentinel'));

// Keep in step with other phones: check every few seconds while open, and straight away on return.
// Changes arrive instantly over a live connection. Checking every few seconds is only the fallback
// for when that connection isn't up, plus a slow safety check while it is.
let live = false;
let source = null;
function connectLive() {
  if (!me || source || !('EventSource' in window)) return;
  source = new EventSource('/api/events');
  source.onopen = () => { live = true; };
  source.onmessage = (event) => {
    try { if (JSON.parse(event.data).version !== server.version) pull(); } catch { /* ignore a garbled message */ }
  };
  source.onerror = () => {
    live = false;
    if (source.readyState === EventSource.CLOSED) { source = null; setTimeout(connectLive, 15_000); } // e.g. signed out
  };
}
setInterval(() => { if (!document.hidden && (!live || Date.now() - lastPull > 30_000)) pull(); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
window.addEventListener('online', pull);
window.addEventListener('offline', () => { online = false; showStatus(); });

// --- install as an app -----------------------------------------------------------------------
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installBar = $('#install');
let installEvent = null;

function snoozed() { return Date.now() < store.get('tally-install-snooze', 0); }
function showInstall() {
  if (isInstalledApp() || snoozed()) return;
  if (installEvent) {
    $('#install-go').hidden = false;
  } else if (IS_IOS) {
    // iPhone and iPad have no install button for websites: point to Share → Add to Home Screen.
    $('#install-go').hidden = true;
    $('#install-note').innerHTML = 'Tap <svg class="ios-share" viewBox="0 0 24 24" aria-label="Share"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2"/></svg> then “Add to Home Screen”';
  } else {
    return;
  }
  installBar.hidden = false;
}
function hideInstall(snoozeDays) {
  installBar.hidden = true;
  if (snoozeDays) store.set('tally-install-snooze', Date.now() + snoozeDays * 86_400_000);
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // show our own prompt instead of the browser's mini bar
  installEvent = event;
  setTimeout(showInstall, 1200);
});
$('#install-go').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  hideInstall(outcome === 'accepted' ? 0 : INSTALL_SNOOZE_DAYS);
});
$('#install-close').addEventListener('click', () => hideInstall(INSTALL_SNOOZE_DAYS));
window.addEventListener('appinstalled', () => { hideInstall(0); showToast('Installed. Open it from your home screen'); });
if (IS_IOS) setTimeout(showInstall, 1500);

// Offline support: the service worker keeps a copy of the app so it opens without a connection.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// --- start -----------------------------------------------------------------------------------
document.body.classList.add('preload');
if (!me) { server = { version: 0, lists: [] }; loaded = false; askWho(); }
rebuild();
onRoute();
pull();
connectLive();
const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 500))]).then(() => {
  document.body.classList.remove('preload');
  document.body.classList.add('intro');
  setTimeout(() => document.body.classList.remove('intro'), 1200);
});
