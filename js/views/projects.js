// Projects: one folder per asset. Each folder has its own pipeline, its people, and an ICP builder.
import { html, plural } from '../ui.js';
import {
  state, folderStats, icpOf, hasIcp, icpMatches, targetMatches, industries, STATUS_LABEL, statusOf,
} from '../store.js';
import { toolbar, pipeline, sheet } from './followup.js';

export const folderHref = (id, tab = '') => `#/projects/${encodeURIComponent(id)}${tab ? '/' + tab : ''}`;

/** One line describing an ICP, or '' if none is set. */
function icpLine(icp) {
  if (!hasIcp(icp)) return '';
  return [icp.industries.join(', '), icp.roles, icp.geography].filter(Boolean).join(' · ');
}

// ───────────── overview ─────────────
function folderCard(id) {
  const s = folderStats(id);
  const icp = icpOf(id);
  const line = icpLine(icp);
  return html`
    <a class="folder-card" href="${folderHref(id)}" aria-label="${id} folder">
      <span class="folder-top"><span class="folder-name">${id}</span>
        ${s.late ? html`<span class="badge-late">${s.late} late</span>` : ''}</span>
      <span class="small ${line ? '' : 'muted'}">${icp.summary || line || 'No ICP yet. Open the folder to build one.'}</span>
      <span class="folder-pipe" aria-label="Pipeline">
        <span><strong>${s.touch}</strong> Touch</span><span><strong>${s.wip}</strong> WIP</span>
        <span class="${s.late ? 'late-text' : ''}"><strong>${s.late}</strong> Late</span>
      </span>
      <span class="muted small">${plural(s.people, 'person', 'people')} · ${s.active} active · ${plural(s.wins, 'win')} this month${s.toResearch ? ` · ${s.toResearch} to research` : ''}</span>
    </a>`;
}

function overview() {
  const unfiled = state.people.filter((p) => !p.project).length;
  const nf = state.ui.newFolder;
  return html`
    <header class="page-head">
      <div><h1>Projects</h1><p class="muted">One folder per asset, each with its own pipeline and ideal customer profile.</p></div>
      <button class="btn primary" type="button" data-action="new-folder-open">+ New folder</button>
    </header>
    ${nf !== null ? html`
      <form class="card row wrap" data-form="new-folder" autocomplete="off">
        <label class="field grow">Asset or project name<input id="new-folder" data-bind="newFolder" value="${nf}" placeholder="e.g. GCR Phase 2"></label>
        <span class="row folder-form-btns"><button class="btn primary" type="submit">Create and build ICP</button>
        <button class="btn" type="button" data-action="new-folder-cancel">Cancel</button></span>
      </form>` : ''}
    ${state.sync.config && !state.sync.v4 ? html`<p class="notice">New folders and ICPs are saved on this device only until you update <code>Code.gs</code> to v4 (see SETUP.md).</p>` : ''}
    <div class="folder-grid">${state.projects.map(folderCard)}</div>
    ${unfiled ? html`<p class="muted small">${plural(unfiled, 'person has', 'people have')} no project yet. Build an ICP in a folder to file the ones that fit.</p>` : ''}`;
}

// ───────────── ICP builder ─────────────
function matchRow({ p, fit }, folder) {
  const s = statusOf(p, state.now);
  const here = p.project === folder;
  return html`
    <div class="match-row">
      <span class="fit-score ${fit.tier}">${fit.score}%</span>
      <button type="button" class="match-who" data-action="edit" data-id="${p.id}">
        <span class="name">${p.name}</span>
        <span class="muted small block">${[p.role, p.organization].filter(Boolean).join(', ') || 'No role or company'}</span>
        <span class="small block"><span class="status-dot ${s}">${STATUS_LABEL[s]}</span>${p.project && !here ? ` · in ${p.project}` : ''}${fit.hits.length ? html` · <span class="muted">matched ${fit.hits.join(', ')}</span>` : ''}</span>
      </button>
      ${here ? html`<span class="tag outline">In ${folder}</span>`
        : html`<button type="button" class="btn sm" data-action="icp-assign" data-id="${p.id}"
            title="${p.project ? `Move from ${p.project} to ${folder}` : `Add to ${folder}`}">${p.project ? 'Move here' : 'Add'}</button>`}
    </div>`;
}

function icpPreview(folder, d) {
  if (!hasIcp(d)) {
    return html`<aside class="card stack-sm icp-preview" aria-label="ICP matches">
      <h2 class="h3">Who fits</h2>
      <p class="muted small">Pick an industry or add a role, and everyone in Kinfolk is scored against this profile as you type.</p>
    </aside>`;
  }
  const matches = icpMatches(folder, d);
  const strong = matches.filter((m) => m.fit.tier === 'strong').length;
  const here = matches.filter((m) => m.p.project === folder).length;
  const unfiled = matches.filter((m) => !m.p.project).length;
  const elsewhere = matches.length - here - unfiled;
  const companies = targetMatches(folder, d);
  const untagged = companies.filter((c) => !c.t.project).length;
  const tagged = companies.filter((c) => c.t.project === folder).length;
  return html`
    <aside class="stack-sm icp-preview" aria-label="ICP matches" aria-live="polite">
      <section class="card stack-sm">
        <div class="row between wrap"><h2 class="h3">People who fit</h2>
          <span class="small"><strong>${matches.length}</strong> fit · <strong>${strong}</strong> strong</span></div>
        <div class="icp-split small">
          <span><strong>${here}</strong> in ${folder}</span><span><strong>${unfiled}</strong> no project</span><span><strong>${elsewhere}</strong> in other folders</span>
        </div>
        ${unfiled ? html`<button type="button" class="btn primary" data-action="icp-file-unfiled">Add ${plural(unfiled, 'unfiled fit')} to ${folder}</button>` : ''}
        <div class="match-list">
          ${matches.length ? matches.slice(0, 25).map((m) => matchRow(m, folder)) : html`<p class="muted small">Nobody fits yet. Loosen a criterion, or find new people in Today.</p>`}
          ${matches.length > 25 ? html`<p class="muted small">Showing the top 25 of ${matches.length}. Filter the People tab for the rest.</p>` : ''}
        </div>
      </section>
      <section class="card stack-sm">
        <div class="row between wrap"><h2 class="h3">Companies to research</h2>
          <span class="small"><strong>${companies.length}</strong> on your lists fit</span></div>
        <p class="muted small">${tagged} tagged for ${folder}, ${untagged} untagged. Tagged companies queue in Today when you pick ${folder}.</p>
        <div class="row wrap">
          ${untagged ? html`<button type="button" class="btn" data-action="icp-tag-targets">Tag ${untagged} for ${folder}</button>` : ''}
          ${tagged || untagged ? html`<button type="button" class="btn" data-action="icp-research">Research for ${folder} in Today →</button>` : html`<a class="link small" href="#/sources">Paste a company list in Sources →</a>`}
        </div>
      </section>
    </aside>`;
}

function icpBuilder(folder) {
  const d = state.ui.icpDraft;
  const inds = industries();
  const count = (i) => state.people.filter((p) => p.industry === i).length;
  const saved = icpOf(folder);
  const dirty = JSON.stringify({ ...d, project: undefined, updatedAt: undefined }) !== JSON.stringify({ ...saved, project: undefined, updatedAt: undefined });
  const chip = (i, focus) => html`<button type="button" class="chip ${d.industries.includes(i) ? 'on' : ''}" data-action="icp-industry" data-value="${i}"
    aria-pressed="${d.industries.includes(i)}">${focus ? '★ ' : ''}${i}<span class="chip-n">${count(i)}</span></button>`;
  return html`
    <div class="icp-layout">
      <form class="card stack icp-form" data-form="icp" autocomplete="off" aria-label="Ideal customer profile for ${folder}">
        <div class="stack-xs">
          <h2>Ideal customer profile</h2>
          <p class="muted small">Describe who ${folder} is for. Kinfolk scores every person and every company on your lists against it: industry counts most, then role, location and signals.</p>
        </div>
        <label class="field">Who it's for, in one line
          <input data-bind="icp.summary" value="${d.summary}" placeholder="e.g. Manufacturers outgrowing their warehouse in South Luzon"></label>
        <fieldset class="field-set">
          <legend>Industries <span class="muted small">40%</span></legend>
          <div class="chips">${inds.focus.map((i) => chip(i, true))}${inds.other.map((i) => chip(i, false))}</div>
        </fieldset>
        <div class="grid2">
          <label class="field"><span>Roles or titles <span class="muted small">35%, comma-separated</span></span>
            <input data-bind="icp.roles" value="${d.roles}" placeholder="Operations, Admin, Facilities, Owner"></label>
          <label class="field"><span>Locations <span class="muted small">15%</span></span>
            <input data-bind="icp.geography" value="${d.geography}" placeholder="Laguna, Cavite, Calamba"></label>
          <label class="field span2"><span>Signals <span class="muted small">10%, words in their notes or headline</span></span>
            <input data-bind="icp.keywords" value="${d.keywords}" placeholder="expanding, lease ending, new plant"></label>
        </div>
        <label class="field">Why ${folder} fits them
          <textarea rows="3" data-bind="icp.pitch" placeholder="The angle for the first message: size, location, terms…">${d.pitch}</textarea></label>
        <div class="row wrap">
          <button class="btn primary" type="submit">Save ICP</button>
          ${dirty ? html`<button class="btn" type="button" data-action="icp-reset">Discard changes</button>` : ''}
          <span class="muted small">${dirty ? 'Unsaved changes · ' : ''}${saved.updatedAt ? 'Last saved ' + new Date(saved.updatedAt).toLocaleDateString() : 'Not saved yet'}</span>
        </div>
      </form>
      ${icpPreview(folder, d)}
    </div>`;
}

// ───────────── folder ─────────────
function icpStrip(folder) {
  const icp = icpOf(folder);
  if (!hasIcp(icp)) {
    return html`<a class="card icp-strip empty" href="${folderHref(folder, 'icp')}">
      <strong>Build an ICP for ${folder}</strong><span class="muted small">Define who this asset is for, then file the people and companies that fit.</span></a>`;
  }
  const fits = icpMatches(folder, icp);
  const unfiled = fits.filter((m) => !m.p.project).length;
  return html`<div class="card icp-strip">
    <div class="stack-xs grow"><span class="eyebrow">ICP</span><strong>${icp.summary || icpLine(icp)}</strong>
      ${icp.summary ? html`<span class="muted small">${icpLine(icp)}</span>` : ''}</div>
    <span class="small">${plural(fits.length, 'fit')}${unfiled ? ` · ${unfiled} not filed` : ''}</span>
    <a class="btn sm" href="${folderHref(folder, 'icp')}">Edit ICP</a></div>`;
}

function folderPage(folder) {
  const s = folderStats(folder);
  const tab = state.ui.folderTab;
  const t = (id, label) => html`<a href="${folderHref(folder, id === 'pipeline' ? '' : id)}" class="${tab === id ? 'on' : ''}" aria-current="${tab === id ? 'page' : 'false'}">${label}</a>`;
  return html`
    <header class="page-head">
      <div><a class="link small" href="#/projects">← Projects</a><h1>${folder}</h1>
        <p class="muted">${s.late ? html`<span class="late-text">${s.late} late</span> · ` : ''}${s.touch} Touch · ${s.wip} WIP · ${s.active} active · ${plural(s.week, 'touch', 'touches')} this week · ${plural(s.wins, 'win')} this month</p></div>
      <div class="seg" role="group" aria-label="Folder view">${t('pipeline', 'Pipeline')}${t('people', `People ${s.people}`)}${t('icp', 'ICP')}</div>
    </header>
    ${tab === 'icp' ? icpBuilder(folder) : html`${icpStrip(folder)}${toolbar()}${tab === 'people' ? sheet() : pipeline()}`}`;
}

export function renderProjects() {
  return state.ui.folder ? folderPage(state.ui.folder) : overview();
}

