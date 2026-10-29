// Follow up: the urgency board (Touch / WIP / Late) and the spreadsheet of everyone.
import { html, icon, rel, plural } from '../ui.js';
import {
  state, PRESETS, columns, statusOf, STATUS_LABEL, matchesFilters, isWin, isNew, accounts, industries, lateCount, touchStats,
} from '../store.js';

const COLS = [
  { id: 'touch', label: 'Touch', hint: 'Ready to follow up' },
  { id: 'wip', label: 'WIP', hint: 'Conversation in motion' },
  { id: 'late', label: 'Late', hint: 'Needs attention' },
];

export const SHEET_COLS = [
  { key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }, { key: 'activeLead', label: 'Active lead' },
  { key: 'industry', label: 'Industry' }, { key: 'project', label: 'Project' }, { key: 'source', label: 'Source' },
  { key: 'nextStep', label: 'Next step' }, { key: 'followUpAt', label: 'Follow-up' },
];

const tags = (p) => html`
  ${isWin(p.nextStep) ? html`<span class="tag win">Win</span>` : ''}
  ${isNew(p) ? html`<span class="tag new">New</span>` : ''}
  ${p.activeLead ? html`<span class="tag active">Active lead</span>` : ''}`;

function toolbar() {
  const accs = accounts();
  const inds = industries();
  const { account, industry, onlyActive, search } = state.ui;
  return html`
    <div class="toolbar">
      <label class="search"><span class="sr">Search</span>${icon('search', 16)}
        <input id="search" type="search" data-bind="search" value="${search}" placeholder="Search people or next steps"></label>
      <button type="button" class="pill ${onlyActive ? 'on' : ''}" data-action="only-active" aria-pressed="${onlyActive}">Active leads only</button>
      <select class="pill-select" data-bind="account" aria-label="Filter by account">
        <option value="">All accounts</option>
        ${accs.map((a) => html`<option ${a === account ? 'selected' : ''}>${a}</option>`)}
      </select>
      <select class="pill-select" data-bind="industry" aria-label="Filter by industry">
        <option value="">All industries</option>
        ${inds.focus.length ? html`<optgroup label="Focus">${inds.focus.map((i) => html`<option ${i === industry ? 'selected' : ''}>${i}</option>`)}</optgroup>` : ''}
        <optgroup label="${inds.focus.length ? 'Other' : 'Industries'}">${inds.other.map((i) => html`<option ${i === industry ? 'selected' : ''}>${i}</option>`)}</optgroup>
      </select>
      ${account || industry || onlyActive || search ? html`<button type="button" class="link" data-action="clear-filters">Clear</button>` : ''}
      <span class="grow"></span>
      <button class="btn primary" type="button" data-action="add-person">+ Add person</button>
    </div>`;
}

function pipeline() {
  const cols = columns();
  const now = state.now;
  const sel = state.ui.selectedId;
  const filtered = state.ui.search || state.ui.onlyActive || state.ui.account || state.ui.industry;
  return html`
    <div class="board" aria-label="Follow-up pipeline">
      ${COLS.map((c) => html`
        <section class="col ${c.id}" data-drop="${c.id}" aria-label="${c.label}">
          <div class="col-head"><h2>${c.label}</h2><span class="muted small">${c.hint} · ${cols[c.id].length}</span></div>
          ${cols[c.id].length ? cols[c.id].map((p) => html`
            <article class="person-card ${sel === p.id ? 'selected' : ''} ${sel && sel !== p.id ? 'dim' : ''}" draggable="true"
              data-card="${p.id}" tabindex="0" aria-label="${p.name}, ${rel(p.followUpAt, now)}">
              <div class="card-top"><span class="name">${p.name}</span><span class="tags">${tags(p)}</span></div>
              <span class="muted small">${[p.organization, p.project].filter(Boolean).join(' · ') || 'Unassigned'}</span>
              <span class="step ${p.nextStep ? '' : 'muted'}">${p.nextStep || 'No next step'}</span>
              <div class="card-foot">
                <span class="timer ${c.id === 'late' ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span>
                <button type="button" class="link small" data-action="edit" data-id="${p.id}" aria-label="Edit ${p.name}">Edit</button>
              </div>
            </article>`) : html`<p class="col-empty">${filtered ? 'No matches here' : 'Nothing here right now'}</p>`}
        </section>`)}
    </div>`;
}

function sortValue(p, key, now) {
  if (key === 'status') return ['late', 'touch', 'wip', 'unqualified', 'cold'].indexOf(statusOf(p, now));
  if (key === 'followUpAt') {
    const s = statusOf(p, now);
    return s === 'cold' || s === 'unqualified' ? Infinity : new Date(p.followUpAt).getTime();
  }
  if (key === 'activeLead') return p.activeLead ? 0 : 1;
  return String(p[key] || '').toLowerCase() || '￿';
}

export function sortedRows() {
  const now = state.now;
  const { key, dir } = state.ui.sort;
  return state.people.filter(matchesFilters).sort((a, b) => {
    const x = sortValue(a, key, now);
    const y = sortValue(b, key, now);
    return (x > y ? 1 : x < y ? -1 : a.name.localeCompare(b.name)) * dir;
  });
}

function timeCell(p, s, now) {
  if (s === 'cold') return html`<span class="muted small">Cold storage</span>`;
  if (s === 'unqualified') return html`<span class="muted small">Not scheduled</span>`;
  return html`<span class="timer ${s === 'late' ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span>`;
}

function bulkBar(ids) {
  const people = ids.map((id) => state.people.find((p) => p.id === id));
  const all = (f) => people.every((p) => p[f]);
  const flag = (field, label) => html`<button type="button" class="pill ${all(field) ? 'on' : ''}" data-action="bulk-flag" data-field="${field}" data-on="${all(field) ? '0' : '1'}" aria-pressed="${all(field)}">${label}</button>`;
  return html`
    <div class="bulk-bar" role="toolbar" aria-label="Edit ${ids.length} selected people">
      <strong>${ids.length} selected</strong>
      ${flag('activeLead', 'Active lead')}
      ${flag('unqualified', 'Unqualified')}
      ${flag('cold', 'Cold storage')}
      <button type="button" class="pill" data-action="bulk-pipeline" title="Clear Unqualified and Cold, back to Touch">Back in pipeline</button>
      <span class="bulk-sep"></span>
      <span class="muted small">Follow up</span>
      ${PRESETS.map((p) => html`<button type="button" class="pill" data-action="bulk-snooze" data-value="${p.id}" title="${p.title}">${p.label}</button>`)}
      <select class="pill-select" data-bind="bulkProject" aria-label="Set project for selected">
        <option value="__">Set project…</option><option value="">No project</option>
        ${state.projects.map((p) => html`<option value="${p}">${p}</option>`)}
      </select>
      <span class="grow"></span>
      <button type="button" class="btn sm danger-ghost" data-action="bulk-remove">${state.ui.bulkConfirm ? `Confirm remove ${ids.length}` : 'Remove'}</button>
      <button type="button" class="btn sm" data-action="bulk-clear" title="Esc">Clear</button>
    </div>`;
}

function sheet() {
  const now = state.now;
  const rows = sortedRows();
  const visible = new Set(rows.map((p) => p.id));
  const multi = state.ui.multi.filter((id) => visible.has(id));
  const isSel = (id) => (multi.length > 1 ? multi.includes(id) : state.ui.selectedId === id);
  const { key, dir } = state.ui.sort;
  const filtered = state.ui.search || state.ui.onlyActive || state.ui.account || state.ui.industry;
  return html`
    ${multi.length > 1 ? bulkBar(multi) : html`<p class="muted small sheet-hint">Shift-click to select a range, ${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}-click to add one, then edit them together.</p>`}
    <div class="sheet-wrap" aria-label="People spreadsheet">
      <table class="sheet">
        <thead><tr>${SHEET_COLS.map((c) => html`<th aria-sort="${c.key === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">
          <button type="button" data-action="sort" data-key="${c.key}">${c.label}${c.key === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`)}<th><span class="sr">Edit</span></th></tr></thead>
        <tbody>
          ${rows.map((p) => {
            const s = statusOf(p, now);
            return html`<tr class="${isSel(p.id) ? 'selected' : ''}" data-row="${p.id}" aria-selected="${isSel(p.id)}">
              <td><span class="name">${p.name}</span><span class="muted small block">${p.organization}</span></td>
              <td><span class="status ${s}">${STATUS_LABEL[s]}</span></td>
              <td>${p.activeLead ? html`<span class="tag active">Active lead</span>` : html`<span class="muted">—</span>`}</td>
              <td class="small">${p.industry}</td>
              <td class="small strong">${p.project}</td>
              <td class="small">${p.source}</td>
              <td class="small">${p.nextStep || html`<span class="muted">No next step</span>`} ${isWin(p.nextStep) ? html`<span class="tag win">Win</span>` : ''}</td>
              <td>${timeCell(p, s, now)}</td>
              <td><button type="button" class="btn sm" data-action="edit" data-id="${p.id}" aria-label="Edit ${p.name}">Edit</button></td>
            </tr>`;
          })}
        </tbody>
      </table>
      ${rows.length ? '' : html`<p class="col-empty">${filtered ? 'No matches' : 'Nothing here yet'}</p>`}
    </div>
    <div class="sheet-cards" aria-label="People list">
      <label class="sort-select">Sort
        <select data-bind="sortKey">${SHEET_COLS.map((c) => html`<option value="${c.key}" ${c.key === key ? 'selected' : ''}>${c.label}</option>`)}</select></label>
      ${rows.map((p) => {
        const s = statusOf(p, now);
        return html`<button type="button" class="sheet-card" data-action="edit" data-id="${p.id}">
          <span class="card-top"><span class="name">${p.name}</span><span class="status ${s}">${STATUS_LABEL[s]}</span></span>
          <span class="muted small">${[p.organization, p.project, p.source].filter(Boolean).join(' · ')}</span>
          <span class="small">${p.nextStep || 'No next step'}</span>
          <span class="card-top">${timeCell(p, s, now)}<span class="tags">${tags(p)}</span></span>
        </button>`;
      })}
    </div>`;
}

export function renderFollowUp() {
  const late = lateCount();
  const { week, wins } = touchStats();
  const view = state.ui.followView;
  return html`
    <header class="page-head">
      <div><h1>Follow up</h1>
        <p class="muted">${late ? html`<span class="late-text">${late} late</span> · ` : ''}${plural(week, 'touch', 'touches')} this week · ${plural(wins, 'win')} this month</p></div>
      <div class="seg" role="group" aria-label="Switch view">
        <a href="#/follow-up" class="${view === 'pipeline' ? 'on' : ''}" aria-current="${view === 'pipeline' ? 'page' : 'false'}">Pipeline</a>
        <a href="#/follow-up/sheet" class="${view === 'sheet' ? 'on' : ''}" aria-current="${view === 'sheet' ? 'page' : 'false'}">Spreadsheet</a>
      </div>
    </header>
    ${toolbar()}
    ${view === 'sheet' ? sheet() : pipeline()}`;
}
