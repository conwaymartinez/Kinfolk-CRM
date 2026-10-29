// Kinfolk: layout, routing, events and keyboard shortcuts.
import { html, icon, fromLocalInput, HOUR } from './ui.js';
import * as S from './store.js';
import { state } from './store.js';
import { startSync, connect, disconnect, pull, syncLabel } from './sync.js';
import { renderToday, emptyFind } from './views/today.js';
import { renderFollowUp, sortedRows } from './views/followup.js';
import { renderSources } from './views/sources.js';
import { renderModal } from './views/modals.js';

const root = document.getElementById('root');
state.ui.find = emptyFind();
state.ui.paste = { open: false, list: '', project: '', text: '' };

// ───────────── render ─────────────
function rail() {
  const r = state.ui.route;
  const late = S.lateCount();
  const item = (id, href, label, ic, badge) => html`
    <a href="${href}" class="rail-item ${r === id ? 'on' : ''}" aria-current="${r === id ? 'page' : 'false'}">
      ${icon(ic, 22)}<span>${label}</span>${badge ? html`<span class="badge" aria-label="${badge} late">${badge}</span>` : ''}</a>`;
  return html`
    <nav class="rail" aria-label="Main">
      <a href="#/today" class="logo" aria-label="Kinfolk home">K</a>
      ${item('today', '#/today', 'Today', 'today')}
      ${item('follow-up', '#/follow-up', 'Follow up', 'clock', late)}
      ${item('sources', '#/sources', 'Sources', 'sources')}
      <span class="grow"></span>
      <button type="button" class="rail-mini" data-action="keys-open" aria-label="Keyboard shortcuts">${icon('keyboard', 18)}</button>
      <button type="button" class="sync-pill ${state.sync.status}" data-action="sync-open"
        title="${state.sync.lastSync ? 'Last synced ' + new Date(state.sync.lastSync).toLocaleTimeString() : 'Connect to your Google Sheet'}">${syncLabel()}</button>
    </nav>`;
}

function view() {
  if (state.ui.route === 'follow-up') return renderFollowUp();
  if (state.ui.route === 'sources') return renderSources();
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
  root.innerHTML = String(html`
    <div class="app">${rail()}<main class="main" id="main">${view()}</main></div>
    ${renderModal()}
    <div class="toast-wrap" aria-live="polite">${state.ui.toast ? html`<div class="toast">${state.ui.toast}</div>` : ''}</div>`);
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
  else if (h.startsWith('sources')) state.ui.route = 'sources';
  else state.ui.route = 'today';
  state.ui.selectedId = state.ui.route === 'follow-up' ? state.ui.selectedId : null;
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
const visibleOrder = () => {
  if (state.ui.route !== 'follow-up') return [];
  if (state.ui.followView === 'sheet') return sortedRows().map((p) => p.id);
  const c = S.columns();
  return [...c.touch, ...c.wip, ...c.late].map((p) => p.id);
};

function act(action, el) {
  const id = el?.dataset.id;
  const num = id !== undefined ? Number(id) : null;
  const m = state.ui.modal;
  switch (action) {
    case 'open-followup': state.ui.selectedId = num; go('#/follow-up'); return;
    case 'add-person': openPerson(null); return;
    case 'edit': openPerson(num); return;
    case 'close-modal': closeModal(); return;
    case 'only-active': state.ui.onlyActive = !state.ui.onlyActive; break;
    case 'clear-filters': Object.assign(state.ui, { search: '', onlyActive: false, account: '', industry: '' }); break;
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
  if (b === 'sortKey') { state.ui.sort = { key: val, dir: 1 }; return render(); }
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
    toast(`${p.name} saved · first message due tomorrow`);
    focusAfter = '#research';
    return render();
  }
  if (kind === 'log-find') {
    const d = m.draft;
    if (!d.name.trim()) { d.error = 'Add the person’s name.'; return render(); }
    if (!d.email.trim() && !d.phone.trim()) { d.error = 'Add an email, phone or LinkedIn so you can reach them.'; return render(); }
    const p = S.saveFind(d);
    state.ui.modal = null;
    toast(`${p.name} saved from ${d.source} · first message due tomorrow`);
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
  const card = e.target.closest('[data-card], [data-row]');
  if (card) {
    const id = Number(card.dataset.card || card.dataset.row);
    state.ui.selectedId = state.ui.selectedId === id ? null : id;
    render();
  }
});
root.addEventListener('dblclick', (e) => {
  const card = e.target.closest('[data-card], [data-row]');
  if (card) openPerson(Number(card.dataset.card || card.dataset.row));
});
root.addEventListener('input', (e) => { if (e.target.dataset.bind && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') onBind(e.target, false); });
root.addEventListener('change', (e) => { if (e.target.dataset.bind) onBind(e.target, true); });
root.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(e.target); });

root.addEventListener('dragstart', (e) => {
  const card = e.target.closest('[data-card]');
  if (!card) return;
  e.dataTransfer.setData('text/plain', card.dataset.card);
  e.dataTransfer.effectAllowed = 'move';
});
root.addEventListener('dragover', (e) => {
  const col = e.target.closest('[data-drop]');
  if (!col) return;
  e.preventDefault();
  root.querySelectorAll('.drag-over').forEach((c) => c !== col && c.classList.remove('drag-over'));
  col.classList.add('drag-over');
});
root.addEventListener('dragleave', (e) => {
  const col = e.target.closest('[data-drop]');
  if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
});
root.addEventListener('drop', (e) => {
  const col = e.target.closest('[data-drop]');
  if (!col) return;
  e.preventDefault();
  const id = Number(e.dataTransfer.getData('text/plain'));
  toast(S.movePerson(id, col.dataset.drop));
  render();
});

// ───────────── keyboard ─────────────
let gPending = 0;
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  if (state.ui.modal) { if (e.key === 'Escape') { e.preventDefault(); closeModal(); } return; }
  if (typing) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (gPending && Date.now() - gPending < 1200) {
    gPending = 0;
    if (k === 't') return go('#/today');
    if (k === 'f') return go('#/follow-up');
    if (k === 's') return go('#/sources');
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
  if (state.ui.route !== 'follow-up') return;
  if (k === 'f' || k === '/') { e.preventDefault(); focusAfter = '#search'; return render(); }
  const order = visibleOrder();
  const sel = state.ui.selectedId;
  if (['ArrowDown', 'ArrowUp', 'j', 'k'].includes(k)) {
    e.preventDefault();
    if (!order.length) return;
    const i = order.indexOf(sel);
    const dir = k === 'ArrowDown' || k === 'j' ? 1 : -1;
    state.ui.selectedId = order[i < 0 ? 0 : (i + dir + order.length) % order.length];
    render();
    root.querySelector(`[data-card="${state.ui.selectedId}"], [data-row="${state.ui.selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (k === 'Escape') { state.ui.selectedId = null; return render(); }
  if (!sel || !S.byId(sel)) return;
  if (k === 't') { e.preventDefault(); return openPerson(sel, { touch: true, focus: '#next-step' }); }
  if (k === 'e' || k === 'Enter') { e.preventDefault(); return openPerson(sel); }
  if (k === 'c') { toast(S.toggleCold(sel)); return render(); }
  if (k === 'r') { toast(S.backToTouch(sel)); return render(); }
  if (k === 'a') { toast(S.toggleActive(sel)); return render(); }
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
