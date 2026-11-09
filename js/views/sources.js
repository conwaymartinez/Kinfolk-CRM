// Leads, in three tabs: To warm up (stage Prospect), Unqualified, and the five hunting grounds with their lists.
import { html, plural, rel, icon } from '../ui.js';
import { state, SOURCES, sourceStats, sourceWhere, prospects, prospectStats, coldness, addedAt, COLDNESS, isEngaged, stageLabel, matchesLead, matchesTarget, unqualifiedLeads } from '../store.js';

const STATE_LABEL = { to_research: 'To research', found: 'Found', not_fit: 'Not a fit' };
const DRAG_HINT = 'Drag onto a source chip to move them there';
export const PAGE = 25;

// Leads selection (Shift-click a range, ⌘/Ctrl-click to add one), like the Follow up spreadsheet.
const isPicked = (id) => state.ui.pool.picked.includes(id);
const MOD = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl';

function leadBulkBar() {
  const n = state.ui.pool.picked.length;
  if (n < 2) return '';
  return html`
    <div class="bulk-bar" role="toolbar" aria-label="Edit ${n} selected leads">
      <strong>${n} selected</strong>
      <select class="pill-select" data-bind="leadBulkSource" aria-label="Set source for selected">
        <option value="__">Set source…</option>${SOURCES.map((s) => html`<option value="${s.id}">${s.id}</option>`)}<option value="">No source</option>
      </select>
      <span class="muted small">or drag any selected row onto a source chip</span>
      <span class="grow"></span>
      <button type="button" class="btn sm" data-action="lead-pick-clear" title="Esc">Clear</button>
    </div>`;
}

// The Source cell: a small menu, so moving someone works without dragging too (touch screens, keyboard).
const sourceSelect = (p) => html`<select id="src-${p.id}" class="pill-select sm" data-bind="personSource" data-id="${p.id}" aria-label="Source for ${p.name}">
  <option value="" ${p.source ? '' : 'selected'}>—</option>${SOURCES.map((s) => html`<option ${p.source === s.id ? 'selected' : ''}>${s.id}</option>`)}</select>`;

const day = (iso, year) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const who = (p) => [p.organization, p.project].filter(Boolean).join(' · ');

// Sort (To warm up only) and the source chips: filter the list, and each chip takes a dragged name.
function listTools(stage) {
  const { source, sort } = state.ui.pool;
  const base = state.people.filter((p) => p.stage === stage && matchesLead(p));
  const n = (id) => (id ? base.filter((p) => p.source === id).length : base.length);
  const chip = (id, label) => html`<button type="button" class="chip ${source === id ? 'on' : ''}" data-action="pool-source" data-value="${id}" aria-pressed="${source === id}" ${id ? html`data-drop-source="${id}"` : ''}>${label} <span class="muted">${n(id)}</span></button>`;
  return html`
    <div class="pool-tools">
      ${chip('', 'All')}${SOURCES.map((s) => chip(s.id, s.id))}
      <span class="grow"></span>
      ${stage === 'prospect' ? html`<select class="pill-select sm" data-bind="poolSort" aria-label="Sort leads">
        <option value="new" ${sort === 'new' ? 'selected' : ''}>Newest first</option>
        <option value="old" ${sort === 'old' ? 'selected' : ''}>Oldest first</option></select>` : ''}
    </div>`;
}

// Show the first PAGE rows, then more on request: a list of hundreds shouldn't be one long scroll.
function more(total) {
  const shown = Math.min(state.ui.pool.limit, total);
  return total > shown ? html`<div class="more"><span class="muted small">Showing ${shown} of ${total}</span>
    <button type="button" class="btn sm" data-action="pool-more">Show ${Math.min(PAGE, total - shown)} more</button>
    <button type="button" class="link small" data-action="pool-all">Show all</button></div>` : '';
}

const emptyText = (what) => {
  const { source, search } = state.ui.pool;
  const q = search.trim();
  return q ? `No ${what} match “${q}”${source ? ` in ${source}` : ''}.` : source ? `No ${what} from ${source}.` : `No ${what}.`;
};

// Everyone at stage Prospect. Being here means cold: touch them, → Marketing once they respond, Unqualified if not a fit.
function warmTab() {
  const now = state.now;
  const all = prospects();
  const rows = all.slice(0, state.ui.pool.limit);
  const legend = COLDNESS.map((b) => `${b.label} ${b.range}`).join(' · ');
  return html`<section class="lead-list" aria-label="To warm up">
    ${listTools('prospect')}
    ${rows.length ? html`
      <div class="sheet-wrap"><table class="sheet compact lead-table">
        <thead><tr><th>Person</th><th>Added</th><th title="Days since the last touch, or since added if never touched: ${legend}">Coldness</th><th>Source</th><th>Next step</th><th>Follow-up</th><th><span class="sr">Actions</span></th></tr></thead>
        <tbody>${rows.map((p) => {
          const c = coldness(p, now);
          const late = p.followUpAt && new Date(p.followUpAt).getTime() <= now;
          return html`<tr draggable="true" data-drag-person="${p.id}" data-lead-row="${p.id}" data-list="pool" title="${DRAG_HINT}" class="${isPicked(p.id) ? 'picked' : ''}">
            <td class="who"><button type="button" class="link name" data-action="edit" data-id="${p.id}">${p.name}</button>${who(p) ? html` <span class="muted small">${who(p)}</span>` : ''}</td>
            <td class="small nowrap">${day(addedAt(p))}</td>
            <td><span class="coldness c-${c.band.id}" title="${c.count ? plural(c.count, 'touch', 'touches') : 'Never touched'}">${c.band.label} · ${c.days}d</span></td>
            <td>${sourceSelect(p)}</td>
            <td class="small clip" title="${p.nextStep}">${p.nextStep || html`<span class="muted">—</span>`}</td>
            <td class="nowrap">${p.followUpAt ? html`<span class="timer ${late ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span>` : html`<span class="muted small">—</span>`}</td>
            <td class="actions">
              <button type="button" class="btn sm" data-action="pool-touch" data-id="${p.id}" title="Log a touch; they stay in Leads">Touch</button>
              <button type="button" class="btn sm primary" data-action="pool-warm" data-id="${p.id}" title="They responded: move to Marketing, onto Follow up">→ Marketing</button>
              <button type="button" class="btn sm ghost" data-action="pool-unqualified" data-id="${p.id}" title="Not a fit, don't revive">Unqualified</button>
            </td></tr>`;
        })}</tbody></table></div>${more(all.length)}`
      : html`<p class="col-empty">${state.ui.pool.search.trim() || state.ui.pool.source ? emptyText('leads to warm up') : 'No leads. New finds land here.'}</p>`}</section>`;
}

// Everyone marked Unqualified ("not a fit, never touch"), so they can be checked, re-filed or brought back.
function unqTab() {
  const all = unqualifiedLeads();
  const rows = all.slice(0, state.ui.pool.limit);
  return html`<section class="lead-list" aria-label="Unqualified">
    ${listTools('unqualified')}
    ${rows.length ? html`
      <div class="sheet-wrap"><table class="sheet compact lead-table">
        <thead><tr><th>Person</th><th>Marked</th><th>Source</th><th>Last next step</th><th><span class="sr">Actions</span></th></tr></thead>
        <tbody>${rows.map(({ p, at }) => html`<tr draggable="true" data-drag-person="${p.id}" data-lead-row="${p.id}" data-list="unq" title="${DRAG_HINT}" class="${isPicked(p.id) ? 'picked' : ''}">
          <td class="who"><button type="button" class="link name" data-action="edit" data-id="${p.id}">${p.name}</button>${who(p) ? html` <span class="muted small">${who(p)}</span>` : ''}</td>
          <td class="small nowrap">${day(at, true)}</td>
          <td>${sourceSelect(p)}</td>
          <td class="small clip" title="${p.nextStep}">${p.nextStep || html`<span class="muted">—</span>`}</td>
          <td class="actions">
            <button type="button" class="btn sm" data-action="unq-revive" data-id="${p.id}" title="Worth another try: back to To warm up">Back to Leads</button>
            <button type="button" class="btn sm ghost" data-action="pool-warm" data-id="${p.id}" title="They responded: onto Follow up">→ Marketing</button>
          </td></tr>`)}</tbody></table></div>${more(all.length)}`
      : html`<p class="col-empty">${state.ui.pool.search.trim() || state.ui.pool.source ? emptyText('unqualified people') : 'Nobody is marked Unqualified.'}</p>`}</section>`;
}

function targetRow(t) {
  const person = t.personId ? state.people.find((p) => p.id === t.personId) : null;
  return html`<tr>
    <td><span class="name">${t.company}</span>${t.hint ? html`<span class="muted small block">${t.hint}</span>` : ''}</td>
    <td class="small">${t.industry}</td>
    <td class="small strong">${t.project}</td>
    <td class="small">${person ? html`<button type="button" class="link" data-action="edit" data-id="${person.id}">${person.name}${person.role ? ', ' + person.role : ''}</button>` : html`<span class="muted">Not found yet</span>`}</td>
    <td><span class="status t-${t.status}">${person ? stageLabel(person.stage) : STATE_LABEL[t.status] || t.status}</span></td>
    <td class="actions">
      ${t.status === 'not_fit' ? html`<button type="button" class="btn sm" data-action="reopen-target" data-id="${t.id}">Reopen</button>` : ''}
      ${t.status === 'to_research' ? html`<button type="button" class="btn sm" data-action="notfit-target" data-id="${t.id}">Not a fit</button>` : ''}
      <button type="button" class="btn sm ghost" data-action="delete-target" data-id="${t.id}" aria-label="Delete ${t.company}">Delete</button>
    </td>
  </tr>`;
}

function pasteForm(src) {
  const d = state.ui.paste;
  return html`
    <form class="card stack-sm" data-form="paste" aria-label="Paste a company list">
      <h3 class="h3">Paste a company list into ${src.id}</h3>
      <p class="muted small">One company per line. Optionally add the industry and a note after commas: <code>Halden Plastics, Plastics, two plants</code></p>
      <div class="grid2">
        <label class="field">List name<input data-bind="paste.list" value="${d.list}" placeholder="${src.id === 'Events' ? 'e.g. WOFEX 2026 exhibitors' : 'e.g. PPMA members'}"></label>
        <label class="field">For project
          <select data-bind="paste.project"><option value="">Any</option>${state.projects.map((p) => html`<option ${p === d.project ? 'selected' : ''}>${p}</option>`)}</select></label>
      </div>
      <label class="field">Companies<textarea rows="6" data-bind="paste.text" placeholder="Company, industry, note">${d.text}</textarea></label>
      <div class="row"><button class="btn primary" type="submit">Add to ${src.id}</button>
        <button class="btn" type="button" data-action="paste-close">Cancel</button></div>
    </form>`;
}

// The five hunting grounds: compact cards to pick one, then its list (companies to research) and logged finds.
function groundsTab() {
  const sel = SOURCES.find((s) => s.id === state.ui.sourceSel) || SOURCES[0];
  const q = state.ui.pool.search.trim();
  const targets = state.targets.filter((t) => t.source === sel.id && matchesTarget(t))
    .sort((a, b) => ['to_research', 'found', 'not_fit'].indexOf(a.status) - ['to_research', 'found', 'not_fit'].indexOf(b.status) || a.createdAt.localeCompare(b.createdAt));
  const lists = [...new Set(targets.map((t) => t.list))];
  const finds = state.people.filter((p) => p.source === sel.id && p.foundAt && !state.targets.some((t) => t.personId === p.id) && matchesLead(p))
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt));
  const st = sourceStats(sel.id);
  const elsewhere = q ? SOURCES.filter((s) => s.id !== sel.id && groundHits(s.id)) : [];
  return html`
    <div class="source-grid" role="list">
      ${SOURCES.map((s, i) => {
        const x = sourceStats(s.id);
        return html`<button type="button" role="listitem" class="source-card ${s.id === sel.id ? 'on' : ''}" data-action="pick-source" data-id="${s.id}" data-drop-source="${s.id}" aria-pressed="${s.id === sel.id}" title="${s.kind}">
          <span class="row between"><span class="name">${i + 1} · ${s.id}</span><span class="big">${x.foundWeek}<span class="muted small"> this wk</span></span></span>
          <span class="small muted">${s.mode === 'list' ? `${x.left} to research` : 'Open search'} · <span class="accent">${x.engaged} engaged</span>${q ? html` · <span class="${groundHits(s.id) ? 'accent' : ''}">${groundHits(s.id) || 'no'} match</span>` : ''}</span>
        </button>`;
      })}
    </div>
    ${state.ui.paste.open ? pasteForm(sel) : ''}
    <section class="card flush" aria-label="${sel.id}">
      <div class="panel-head">
        <div class="stack-xs grow">
          <label class="where"><strong class="h3">${sel.id}</strong>
            <input data-bind="where" data-id="${sel.id}" value="${sourceWhere(sel.id)}" aria-label="Where to look for ${sel.id}" placeholder="Where to look"></label>
          <span class="muted small">${sel.kind} · ${plural(st.found, 'find')} so far · ${st.engaged} engaged now${lists.length ? ' · lists: ' + lists.join(', ') : ''}</span>
        </div>
        <div class="row wrap">
          <button class="btn sm" type="button" data-action="paste-open">Paste a company list</button>
          ${st.left ? html`<button class="btn sm primary" type="button" data-action="research" data-id="${sel.id}">Research ${st.left} in Today →</button>`
            : html`<button class="btn sm primary" type="button" data-action="log-find" data-source="${sel.id}">+ Log a find</button>`}
        </div>
      </div>
      ${q && elsewhere.length ? html`<p class="small muted pad-x">Also matches in ${elsewhere.map((x, i) => html`${i ? ', ' : ''}<button type="button" class="link" data-action="pick-source" data-id="${x.id}">${x.id} (${groundHits(x.id)})</button>`)}.</p>` : ''}
      ${targets.length ? html`
        <div class="sheet-wrap"><table class="sheet compact">
          <thead><tr><th>Company</th><th>Industry</th><th>Project</th><th>Person found</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead>
          <tbody>${targets.map(targetRow)}</tbody></table></div>`
        : q ? html`<p class="col-empty">No ${sel.id} companies match “${q}”.</p>`
        : html`<p class="col-empty">${sel.mode === 'list'
          ? `No ${sel.id} list yet. Paste the companies and work through them one at a time in Today.`
          : `${sel.id} has no fixed list: log each person as you find them.`}</p>`}
      ${finds.length ? html`
        <div class="finds"><h3 class="h3">Logged finds <span class="muted small">· drag one onto a source card to move it</span></h3>
          ${finds.slice(0, 12).map((p) => html`<button type="button" class="mini-row" data-action="edit" data-id="${p.id}" draggable="true" data-drag-person="${p.id}" title="Drag onto a source card to move them there">
            <span class="name">${p.name}</span><span class="muted small">${[p.role, p.organization].filter(Boolean).join(', ')} · ${new Date(p.foundAt).toLocaleDateString()}</span>
            ${isEngaged(p) ? html`<span class="tag stage s-${p.stage}">${stageLabel(p.stage)}</span>` : p.stage === 'unqualified' ? html`<span class="status unqualified">Unqualified</span>` : ''}</button>`)}
        </div>` : ''}
    </section>`;
}

// While searching, how many of a hunting ground's companies and finds match.
const groundHits = (id) => state.targets.filter((t) => t.source === id && matchesTarget(t)).length
  + state.people.filter((p) => p.source === id && p.foundAt && !state.targets.some((t) => t.personId === p.id) && matchesLead(p)).length;

export function renderSources() {
  const { tab, search } = state.ui.pool;
  const q = search.trim();
  const st = prospectStats();
  const count = (stage) => state.people.filter((p) => p.stage === stage && matchesLead(p)).length;
  const groundsHits = q ? SOURCES.reduce((n, s) => n + groundHits(s.id), 0) : null;
  const tabBtn = (id, label, n) => html`<button type="button" class="${tab === id ? 'on' : ''}" data-action="lead-tab" data-value="${id}" aria-pressed="${tab === id}">${label}${n != null ? html` <span class="n">${n}</span>` : ''}</button>`;
  return html`
    <header class="page-head">
      <div><h1>Leads</h1>
        <p class="muted">${plural(st.total, 'person', 'people')} to warm up${st.late ? html` · <span class="late-text">${st.late} late</span>` : ''}${st.today ? ` · ${st.today} due today` : ''}</p></div>
      <button class="btn" type="button" data-action="log-find" data-source="${state.ui.sourceSel}">+ Log a find</button>
    </header>
    ${state.sync.config && !state.sync.v3 ? html`<p class="notice">Company lists are saved on this device only until you update <code>Code.gs</code> in your sheet (see SETUP.md).</p>` : ''}
    ${state.sync.config && state.sync.v3 && !state.sync.v6 ? html`<p class="notice">Your sheet runs an older <code>Code.gs</code>, so stages are worked out from the old Status column on each sync. Update it to v7 (see SETUP.md).</p>`
      : state.sync.config && state.sync.v6 && !state.sync.v7 ? html`<p class="notice">Your sheet runs <code>Code.gs</code> v6: the new stage names sync, but Lost reasons aren't saved to the sheet and old rows keep the Attention…Action names there. Update it to v7 (see SETUP.md).</p>` : ''}
    <div class="toolbar">
      <div class="seg tabs" role="group" aria-label="Leads view">
        ${tabBtn('warm', 'To warm up', count('prospect'))}${tabBtn('unq', 'Unqualified', count('unqualified'))}${tabBtn('grounds', 'Hunting grounds', groundsHits)}
      </div>
      <label class="search"><span class="sr">Search leads</span>${icon('search', 16)}
        <input id="lead-search" type="search" data-bind="leadSearch" value="${search}" placeholder="Search leads and companies"></label>
      ${q ? html`<button type="button" class="link small" data-action="lead-search-clear">Clear</button>` : ''}
      <span class="grow"></span>
      ${tab !== 'grounds' ? html`<span class="muted small hint">Shift-click or ${MOD}-click rows to edit several · drag a name onto a source chip</span>` : ''}
    </div>
    ${leadBulkBar()}
    ${tab === 'unq' ? unqTab() : tab === 'grounds' ? groundsTab() : warmTab()}`;
}
