// Sources: the five hunting grounds, their company lists, and what each one yields.
import { html, plural } from '../ui.js';
import { state, SOURCES, sourceStats, sourceWhere } from '../store.js';

const STATE_LABEL = { to_research: 'To research', found: 'Found → Touch', not_fit: 'Not a fit' };

function targetRow(t) {
  const person = t.personId ? state.people.find((p) => p.id === t.personId) : null;
  return html`<tr>
    <td><span class="name">${t.company}</span>${t.hint ? html`<span class="muted small block">${t.hint}</span>` : ''}</td>
    <td class="small">${t.industry}</td>
    <td class="small strong">${t.project}</td>
    <td class="small">${person ? html`<button type="button" class="link" data-action="edit" data-id="${person.id}">${person.name}${person.role ? ', ' + person.role : ''}</button>` : html`<span class="muted">Not found yet</span>`}</td>
    <td><span class="status t-${t.status}">${person?.activeLead ? 'Active lead' : STATE_LABEL[t.status] || t.status}</span></td>
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

export function renderSources() {
  const sel = SOURCES.find((s) => s.id === state.ui.sourceSel) || SOURCES[0];
  const targets = state.targets.filter((t) => t.source === sel.id)
    .sort((a, b) => ['to_research', 'found', 'not_fit'].indexOf(a.status) - ['to_research', 'found', 'not_fit'].indexOf(b.status) || a.createdAt.localeCompare(b.createdAt));
  const lists = [...new Set(targets.map((t) => t.list))];
  const finds = state.people.filter((p) => p.source === sel.id && p.foundAt && !state.targets.some((t) => t.personId === p.id))
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt));
  const st = sourceStats(sel.id);

  return html`
    <header class="page-head">
      <div><h1>Sources</h1><p class="muted">Your hunting grounds: where to look for new people, and which ones pay off.</p></div>
      <div class="row wrap">
        <button class="btn" type="button" data-action="log-find" data-source="${sel.id}">+ Log a find</button>
        <button class="btn primary" type="button" data-action="paste-open">Paste a company list</button>
      </div>
    </header>
    ${state.sync.config && !state.sync.v3 ? html`<p class="notice">Company lists are saved on this device only until you update <code>Code.gs</code> in your sheet (see SETUP.md).</p>` : ''}
    <div class="source-grid" role="list">
      ${SOURCES.map((s, i) => {
        const x = sourceStats(s.id);
        return html`<button type="button" role="listitem" class="source-card ${s.id === sel.id ? 'on' : ''}" data-action="pick-source" data-id="${s.id}" aria-pressed="${s.id === sel.id}">
          <span><span class="name">${i + 1} · ${s.id}</span><span class="muted small block">${s.kind}</span></span>
          <span class="big">${x.foundWeek}<span class="muted small"> found this wk</span></span>
          <span class="small">${s.mode === 'list' ? `${x.left} to research` : 'Open search'} · <span class="accent">${x.active} became active</span></span>
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
          <span class="muted small">${plural(st.found, 'find')} so far · ${st.active} became Active leads${lists.length ? ' · lists: ' + lists.join(', ') : ''}</span>
        </div>
        ${st.left
          ? html`<button class="btn primary" type="button" data-action="research" data-id="${sel.id}">Research ${st.left} in Today →</button>`
          : html`<button class="btn primary" type="button" data-action="log-find" data-source="${sel.id}">+ Log a find</button>`}
      </div>
      ${targets.length ? html`
        <div class="sheet-wrap"><table class="sheet">
          <thead><tr><th>Company</th><th>Industry</th><th>Project</th><th>Person found</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead>
          <tbody>${targets.map(targetRow)}</tbody></table></div>`
        : html`<p class="col-empty">${sel.mode === 'list'
          ? `No ${sel.id} list yet. Paste the companies and work through them one at a time in Today.`
          : `${sel.id} has no fixed list: log each person as you find them.`}</p>`}
      ${finds.length ? html`
        <div class="finds"><h3 class="h3">Logged finds</h3>
          ${finds.slice(0, 12).map((p) => html`<button type="button" class="mini-row" data-action="edit" data-id="${p.id}">
            <span class="name">${p.name}</span><span class="muted small">${[p.role, p.organization].filter(Boolean).join(', ')} · ${new Date(p.foundAt).toLocaleDateString()}</span>
            ${p.activeLead ? html`<span class="tag active">Active lead</span>` : ''}</button>`)}
        </div>` : ''}
    </section>`;
}
