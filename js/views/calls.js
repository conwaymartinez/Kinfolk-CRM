// Calls: people booked for a call at 12 NOON or 5 PM, grouped by day, worked one at a time.
import { html, icon, plural, toLocalInput, DAY, startOfDay } from '../ui.js';
import {
  state, PRESETS, ENGAGED, STAGES, SLOTS, OUTCOMES, byId, touchesFor, isWin, stageLabel,
  callBook, callWorkList, callMissed, callLabel, callsDoneToday, slotOf, slotOpen, slotTime, nextSlot,
} from '../store.js';
import { stageTag } from './followup.js';

/** The day tiles: today and the next four days, plus any later day that has calls. */
export function callDays(now = state.now) {
  const today = startOfDay(now);
  const days = [0, 1, 2, 3, 4].map((i) => today + i * DAY);
  callBook(now).open.forEach((p) => {
    const d = startOfDay(new Date(p.callAt).getTime());
    if (!days.includes(d)) days.push(d);
  });
  return days.sort((a, b) => a - b);
}

/** The person on the call card: the one picked, else the first on today's list who wasn't skipped. */
export function currentCall() {
  const c = state.ui.calls;
  const picked = c.currentId != null && byId(c.currentId);
  if (picked && picked.callAt) return picked;
  if (c.paused) return null;
  const list = callWorkList();
  const skipped = c.skipped || [];
  return list.find((p) => !skipped.includes(p.id)) || list[0] || null;
}

/** A fresh log form for this person. */
export function newCallDraft(p) {
  return {
    id: p.id, outcome: 'connected', nextStep: p.nextStep, project: p.project, stage: p.stage, lostReason: '',
    after: 'followup', preset: null, followUpAt: '', callAt: nextSlot(), error: '',
  };
}

export function callDraft(p) {
  const c = state.ui.calls;
  if (!c.draft || c.draft.id !== p.id) c.draft = newCallDraft(p);
  return c.draft;
}

const dayName = (d, now = state.now) => {
  const today = startOfDay(now);
  if (d === today) return 'Today';
  if (d === today + DAY) return 'Tmrw';
  return new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
};

function dayStrip(selected, book) {
  const today = startOfDay(state.now);
  return html`<div class="days" role="group" aria-label="Pick a day">
    ${callDays().map((d) => {
      const slots = book.day(d);
      const n = slots.noon.length + slots.pm.length;
      return html`<button type="button" class="day ${d === selected ? 'on' : ''}" data-action="call-day-view" data-value="${d}" aria-pressed="${d === selected}">
        ${dayName(d)}<strong>${new Date(d).getDate()}</strong><span class="n ${n ? '' : 'none'}">${n ? (d === today ? `${n} left` : n) : '—'}</span></button>`;
    })}
  </div>`;
}

function qrow(p, cur) {
  const missed = callMissed(p);
  return html`<div class="q-row ${cur && cur.id === p.id ? 'on' : ''}" data-action="call-pick" data-id="${p.id}" role="button" tabindex="0"
      aria-label="${p.name}, ${callLabel(p.callAt)}">
    <div class="q-body">
      <div class="card-top"><span class="name">${p.name}</span>${stageTag(p)}</div>
      <span class="small muted q-step">${p.nextStep || 'No next step'}</span>
      ${missed ? html`<span class="small late-text">Missed · ${callLabel(p.callAt)}</span>` : ''}
    </div>
    <button type="button" class="q-x" data-action="call-remove" data-id="${p.id}" title="Back to Follow up without a call" aria-label="Take ${p.name} out of Calls">${icon('close', 14)}</button>
  </div>`;
}

function slotBlock(title, stateCls, stateTxt, people, cur, extra = '') {
  return html`<section class="slot ${extra}" aria-label="${title}">
    <div class="slot-head"><span class="slot-time">${icon('clock', 15)}${title}</span><span class="slot-state ${stateCls}">${stateTxt}</span></div>
    ${people.length ? html`<div class="q-list">${people.map((p) => qrow(p, cur))}</div>` : html`<p class="slot-empty">Nobody booked</p>`}
  </section>`;
}

function queue(cur) {
  const now = state.now;
  const book = callBook(now);
  const today = startOfDay(now);
  const day = state.ui.calls.day ?? today;
  const slots = book.day(day);
  const done = callsDoneToday(now);
  const status = (s) => {
    const start = new Date(slotTime(day, s.id)).getTime();
    if (!slotOpen(day, s.id, now)) return ['done', 'Done'];
    if (start <= now) return ['now', `Now · ${slots[s.id].length}`];
    const first = day === today && SLOTS.find((x) => slotOpen(day, x.id, now))?.id === s.id;
    return [first ? 'next' : '', first ? `Next · ${slots[s.id].length}` : String(slots[s.id].length)];
  };
  return html`
    <aside class="split-side card flush calls-queue" aria-label="Scheduled calls">
      <div class="panel-head"><h2 class="h3">Scheduled calls</h2><span class="muted small">12 NOON · 5 PM</span></div>
      ${dayStrip(day, book)}
      ${book.missed.length ? slotBlock('Missed', 'missed', String(book.missed.length), book.missed, cur, 'missed') : ''}
      ${SLOTS.map((s) => { const [c, t] = status(s); return slotBlock(s.label, c, t, slots[s.id], cur); })}
      ${done.length ? html`<details class="q-done" open><summary>Done today · ${done.length}</summary>
        <div class="stack-xs small">${[...done].reverse().map((d) => html`<span>${d.name} <span class="muted">· ${d.outcome} → ${d.where}</span></span>`)}</div></details>` : ''}
      <p class="muted small q-hint">✕ puts someone back on Follow up without a call.</p>
    </aside>`;
}

function emptyCard() {
  const book = callBook();
  const next = book.open.find((p) => new Date(p.callAt).getTime() >= startOfDay(state.now) + DAY);
  const body = !book.all.length
    ? html`<p>No calls booked. On <a href="#/follow-up">Follow up</a>, press the phone button on a card (or <kbd>C</kbd>) and pick 12 NOON or 5 PM.</p>`
    : state.ui.calls.paused
      ? html`<p>Paused. Pick someone from the list, or carry on with the next call.</p>
        <button type="button" class="btn primary" data-action="call-resume">Next call</button>`
      : html`<p>No calls left today.${next ? ` Next: ${callLabel(next.callAt)}.` : ''}</p>`;
  return html`<section class="split-main card dashed empty-state" aria-label="Now calling">${body}</section>`;
}

function phoneButton(p) {
  const tel = (p.phone || '').replace(/[^\d+]/g, '');
  if (!tel) {
    return html`<button type="button" class="btn lg" data-action="edit" data-id="${p.id}">${icon('phone', 18)}Add a phone number</button>
      <span class="muted small">No phone on the record</span>`;
  }
  return html`<a class="btn primary lg" href="tel:${tel}">${icon('phone', 18)}Call ${p.phone}</a>
    <span class="muted small">Opens your phone or dialer</span>`;
}

function logForm(p, d) {
  const closing = d.stage === 'won' || d.stage === 'lost' || d.stage === 'unqualified';
  const stageInfo = STAGES.find((s) => s.id === d.stage);
  const preset = PRESETS.find((x) => x.id === d.preset);
  const callDay = startOfDay(new Date(d.callAt).getTime());
  const today = startOfDay(state.now);
  const dayChoices = [0, 1, 2, 3].map((i) => today + i * DAY);
  const reach = ENGAGED.findIndex((s) => s.id === d.stage);
  return html`
    <form class="call-log touch-box active stack-sm" data-form="call" aria-label="Log this call" autocomplete="off">
      <div class="field">How did it go?
        <div class="outcomes" role="group" aria-label="Outcome">
          ${OUTCOMES.map((o) => html`<button type="button" class="stage-btn ${d.outcome === o.id ? 'on' : ''}" data-action="call-outcome" data-value="${o.id}" aria-pressed="${d.outcome === o.id}">${o.label}</button>`)}
        </div>
      </div>
      <label class="field">Next step
        <input id="call-next" data-bind="call.nextStep" value="${d.nextStep}" placeholder="What happens next?"></label>
      <div class="chips" aria-label="Project">
        ${state.projects.map((x) => html`<button type="button" class="chip ${d.project === x ? 'on' : ''}" data-action="call-project" data-value="${x}">${x}</button>`)}
        <span class="chip-sep"></span>
        <button type="button" class="chip" data-action="call-prefix" data-value="SV" title="Site visit scheduled">SV:</button>
        <button type="button" class="chip" data-action="call-prefix" data-value="IP" title="In-person presentation scheduled">IP:</button>
      </div>
      <div class="field">Stage
        <div class="stage-picker picker4" role="group" aria-label="Stage">
          ${ENGAGED.map((s, i) => html`<button type="button" class="stage-btn s-${s.id} ${reach >= 0 && i <= reach ? 'reached' : ''} ${d.stage === s.id ? 'on' : ''}"
            data-action="call-stage" data-value="${s.id}" aria-pressed="${d.stage === s.id}">${s.label}</button>`)}
        </div>
        <div class="row" style="gap:6px">
          ${['won', 'lost'].map((id) => html`<button type="button" class="stage-btn s-${id} ${d.stage === id ? 'on' : ''}" data-action="call-stage" data-value="${id}" aria-pressed="${d.stage === id}" style="flex:0 0 96px">${stageLabel(id)}</button>`)}
          <span class="muted small">${closing ? 'Leaves Calls and the board · kept as a record' : 'Won and Lost close the deal'}</span>
        </div>
        ${d.stage === 'lost' ? html`<label class="field">Why was it lost?
          <input id="call-lost" data-bind="call.lostReason" value="${d.lostReason}" placeholder="e.g. No budget, went with a competitor"></label>` : ''}
      </div>
      ${closing ? '' : html`<div class="field">After this call
        <div class="seg full" role="group" aria-label="Where they go next">
          <button type="button" class="${d.after === 'followup' ? 'on' : ''}" data-action="call-after" data-value="followup" aria-pressed="${d.after === 'followup'}">Back to Follow up</button>
          <button type="button" class="${d.after === 'again' ? 'on' : ''}" data-action="call-after" data-value="again" aria-pressed="${d.after === 'again'}">Call again</button>
        </div>
        ${d.after === 'followup' ? html`
          <div class="row wrap">
            ${PRESETS.map((x) => html`<button type="button" class="chip ${d.preset === x.id ? 'on' : ''}" data-action="call-preset" data-value="${x.id}" title="${x.title}">${x.label}</button>`)}
            <input type="datetime-local" data-bind="call.followUpAt" value="${toLocalInput(d.followUpAt)}" aria-label="Follow-up date and time" style="flex:1 1 170px">
          </div>
          <span class="muted small">${preset ? preset.title : d.followUpAt ? 'Follow up on the date picked'
            : `Back in ${stageLabel(d.stage)} · follow up in ${stageInfo?.every ?? ''} (the stage rhythm)`}</span>` : html`
          <div class="day-pick" role="group" aria-label="Day">
            ${dayChoices.map((t) => html`<button type="button" class="chip ${callDay === t ? 'on' : ''}" data-action="call-again-day" data-value="${t}">${t === today ? 'Today' : t === today + DAY ? 'Tomorrow' : `${new Date(t).toLocaleDateString(undefined, { weekday: 'short' })} ${new Date(t).getDate()}`}</button>`)}
            <input type="date" data-bind="call.againDate" value="${toLocalInput(new Date(callDay).toISOString()).slice(0, 10)}" aria-label="Another day">
          </div>
          <div class="slot-pick" role="group" aria-label="Time">
            ${SLOTS.map((s) => html`<button type="button" class="slot-btn ${slotOf(d.callAt).id === s.id ? 'on' : ''}" data-action="call-again-slot" data-value="${s.id}"
              ${new Date(slotTime(callDay, s.id)).getTime() > state.now ? '' : 'disabled'}>${s.label}</button>`)}
          </div>
          <span class="muted small">Stays in Calls · ${callLabel(d.callAt)}</span>`}
      </div>`}
      ${d.error ? html`<p class="error" role="alert">${d.error}</p>` : ''}
      <div class="modal-foot">
        <button type="button" class="btn ghost" data-action="call-skip">Skip <kbd>S</kbd></button>
        <span class="grow"></span>
        <button type="button" class="btn" data-action="call-save-stop">Save &amp; stop</button>
        <button type="submit" class="btn primary">Save &amp; next call <kbd>↵</kbd></button>
      </div>
      <p class="muted small">Saving logs a touch (today · next step · project)${isWin(d.nextStep) ? ' · counts as a win ★' : ''}.</p>
    </form>`;
}

function callCard(p) {
  const d = callDraft(p);
  const last = touchesFor(p.id).slice(0, 3);
  const missed = callMissed(p);
  const list = callWorkList();
  const i = list.findIndex((x) => x.id === p.id);
  return html`
    <section class="split-main card strong research" aria-label="Now calling">
      <div class="research-head">
        <div>
          <p class="eyebrow">Now calling${i >= 0 ? ` · ${i + 1} of ${list.length}` : ''}${missed ? ' · missed' : ''}</p>
          <h3><button type="button" class="link name call-name" data-action="edit" data-id="${p.id}" title="Open the record">${p.name}</button></h3>
          <p class="muted">${[p.role, p.organization, p.industry].filter(Boolean).join(' · ') || 'No role or organization yet'}</p>
          <div class="row wrap" style="margin-top:8px;gap:6px">${stageTag(p)}${p.project ? html`<span class="tag outline">${p.project}</span>` : ''}</div>
        </div>
        <div class="stack-xs call-dial">${phoneButton(p)}</div>
      </div>
      <div class="call-split">
        <div class="call-info">
          <div class="facts">
            <div class="fact"><p class="eyebrow">Next step</p><p class="strong">${p.nextStep || 'No next step'}</p></div>
            <div class="fact"><p class="eyebrow">Scheduled</p><p class="strong ${missed ? 'late-text' : ''}">${callLabel(p.callAt)}${missed ? ' · missed' : ''}</p></div>
          </div>
          <div class="stack-xs">
            <p class="eyebrow">Last touches</p>
            ${last.length ? html`<ul class="touch-list">${last.map((t) => html`<li><span class="d">${new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              <span class="grow">${t.next_step}${isWin(t.next_step) ? html` <span class="tag win">Win</span>` : ''}</span><span class="muted">${t.project}</span></li>`)}</ul>`
              : html`<p class="muted small">No touches yet</p>`}
          </div>
          ${p.headline || p.notes ? html`<details><summary>Notes</summary>${p.headline ? html`<p class="small">${p.headline}</p>` : ''}<p class="small pre">${p.notes}</p></details>` : ''}
        </div>
        ${logForm(p, d)}
      </div>
    </section>`;
}

export function renderCalls() {
  const now = state.now;
  const book = callBook(now);
  const today = book.day(startOfDay(now));
  const cur = currentCall();
  const done = callsDoneToday(now).length;
  const left = today.noon.length + today.pm.length;
  const bits = [
    book.missed.length && html`<span class="late-text">${book.missed.length} missed</span>`,
    `${plural(left, 'call')} left today${left ? ` (12 NOON ${today.noon.length} · 5 PM ${today.pm.length})` : ''}`,
    done && `${done} done`,
  ].filter(Boolean);
  return html`
    <header class="page-head">
      <div><h1>Calls</h1>
        <p class="muted">${new Date(now).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}${bits.map((b) => html` · ${b}`)}</p></div>
      <a class="btn" href="#/follow-up">+ Schedule from Follow up</a>
    </header>
    <div class="split calls">
      ${queue(cur)}
      ${cur ? callCard(cur) : emptyCard()}
    </div>`;
}
