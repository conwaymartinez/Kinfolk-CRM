// Kinfolk: layout, routing, events and keyboard shortcuts.
import { html, icon, fromLocalInput, HOUR, DAY, startOfDay } from './ui.js';
import * as S from './store.js';
import { state } from './store.js';
import { startSync, connect, disconnect, pull, syncLabel } from './sync.js';
import { renderToday, emptyFind } from './views/today.js';
import { renderFollowUp, sortedRows } from './views/followup.js';
import { renderSources, PAGE } from './views/sources.js';
import { renderModal } from './views/modals.js';
import { renderCalls, currentCall, newCallDraft, callDraft } from './views/calls.js';

const root = document.getElementById('root');
state.ui.find = emptyFind();
state.ui.paste = { open: false, list: '', project: '', text: '' };

// ───────────── render ─────────────
function rail() {
  const r = state.ui.route;
  const late = S.lateCount();
  const cols = S.columns();
  const leads = S.prospectStats().total;
  const closed = S.closedStats(state.now);
  const book = S.callBook(state.now);
  const callsLeft = S.callWorkList(state.now).length;
  const item = (id, href, label, ic, extra) => html`
    <a href="${href}" class="rail-item ${r === id ? 'on' : ''}" aria-current="${r === id ? 'page' : 'false'}">
      ${icon(ic, 18)}<span class="rail-label">${label}</span>${extra || ''}</a>`;
  return html`
    <nav class="rail" aria-label="Main">
      <a href="#/today" class="ws" aria-label="Kinfolk home"><span class="logo">K</span><span class="ws-text"><strong>Kinfolk</strong><span>Sales CRM</span></span></a>
      ${item('today', '#/today', 'Today', 'today')}
      ${item('follow-up', '#/follow-up', 'Follow up', 'clock', late ? html`<span class="badge" aria-label="${late} late">${late}</span>` : '')}
      ${item('calls', '#/calls', 'Calls', 'phone', html`${callsLeft ? html`<span class="rail-n" title="Left today">${callsLeft}</span>` : ''}${book.missed.length ? html`<span class="badge" aria-label="${book.missed.length} missed">${book.missed.length}</span>` : ''}`)}
      ${item('sources', '#/leads', 'Leads', 'sources', leads ? html`<span class="rail-n">${leads}</span>` : '')}
      <div class="rail-sec">
        <p class="rail-h">Pipeline</p>
        ${S.ENGAGED.map((s) => html`<a class="rail-stage" href="#/follow-up" title="${s.desc} · every ${s.every}"><span class="dot s-${s.id}"></span>${s.label}<span class="rail-n">${cols[s.id].length}</span></a>`)}
        <p class="rail-h">Last 30 days</p>
        <span class="rail-stage">Won<span class="rail-n">${closed.wonMonth}</span></span>
        <span class="rail-stage">Lost<span class="rail-n">${closed.lostMonth}</span></span>
      </div>
      <span class="grow"></span>
      <button type="button" class="sync-pill ${state.sync.status}" data-action="sync-open"
        title="${state.sync.lastSync ? 'Last synced ' + new Date(state.sync.lastSync).toLocaleTimeString() : 'Connect to your Google Sheet'}"><span class="dot"></span><span class="sync-text">${syncLabel()}</span></button>
      <button type="button" class="rail-mini" data-action="keys-open" aria-label="Keyboard shortcuts">${icon('keyboard', 16)}<span class="rail-label">Shortcuts</span><kbd>?</kbd></button>
    </nav>`;
}

function view() {
  if (state.ui.route === 'follow-up') return renderFollowUp();
  if (state.ui.route === 'sources') return renderSources();
  if (state.ui.route === 'calls') return renderCalls();
  return renderToday();
}

let focusAfter = null;
export function render() {
  state.now = Date.now();
  const a = document.activeElement;
  let key = null;
  let sel = null;
  if (a && a !== document.body && root.contains(a)) {
    key = a.id ? '#' + a.id : a.dataset.bind ? `[data-bind="${a.dataset.bind}"]` : a.dataset.card ? `[data-card="${a.dataset.card}"]` : null;
    try { sel = [a.selectionStart, a.selectionEnd]; } catch { sel = null; }
  }
  // Board columns scroll on their own; keep each one where it was across the re-render.
  const scrolls = [...root.querySelectorAll('[data-scroll]')].map((el) => [el.dataset.scroll, el.scrollTop]);
  root.innerHTML = String(html`
    <div class="app">${rail()}<main class="main" id="main">${view()}</main></div>
    ${renderModal()}
    <div class="toast-wrap" aria-live="polite">${state.ui.toast ? html`<div class="toast">${state.ui.toast}</div>` : ''}</div>`);
  scrolls.forEach(([k, top]) => { const el = root.querySelector(`[data-scroll="${k}"]`); if (el) el.scrollTop = top; });
  // Keep the selected board card in view inside its column (without scrolling the page).
  const picked = state.ui.route === 'follow-up' && state.ui.selectedId != null && root.querySelector(`.col-body [data-card="${state.ui.selectedId}"]`);
  if (picked) {
    const box = picked.parentElement;
    const top = picked.offsetTop;
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (top + picked.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + picked.offsetHeight - box.clientHeight + 4;
  }
  const target = focusAfter ? root.querySelector(focusAfter) : key ? root.querySelector(key) : null;
  focusAfter = null;
  if (target) {
    target.focus({ preventScroll: true });
    if (sel && sel[0] !== null && typeof target.setSelectionRange === 'function' && target === document.activeElement) {
      try { target.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ }
    }
  } else if (state.ui.modal) {
    root.querySelector('.modal input, .modal button')?.focus();
  }
  S.persist();
}

let toastTimer;
function toast(text) {
  if (!text) return;
  state.ui.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.ui.toast = null; render(); }, 2600);
}

// ───────────── routing ─────────────
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('follow-up')) { state.ui.route = 'follow-up'; state.ui.followView = h.endsWith('/sheet') ? 'sheet' : 'pipeline'; }
  else if (h.startsWith('leads') || h.startsWith('sources')) state.ui.route = 'sources';
  else if (h.startsWith('calls')) state.ui.route = 'calls';
  else state.ui.route = 'today';
  state.ui.selectedId = state.ui.route === 'follow-up' ? state.ui.selectedId : null;
  clearMulti();
  Object.assign(state.ui.pool, { picked: [], anchor: null });
  state.ui.sched = { id: null, day: null, bulkDay: null };
  render();
  document.getElementById('main')?.scrollTo?.(0, 0);
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ───────────── modals ─────────────
function openPerson(id, { touch = false, focus } = {}) {
  const p = id ? S.byId(id) : null;
  const draft = p ? { ...p } : S.blankPerson();
  state.ui.modal = { type: 'person', id: p ? p.id : null, draft, touch, preset: null, error: '', confirmRemove: false, origNext: draft.nextStep };
  focusAfter = focus || (p ? '#next-step' : '#person-name');
  render();
}
function openFind(source) {
  state.ui.modal = { type: 'find', draft: { source: source || state.ui.today.source || 'Events', organization: '', industry: '', project: state.ui.today.project || '', name: '', role: '', email: '', phone: '', why: '', error: '' } };
  focusAfter = '#find-org';
  render();
}
const closeModal = () => { state.ui.modal = null; render(); };

// ───────────── actions ─────────────
/**
 * Arrow-key navigation. On the board, up/down stays in the column and left/right jumps to the
 * same row of the next column that has cards. In the spreadsheet only up/down applies.
 */
function moveSelection(sel, dx, dy) {
  if (state.ui.route !== 'follow-up') return null;
  if (state.ui.followView === 'sheet') {
    if (dx) return sel;
    const order = sortedRows().map((p) => p.id);
    const i = order.indexOf(sel);
    if (!order.length) return null;
    return i < 0 ? order[0] : order[Math.min(order.length - 1, Math.max(0, i + dy))];
  }
  const c = S.columns();
  const cols = S.ENGAGED.map((st) => c[st.id].map((p) => p.id));
  let ci = cols.findIndex((ids) => ids.includes(sel));
  if (ci < 0) return cols.find((ids) => ids.length)?.[0] ?? null;
  const ri = cols[ci].indexOf(sel);
  if (dy) return cols[ci][Math.min(cols[ci].length - 1, Math.max(0, ri + dy))];
  for (let n = ci + dx; n >= 0 && n < cols.length; n += dx) {
    if (cols[n].length) return cols[n][Math.min(ri, cols[n].length - 1)];
  }
  return sel;
}

// ───────────── spreadsheet multi-select ─────────────
const inSheet = () => state.ui.route === 'follow-up' && state.ui.followView === 'sheet';
const clearMulti = () => { state.ui.multi = []; state.ui.cursor = null; state.ui.bulkConfirm = false; };

/** Who an action applies to: the multi-selection (visible rows only), else the single selection. */
function picked() {
  if (inSheet() && state.ui.multi.length) {
    const visible = new Set(sortedRows().map((p) => p.id));
    const ids = state.ui.multi.filter((id) => visible.has(id));
    if (ids.length) return ids;
  }
  return state.ui.selectedId && S.byId(state.ui.selectedId) ? [state.ui.selectedId] : [];
}

/** Select every visible row between the anchor (selectedId) and `to`. */
function selectRange(to) {
  const order = sortedRows().map((p) => p.id);
  const a = order.indexOf(state.ui.selectedId);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) { state.ui.selectedId = to; clearMulti(); return; }
  state.ui.multi = order.slice(Math.min(a, b), Math.max(a, b) + 1);
  state.ui.cursor = to;
  state.ui.bulkConfirm = false;
}

function rowClick(id, e) {
  const ui = state.ui;
  if (e.shiftKey && ui.selectedId) return selectRange(id);
  if (e.metaKey || e.ctrlKey) {
    const set = new Set(ui.multi.length ? ui.multi : ui.selectedId ? [ui.selectedId] : []);
    set.has(id) ? set.delete(id) : set.add(id);
    ui.multi = [...set];
    ui.selectedId = set.has(id) ? id : ui.multi[ui.multi.length - 1] ?? null;
    ui.cursor = null;
    ui.bulkConfirm = false;
    if (ui.multi.length < 2) ui.multi = [];
    return;
  }
  const wasMulti = ui.multi.length > 1;
  clearMulti();
  ui.selectedId = ui.selectedId === id && !wasMulti ? null : id;
}

/**
 * Leads rows (To warm up, Unqualified): click selects one, Shift-click a range within the same list,
 * ⌘/Ctrl-click adds or removes one. 2+ selected shows the bulk bar (Set source…).
 */
function leadRowClick(row, e) {
  const pool = state.ui.pool;
  const id = Number(row.dataset.leadRow);
  const order = [...root.querySelectorAll(`[data-lead-row][data-list="${row.dataset.list}"]`)].map((r) => Number(r.dataset.leadRow));
  if (e.shiftKey && pool.anchor && order.includes(pool.anchor)) {
    const [a, b] = [order.indexOf(pool.anchor), order.indexOf(id)].sort((x, y) => x - y);
    pool.picked = order.slice(a, b + 1);
    return;
  }
  if (e.metaKey || e.ctrlKey) {
    pool.picked = pool.picked.includes(id) ? pool.picked.filter((x) => x !== id) : [...pool.picked, id];
    pool.anchor = id;
    return;
  }
  const only = pool.picked.length === 1 && pool.picked[0] === id;
  pool.picked = only ? [] : [id];
  pool.anchor = only ? null : id;
}

// ───────────── calls ─────────────
const callDraftNow = () => { const p = currentCall(); return p ? callDraft(p) : null; };
/** The first day that still has a slot open (today until 5 PM ends, else tomorrow). */
const firstOpenDay = () => (S.slotOpen(Date.now(), 'pm') ? startOfDay(Date.now()) : startOfDay(Date.now()) + DAY);
/** For "call again": `slotId` on `day` if it hasn't started yet, else the next slot that hasn't. */
function openSlotAt(day, slotId) {
  const at = S.slotTime(day, slotId);
  return new Date(at).getTime() > Date.now() ? at : S.nextSlot(Math.max(Date.now(), day));
}
const AGAIN = ['no_answer', 'voicemail', 'call_back'];

/** The rows on the Calls list in screen order (missed, then the day shown), for ↑/↓. */
function callRows() {
  const book = S.callBook();
  const day = book.day(state.ui.calls.day ?? startOfDay(state.now));
  return [...book.missed, ...day.noon, ...day.pm];
}

function pickCall(id) {
  Object.assign(state.ui.calls, { currentId: id, paused: false, draft: null });
}

function skipCall() {
  const c = state.ui.calls;
  const cur = currentCall();
  if (!cur) return;
  c.skipped = [...(c.skipped || []).filter((x) => x !== cur.id), cur.id];
  c.currentId = null;
  c.draft = null;
  if (S.callWorkList().every((p) => c.skipped.includes(p.id))) c.skipped = [cur.id];
  toast(`${cur.name} skipped · still booked ${S.callLabel(cur.callAt).replace(/^(Today|Tomorrow)/, (m) => m.toLowerCase())}`);
}

function saveCall(stop) {
  const c = state.ui.calls;
  const cur = currentCall();
  const d = c.draft;
  if (!cur || !d || d.id !== cur.id) return render();
  if (!d.nextStep.trim()) { d.error = 'Add the next step to log the call.'; focusAfter = '#call-next'; return render(); }
  const msg = S.logCall(cur.id, { ...d, nextStep: d.nextStep.trim(), callAt: d.after === 'again' ? d.callAt : '', followUpAt: d.followUpAt || '' });
  Object.assign(c, { draft: null, currentId: null, paused: !!stop, skipped: (c.skipped || []).filter((x) => x !== cur.id) });
  toast(msg);
  render();
}

/** Board cards: ⌘/Ctrl/Shift-click picks several (to book calls together); a plain click selects one. */
function boardClick(id, e) {
  const ui = state.ui;
  if (e.metaKey || e.ctrlKey || e.shiftKey) {
    const set = new Set(ui.multi.length ? ui.multi : ui.selectedId ? [ui.selectedId] : []);
    set.has(id) ? set.delete(id) : set.add(id);
    ui.multi = [...set];
    ui.selectedId = set.has(id) ? id : ui.multi[ui.multi.length - 1] ?? null;
    if (ui.multi.length < 2) ui.multi = [];
    return;
  }
  clearMulti();
  ui.selectedId = ui.selectedId === id ? null : id;
}

/** Who the bulk "Call on…" applies to: the spreadsheet selection, or the cards picked on the board. */
const callIds = () => (inSheet() ? picked() : state.ui.multi.filter((id) => S.byId(id)));

/** `U` on a selection: all Unqualified already → back to Marketing, else all to Unqualified. */
const unqualifiedTarget = (ids) => (ids.every((id) => S.byId(id)?.stage === 'unqualified') ? S.FIRST_ENGAGED : 'unqualified');

function act(action, el) {
  const id = el?.dataset.id;
  const num = id !== undefined ? Number(id) : null;
  const m = state.ui.modal;
  switch (action) {
    case 'open-followup': state.ui.selectedId = num; go('#/follow-up'); return;
    case 'add-person': openPerson(null); return;
    case 'bulk-snooze': { const p = S.PRESETS.find((x) => x.id === el.dataset.value); toast(S.bulkSnooze(picked(), p.hours, p.label)); break; }
    case 'bulk-remove':
      if (!state.ui.bulkConfirm) { state.ui.bulkConfirm = true; break; }
      toast(S.bulkRemove(picked())); clearMulti(); state.ui.selectedId = null; break;
    case 'bulk-clear': clearMulti(); break;
    case 'edit': openPerson(num); return;
    case 'close-modal': closeModal(); return;
    case 'clear-filters': Object.assign(state.ui, { search: '', account: '', industry: '', stage: '' }); break;
    case 'pool-source': Object.assign(state.ui.pool, { source: el.dataset.value, limit: PAGE }); break;
    case 'lead-tab': Object.assign(state.ui.pool, { tab: el.dataset.value, limit: PAGE, picked: [], anchor: null }); break;
    case 'pool-more': state.ui.pool.limit += PAGE; break;
    case 'pool-all': state.ui.pool.limit = Infinity; break;
    case 'lead-search-clear': state.ui.pool.search = ''; focusAfter = '#lead-search'; break;
    case 'pool-touch': openPerson(num, { touch: true, focus: '#next-step' }); return;
    case 'pool-warm': toast(S.setStage(num, S.FIRST_ENGAGED)); break;
    case 'pool-unqualified': toast(S.setStage(num, 'unqualified')); break;
    case 'lead-pick-clear': state.ui.pool.picked = []; state.ui.pool.anchor = null; break;
    case 'unq-revive': toast(S.setStage(num, 'prospect')); break;
    case 'stage-filter': state.ui.stage = state.ui.stage === el.dataset.value ? '' : el.dataset.value; break;
    case 'sort': {
      const k = el.dataset.key;
      state.ui.sort = { key: k, dir: state.ui.sort.key === k ? -state.ui.sort.dir : 1 };
      break;
    }
    case 'skip-target': S.skipTarget(id); toast('Moved to the back of the list'); focusAfter = '#research'; break;
    case 'notfit-target': S.setTargetStatus(id, 'not_fit'); toast('Marked not a fit'); if (state.ui.route === 'today') focusAfter = '#research'; break;
    case 'reopen-target': S.setTargetStatus(id, 'to_research'); break;
    case 'delete-target': S.deleteTarget(id); toast('Company removed from the list'); break;
    case 'today-any': state.ui.today.source = ''; break;
    case 'log-find': openFind(el?.dataset.source); return;
    case 'edit-goal': state.ui.modal = { type: 'goal' }; focusAfter = '#goal-input'; break;
    case 'research': state.ui.today = { source: id, project: '' }; go('#/today'); return;
    case 'pick-source': state.ui.sourceSel = id; state.ui.paste.open = false; break;
    case 'paste-open': state.ui.paste.open = true; focusAfter = '[data-bind="paste.list"]'; break;
    case 'paste-close': state.ui.paste.open = false; break;
    case 'keys-open': state.ui.modal = { type: 'keys' }; break;
    case 'sync-open': state.ui.modal = { type: 'sync', url: state.sync.config?.url ?? '', token: state.sync.config?.token ?? '', busy: false }; focusAfter = '#sync-url'; break;
    case 'disconnect': disconnect(); state.ui.modal = null; toast('Disconnected · data stays in this browser'); break;
    case 'pull': pull(); state.ui.modal = null; break;
    // person modal
    case 'draft-stage':
      m.draft.stage = el.dataset.value;
      if (m.draft.stage === 'lost') focusAfter = '#lost-reason';
      break;
    case 'draft-project': m.draft.project = m.draft.project === el.dataset.value ? '' : el.dataset.value; break;
    case 'win-prefix': {
      const pre = el.dataset.value + ': ';
      m.draft.nextStep = pre + m.draft.nextStep.replace(/^\s*(SV|IP)\s*:\s*/i, '');
      m.touch = true;
      focusAfter = '#next-step';
      break;
    }
    case 'preset': {
      const p = S.PRESETS.find((x) => x.id === el.dataset.value);
      m.preset = p.id;
      m.draft.followUpAt = new Date(Date.now() + p.hours * HOUR).toISOString();
      break;
    }
    case 'remove-person':
      if (!m.confirmRemove) { m.confirmRemove = true; break; }
      S.removePerson(m.id); toast(`${m.draft.name} removed`); state.ui.modal = null; state.ui.selectedId = null;
      break;
    case 'find-source': m.draft.source = el.dataset.value; break;
    // Calls page
    case 'call-day-view': state.ui.calls.day = Number(el.dataset.value); break;
    case 'call-pick': pickCall(num); break;
    case 'call-remove':
      toast(S.unscheduleCall(num));
      if (state.ui.calls.currentId === num) Object.assign(state.ui.calls, { currentId: null, draft: null });
      break;
    case 'call-resume': Object.assign(state.ui.calls, { paused: false, currentId: null, draft: null }); break;
    case 'call-skip': skipCall(); break;
    case 'call-save-stop': saveCall(true); return;
    case 'call-outcome': { const d = callDraftNow(); if (!d) break; d.outcome = el.dataset.value; d.after = AGAIN.includes(d.outcome) ? 'again' : 'followup'; break; }
    case 'call-project': { const d = callDraftNow(); if (d) d.project = d.project === el.dataset.value ? '' : el.dataset.value; break; }
    case 'call-prefix': {
      const d = callDraftNow();
      if (d) { d.nextStep = el.dataset.value + ': ' + d.nextStep.replace(/^\s*(SV|IP)\s*:\s*/i, ''); focusAfter = '#call-next'; }
      break;
    }
    case 'call-stage': { const d = callDraftNow(); if (!d) break; d.stage = el.dataset.value; if (d.stage === 'lost') focusAfter = '#call-lost'; break; }
    case 'call-after': { const d = callDraftNow(); if (d) d.after = el.dataset.value; break; }
    case 'call-preset': {
      const d = callDraftNow();
      const p = S.PRESETS.find((x) => x.id === el.dataset.value);
      if (d && p) { d.preset = p.id; d.followUpAt = new Date(Date.now() + p.hours * HOUR).toISOString(); }
      break;
    }
    case 'call-again-day': { const d = callDraftNow(); if (d) d.callAt = openSlotAt(Number(el.dataset.value), S.slotOf(d.callAt).id); break; }
    case 'call-again-slot': { const d = callDraftNow(); if (d) d.callAt = openSlotAt(startOfDay(new Date(d.callAt).getTime()), el.dataset.value); break; }
    // Follow up: booking a call from a card or a selection
    case 'sched-open': state.ui.sched = { ...state.ui.sched, id: state.ui.sched.id === num ? null : num, day: firstOpenDay() }; break;
    case 'sched-day': state.ui.sched.day = Number(el.dataset.value); break;
    case 'sched-close': state.ui.sched.id = null; break;
    case 'sched-slot':
      toast(S.scheduleCall([num], S.slotTime(state.ui.sched.day ?? firstOpenDay(), el.dataset.value)));
      state.ui.sched.id = null;
      if (state.ui.selectedId === num) state.ui.selectedId = null;
      break;
    case 'bulk-call': {
      const ids = callIds();
      if (!ids.length) break;
      toast(S.scheduleCall(ids, S.slotTime(state.ui.sched.bulkDay ?? firstOpenDay(), el.dataset.value)));
      clearMulti();
      state.ui.selectedId = null;
      break;
    }
    case 'find-project': m.draft.project = m.draft.project === el.dataset.value ? '' : el.dataset.value; break;
    default: return;
  }
  render();
}

function onBind(el, final) {
  const b = el.dataset.bind;
  const val = el.type === 'checkbox' ? el.checked : el.value;
  const m = state.ui.modal;
  const [scope, field] = b.split('.');
  if (b === 'search') { state.ui.search = val; return render(); }
  if (b === 'account' || b === 'industry') { state.ui[b] = val; return render(); }
  if (b === 'bulkStage') { if (val) toast(S.bulkStage(picked(), val)); return render(); }
  if (b === 'bulkProject') { if (val !== '__') toast(S.bulkSet(picked(), 'project', val)); return render(); }
  if (b === 'poolSort') { state.ui.pool.sort = val; return render(); }
  if (b === 'leadBulkSource') { if (val !== '__') { toast(S.bulkSource(state.ui.pool.picked, val)); Object.assign(state.ui.pool, { picked: [], anchor: null }); } return render(); }
  if (b === 'bulkSource') { if (val !== '__') toast(S.bulkSource(picked(), val)); return render(); }
  if (b === 'personSource') { toast(S.setSource(Number(el.dataset.id), val)); return render(); }
  if (b === 'leadSearch') { Object.assign(state.ui.pool, { search: val, limit: PAGE }); return render(); }
  if (b === 'sortKey') { state.ui.sort = { key: val, dir: 1 }; return render(); }
  if (b === 'bulkCallDay') { state.ui.sched.bulkDay = Number(val); return render(); }
  if (b === 'schedDate') {
    if (!final || !val) return;
    const [y, mo, da] = val.split('-').map(Number);
    state.ui.sched.day = new Date(y, mo - 1, da).getTime();
    return render();
  }
  if (scope === 'call') {
    const d = callDraftNow();
    if (!d) return;
    if (field === 'followUpAt') { d.followUpAt = fromLocalInput(val) || d.followUpAt; d.preset = null; if (final) render(); return; }
    if (field === 'againDate') {
      if (!final || !val) return;
      const [y, mo, da] = val.split('-').map(Number);
      d.callAt = openSlotAt(new Date(y, mo - 1, da).getTime(), S.slotOf(d.callAt).id);
      return render();
    }
    d[field] = val;
    if (d.error) { d.error = ''; render(); }
    return;
  }
  if (scope === 'today') { state.ui.today[field] = val; return render(); }
  if (scope === 'find') { state.ui.find[field] = val; if (state.ui.find.error) { state.ui.find.error = ''; render(); } return; }
  if (scope === 'paste') { state.ui.paste[field] = val; return; }
  if (scope === 'msync') { m[field] = val; return; }
  if (scope === 'mfind') { m.draft[field] = val; if (m.draft.error) { m.draft.error = ''; render(); } return; }
  if (b === 'where') { if (final) S.setSourceNote(el.dataset.id, val.trim()); return; }
  if (b === 'touch') { m.touch = val; m.error = ''; return render(); }
  if (scope === 'draft') {
    const d = m.draft;
    if (field === 'followUpAt') { d.followUpAt = fromLocalInput(val) || d.followUpAt; m.preset = null; return; }
    if (field === 'reportsToId') { d.reportsToId = val ? Number(val) : null; return; }
    if (field === 'strength') { d.strength = Number(val); return; }
    d[field] = val;
    if (field === 'nextStep') {
      const changed = val.trim() !== (m.origNext || '').trim();
      if ((changed && !m.touch) || m.error) { m.touch = m.touch || changed; m.error = ''; render(); }
      return;
    }
    if (el.type === 'checkbox') render();
  }
}

async function onSubmit(form) {
  const kind = form.dataset.form;
  const m = state.ui.modal;
  if (kind === 'find') {
    const f = state.ui.find;
    const t = S.queue()[0];
    if (!t) return;
    if (!f.name.trim()) { f.error = 'Add the name of the person who decides.'; focusAfter = '#find-name'; return render(); }
    if (!f.email.trim() && !f.phone.trim()) { f.error = 'Add an email, phone or LinkedIn so you can reach them.'; return render(); }
    const p = S.saveFind({ ...f, organization: t.company, industry: t.industry, project: t.project, source: t.source }, t.id);
    toast(`${p.name} saved to Leads · first message due tomorrow`);
    focusAfter = '#research';
    return render();
  }
  if (kind === 'log-find') {
    const d = m.draft;
    if (!d.name.trim()) { d.error = 'Add the person’s name.'; return render(); }
    if (!d.email.trim() && !d.phone.trim()) { d.error = 'Add an email, phone or LinkedIn so you can reach them.'; return render(); }
    const p = S.saveFind(d);
    state.ui.modal = null;
    toast(`${p.name} saved from ${d.source} to Leads · first message due tomorrow`);
    return render();
  }
  if (kind === 'person') {
    const d = m.draft;
    if (!d.name.trim()) { m.error = ''; focusAfter = '#person-name'; return render(); }
    if (m.touch && !d.nextStep.trim()) { m.error = 'Add the next step to log a touch.'; focusAfter = '#next-step'; return render(); }
    const orig = m.id ? S.byId(m.id) : null;
    const msg = S.savePerson(d, orig ? { ...orig } : null, { touch: m.touch });
    state.ui.modal = null;
    toast(msg);
    return render();
  }
  if (kind === 'call') return saveCall(false);
  if (kind === 'goal') {
    const v = Number(new FormData(form).get('goal'));
    if (v > 0) state.goal = Math.round(v);
    state.ui.modal = null;
    return render();
  }
  if (kind === 'paste') {
    const p = state.ui.paste;
    const n = S.addTargets(state.ui.sourceSel, p.list, p.project, p.text);
    state.ui.paste = { open: false, list: '', project: '', text: '' };
    toast(n ? `Added ${n} ${n === 1 ? 'company' : 'companies'} to ${state.ui.sourceSel}` : 'Nothing new to add');
    return render();
  }
  if (kind === 'sync') {
    if (!m.url?.trim() || !m.token?.trim()) return;
    m.busy = true; state.sync.message = ''; render();
    try {
      const n = await connect(m.url, m.token);
      state.ui.modal = null;
      toast(`Connected · ${n} people loaded from the sheet`);
    } catch (e) {
      m.busy = false;
      state.sync.message = e.message || String(e);
      state.sync.status = state.sync.config ? state.sync.status : 'local';
    }
    render();
  }
}

// ───────────── DOM events ─────────────
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && el.dataset.action === 'close-modal-bg') { if (e.target === el) closeModal(); return; }
  if (el) { e.preventDefault(); act(el.dataset.action, el); return; }
  const lead = e.target.closest('[data-lead-row]');
  if (lead && !e.target.closest('select, input, button, a')) { leadRowClick(lead, e); render(); return; }
  if (e.target.closest('.sched')) return; // the booking panel inside a card
  const card = e.target.closest('[data-card], [data-row]');
  if (card) {
    const id = Number(card.dataset.card || card.dataset.row);
    if (card.dataset.row) rowClick(id, e);
    else boardClick(id, e);
    render();
  }
});
// Shift-click on a row selects a range; stop the browser from also selecting the text in between.
root.addEventListener('mousedown', (e) => { if ((e.shiftKey || e.metaKey || e.ctrlKey) && e.target.closest('[data-row], [data-lead-row], [data-card]')) e.preventDefault(); });
root.addEventListener('dblclick', (e) => {
  if (e.target.closest('.sched')) return;
  const card = e.target.closest('[data-card], [data-row]');
  if (card) openPerson(Number(card.dataset.card || card.dataset.row));
});
root.addEventListener('input', (e) => { if (e.target.dataset.bind && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') onBind(e.target, false); });
root.addEventListener('change', (e) => { if (e.target.dataset.bind) onBind(e.target, true); });
root.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(e.target); });

// Drag and drop: board cards onto a stage column (data-drop), and names on Leads onto a source (data-drop-source).
const dropZone = (e) => {
  const z = e.target.closest('[data-drop], [data-drop-source]');
  if (!z) return null;
  const kind = z.dataset.dropSource ? 'person' : 'card';
  return e.dataTransfer.types.includes(`kinfolk/${kind}`) ? z : null;
};
const clearDrag = () => root.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
root.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-card], [data-drag-person]');
  if (!el) return;
  const kind = el.dataset.card ? 'card' : 'person';
  const id = el.dataset.card || el.dataset.dragPerson;
  e.dataTransfer.setData(`kinfolk/${kind}`, id);
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
  if (kind === 'person') { el.classList.add('dragging'); root.classList.add('dragging-person'); }
});
root.addEventListener('dragend', () => {
  root.querySelectorAll('.dragging').forEach((c) => c.classList.remove('dragging'));
  root.classList.remove('dragging-person');
  clearDrag();
});
root.addEventListener('dragover', (e) => {
  const z = dropZone(e);
  if (!z) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  root.querySelectorAll('.drag-over').forEach((c) => c !== z && c.classList.remove('drag-over'));
  z.classList.add('drag-over');
});
root.addEventListener('dragleave', (e) => {
  const z = e.target.closest('[data-drop], [data-drop-source]');
  if (z && !z.contains(e.relatedTarget)) z.classList.remove('drag-over');
});
root.addEventListener('drop', (e) => {
  const z = dropZone(e);
  if (!z) return;
  e.preventDefault();
  root.classList.remove('dragging-person');
  clearDrag();
  if (z.dataset.dropSource) {
    const id = Number(e.dataTransfer.getData('kinfolk/person'));
    const picked = state.ui.pool.picked;
    if (picked.length > 1 && picked.includes(id)) { toast(S.bulkSource(picked, z.dataset.dropSource)); Object.assign(state.ui.pool, { picked: [], anchor: null }); }
    else toast(S.setSource(id, z.dataset.dropSource));
  }
  else toast(S.setStage(Number(e.dataTransfer.getData('kinfolk/card')), z.dataset.drop));
  render();
});

// ───────────── keyboard ─────────────
let gPending = 0;
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  if (state.ui.modal) {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    // Enter saves from anywhere in a dialog (checkboxes, chips, nothing focused), not only from a text field.
    // Textareas keep Enter for new lines and buttons keep Enter for themselves.
    if (e.key === 'Enter' && !e.shiftKey && tag !== 'TEXTAREA' && tag !== 'BUTTON' && !e.isComposing) {
      const form = root.querySelector('.modal form');
      if (form) { e.preventDefault(); form.requestSubmit(); }
    }
    return;
  }
  if (typing) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (gPending && Date.now() - gPending < 1200) {
    gPending = 0;
    if (k === 't') return go('#/today');
    if (k === 'f') return go('#/follow-up');
    if (k === 'c') return go('#/calls');
    if (k === 'l' || k === 's') return go('#/leads');
  }
  if (k === 'g') { gPending = Date.now(); return; }
  if (k === '?') { state.ui.modal = { type: 'keys' }; return render(); }
  if (k === 'n' || k === 'q') { e.preventDefault(); return openPerson(null); }

  if (state.ui.route === 'today') {
    const t = S.queue()[0];
    if (k === 's' && t) return act('skip-target', { dataset: { id: t.id } });
    if (k === 'x' && t) return act('notfit-target', { dataset: { id: t.id } });
    if (k === 'l') { e.preventDefault(); return openFind(); }
    return;
  }
  if (state.ui.route === 'sources') {
    if (k === 'f' || k === '/') { e.preventDefault(); focusAfter = '#lead-search'; return render(); }
    if (k === 'Escape' && state.ui.pool.picked.length) { Object.assign(state.ui.pool, { picked: [], anchor: null }); return render(); }
    return;
  }
  if (state.ui.route === 'calls') {
    const cur = currentCall();
    const o = S.OUTCOMES.find((x) => x.key === k);
    if (o && cur) return act('call-outcome', { dataset: { value: o.id } });
    if (k === 's' && cur) { skipCall(); return render(); }
    if (k === 'x' && cur) return act('call-remove', { dataset: { id: String(cur.id) } });
    if (k === 'e' && cur) { e.preventDefault(); return openPerson(cur.id); }
    if (k === 'Enter' && cur && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); return saveCall(false); }
    const dy = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[k];
    if (dy) {
      e.preventDefault();
      const rows = callRows();
      if (!rows.length) return;
      const i = cur ? rows.findIndex((p) => p.id === cur.id) : -1;
      pickCall(rows[Math.min(rows.length - 1, Math.max(0, i + dy))].id);
      return render();
    }
    return;
  }
  if (state.ui.route !== 'follow-up') return;
  if (k === 'f' || k === '/') { e.preventDefault(); focusAfter = '#search'; return render(); }
  if (k === 'c' && state.ui.selectedId && state.ui.followView === 'pipeline') return act('sched-open', { dataset: { id: String(state.ui.selectedId) } });
  const sel = state.ui.selectedId;
  const step = { ArrowDown: [0, 1], j: [0, 1], ArrowUp: [0, -1], k: [0, -1], ArrowRight: [1, 0], l: [1, 0], ArrowLeft: [-1, 0], h: [-1, 0] }[k];
  if (step && e.shiftKey && inSheet() && step[1]) {
    e.preventDefault();
    if (!sel) return;
    const next = moveSelection(state.ui.cursor ?? sel, 0, step[1]);
    selectRange(next);
    render();
    root.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (step) {
    e.preventDefault();
    const from = state.ui.cursor ?? sel;
    clearMulti();
    const next = moveSelection(from, step[0], step[1]);
    if (next == null || next === sel) return;
    state.ui.selectedId = next;
    render();
    root.querySelector(`[data-card="${next}"], [data-row="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (k === 'Escape') { state.ui.selectedId = null; state.ui.sched.id = null; clearMulti(); return render(); }
  const ids = picked();
  if (ids.length > 1) {
    if (k === 'u') { toast(S.bulkStage(ids, unqualifiedTarget(ids))); return render(); }
    if (k === 'p') { toast(S.bulkStage(ids, 'prospect')); return render(); }
    if (k === ']' || k === '[') { toast(S.bulkStep(ids, k === ']' ? 1 : -1)); return render(); }
    const bp = S.PRESETS.find((p) => p.key === k);
    if (bp) { toast(S.bulkSnooze(ids, bp.hours, bp.label)); return render(); }
    return;
  }
  if (!sel || !S.byId(sel)) return;
  if (k === 't') { e.preventDefault(); return openPerson(sel, { touch: true, focus: '#next-step' }); }
  if (k === 'e' || k === 'Enter') { e.preventDefault(); return openPerson(sel); }
  if (k === 'u') { toast(S.toggleUnqualified(sel)); return render(); }
  if (k === 'p') { toast(S.setStage(sel, 'prospect')); return render(); }
  if (k === ']' || k === '[') { toast(S.stepStage(sel, k === ']' ? 1 : -1)); return render(); }
  const preset = S.PRESETS.find((p) => p.key === k);
  if (preset) { toast(S.snooze(sel, preset.hours, preset.label)); return render(); }
});

// ───────────── start ─────────────
window.addEventListener('hashchange', route);
setInterval(() => {
  state.now = Date.now();
  if (!state.ui.modal) render();
}, 30e3);
startSync(render);
route();
