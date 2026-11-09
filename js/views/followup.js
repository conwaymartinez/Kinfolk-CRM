// Follow up: the board (one column per engaged stage) and the spreadsheet of everyone.
import { html, icon, rel, plural } from '../ui.js';
import {
  state, PRESETS, columns, matchesFilters, isWin, isNew, isLate, isEngaged, accounts, industries, lateCount, touchStats,
  STAGES, STAGE_IDS, ENGAGED, stageLabel, prospectStats, matchesOtherFilters,
} from '../store.js';

export const SHEET_COLS = [
  { key: 'name', label: 'Name' }, { key: 'stage', label: 'Stage' },
  { key: 'industry', label: 'Industry' }, { key: 'project', label: 'Project' }, { key: 'source', label: 'Source' },
  { key: 'nextStep', label: 'Next step' }, { key: 'followUpAt', label: 'Follow-up' },
];

export const stageTag = (p) => html`<span class="tag stage s-${p.stage}">${stageLabel(p.stage)}</span>`;

const tags = (p, withStage = true) => html`
  ${withStage ? stageTag(p) : ''}
  ${isWin(p.nextStep) ? html`<span class="tag win">Win</span>` : ''}
  ${isNew(p) ? html`<span class="tag new">New</span>` : ''}`;

function toolbar() {
  const accs = accounts();
  const inds = industries();
  const { account, industry, search } = state.ui;
  return html`
    <div class="toolbar">
      <label class="search"><span class="sr">Search</span>${icon('search', 16)}
        <input id="search" type="search" data-bind="search" value="${search}" placeholder="Search people or next steps"></label>
      <select class="pill-select" data-bind="account" aria-label="Filter by account">
        <option value="">All accounts</option>
        ${accs.map((a) => html`<option ${a === account ? 'selected' : ''}>${a}</option>`)}
      </select>
      <select class="pill-select" data-bind="industry" aria-label="Filter by industry">
        <option value="">All industries</option>
        ${inds.focus.length ? html`<optgroup label="Focus">${inds.focus.map((i) => html`<option ${i === industry ? 'selected' : ''}>${i}</option>`)}</optgroup>` : ''}
        <optgroup label="${inds.focus.length ? 'Other' : 'Industries'}">${inds.other.map((i) => html`<option ${i === industry ? 'selected' : ''}>${i}</option>`)}</optgroup>
      </select>
      ${account || industry || search || state.ui.stage ? html`<button type="button" class="link" data-action="clear-filters">Clear</button>` : ''}
      <span class="grow"></span>
      <button class="btn primary" type="button" data-action="add-person">+ Add person</button>
    </div>`;
}

/** Spreadsheet only: the four engaged stages with counts under the other filters; click one to filter. */
function stageStrip() {
  const sel = state.ui.stage;
  const count = (id) => state.people.filter((p) => p.stage === id && matchesOtherFilters(p)).length;
  return html`
    <section class="stage-strip" aria-label="Filter by stage">
      <div class="stage-tiles" role="group" aria-label="Stage">
        ${ENGAGED.map((s) => html`<button type="button" class="stage-tile s-${s.id} ${sel === s.id ? 'on' : ''} ${sel && sel !== s.id ? 'dim' : ''}"
          data-action="stage-filter" data-value="${s.id}" aria-pressed="${sel === s.id}">
          <span class="row between"><strong>${s.label}</strong><span class="n">${count(s.id)}</span></span>
          <span class="small">${s.desc}</span></button>`)}
      </div>
    </section>`;
}

function pipeline() {
  const cols = columns();
  const now = state.now;
  const sel = state.ui.selectedId;
  const filtered = state.ui.search || state.ui.account || state.ui.industry;
  const st = prospectStats();
  return html`
    <p class="muted small">${plural(st.total, 'person', 'people')} waiting in <a href="#/leads">Leads</a>. Drag a card to change its stage.</p>
    <div class="board" aria-label="Follow-up board">
      ${ENGAGED.map((c) => html`
        <section class="col" data-drop="${c.id}" aria-label="${c.label}">
          <div class="col-head"><h2><span class="tag stage s-${c.id}">${c.label}</span></h2><span class="muted small">${c.desc} · ${cols[c.id].length}</span></div>
          ${cols[c.id].length ? cols[c.id].map((p) => html`
            <article class="person-card ${sel === p.id ? 'selected' : ''} ${sel && sel !== p.id ? 'dim' : ''}" draggable="true"
              data-card="${p.id}" tabindex="0" aria-label="${p.name}, ${rel(p.followUpAt, now)}">
              <div class="card-top"><span class="name">${p.name}</span><span class="tags">${tags(p, false)}</span></div>
              <span class="muted small">${[p.organization, p.project].filter(Boolean).join(' · ') || 'Unassigned'}</span>
              <span class="step ${p.nextStep ? '' : 'muted'}">${p.nextStep || 'No next step'}</span>
              <div class="card-foot">
                <span class="timer ${isLate(p, now) ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span>
                <button type="button" class="link small" data-action="edit" data-id="${p.id}" aria-label="Edit ${p.name}">Edit</button>
              </div>
            </article>`) : html`<p class="col-empty">${filtered ? 'No matches here' : 'Nobody here right now'}</p>`}
        </section>`)}
    </div>`;
}

function sortValue(p, key) {
  if (key === 'followUpAt') return p.stage === 'unqualified' || !p.followUpAt ? Infinity : new Date(p.followUpAt).getTime();
  if (key === 'stage') return STAGE_IDS.indexOf(p.stage);
  return String(p[key] || '').toLowerCase() || '\uffff';
}

export function sortedRows() {
  const { key, dir } = state.ui.sort;
  // The spreadsheet lists the engaged; a search also finds Leads and Unqualified people, so nobody is out of reach.
  return state.people.filter((p) => (isEngaged(p) || state.ui.search) && matchesFilters(p)).sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    return (x > y ? 1 : x < y ? -1 : a.name.localeCompare(b.name)) * dir;
  });
}

function timeCell(p, now) {
  if (p.stage === 'unqualified' || !p.followUpAt) return html`<span class="muted small">Not scheduled</span>${p.stage === 'prospect' ? html` <span class="muted small">· Leads</span>` : ''}`;
  const late = new Date(p.followUpAt).getTime() <= now;
  return html`<span class="timer ${late ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span>${p.stage === 'prospect' ? html` <span class="muted small">· Leads</span>` : ''}`;
}

function bulkBar(ids) {
  return html`
    <div class="bulk-bar" role="toolbar" aria-label="Edit ${ids.length} selected people">
      <strong>${ids.length} selected</strong>
      <select class="pill-select" data-bind="bulkStage" aria-label="Set stage for selected">
        <option value="">Set stage…</option>
        ${STAGES.map((s) => html`<option value="${s.id}">${s.id === 'prospect' ? 'Back to Leads' : s.label}</option>`)}
      </select>
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
  const filtered = state.ui.search || state.ui.account || state.ui.industry || state.ui.stage;
  return html`
    ${multi.length > 1 ? bulkBar(multi) : html`<p class="muted small sheet-hint">${state.ui.search ? 'Searching everyone, including Leads and Unqualified. ' : 'Engaged people only; search to find anyone in Leads or Unqualified. '}Shift-click to select a range, ${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}-click to add one, then edit them together.</p>`}
    <div class="sheet-wrap" aria-label="People spreadsheet">
      <table class="sheet">
        <thead><tr>${SHEET_COLS.map((c) => html`<th aria-sort="${c.key === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">
          <button type="button" data-action="sort" data-key="${c.key}">${c.label}${c.key === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`)}<th><span class="sr">Edit</span></th></tr></thead>
        <tbody>
          ${rows.map((p) => html`<tr class="${isSel(p.id) ? 'selected' : ''}" data-row="${p.id}" aria-selected="${isSel(p.id)}">
              <td><span class="name">${p.name}</span><span class="muted small block">${p.organization}</span></td>
              <td>${stageTag(p)}</td>
              <td class="small">${p.industry}</td>
              <td class="small strong">${p.project}</td>
              <td class="small">${p.source}</td>
              <td class="small">${p.nextStep || html`<span class="muted">No next step</span>`} ${isWin(p.nextStep) ? html`<span class="tag win">Win</span>` : ''}</td>
              <td>${timeCell(p, now)}</td>
              <td><button type="button" class="btn sm" data-action="edit" data-id="${p.id}" aria-label="Edit ${p.name}">Edit</button></td>
            </tr>`)}
        </tbody>
      </table>
      ${rows.length ? '' : html`<p class="col-empty">${filtered ? 'No matches' : 'Nothing here yet'}</p>`}
    </div>
    <div class="sheet-cards" aria-label="People list">
      <label class="sort-select">Sort
        <select data-bind="sortKey">${SHEET_COLS.map((c) => html`<option value="${c.key}" ${c.key === key ? 'selected' : ''}>${c.label}</option>`)}</select></label>
      ${rows.map((p) => html`<button type="button" class="sheet-card" data-action="edit" data-id="${p.id}">
          <span class="card-top"><span class="name">${p.name}</span>${stageTag(p)}</span>
          <span class="muted small">${[p.organization, p.project, p.source].filter(Boolean).join(' · ')}</span>
          <span class="small">${p.nextStep || 'No next step'}</span>
          <span class="card-top">${timeCell(p, now)}<span class="tags">${tags(p, false)}</span></span>
        </button>`)}
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
        <a href="#/follow-up" class="${view === 'pipeline' ? 'on' : ''}" aria-current="${view === 'pipeline' ? 'page' : 'false'}">Board</a>
        <a href="#/follow-up/sheet" class="${view === 'sheet' ? 'on' : ''}" aria-current="${view === 'sheet' ? 'page' : 'false'}">Spreadsheet</a>
      </div>
    </header>
    ${toolbar()}
    ${view === 'sheet' ? html`${stageStrip()}${sheet()}` : pipeline()}`;
}
