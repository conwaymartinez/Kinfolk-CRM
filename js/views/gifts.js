// Gifts: who needs a gift, for what, by when. A tag on top: people stay on their usual page.
import { html, icon, plural, DAY, startOfDay } from '../ui.js';
import { state, giftList, giftsGiven, giftStats, GIFT_STATUS, OCCASIONS, stageLabel, isOff } from '../store.js';

const dayLabel = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date');

function when(p, now) {
  if (!p.giftDue) return html`<span class="muted small">No date</span>`;
  const t = startOfDay(new Date(p.giftDue).getTime());
  const today = startOfDay(now);
  const days = Math.round((t - today) / DAY);
  const text = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 0 ? `${-days}d late` : `in ${days}d`;
  return html`<span class="small">${dayLabel(p.giftDue)}</span> <span class="timer ${days < 0 ? 'overdue' : ''}">${text}</span>`;
}

function addForm() {
  const g = state.ui.gift;
  const people = state.people.filter((p) => p.stage !== 'unqualified').sort((a, b) => a.name.localeCompare(b.name));
  return html`
    <form class="card stack-sm" data-form="gift" aria-label="Add a gift" autocomplete="off">
      <div class="grid2">
        <label class="field">Who<input id="gift-who" data-bind="gift.who" value="${g.who}" list="dl-gift-people" placeholder="Start typing a name"></label>
        <label class="field">By<input type="date" data-bind="gift.due" value="${g.due}"></label>
      </div>
      <datalist id="dl-gift-people">${people.map((p) => html`<option value="${p.name}">${[p.organization, stageLabel(p.stage)].filter(Boolean).join(' · ')}</option>`)}</datalist>
      <div class="chips" role="group" aria-label="Occasion">
        <span class="muted small">For</span>
        ${OCCASIONS.map((o) => html`<button type="button" class="chip ${g.occasion === o ? 'on' : ''}" data-action="gift-occasion" data-value="${o}">${o}</button>`)}
        <input class="chip-input" data-bind="gift.occasion" value="${OCCASIONS.includes(g.occasion) ? '' : g.occasion}" placeholder="Other…" aria-label="Other occasion">
      </div>
      ${g.error ? html`<p class="error" role="alert">${g.error}</p>` : ''}
      <div class="row wrap"><button class="btn primary" type="submit">${icon('gift', 15)} Add to gift list</button>
        <span class="muted small">To add many at once: Follow up › Spreadsheet, select rows, press “${g.occasion} gift”.</span></div>
    </form>`;
}

function statusButtons(p) {
  return html`<div class="seg tabs sm" role="group" aria-label="Gift status for ${p.name}">
    ${GIFT_STATUS.map((s) => html`<button type="button" class="${p.giftStatus === s.id ? 'on' : ''}" data-action="gift-status" data-id="${p.id}" data-value="${s.id}" aria-pressed="${p.giftStatus === s.id}">${s.label}</button>`)}
  </div>`;
}

const where = (p) => (isOff(p) ? stageLabel(p.stage) : html`<span class="tag stage s-${p.stage}">${stageLabel(p.stage)}</span>`);

export function renderGifts() {
  const now = state.now;
  const list = giftList();
  const given = giftsGiven();
  const st = giftStats(now);
  return html`
    <header class="page-head">
      <div><h1>Gifts</h1>
        <p class="muted">${plural(st.total, 'gift')} to give${st.overdue ? html` · <span class="late-text">${st.overdue} late</span>` : ''}${st.soon ? ` · ${st.soon} this week` : ''}</p></div>
    </header>
    ${addForm()}
    ${list.length ? html`<section class="lead-list" aria-label="Gifts to give">
      <div class="sheet-wrap"><table class="sheet compact lead-table">
        <thead><tr><th>Person</th><th>Stage</th><th>Occasion</th><th>By</th><th>Status</th><th><span class="sr">Remove</span></th></tr></thead>
        <tbody>${list.map((p) => html`<tr>
          <td class="who"><button type="button" class="link name" data-action="edit" data-id="${p.id}">${p.name}</button>${p.organization ? html` <span class="muted small">${p.organization}</span>` : ''}</td>
          <td class="small">${where(p)}</td>
          <td class="small strong">${p.giftOccasion}</td>
          <td class="nowrap">${when(p, now)}</td>
          <td>${statusButtons(p)}</td>
          <td class="actions"><button type="button" class="q-x" data-action="gift-clear" data-id="${p.id}" aria-label="Take ${p.name} off the gift list" title="Off the gift list">${icon('close', 14)}</button></td>
        </tr>`)}</tbody></table></div></section>`
      : html`<p class="col-empty">Nobody on the gift list. Add someone above.</p>`}
    ${given.length ? html`<details class="given"><summary class="h3">Given <span class="muted small">${given.length}</span></summary>
      ${given.map((p) => html`<div class="mini-row"><button type="button" class="link name" data-action="edit" data-id="${p.id}">${p.name}</button>
        <span class="muted small">${p.giftOccasion} · ${dayLabel(p.giftDue)}</span>
        <button type="button" class="link small" data-action="gift-clear" data-id="${p.id}">Clear</button></div>`)}
    </details>` : ''}`;
}
