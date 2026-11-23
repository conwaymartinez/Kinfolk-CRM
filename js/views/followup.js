// Follow up: the board (one column per engaged stage) and the spreadsheet of everyone.
import { html, icon, rel, plural, DAY, startOfDay } from '../ui.js';
import {
  state, PRESETS, columns, matchesFilters, isWin, isNew, isLate, isEngaged, accounts, industries, lateCount, touchStats,
  STAGES, STAGE_IDS, ENGAGED, stageLabel, prospectStats, matchesOtherFilters, isOff, closedStats, SOURCES,
  SLOTS, slotOpen, inCalls, callLabel, scheduled,
} from '../store.js';

const shortDay = (t, today) => (t === today ? 'Today' : t === today + DAY ? 'Tomorrow' : `${new Date(t).toLocaleDateString(undefined, { weekday: 'short' })} ${new Date(t).getDate()}`);

/** Book a call from a card: pick a day, then 12 NOON or 5 PM. */
function schedPanel(p) {
  const now = state.now;
  const today = startOfDay(now);
  const day = state.ui.sched.day ?? today;
  const days = [0, 1, 2, 3].map((i) => today + i * DAY);
  const iso = new Date(day - new Date(day).getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  return html`<div class="sched" role="group" aria-label="Book a call with ${p.name}">
    <div class="row between"><span class="small strong">Book a call</span>
      <button type="button" class="q-x" data-action="sched-close" aria-label="Close">${icon('close', 14)}</button></div>
    <div class="day-pick">${days.map((d) => html`<button type="button" class="chip ${d === day ? 'on' : ''}" data-action="sched-day" data-value="${d}">${shortDay(d, today)}</button>`)}
      <input type="date" data-bind="schedDate" value="${iso}" min="${new Date(today - new Date(today).getTimezoneOffset() * 6e4).toISOString().slice(0, 10)}" aria-label="Another day"></div>
    <div class="slot-pick">${SLOTS.map((s) => html`<button type="button" class="slot-btn" data-action="sched-slot" data-id="${p.id}" data-value="${s.id}"
      ${slotOpen(day, s.id, now) ? '' : 'disabled'}>${s.label}</button>`)}</div>
    <span class="muted small">Leaves the board until the call is logged.</span>
  </div>`;
}

/** Day + slot buttons for booking several people at once (board picks or spreadsheet rows). */
function bulkCall() {
  const today = startOfDay(state.now);
  const first = slotOpen(today, 'pm', state.now) ? today : today + DAY;
  const day = state.ui.sched.bulkDay ?? first;
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => today + i * DAY).filter((d) => d >= first);
  return html`<span class="muted small">Call on</span>
    <select class="pill-select" data-bind="bulkCallDay" aria-label="Call day">
      ${days.map((d) => html`<option value="${d}" ${d === day ? 'selected' : ''}>${shortDay(d, today)}</option>`)}
    </select>
    ${SLOTS.map((s) => html`<button type="button" class="pill" data-action="bulk-call" data-value="${s.id}" ${slotOpen(day, s.id, state.now) ? '' : 'disabled'}>${s.label}</button>`)}`;
}

export const SHEET_COLS = [
  { key: 'name', label: 'Name' }, { key: 'stage', label: 'Stage' }, { key: 'project', label: 'Project' },
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

/**
 * Spreadsheet only: the four engaged stages with counts under the other filters; click one to filter.
 * Below them, the closed records (Won, Lost), which only show in the spreadsheet when picked here.
 */
function stageStrip() {
  const sel = state.ui.stage;
  const count = (id) => state.people.filter((p) => p.stage === id && matchesOtherFilters(p)).length;
  return html`
    <section class="stage-strip" aria-label="Filter by stage">
      ${ENGAGED.map((s) => html`<button type="button" class="stage-tile s-${s.id} ${sel === s.id ? 'on' : ''} ${sel && sel !== s.id ? 'dim' : ''}"
        data-action="stage-filter" data-value="${s.id}" aria-pressed="${sel === s.id}" title="${s.desc} · every ${s.every}">
        <strong>${s.label}</strong><span class="n">${count(s.id)}</span></button>`)}
      <span class="sep" aria-hidden="true"></span>
      ${['won', 'lost'].map((id) => html`<button type="button" class="pill ${sel === id ? 'on' : ''}" data-action="stage-filter" data-value="${id}"
        aria-pressed="${sel === id}">${stageLabel(id)} · ${count(id)}</button>`)}
    </section>`;
}

function pipeline() {
  const cols = columns();
  const now = state.now;
  const sel = state.ui.selectedId;
  const filtered = state.ui.search || state.ui.account || state.ui.industry;
  const multi = state.ui.multi;
  const booked = scheduled().length;
  const sched = state.ui.sched.id;
  const st = prospectStats();
  const closed = closedStats(now);
  return html`
    <p class="muted small">${plural(st.total, 'person', 'people')} waiting in <a href="#/leads">Leads</a>.
      ${closed.wonMonth || closed.lostMonth ? `Last 30 days: ${closed.wonMonth} won, ${closed.lostMonth} lost. ` : ''}Click a name to open it; drag a card to change its stage; the phone button books a call (⌘/Shift-click to pick several).</p>
    ${multi.length > 1 ? html`<div class="bulk-bar" role="toolbar" aria-label="${multi.length} picked">
      <strong>${multi.length} picked</strong><span class="bulk-sep"></span>${bulkCall()}<span class="grow"></span>
      <button type="button" class="btn sm" data-action="bulk-clear" title="Esc">Clear</button></div>` : ''}
    ${booked ? html`<div class="away">${icon('phone', 16)}<span class="grow"><strong>${plural(booked, 'person is', 'people are')} in Calls</strong> and off this board until their call is logged.</span><a class="link" href="#/calls">Open Calls →</a></div>` : ''}
    <div class="board" aria-label="Follow-up board">
      ${ENGAGED.map((c) => html`
        <section class="col" data-drop="${c.id}" aria-label="${c.label}">
          <div class="col-head" title="${c.desc}"><h2><span class="dot s-${c.id}"></span>${c.label}<span class="col-n">${cols[c.id].length}</span></h2><span class="tag outline">every ${c.every}</span></div>
          <div class="col-body" data-scroll="${c.id}">
          ${cols[c.id].length ? cols[c.id].map((p) => html`
            <article class="person-card ${sel === p.id ? 'selected' : ''} ${multi.includes(p.id) ? 'picked' : ''} ${sel && sel !== p.id && !multi.length && sched !== p.id ? 'dim' : ''}" draggable="${sched === p.id ? 'false' : 'true'}"
              data-card="${p.id}" tabindex="0" aria-label="${p.name}, ${rel(p.followUpAt, now)}">
              <div class="card-top"><button type="button" class="link name" data-action="edit" data-id="${p.id}" title="Open ${p.name}">${p.name}</button>
                <span class="timer ${isLate(p, now) ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span></div>
              <div class="card-top"><span class="step ${p.nextStep ? '' : 'muted'}" title="${p.nextStep}">${p.nextStep || 'No next step'}</span>
                <span class="row" style="gap:6px">${isWin(p.nextStep) ? html`<span class="tag win">Win</span>` : ''}<button type="button" class="card-call" data-action="sched-open" data-id="${p.id}"
                  aria-expanded="${sched === p.id}" title="Book a call (C)" aria-label="Book a call with ${p.name}">${icon('phone', 14)}</button></span></div>
              ${sched === p.id ? schedPanel(p) : ''}
            </article>`) : html`<p class="col-empty">${filtered ? 'No matches here' : 'Nobody here right now'}</p>`}
          </div>
        </section>`)}
    </div>`;
}

function sortValue(p, key) {
  if (key === 'followUpAt') return isOff(p) || !p.followUpAt ? Infinity : new Date(p.followUpAt).getTime();
  if (key === 'stage') return STAGE_IDS.indexOf(p.stage);
  return String(p[key] || '').toLowerCase() || '\uffff';
}

export function sortedRows() {
  const { key, dir } = state.ui.sort;
  // The spreadsheet lists the engaged; a search also finds Leads, closed and Unqualified people, so nobody is out of
  // reach, and picking Won or Lost in the stage strip lists those records.
  return state.people.filter((p) => (isEngaged(p) || state.ui.search || state.ui.stage === p.stage) && matchesFilters(p)).sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    return (x > y ? 1 : x < y ? -1 : a.name.localeCompare(b.name)) * dir;
  });
}

function timeCell(p, now) {
  if (inCalls(p)) return html`<a class="in-calls" href="#/calls">${icon('phone', 11)}Call · ${callLabel(p.callAt, now)}</a>`;
  if (p.stage === 'lost') return html`<span class="muted small">Lost${p.lostReason ? ' · ' + p.lostReason : ''}</span>`;
  if (p.stage === 'won') return html`<span class="muted small">Won ★</span>`;
  if (isOff(p) || !p.followUpAt) return html`<span class="muted small">Not scheduled</span>${p.stage === 'prospect' ? html` <span class="muted small">· Leads</span>` : ''}`;
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
      <select class="pill-select" data-bind="bulkSource" aria-label="Set source for selected">
        <option value="__">Set source…</option>${SOURCES.map((s) => html`<option value="${s.id}">${s.id}</option>`)}<option value="">No source</option>
      </select>
      <span class="bulk-sep"></span>
      ${bulkCall()}
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
    ${multi.length > 1 ? bulkBar(multi) : html`<p class="muted small sheet-hint">${state.ui.search ? 'Searching everyone. ' : 'Engaged only; search to find anyone. '}Click a name to open it · Shift-click a range, ${navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'}-click to add one.</p>`}
    <div class="sheet-wrap" aria-label="People spreadsheet">
      <table class="sheet">
        <thead><tr>${SHEET_COLS.map((c) => html`<th aria-sort="${c.key === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">
          <button type="button" data-action="sort" data-key="${c.key}">${c.label}${c.key === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`)}</tr></thead>
        <tbody>
          ${rows.map((p) => html`<tr class="${isSel(p.id) ? 'selected' : ''}" data-row="${p.id}" aria-selected="${isSel(p.id)}">
              <td><button type="button" class="link name" data-action="edit" data-id="${p.id}" title="Open ${p.name}">${p.name}</button></td>
              <td>${stageTag(p)}</td>
              <td class="small strong">${p.project}</td>
              <td class="small">${p.nextStep || html`<span class="muted">No next step</span>`} ${isWin(p.nextStep) ? html`<span class="tag win">Win</span>` : ''}</td>
              <td>${timeCell(p, now)}</td>
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
          <span class="card-top"><span class="small step">${p.nextStep || 'No next step'}</span>${timeCell(p, now)}</span>
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
