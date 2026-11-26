// Marketing: people who only get updates. Everyone at stage Marketing, plus Won clients kept updated.
// Updates go out in a weekly batch: tick who got it, add what you sent, press "Sent update".
import { html, icon, rel, plural, DAY, startOfDay } from '../ui.js';
import { state, marketingList, marketingStats, updateDue, touchesFor, giftPending } from '../store.js';

const isPicked = (id) => state.ui.mkt.picked.includes(id);

function lastUpdate(p, now) {
  const t = touchesFor(p.id)[0];
  if (!t) return html`<span class="muted small">Never</span>`;
  const ago = now - new Date(t.date).getTime();
  const text = ago < 6e4 ? 'Just now' : rel(t.date, now).replace(' late', ' ago');
  return html`<span class="muted small" title="${t.next_step}">${text}</span>`;
}

function row(p, now) {
  const due = updateDue(p);
  const late = due < startOfDay(now);
  return html`<tr class="${isPicked(p.id) ? 'picked' : ''}">
    <td class="pick"><input type="checkbox" data-action="mkt-pick" data-id="${p.id}" ${isPicked(p.id) ? 'checked' : ''} aria-label="Pick ${p.name}"></td>
    <td class="who"><button type="button" class="link name" data-action="edit" data-id="${p.id}">${p.name}</button>${p.organization ? html` <span class="muted small">${p.organization}</span>` : ''}
      ${giftPending(p) ? html` <span class="tag gift" title="${p.giftOccasion} gift">${icon('gift', 12)}</span>` : ''}</td>
    <td>${p.stage === 'won' ? html`<span class="tag stage s-won">Client ★</span>` : html`<span class="tag stage s-marketing">Marketing</span>`}</td>
    <td class="small clip" title="${p.nextStep}">${p.nextStep || html`<span class="muted">—</span>`}</td>
    <td class="nowrap">${lastUpdate(p, now)}</td>
    <td class="nowrap"><span class="timer ${late ? 'overdue' : ''}">${due <= now ? (late ? rel(new Date(due).toISOString(), now) : 'Today') : rel(new Date(due).toISOString(), now)}</span></td>
    <td class="actions">
      <button type="button" class="btn sm" data-action="mkt-send-one" data-id="${p.id}" title="Log an update for ${p.name}">Sent</button>
      ${p.stage === 'won'
        ? html`<button type="button" class="btn sm ghost" data-action="mkt-stop" data-id="${p.id}" title="Stop the weekly updates">Stop updates</button>`
        : html`<button type="button" class="btn sm ghost" data-action="mkt-need" data-id="${p.id}" title="They have a need now: onto Follow up as Discovery">Has a need →</button>`}
    </td></tr>`;
}

function table(list, now, label) {
  return html`<section class="lead-list" aria-label="${label}">
    <div class="sheet-wrap"><table class="sheet compact lead-table">
      <thead><tr><th class="pick"><span class="sr">Pick</span></th><th>Person</th><th>Type</th><th>Next step</th><th>Last touch</th><th>Next update</th><th><span class="sr">Actions</span></th></tr></thead>
      <tbody>${list.map((p) => row(p, now))}</tbody></table></div></section>`;
}

export function renderMarketing() {
  const now = state.now;
  const all = marketingList();
  const st = marketingStats(now);
  const end = startOfDay(now) + DAY;
  const due = all.filter((p) => updateDue(p) < end);
  const later = all.filter((p) => updateDue(p) >= end);
  const picked = state.ui.mkt.picked.filter((id) => all.some((p) => p.id === id));
  const clients = state.people.filter((p) => p.stage === 'won' && !p.keepUpdated).sort((a, b) => a.name.localeCompare(b.name));
  return html`
    <header class="page-head">
      <div><h1>Marketing</h1>
        <p class="muted">${plural(st.total, 'person', 'people')} on weekly updates${st.overdue ? html` · <span class="late-text">${st.overdue} overdue</span>` : ''}${st.due - st.overdue ? ` · ${st.due - st.overdue} due today` : ''}</p></div>
      ${clients.length ? html`<label class="select-chip"><span>${icon('plus', 14)} Past client</span>
        <select data-bind="mktAddClient" aria-label="Keep a past client updated"><option value="">Keep a Won client updated…</option>
          ${clients.map((p) => html`<option value="${p.id}">${p.name}${p.organization ? ' · ' + p.organization : ''}</option>`)}</select></label>` : ''}
    </header>
    <form class="card batch" data-form="mkt" aria-label="Send an update" autocomplete="off">
      <div class="row wrap">
        <label class="field grow">What did you send? <span class="muted small">(optional, saved with each touch)</span>
          <input id="mkt-note" data-bind="mkt.note" value="${state.ui.mkt.note}" placeholder="e.g. December availability, new site photos"></label>
      </div>
      <div class="row wrap">
        <button type="button" class="btn" data-action="mkt-pick-due" ${due.length ? '' : 'disabled'}>Pick all due (${due.length})</button>
        ${picked.length ? html`<button type="button" class="link small" data-action="mkt-pick-clear">Clear</button>` : ''}
        <span class="grow"></span>
        <button type="submit" class="btn primary" ${picked.length ? '' : 'disabled'}>${icon('send', 15)} Sent update${picked.length ? ` to ${plural(picked.length, 'person', 'people')}` : ''}</button>
      </div>
      <p class="muted small">Logs a touch for each person picked. Marketing people come back in a week; so do past clients.</p>
    </form>
    <h2 class="h3">Due now <span class="muted small">${due.length}</span></h2>
    ${due.length ? table(due, now, 'Due now') : html`<p class="col-empty">All caught up.${later[0] ? ` Next update ${rel(new Date(updateDue(later[0])).toISOString(), now)}.` : ''}</p>`}
    ${later.length ? html`<h2 class="h3">Coming up <span class="muted small">${later.length}</span></h2>${table(later, now, 'Coming up')}` : ''}
    ${!all.length ? html`<p class="muted small">Set someone's stage to Marketing (or press → Marketing in Leads) to start sending them updates.</p>` : ''}`;
}
