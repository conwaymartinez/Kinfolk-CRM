// Today: follow-ups first, then a prospecting session that rewards finding people.
import { html, rel, plural, DAY, startOfDay, startOfWeek } from '../ui.js';
import {
  state, statusOf, touchStats, queue, findsBetween, SOURCES, SOURCE_IDS,
} from '../store.js';

export const emptyFind = () => ({ name: '', role: '', email: '', phone: '', why: '', error: '' });

function dueStrip() {
  const now = state.now;
  const endOfDay = startOfDay(now) + DAY;
  const pipe = state.people.filter((p) => ['touch', 'wip', 'late'].includes(statusOf(p, now)));
  const late = pipe.filter((p) => statusOf(p, now) === 'late');
  const today = pipe.filter((p) => statusOf(p, now) !== 'late' && new Date(p.followUpAt).getTime() < endOfDay);
  const list = [...late, ...today].sort((a, b) => new Date(a.followUpAt) - new Date(b.followUpAt)).slice(0, 3);
  const next = pipe.filter((p) => statusOf(p, now) !== 'late').sort((a, b) => new Date(a.followUpAt) - new Date(b.followUpAt))[0];
  const summary = late.length || today.length
    ? html`<span class="due-sum ${late.length ? 'is-late' : ''}">${[late.length && `${late.length} late`, today.length && `${today.length} due today`].filter(Boolean).join(' · ')}</span>`
    : html`<span class="due-sum">All caught up.${next ? ` Next one ${rel(next.followUpAt, now)}.` : ''}</span>`;
  return html`
    <section class="due card" aria-label="Follow-ups due">
      <div class="due-head"><strong>Follow-ups first</strong>${summary}</div>
      ${list.map((p) => html`
        <button type="button" class="due-item" data-action="open-followup" data-id="${p.id}">
          <span class="due-top"><span class="name">${p.name}</span>
            <span class="timer ${statusOf(p, now) === 'late' ? 'overdue' : ''}">${rel(p.followUpAt, now)}</span></span>
          <span class="muted small">${p.nextStep || 'No next step'}</span>
        </button>`)}
      <a class="link" href="#/follow-up">Open Follow up →</a>
    </section>`;
}

function filters() {
  const { source, project } = state.ui.today;
  return html`
    <div class="chips">
      <label class="select-chip ${source ? 'on' : ''}"><span>Source</span>
        <select data-bind="today.source" aria-label="Source">
          <option value="">Any list</option>
          ${SOURCES.map((s) => html`<option value="${s.id}" ${s.id === source ? 'selected' : ''}>${s.id}</option>`)}
        </select></label>
      <label class="select-chip ${project ? 'on' : ''}"><span>Project</span>
        <select data-bind="today.project" aria-label="Project">
          <option value="">Any</option>
          ${state.projects.map((p) => html`<option value="${p}" ${p === project ? 'selected' : ''}>${p}</option>`)}
        </select></label>
    </div>`;
}

function researchCard(t, total) {
  const f = state.ui.find;
  return html`
    <form id="research" tabindex="-1" class="research card strong" data-form="find" aria-label="Company to research" autocomplete="off">
      <div class="research-head">
        <div>
          <span class="muted small">${t.source} · ${t.list}${t.industry ? ' · ' + t.industry : ''} · ${plural(total, 'company', 'companies')} left</span>
          <h3>${t.company}</h3>
          ${t.hint ? html`<span class="muted">${t.hint}</span>` : ''}
        </div>
        ${t.project ? html`<span class="tag outline">For ${t.project}</span>` : ''}
      </div>
      <div class="grid2">
        <label class="field">Who decides on space<input id="find-name" data-bind="find.name" value="${f.name}" placeholder="Name"></label>
        <label class="field">Role<input data-bind="find.role" value="${f.role}" placeholder="e.g. Operations Director"></label>
        <label class="field">Email<input data-bind="find.email" value="${f.email}" placeholder="name@company.com" inputmode="email"></label>
        <label class="field">Phone or LinkedIn<input data-bind="find.phone" value="${f.phone}" placeholder="+63… or linkedin.com/in/…"></label>
        <label class="field span2">Why they fit<input data-bind="find.why" value="${f.why}" placeholder="e.g. expanding, lease ending, near the site"></label>
      </div>
      ${f.error ? html`<p class="error" role="alert">${f.error}</p>` : ''}
      <div class="row wrap">
        <button class="btn primary lg" type="submit">Save prospect <kbd>Enter</kbd></button>
        <button class="btn lg" type="button" data-action="skip-target" data-id="${t.id}">Can't find anyone yet <kbd>S</kbd></button>
        <button class="btn lg" type="button" data-action="notfit-target" data-id="${t.id}">Not a fit <kbd>X</kbd></button>
      </div>
      <p class="muted small">Saving counts toward today's goal and puts them in Follow up › Touch with “First message” due tomorrow.</p>
    </form>`;
}

function emptyCard(found) {
  const { source } = state.ui.today;
  const any = state.targets.some((t) => t.status === 'to_research');
  return html`
    <article class="card dashed empty-state">
      <h3>${found ? `List done. ${plural(found, 'new person', 'new people')} found today.` : 'No companies waiting to be researched.'}</h3>
      <p>${any && source
        ? `Nothing left for ${source}${state.ui.today.project ? ' · ' + state.ui.today.project : ''}. Try another source, or paste a fresh list.`
        : 'Paste a company list in Sources, or log someone you found at an event, while manning, searching or on social.'}</p>
      <div class="row wrap">
        <a class="btn primary lg" href="#/sources">Find more in Sources →</a>
        ${any && source ? html`<button class="btn lg" type="button" data-action="today-any">Any source</button>` : ''}
      </div>
    </article>`;
}

function weekBars() {
  const wk = startOfWeek(state.now);
  const today = startOfDay(state.now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = wk + i * DAY;
    const n = findsBetween(from, from + DAY).length;
    return { n, label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i], cls: from === today ? 'now' : from > today || !n ? 'future' : '' };
  });
  const max = Math.max(state.goal, ...days.map((d) => d.n));
  return html`
    <div class="bars" role="img" aria-label="Finds per day this week: ${days.map((d) => d.n).join(', ')}">
      ${days.map((d) => html`<div class="bar-col"><span class="bar-n">${d.n || ''}</span>
        <div class="bar ${d.cls}" style="height:${Math.max(4, Math.round((d.n / max) * 72))}px"></div>
        <span class="muted small">${d.label}</span></div>`)}
    </div>`;
}

export function renderToday() {
  const { week, wins } = touchStats();
  const foundToday = findsBetween(startOfDay(state.now));
  const q = queue();
  const t = q[0];
  if (state.ui.findFor !== (t && t.id)) { state.ui.find = emptyFind(); state.ui.findFor = t && t.id; }
  const goal = state.goal;
  const pct = Math.min(100, Math.round((foundToday.length / goal) * 100));
  const month = findsBetween(state.now - 30 * DAY);
  const left = SOURCE_IDS.map((id) => ({ id, n: state.targets.filter((x) => x.source === id && x.status === 'to_research').length }));
  const dateLabel = new Date(state.now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return html`
    <header class="page-head">
      <div><h1>Today</h1><p class="muted">${dateLabel} · ${plural(week, 'touch', 'touches')} this week · ${plural(wins, 'win')} this month</p></div>
      <button class="btn primary" type="button" data-action="add-person">+ Add person</button>
    </header>
    ${dueStrip()}
    <div class="split">
      <div class="split-main stack">
        <div class="stack-sm">
          <div class="row between end wrap">
            <div><h2>Prospecting: find new people</h2>
              <p class="muted small">Research one company at a time. Messaging happens later, in Follow up.</p></div>
            <button class="goal" type="button" data-action="edit-goal" title="Change daily goal">${foundToday.length} of ${goal} found</button>
          </div>
          <div class="progress" role="progressbar" aria-label="Found today" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${foundToday.length}"><div style="width:${pct}%"></div></div>
          ${filters()}
        </div>
        ${t ? researchCard(t, q.length) : emptyCard(foundToday.length)}
        <button class="btn dashed" type="button" data-action="log-find">+ Log a find from Events, Manning, Search or Social</button>
      </div>
      <aside class="split-side stack" aria-label="Prospecting progress">
        <section class="card stack-sm">
          <h2 class="h3">Found today</h2>
          ${foundToday.length ? foundToday.slice().reverse().slice(0, 6).map((p) => html`
            <button type="button" class="mini-row" data-action="edit" data-id="${p.id}"><span class="name">${p.name}</span><span class="muted small">${p.organization || p.source} → Touch</span></button>`)
            : html`<p class="muted small">Nobody yet. Your first find shows up here.</p>`}
        </section>
        <section class="card stack-sm">
          <h2 class="h3">Found this week</h2>
          ${weekBars()}
          <p class="small">${month.filter((p) => p.activeLead).length} of ${plural(month.length, 'find')} from the last 30 days became Active leads.</p>
        </section>
        <section class="card stack-sm">
          <h2 class="h3">Companies left to research</h2>
          ${left.map((s) => html`<div class="row between small"><span>${s.id}</span><strong class="${s.n ? '' : 'muted'}">${s.n}</strong></div>`)}
          <a class="link small" href="#/sources">Manage sources →</a>
        </section>
      </aside>
    </div>`;
}
