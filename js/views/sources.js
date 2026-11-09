// Leads: everyone not engaged yet (new finds and anyone gone cold), then the five hunting grounds and their lists.
import { html, plural, rel, icon } from '../ui.js';
import { state, SOURCES, sourceStats, sourceWhere, prospects, prospectStats, coldness, addedAt, COLDNESS, isEngaged, stageLabel, matchesLead, matchesTarget, unqualifiedLeads } from '../store.js';

const STATE_LABEL = { to_research: 'To research', found: 'Found', not_fit: 'Not a fit' };
const DRAG_HINT = 'Drag onto a source to move them there';

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
      <span class="muted small">or drag any selected row onto a source</span>
      <span class="grow"></span>
      <button type="button" class="btn sm" data-action="lead-pick-clear" title="Esc">Clear</button>
    </div>`;
}

// The Source cell: a small menu, so moving someone works without dragging too (touch screens, keyboard).
const sourceSelect = (p) => html`<select id="src-${p.id}" class="pill-select" data-bind="personSource" data-id="${p.id}" aria-label="Source for ${p.name}">
  <option value="" ${p.source ? '' : 'selected'}>—</option>${SOURCES.map((s) => html`<option ${p.source === s.id ? 'selected' : ''}>${s.id}</option>`)}</select>`;

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

// Everyone at stage Prospect, newest first. Being here means cold: the only questions are whether you've touched
// them, whether they've responded (→ Marketing, onto Follow up) and whether they're not a fit (Unqualified).
function prospectsSection() {
  const now = state.now;
  const { source, sort } = state.ui.pool;
  const rows = prospects();
  const st = prospectStats();
  const chip = (id, label) => html`<button type="button" class="chip ${source === id ? 'on' : ''}" data-action="pool-source" data-value="${id}" aria-pressed="${source === id}" ${id ? html`data-drop-source="${id}"` : ''}>${label} ${st.bySource(id)}</button>`;
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return html`
    <section class="card flush pool" aria-label="Leads to warm up">
      <div class="panel-head">
        <div class="stack-xs grow">
          <h2>To warm up</h2>
          <span class="muted small">${plural(st.total, 'person', 'people')} not engaged yet${st.late ? html` · <span class="late-text">${st.late} late</span>` : ''}${st.today ? ` · ${st.today} due today` : ''}.
            Touch to reach out (they stay here), → Marketing once they respond, Unqualified if they're not a fit. Drag a name onto a source to file it there; Shift-click or ${MOD}-click names to edit several.</span>
        </div>
      </div>
      <div class="pool-tools">
        <label class="small muted row">Sort
          <select class="pill-select" data-bind="poolSort" aria-label="Sort leads">
            <option value="new" ${sort === 'new' ? 'selected' : ''}>Date added · newest first</option>
            <option value="old" ${sort === 'old' ? 'selected' : ''}>Date added · oldest first</option>
          </select></label>
        <span class="sep" aria-hidden="true"></span>
        <span class="small muted">Source</span>
        ${chip('', 'All')}
        ${SOURCES.map((s) => chip(s.id, s.id))}
      </div>
      ${rows.length ? html`
        <div class="sheet-wrap"><table class="sheet">
          <thead><tr><th>Person</th><th>Added</th><th>Touched</th><th>Source</th><th>Next step</th><th>Follow-up</th><th><span class="sr">Actions</span></th></tr></thead>
          <tbody>${rows.map((p) => {
            const c = coldness(p, now);
            const late = new Date(p.followUpAt).getTime() <= now;
            return html`<tr draggable="true" data-drag-person="${p.id}" data-lead-row="${p.id}" data-list="pool" title="${DRAG_HINT}" class="${isPicked(p.id) ? 'picked' : ''}">
              <td><button type="button" class="link name" data-action="edit" data-id="${p.id}">${p.name}</button>
                <span class="muted small block">${[p.organization, p.project].filter(Boolean).join(' · ') || 'Unassigned'}</span></td>
              <td class="small">${day(addedAt(p))}</td>
              <td><span class="coldness c-${c.band.id}" title="${c.touched ? 'Days since the last touch' : 'Days since added, never touched'}">${c.band.label} · ${c.days}d</span>
                <span class="muted small block">${c.count ? plural(c.count, 'touch', 'touches') : 'Never touched'}</span></td>
              <td class="small">${sourceSelect(p)}</td>
              <td class="small">${p.nextStep || html`<span class="muted">No next step</span>`}</td>
              <td>${p.followUpAt ? html`<span class="timer ${late ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span>` : html`<span class="muted small">Not scheduled</span>`}</td>
              <td class="actions">
                <button type="button" class="btn sm" data-action="pool-touch" data-id="${p.id}" title="Log a touch; they stay in Leads">Touch</button>
                <button type="button" class="btn sm primary" data-action="pool-warm" data-id="${p.id}" title="Move to Marketing, onto Follow up">→ Marketing</button>
                <button type="button" class="btn sm ghost" data-action="pool-unqualified" data-id="${p.id}" title="Not a fit, don't revive: off Leads and Follow up">Unqualified</button>
              </td>
            </tr>`;
          })}</tbody></table></div>`
        : html`<p class="col-empty">${state.ui.pool.search.trim() ? `No leads to warm up match “${state.ui.pool.search.trim()}”${source ? ` in ${source}` : ''}.`
          : source ? `No leads from ${source}.` : 'No leads. New finds land here.'}</p>`}
      <div class="legend small muted"><strong class="small">Coldness</strong>
        ${COLDNESS.map((b) => html`<span><span class="coldness c-${b.id}">${b.label}</span> ${b.range}</span>`)}
        <span>· days since the last touch, or since added if never touched</span></div>
    </section>`;
}

// Everyone marked Unqualified ("not a fit, never touch"), so they can be checked, re-filed or brought back.
// Filtered by the same source chips and search as To warm up.
function unqualifiedSection() {
  const open = state.ui.pool.showUnq;
  const rows = unqualifiedLeads();
  const total = state.people.filter((p) => p.stage === 'unqualified').length;
  const { source } = state.ui.pool;
  const q = state.ui.pool.search.trim();
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return html`
    <section class="card flush pool unq" aria-label="Unqualified leads">
      <div class="panel-head">
        <div class="stack-xs grow">
          <h2>Unqualified</h2>
          <span class="muted small">${plural(total, 'person', 'people')} marked not a fit${source || q ? ` · ${rows.length} shown` : ''}. Off Leads and Follow up; back to Leads if they're worth another try.</span>
        </div>
        <button type="button" class="btn" data-action="unq-toggle" aria-expanded="${!!open}">${open ? 'Hide' : `Show ${total}`}</button>
      </div>
      ${!open ? '' : rows.length ? html`
        <div class="sheet-wrap"><table class="sheet">
          <thead><tr><th>Person</th><th>Marked</th><th>Source</th><th>Last next step</th><th><span class="sr">Actions</span></th></tr></thead>
          <tbody>${rows.map(({ p, at }) => html`<tr draggable="true" data-drag-person="${p.id}" data-lead-row="${p.id}" data-list="unq" title="${DRAG_HINT}" class="${isPicked(p.id) ? 'picked' : ''}">
            <td><button type="button" class="link name" data-action="edit" data-id="${p.id}">${p.name}</button>
              <span class="muted small block">${[p.role, p.organization, p.project].filter(Boolean).join(' · ') || 'Unassigned'}</span></td>
            <td class="small">${day(at)}</td>
            <td class="small">${sourceSelect(p)}</td>
            <td class="small">${p.nextStep || html`<span class="muted">—</span>`}</td>
            <td class="actions">
              <button type="button" class="btn sm" data-action="unq-revive" data-id="${p.id}" title="Not a fit after all: back to To warm up">Back to Leads</button>
              <button type="button" class="btn sm ghost" data-action="pool-warm" data-id="${p.id}" title="They responded: onto Follow up">→ Marketing</button>
            </td></tr>`)}</tbody></table></div>`
        : html`<p class="col-empty">${q ? `No unqualified people match “${q}”${source ? ` in ${source}` : ''}.` : source ? `No unqualified people from ${source}.` : 'Nobody is marked Unqualified.'}</p>`}
    </section>`;
}

export function renderSources() {
  const sel = SOURCES.find((s) => s.id === state.ui.sourceSel) || SOURCES[0];
  const q = state.ui.pool.search.trim();
  const targets = state.targets.filter((t) => t.source === sel.id && matchesTarget(t))
    .sort((a, b) => ['to_research', 'found', 'not_fit'].indexOf(a.status) - ['to_research', 'found', 'not_fit'].indexOf(b.status) || a.createdAt.localeCompare(b.createdAt));
  const lists = [...new Set(targets.map((t) => t.list))];
  const finds = state.people.filter((p) => p.source === sel.id && p.foundAt && !state.targets.some((t) => t.personId === p.id) && matchesLead(p))
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt));
  const st = sourceStats(sel.id);
  // While searching, each hunting ground shows how many of its companies and finds match.
  const hits = (id) => state.targets.filter((t) => t.source === id && matchesTarget(t)).length
    + state.people.filter((p) => p.source === id && p.foundAt && !state.targets.some((t) => t.personId === p.id) && matchesLead(p)).length;
  const elsewhere = q ? SOURCES.filter((s) => s.id !== sel.id && hits(s.id)) : [];

  return html`
    <header class="page-head">
      <div><h1>Leads</h1><p class="muted">Who to warm up next, and the hunting grounds where you find them.</p></div>
      <div class="row wrap">
        <button class="btn" type="button" data-action="log-find" data-source="${sel.id}">+ Log a find</button>
        <button class="btn primary" type="button" data-action="paste-open">Paste a company list</button>
      </div>
    </header>
    ${state.sync.config && !state.sync.v3 ? html`<p class="notice">Company lists are saved on this device only until you update <code>Code.gs</code> in your sheet (see SETUP.md).</p>` : ''}
    ${state.sync.config && state.sync.v3 && !state.sync.v6 ? html`<p class="notice">Your sheet runs an older <code>Code.gs</code>, so stages are worked out from the old Status column on each sync. Update it to v7 (see SETUP.md).</p>`
      : state.sync.config && state.sync.v6 && !state.sync.v7 ? html`<p class="notice">Your sheet runs <code>Code.gs</code> v6: the new stage names sync, but Lost reasons aren't saved to the sheet and old rows keep the Attention…Action names there. Update it to v7 (see SETUP.md).</p>` : ''}
    <div class="toolbar">
      <label class="search"><span class="sr">Search leads</span>${icon('search', 16)}
        <input id="lead-search" type="search" data-bind="leadSearch" value="${state.ui.pool.search}" placeholder="Search leads and companies"></label>
      ${q ? html`<button type="button" class="link small" data-action="lead-search-clear">Clear</button>` : ''}
    </div>
    ${leadBulkBar()}
    ${prospectsSection()}
    ${unqualifiedSection()}
    <h2>Hunting grounds</h2>
    <p class="muted small">Drag a name from the lists on this page onto a source to move them there.</p>
    <div class="source-grid" role="list">
      ${SOURCES.map((s, i) => {
        const x = sourceStats(s.id);
        return html`<button type="button" role="listitem" class="source-card ${s.id === sel.id ? 'on' : ''}" data-action="pick-source" data-id="${s.id}" data-drop-source="${s.id}" aria-pressed="${s.id === sel.id}">
          <span><span class="name">${i + 1} · ${s.id}</span><span class="muted small block">${s.kind}</span></span>
          <span class="big">${x.foundWeek}<span class="muted small"> found this wk</span></span>
          <span class="small">${s.mode === 'list' ? `${x.left} to research` : 'Open search'} · <span class="accent">${x.engaged} engaged</span></span>
          ${q ? html`<span class="small ${hits(s.id) ? 'accent' : 'muted'}">${hits(s.id) ? `${hits(s.id)} match` : 'No matches'}</span>` : ''}
        </button>`;
      })}
    </div>

    ${state.ui.paste.open ? pasteForm(sel) : ''}

    <section class="card flush" aria-label="${sel.id}">
      <div class="panel-head">
        <div class="stack-xs grow">
          <h2>${sel.id}</h2>
          <label class="where">Where to look
            <input data-bind="where" data-id="${sel.id}" value="${sourceWhere(sel.id)}" aria-label="Where to look for ${sel.id}"></label>
          <span class="muted small">${plural(st.found, 'find')} so far · ${st.engaged} engaged now${lists.length ? ' · lists: ' + lists.join(', ') : ''}</span>
        </div>
        ${st.left
          ? html`<button class="btn primary" type="button" data-action="research" data-id="${sel.id}">Research ${st.left} in Today →</button>`
          : html`<button class="btn primary" type="button" data-action="log-find" data-source="${sel.id}">+ Log a find</button>`}
      </div>
      ${q && elsewhere.length ? html`<p class="small muted pad-x">Also matches in ${elsewhere.map((x, i) => html`${i ? ', ' : ''}<button type="button" class="link" data-action="pick-source" data-id="${x.id}">${x.id} (${hits(x.id)})</button>`)}.</p>` : ''}
      ${targets.length ? html`
        <div class="sheet-wrap"><table class="sheet">
          <thead><tr><th>Company</th><th>Industry</th><th>Project</th><th>Person found</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead>
          <tbody>${targets.map(targetRow)}</tbody></table></div>`
        : q ? html`<p class="col-empty">No ${sel.id} companies match “${q}”.</p>`
        : html`<p class="col-empty">${sel.mode === 'list'
          ? `No ${sel.id} list yet. Paste the companies and work through them one at a time in Today.`
          : `${sel.id} has no fixed list: log each person as you find them.`}</p>`}
      ${finds.length ? html`
        <div class="finds"><h3 class="h3">Logged finds</h3>
          ${finds.slice(0, 12).map((p) => html`<button type="button" class="mini-row" data-action="edit" data-id="${p.id}" draggable="true" data-drag-person="${p.id}" title="${DRAG_HINT}">
            <span class="name">${p.name}</span><span class="muted small">${[p.role, p.organization].filter(Boolean).join(', ')} · ${new Date(p.foundAt).toLocaleDateString()}</span>
            ${isEngaged(p) ? html`<span class="tag stage s-${p.stage}">${stageLabel(p.stage)}</span>` : p.stage === 'unqualified' ? html`<span class="status unqualified">Unqualified</span>` : ''}</button>`)}
        </div>` : ''}
    </section>`;
}
