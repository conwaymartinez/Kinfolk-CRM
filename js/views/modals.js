// Dialogs: person record, log a find, daily goal, sync settings, keyboard shortcuts.
import { html, icon, toLocalInput } from '../ui.js';
import { state, PRESETS, SOURCES, accounts, industries, touchesFor, isWin, byId } from '../store.js';
import { syncLabel } from '../sync.js';

const shell = (title, sub, body, label = title) => html`
  <div class="overlay" data-action="close-modal-bg">
    <div class="modal" role="dialog" aria-modal="true" aria-label="${label}">
      <div class="modal-head">
        <div><p class="eyebrow">${sub}</p><h2>${title}</h2></div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">${icon('close', 18)}</button>
      </div>
      ${body}
    </div>
  </div>`;

function personModal(m) {
  const d = m.draft;
  const orig = m.id ? byId(m.id) : null;
  const last = orig ? touchesFor(orig.id) : [];
  const inds = industries();
  const preset = PRESETS.find((p) => p.id === m.preset);
  const saveLabel = m.touch && d.cold ? 'Log touch & go cold' : m.touch ? (orig ? 'Save & log touch' : 'Add & log touch') : orig ? 'Save changes' : 'Add person';
  const sub = orig ? (m.touch ? 'Log a touch' : 'Update follow-up') : 'New person';
  return shell(orig ? orig.name : 'Add to the pipe', sub, html`
    <form class="stack" data-form="person" autocomplete="off">
      ${last.length ? html`<p class="muted small">Last touch ${new Date(last[0].date).toLocaleDateString()}${last[0].project ? ' · ' + last[0].project : ''} · ${last.length} total</p>` : ''}
      <div class="touch-box ${m.touch ? 'active' : ''} ${m.error ? 'has-error' : ''}">
        <label class="field">Next step
          <input id="next-step" data-bind="draft.nextStep" value="${d.nextStep}" placeholder="What happens next?"></label>
        <div class="chips" aria-label="Project">
          ${state.projects.map((p) => html`<button type="button" class="chip ${d.project === p ? 'on' : ''}" data-action="draft-project" data-value="${p}">${p}</button>`)}
          <span class="chip-sep"></span>
          <button type="button" class="chip" data-action="win-prefix" data-value="SV" title="Site visit scheduled">SV:</button>
          <button type="button" class="chip" data-action="win-prefix" data-value="IP" title="In-person presentation scheduled">IP:</button>
        </div>
        <label class="check"><input type="checkbox" data-bind="touch" ${m.touch ? 'checked' : ''}>
          <span><strong>Log a touch now</strong><span class="muted small block">${m.touch
            ? `Today · ${d.project || 'no project'} · ${isWin(d.nextStep) ? 'counts as a win ★' : 'with the next step above'}`
            : "Tick when you've just reached out, on any channel"}</span></span></label>
        ${m.error ? html`<p class="error" role="alert">${m.error}</p>` : ''}
      </div>

      <div class="field">Next follow-up
        <div class="row wrap">
          <input type="datetime-local" data-bind="draft.followUpAt" value="${toLocalInput(d.followUpAt)}" ${d.cold || !d.contacted ? 'disabled' : ''} aria-label="Follow-up date and time">
          ${PRESETS.map((p) => html`<button type="button" class="chip ${m.preset === p.id ? 'on' : ''}" data-action="preset" data-value="${p.id}" title="${p.title}" ${d.cold || !d.contacted ? 'disabled' : ''}>${p.label}</button>`)}
        </div>
        <span class="muted small">${d.cold ? 'None while in cold storage' : !d.contacted ? 'Not in the pipeline yet' : preset ? preset.title : ''}</span>
      </div>

      <div class="grid2">
        <label class="field span2">Name<input id="person-name" data-bind="draft.name" value="${d.name}" placeholder="Person's name" required></label>
        <label class="field">Organization<input data-bind="draft.organization" value="${d.organization}" list="dl-accounts"></label>
        <label class="field">Role<input data-bind="draft.role" value="${d.role}"></label>
        <label class="field">Email<input type="email" data-bind="draft.email" value="${d.email}"></label>
        <label class="field">Phone<input type="tel" data-bind="draft.phone" value="${d.phone}"></label>
        <label class="field">Industry<input data-bind="draft.industry" value="${d.industry}" list="dl-industries"></label>
        <label class="field">Source
          <select data-bind="draft.source"><option value="">Not set</option>${SOURCES.map((s) => html`<option ${d.source === s.id ? 'selected' : ''}>${s.id}</option>`)}</select></label>
        <label class="field">Reports to
          <select data-bind="draft.reportsToId"><option value="">No manager mapped</option>
            ${state.people.filter((p) => p.id !== m.id).sort((a, b) => a.name.localeCompare(b.name)).map((p) => html`<option value="${p.id}" ${d.reportsToId === p.id ? 'selected' : ''}>${p.name}${p.organization ? ' · ' + p.organization : ''}</option>`)}
          </select></label>
        <label class="field">Relationship strength
          <select data-bind="draft.strength">
            ${[[1, 'New connection'], [2, 'Developing'], [3, 'Strong relationship']].map(([v, l]) => html`<option value="${v}" ${d.strength === v ? 'selected' : ''}>${l}</option>`)}
          </select></label>
      </div>
      <datalist id="dl-accounts">${accounts().map((a) => html`<option value="${a}"></option>`)}</datalist>
      <datalist id="dl-industries">${[...inds.focus, ...inds.other].map((a) => html`<option value="${a}"></option>`)}</datalist>

      <div class="checks">
        <label class="check"><input type="checkbox" data-bind="draft.activeLead" ${d.activeLead ? 'checked' : ''}>
          <span><strong>Active lead</strong><span class="muted small block">They're engaged: a real opportunity</span></span></label>
        <label class="check"><input type="checkbox" data-bind="draft.contacted" ${d.contacted ? 'checked' : ''}>
          <span><strong>In the follow-up pipeline</strong><span class="muted small block">Untick for a prospect you haven't reached</span></span></label>
        <label class="check"><input type="checkbox" data-bind="draft.cold" ${d.cold ? 'checked' : ''}>
          <span><strong>Cold storage</strong><span class="muted small block">${m.touch ? 'Log this touch, then park them out of the pipeline' : 'Keep the record, take them out of the pipeline'}</span></span></label>
      </div>

      ${orig ? (orig.headline || orig.notes ? html`<details><summary>Notes</summary>
          ${orig.headline ? html`<p class="small">${orig.headline}</p>` : ''}<p class="small pre">${orig.notes}</p></details>` : '')
        : html`<label class="field">Notes<textarea rows="2" data-bind="draft.notes">${d.notes}</textarea></label>`}

      <div class="modal-foot">
        ${orig ? html`<button type="button" class="btn danger-ghost" data-action="remove-person">${m.confirmRemove ? 'Confirm remove' : 'Remove'}</button>` : ''}
        <span class="grow"></span>
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn primary">${saveLabel}</button>
      </div>
    </form>`, orig ? orig.name : 'New person');
}

function findModal(m) {
  const d = m.draft;
  const inds = industries();
  return shell('Log a find', 'Prospecting', html`
    <form class="stack" data-form="log-find" autocomplete="off">
      <div class="chips" role="group" aria-label="Source">
        ${SOURCES.map((s, i) => html`<button type="button" class="chip ${d.source === s.id ? 'on' : ''}" data-action="find-source" data-value="${s.id}">${i + 1} · ${s.id}</button>`)}
      </div>
      <div class="grid2">
        <label class="field">Company<input id="find-org" data-bind="mfind.organization" value="${d.organization}" list="dl-accounts2"></label>
        <label class="field">Industry<input data-bind="mfind.industry" value="${d.industry}" list="dl-industries2"></label>
        <label class="field">Name<input data-bind="mfind.name" value="${d.name}" placeholder="Who decides on space"></label>
        <label class="field">Role<input data-bind="mfind.role" value="${d.role}"></label>
        <label class="field">Email<input type="email" data-bind="mfind.email" value="${d.email}"></label>
        <label class="field">Phone or LinkedIn<input data-bind="mfind.phone" value="${d.phone}"></label>
        <label class="field span2">Why they fit<input data-bind="mfind.why" value="${d.why}"></label>
      </div>
      <datalist id="dl-accounts2">${accounts().map((a) => html`<option value="${a}"></option>`)}</datalist>
      <datalist id="dl-industries2">${[...inds.focus, ...inds.other].map((a) => html`<option value="${a}"></option>`)}</datalist>
      <div class="chips" aria-label="Project">
        <span class="muted small">Project</span>
        ${state.projects.map((p) => html`<button type="button" class="chip ${d.project === p ? 'on' : ''}" data-action="find-project" data-value="${p}">${p}</button>`)}
      </div>
      ${d.error ? html`<p class="error" role="alert">${d.error}</p>` : ''}
      <p class="muted small">Counts toward today's goal. They land in Follow up › Touch with “First message” due tomorrow.</p>
      <div class="modal-foot"><span class="grow"></span>
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn primary">Save find</button></div>
    </form>`);
}

function goalModal() {
  return shell('Daily goal', 'Prospecting', html`
    <form class="stack" data-form="goal">
      <label class="field">New people to find each day<input id="goal-input" type="number" min="1" max="100" name="goal" value="${state.goal}"></label>
      <div class="modal-foot"><span class="grow"></span>
        <button type="button" class="btn" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn primary">Save</button></div>
    </form>`);
}

function syncModal(m) {
  const s = state.sync;
  return shell('Sync settings', 'Google Sheets', html`
    <form class="stack" data-form="sync" autocomplete="off">
      <label class="field">Web app URL<input id="sync-url" data-bind="msync.url" value="${m.url}" placeholder="https://script.google.com/macros/s/…/exec"></label>
      <label class="field">Token<input data-bind="msync.token" value="${m.token}" placeholder="From the sheet's Kinfolk menu"></label>
      <p class="small ${s.status === 'error' ? 'error' : 'muted'}">${s.message || (s.config
        ? `${syncLabel()}${s.lastSync ? ' · last synced ' + new Date(s.lastSync).toLocaleTimeString() : ''}. Edits save to the sheet.`
        : 'Not connected. Everything is saved in this browser only.')}</p>
      ${s.config && !s.v3 ? html`<p class="notice small">Your sheet is running an older Code.gs. People and touches sync, but Active lead, finds and company lists need the new Code.gs (see SETUP.md).</p>` : ''}
      <div class="modal-foot">
        ${s.config ? html`<button type="button" class="btn danger-ghost" data-action="disconnect">Disconnect</button>
          <button type="button" class="btn" data-action="pull">Pull now</button>` : ''}
        <span class="grow"></span>
        <button type="submit" class="btn primary" ${m.busy ? 'disabled' : ''}>${m.busy ? 'Connecting…' : s.config ? 'Reconnect' : 'Connect'}</button>
      </div>
    </form>`);
}

const KEYS = [
  ['Pick someone', [['↑ ↓', 'J K', 'Move through cards'], ['Esc', '', 'Clear the selection'], ['F', '/', 'Search']]],
  ['Act on them', [['T', '', 'Log a touch'], ['A', '', 'Active lead on / off'], ['C', '', 'Cold storage on / off'], ['R', '', 'Back to Touch, due tomorrow'],
    ['1 2 3', '', 'Follow up in 24H / 2 days / 1 week'], ['E', 'Enter', 'Open the full record']]],
  ['Prospecting (Today)', [['Enter', '', 'Save prospect'], ['S', '', "Can't find anyone yet"], ['X', '', 'Not a fit'], ['L', '', 'Log a find']]],
  ['Anywhere', [['G', 'then T F S', 'Go to Today / Follow up / Sources'], ['N', '', 'Add a person'], ['?', '', 'This list']]],
];

function keysModal() {
  return shell('Keyboard', 'Work without the mouse', html`
    <div class="keys">${KEYS.map(([title, rows]) => html`<section><h3 class="h3">${title}</h3>
      ${rows.map(([a, b, c]) => html`<div class="key-row"><span><kbd>${a}</kbd>${b ? html` <kbd>${b}</kbd>` : ''}</span><span>${c}</span></div>`)}
    </section>`)}</div>`, 'Keyboard shortcuts');
}

export function renderModal() {
  const m = state.ui.modal;
  if (!m) return '';
  if (m.type === 'person') return personModal(m);
  if (m.type === 'find') return findModal(m);
  if (m.type === 'goal') return goalModal();
  if (m.type === 'sync') return syncModal(m);
  if (m.type === 'keys') return keysModal();
  return '';
}
