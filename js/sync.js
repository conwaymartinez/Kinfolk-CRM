// Google Sheets sync through the Apps Script web app (apps-script/Code.gs).
// Every change is an op in an outbox; the outbox flushes in batches and survives reloads/offline.
import {
  state, setEmitter, load, save, KEYS, fromSheet, targetFromSheet, targetToSheet, SOURCE_IDS,
} from './store.js';

const OUTBOX = 'kinfolk-v3-outbox';
let outbox = load(OUTBOX, null) ?? load('kinfolk-outbox-v1', []); // carry over unsent v2 edits
let flushing = false;
let timer;
let onChange = () => {};

const saveOutbox = () => { save(OUTBOX, outbox); state.sync.queued = outbox.length; };

async function parse(res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch {
    throw new Error(text.includes('<html') || text.includes('<!DOCTYPE')
      ? 'The URL returned a web page, not data. Check the deployment is a Web app with access set to Anyone.'
      : 'Unexpected response from the sheet.');
  }
  if (!body.ok) throw new Error(body.error === 'unauthorized' ? 'Token rejected – check it matches the sheet.' : body.error || 'Sheet error');
  return body;
}

async function fetchAll(cfg) {
  const sep = cfg.url.includes('?') ? '&' : '?';
  const res = await fetch(`${cfg.url}${sep}token=${encodeURIComponent(cfg.token)}&t=${Date.now()}`, { redirect: 'follow' });
  const body = await parse(res);
  if (!body.data) throw new Error('No data returned');
  return body.data;
}

async function post(cfg, ops) {
  const res = await fetch(cfg.url, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: cfg.token, ops }),
  });
  return parse(res);
}

const offline = (msg) => !navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(msg);

function setStatus(status, message = '') {
  state.sync.status = status;
  state.sync.message = message;
  onChange();
}

export function queueOps(ops) {
  if (!state.sync.config || !ops.length) return;
  outbox.push(...ops);
  saveOutbox();
  clearTimeout(timer);
  timer = setTimeout(flush, 900);
}

export async function flush() {
  const cfg = state.sync.config;
  if (!cfg || flushing) return false;
  if (!outbox.length) return true;
  flushing = true;
  setStatus('syncing');
  try {
    while (outbox.length) {
      const batch = outbox.slice(0, 40);
      await post(cfg, batch);
      outbox = outbox.slice(batch.length);
      saveOutbox();
    }
    state.sync.lastSync = Date.now();
    setStatus('synced');
    return true;
  } catch (e) {
    const msg = e.message || String(e);
    setStatus(offline(msg) ? 'offline' : 'error', offline(msg) ? 'Offline — changes are queued and will sync later.' : msg);
    return false;
  } finally {
    flushing = false;
  }
}

function apply(data) {
  const touches = (data.touches || []).map((t) => ({
    touch_id: Number(t.touch_id), date: String(t.date || ''), person_id: Number(t.person_id),
    person: String(t.person ?? ''), next_step: String(t.next_step ?? ''), project: String(t.project ?? ''),
  })).filter((t) => t.touch_id);
  state.people = (data.people || []).map((r) => fromSheet(r)).filter((p) => p.id && p.name);
  state.touches = touches;
  if (data.projects?.length) state.projects = data.projects;
  if (data.groups?.length) state.groups = data.groups;

  state.sync.v3 = Number(data.version) >= 3;
  if (state.sync.v3) {
    const remote = (data.targets || []).map(targetFromSheet).filter((t) => t.id && t.company);
    const local = state.targets.filter((t) => !t.id.startsWith('demo'));
    if (!remote.length && local.length) {
      // First sync after upgrading Code.gs: upload company lists made while local-only.
      outbox.push(...local.map((t) => ({ op: 'upsertTarget', target: targetToSheet(t) })));
      saveOutbox();
      state.targets = local;
    } else {
      state.targets = remote;
    }
    (data.sources || []).forEach((s) => {
      const id = SOURCE_IDS.find((x) => x.toLowerCase() === String(s.source).toLowerCase());
      if (id && s.where) state.sourceNotes[id] = String(s.where);
    });
  } else {
    state.targets = state.targets.filter((t) => !t.id.startsWith('demo'));
  }
  if (state.ui.selectedId && !state.people.some((p) => p.id === state.ui.selectedId)) state.ui.selectedId = null;
}

export async function pull() {
  const cfg = state.sync.config;
  if (!cfg) return;
  if (!(await flush()) || outbox.length) return;
  setStatus('syncing');
  try {
    const data = await fetchAll(cfg);
    if (outbox.length) { setStatus('synced'); return; } // edits arrived mid-pull; next pull picks it up
    apply(data);
    state.sync.lastSync = Date.now();
    setStatus('synced');
    if (outbox.length) flush();
  } catch (e) {
    const msg = e.message || String(e);
    setStatus(offline(msg) ? 'offline' : 'error', offline(msg) ? 'Offline — showing your last saved copy.' : msg);
  }
}

export async function connect(url, token) {
  const cfg = { url: url.trim(), token: token.trim() };
  const data = await fetchAll(cfg); // throws with a readable message
  outbox = [];
  saveOutbox();
  save(KEYS.sync, cfg);
  state.sync.config = cfg;
  apply(data);
  state.sync.lastSync = Date.now();
  setStatus('synced');
  return data.people?.length ?? 0;
}

export function disconnect() {
  save(KEYS.sync, null);
  state.sync.config = null;
  outbox = [];
  saveOutbox();
  setStatus('local');
}

export function syncLabel() {
  const s = state.sync;
  if (s.status === 'local') return 'Local only';
  if (s.status === 'syncing') return 'Syncing…';
  if (s.status === 'synced') return s.queued ? `${s.queued} to sync` : 'Synced';
  if (s.status === 'offline') return s.queued ? `Offline · ${s.queued} queued` : 'Offline';
  return 'Sync error';
}

export function startSync(rerender) {
  onChange = rerender;
  setEmitter(queueOps);
  state.sync.queued = outbox.length;
  if (!state.sync.config) return;
  state.sync.status = 'syncing';
  pull();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('online', () => pull());
  setInterval(pull, 5 * 60e3);
}
