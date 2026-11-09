// State, persistence, derived data and every action that changes data.
// Actions queue sheet ops through `emit` (wired up by sync.js).
import { DAY, HOUR, startOfDay, startOfWeek } from './ui.js';

export const SOURCES = [
  { id: 'Events', kind: 'Exhibitor lists + people met', mode: 'list', where: 'Exhibitor list from the event; cards collected on the day' },
  { id: 'Manning', kind: 'Booth, showroom, site duty', mode: 'open', where: 'Walk-ins and enquiries while manning a booth or site office' },
  { id: 'Search', kind: 'Web, maps, news', mode: 'open', where: 'Google / Maps: [industry] near the project; news on expansions' },
  { id: 'Social', kind: 'LinkedIn, Facebook', mode: 'open', where: 'LinkedIn: "operations director" + industry + city' },
  { id: 'Association', kind: 'Member directories', mode: 'list', where: 'Member directory → filter by industry and region' },
];
export const SOURCE_IDS = SOURCES.map((s) => s.id);

export const PRESETS = [
  { id: '24h', label: '24H', hours: 24, key: '1', title: 'Follow up in 24 hours' },
  { id: '2d', label: 'N2D', hours: 48, key: '2', title: 'Follow up in 2 days' },
  { id: '1w', label: 'N1W', hours: 168, key: '3', title: 'Follow up in 1 week' },
];

const DEFAULT_PROJECTS = ['GCR', 'PNST', 'AC', 'EN', 'AGE'];
const DEFAULT_GROUPS = [
  { name: 'Healthcare', focus: true }, { name: 'Cosmetics', focus: true },
  { name: 'Plastics', focus: true }, { name: 'Construction', focus: true },
];

const K = {
  people: 'kinfolk-v3-people',
  touches: 'kinfolk-v3-touches',
  targets: 'kinfolk-v3-targets',
  meta: 'kinfolk-v3-meta',
  sync: 'kinfolk-sync-v1', // shared with v2 so an existing connection carries over
};

export const load = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };
export const KEYS = K;

// ───────────── model ─────────────
export const isWin = (text) => /^\s*(SV|IP)\s*:/i.test(text || '');

// ───────────── stage: the one marker ─────────────
// Stage is the only thing you set. It decides where someone shows up:
//   Prospect → the Leads page (not engaged yet, or gone cold: worth reviving)
//   Marketing / Discovery / Proposal / Negotiation → the Follow up board, each with its own follow-up rhythm
//   Won / Lost → off the board, kept as a record (found through search). Lost keeps a reason.
//   Unqualified → nowhere (not a fit, e.g. can't afford it: don't revive; found again through search)
// Late and Win are worked out from the follow-up date and the next step, never stored.
export const STAGES = [
  { id: 'prospect', label: 'Prospect', desc: 'Not engaged yet' },
  { id: 'marketing', label: 'Marketing', desc: 'No active need yet', cadence: 168, every: '1W' },
  { id: 'discovery', label: 'Discovery', desc: 'Finding the need', cadence: 168, every: '1W' },
  { id: 'proposal', label: 'Proposal', desc: 'Need confirmed', cadence: 48, every: '48H' },
  { id: 'negotiation', label: 'Negotiation', desc: 'Offer on the table', cadence: 24, every: '24H' },
  { id: 'won', label: 'Won', desc: 'Purchased · kept as a record' },
  { id: 'lost', label: 'Lost', desc: 'Final no · kept with the reason' },
  { id: 'unqualified', label: 'Unqualified', desc: "Not a fit · don't revive" },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
/** Off the board and Leads for good: closed deals and people who aren't a fit. Search still finds them. */
export const OFF_IDS = ['won', 'lost', 'unqualified'];
export const ENGAGED = STAGES.filter((s) => s.id !== 'prospect' && !OFF_IDS.includes(s.id));
const ENGAGED_IDS = ENGAGED.map((s) => s.id);
export const FIRST_ENGAGED = ENGAGED_IDS[0];
export const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label ?? '';
export const isEngaged = (p) => ENGAGED_IDS.includes(p.stage);
export const isOff = (p) => OFF_IDS.includes(p.stage);
/** The stage's follow-up rhythm in hours (engaged stages only). */
const cadence = (stage) => STAGES.find((s) => s.id === stage)?.cadence ?? 0;
const inCadence = (stage, now = Date.now()) => new Date(now + cadence(stage) * HOUR).toISOString();
export const isLate = (p, now = state.now) => isEngaged(p) && new Date(p.followUpAt).getTime() <= now;
/** No follow-up date, or one that has passed. */
const dueBy = (p, now = Date.now()) => !p.followUpAt || new Date(p.followUpAt).getTime() <= now;

/**
 * The sheet's `status` column mirrors the stage in the old words, so dropdowns and Dashboard formulas keep working.
 * Unqualified, Won and Lost are written as "Cold" there (off the pipeline): the old dropdown has only Prospect/Touch/Cold.
 */
export const sheetStatus = (stage) => (stage === 'prospect' ? 'Prospect' : OFF_IDS.includes(stage) ? 'Cold' : 'Touch');
/** Older names for today's stages: v5 called Unqualified "cold"; v6 used Attention / Interest / Desire / Action. */
const OLD_NAMES = { cold: 'unqualified', attention: 'marketing', interest: 'discovery', desire: 'proposal', action: 'negotiation' };
const renamed = (stage) => OLD_NAMES[stage] || stage;

/** How long since anyone reached them: days since the last touch, or since added if never touched. */
export const COLDNESS = [
  { id: 'fresh', label: 'Fresh', max: 7, range: '0–7d' },
  { id: 'cooling', label: 'Cooling', max: 30, range: '8–30d' },
  { id: 'stale', label: 'Stale', max: 90, range: '31–90d' },
  { id: 'frozen', label: 'Frozen', max: Infinity, range: '90d+' },
];
export const addedAt = (p) => p.foundAt || p.createdAt;
export function coldness(p, now = state.now) {
  const last = touchesFor(p.id)[0];
  const from = new Date(last ? last.date : addedAt(p)).getTime();
  const days = Math.max(0, Math.floor((now - from) / DAY));
  return { days, band: COLDNESS.find((b) => days <= b.max), touched: !!last, count: touchesFor(p.id).length };
}

const parseHistory = (v) => {
  if (Array.isArray(v)) return v;
  try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a.filter((h) => h && h.stage && h.at) : []; } catch { return []; }
};

// ───────────── moving from the old markers (status + funnel + Active lead) ─────────────
// Kept in step with migrateStages_ in apps-script/Code.gs.
const DEAD_END = /^\s*(out of (network|geography|country|help)|rejected|complete rejection|parked|no way in|ignored|master'?s student|cannot until)/i;
const NO_REPLY = /no reply|not replying|email not working|^\s*retap/i;
const RANK = { prospect: 0, marketing: 1, discovery: 2, proposal: 3, negotiation: 4 };
/** In the old history "cold" meant "not engaged yet", which is Prospect now. */
const oldHistory = (v) => parseHistory(v).map((h) => ({ ...h, stage: h.stage === 'cold' ? 'prospect' : renamed(h.stage) }));

/**
 * One stage from the old markers.
 * - A dead-end next step (Rejected, Out of Geography/Network/Country, Parked…) → Unqualified.
 * - Old Cold storage or Prospect/Unqualified: touched with a live next step → back on Follow up; otherwise → Prospect.
 * - Old Touch / WIP: keep an engaged funnel stage, else Touch → Marketing, WIP → Discovery.
 * - Active lead → at least Proposal.
 * The old funnel names (Attention…Action) are read as today's (Marketing…Negotiation).
 */
export function legacyStage({ status, funnel, activeLead, nextStep = '', touched }) {
  const f = renamed(funnel);
  const engaged = ENGAGED_IDS.includes(f) ? f : '';
  const out = status === 'Cold' || status === 'Prospect' || status === 'Unqualified';
  let s;
  if (DEAD_END.test(nextStep)) s = 'unqualified';
  else if (out) s = touched && nextStep.trim() && !NO_REPLY.test(nextStep) ? engaged || 'marketing' : 'prospect';
  else s = engaged || (status === 'WIP' ? 'discovery' : 'marketing');
  if (activeLead && s !== 'unqualified' && RANK[s] < RANK.proposal) s = 'proposal';
  return s;
}

/** Local data saved by the old model (`funnel`, `cold`, `unqualified`, `activeLead`, `stage: touch|wip`) → one `stage`. */
function upgradeLocal(people, touches) {
  const touched = new Set(touches.map((t) => Number(t.person_id)));
  return people.map((p) => {
    if (!('funnel' in p) && STAGE_IDS.includes(renamed(p.stage))) {
      return { ...p, stage: renamed(p.stage), stageHistory: parseHistory(p.stageHistory).map((h) => ({ ...h, stage: renamed(h.stage) })) };
    }
    const { funnel, cold, unqualified, contacted, activeLead, ...rest } = p;
    const status = cold ? 'Cold' : unqualified || contacted === false ? 'Prospect' : p.stage === 'wip' ? 'WIP' : 'Touch';
    const stage = legacyStage({ status, funnel, activeLead, nextStep: p.nextStep, touched: touched.has(p.id) });
    const history = oldHistory(p.stageHistory);
    if (history.at(-1)?.stage !== stage) history.push({ stage, at: new Date().toISOString() });
    return { ...rest, stage, stageHistory: history };
  });
}

export function blankPerson(over = {}) {
  return {
    id: 0, name: '', organization: '', role: '', industry: '', project: '', email: '', phone: '', source: '',
    nextStep: '', followUpAt: new Date(Date.now() + DAY).toISOString(), stage: 'marketing', lostReason: '',
    reportsToId: null, strength: 1, createdAt: new Date().toISOString(), foundAt: '',
    stageHistory: [], headline: '', notes: '', ...over,
  };
}

/** Old local data (v2) → the old v3 shape; upgradeLocal then gives it a stage. */
function migrateV2() {
  const old = load('kinfolk-pipe-v2', null);
  if (!old) return null;
  return old.map((p) => ({
    ...blankPerson({
      id: p.id, name: p.name || '', organization: p.organization || '', role: p.role || '', industry: p.industry || '',
      project: p.project || '', email: p.email || '', phone: p.phone || '', nextStep: p.nextStep ?? p.lastTouch ?? '',
      followUpAt: p.followUpAt || new Date(Date.now() + DAY).toISOString(), stage: p.stage === 'wip' ? 'wip' : 'touch',
      reportsToId: p.reportsToId ?? null, strength: p.relationshipStrength || 1, createdAt: p.createdAt || new Date().toISOString(),
      stageHistory: p.stageHistory || [],
    }),
    funnel: p.funnelStage || '', cold: !!p.cold, unqualified: p.contacted === false && !p.cold,
  }));
}

function demoPeople() {
  const h = (n) => new Date(Date.now() + n * HOUR).toISOString();
  const now = new Date().toISOString();
  return [
    blankPerson({ id: 1, name: 'Maya Chen', organization: 'Northstar Labs', industry: 'Technology', role: 'VP, Product', project: 'GCR', source: 'Social', nextStep: 'Send the product overview', followUpAt: h(3), strength: 3, stage: 'discovery' }),
    blankPerson({ id: 2, name: 'Sofia Alvarez', organization: 'Northstar Labs', industry: 'Technology', role: 'Director, Partnerships', project: 'AC', source: 'Search', nextStep: 'Book a discovery call', followUpAt: h(22), reportsToId: 1, strength: 2, stage: 'marketing' }),
    blankPerson({ id: 3, name: 'Jon Bell', organization: 'Cedar & Co.', industry: 'Professional Services', role: 'Managing Partner', project: 'GCR', source: 'Events', nextStep: 'SV: Site visit Thursday', followUpAt: h(6), strength: 2, stage: 'negotiation' }),
    blankPerson({ id: 4, name: 'Amara Okafor', organization: 'Cedar & Co.', industry: 'Professional Services', role: 'Operations Director', project: 'PNST', source: 'Manning', nextStep: 'Try calling again', followUpAt: h(-5), reportsToId: 3, stage: 'proposal' }),
    blankPerson({ id: 5, name: 'Nina Patel', organization: 'Cedar & Co.', industry: 'Professional Services', role: 'Engagement Lead', project: 'EN', source: 'Association', nextStep: 'Research current priorities', followUpAt: h(24), foundAt: now, stage: 'prospect' }),
  ];
}

function demoTargets() {
  const now = Date.now();
  return [
    ['Halden Plastics', 'Plastics', 'Two plants; ops team listed'],
    ['Lumen Cosmetics', 'Cosmetics', 'D2C brand, hiring warehouse staff'],
    ['Meridian Medical Supply', 'Healthcare', 'Distributor, outgrowing current site'],
    ['Ridgeway Builders', 'Construction', 'New large contract, may need a yard'],
  ].map(([company, industry, hint], i) => ({
    id: 'demo' + i, company, industry, hint, source: 'Association', list: 'Sample directory', project: 'GCR',
    status: 'to_research', personId: null, skippedAt: '', createdAt: new Date(now + i * 1000).toISOString(),
  }));
}

// ───────────── state ─────────────
const meta = load(K.meta, null);
const hasV3 = load(K.people, null);

const startTouches = load(K.touches, null) ?? load('kinfolk-touches-v1', []);
export const state = {
  people: upgradeLocal(hasV3 ?? migrateV2() ?? demoPeople(), startTouches),
  touches: startTouches,
  targets: load(K.targets, null) ?? (hasV3 || load('kinfolk-pipe-v2', null) ? [] : demoTargets()),
  projects: meta?.projects ?? load('kinfolk-meta-v1', {}).projects ?? DEFAULT_PROJECTS,
  groups: meta?.groups ?? load('kinfolk-meta-v1', {}).groups ?? DEFAULT_GROUPS,
  sourceNotes: meta?.sourceNotes ?? {},
  goal: meta?.goal ?? 10,
  now: Date.now(),
  ui: {
    route: 'today', followView: 'pipeline', search: '', account: '', industry: '', stage: '',
    pool: { source: '', sort: 'new', search: '', showUnq: true },
    sort: { key: 'followUpAt', dir: 1 }, selectedId: null, multi: [], cursor: null, bulkConfirm: false, modal: null, toast: null,
    today: { source: '', project: '' }, sourceSel: 'Events', confirmRemove: false,
  },
  sync: { config: load(K.sync, null), status: 'local', message: '', lastSync: null, queued: 0, v3: false, v6: false, v7: false },
};

let emit = () => {};
export const setEmitter = (fn) => { emit = fn; };

export function persist() {
  save(K.people, state.people);
  save(K.touches, state.touches);
  save(K.targets, state.targets);
  save(K.meta, { projects: state.projects, groups: state.groups, sourceNotes: state.sourceNotes, goal: state.goal });
}

// ───────────── sheet mapping ─────────────
export function toSheet(p) {
  const status = sheetStatus(p.stage);
  return {
    id: p.id, name: p.name, status, follow_up_at: isOff(p) ? '' : p.followUpAt || '', lost_reason: p.lostReason || '',
    next_step: p.nextStep, project: p.project, organization: p.organization, role: p.role, industry: p.industry,
    reports_to_id: p.reportsToId ?? '', strength: p.strength, email: p.email, phone: p.phone, source: p.source,
    found_at: p.foundAt || '', created_at: p.createdAt,
    funnel_stage: p.stage, stage_history: JSON.stringify(p.stageHistory || []),
  };
}

/**
 * A People row → a person. A v5 sheet stores the stage in `funnel_stage`. An older sheet still has the old
 * markers, so the stage is worked out from them (`touched`: the ids that have touches).
 */
export function fromSheet(r, { version = 5, touched = new Set() } = {}) {
  const id = Number(r.id);
  const status = String(r.status || 'Prospect').trim();
  const created = r.created_at ? String(r.created_at) : new Date().toISOString();
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const src = SOURCE_IDS.find((s) => s.toLowerCase() === String(r.source || '').trim().toLowerCase()) || '';
  const stored = String(r.funnel_stage ?? '').trim().toLowerCase();
  const nextStep = String(r.next_step ?? '');
  let stage;
  let history = parseHistory(r.stage_history);
  if (version >= 5 || stored === 'prospect' || stored === 'unqualified') {
    stage = STAGE_IDS.includes(renamed(stored)) ? renamed(stored)
      : { Prospect: 'prospect', Unqualified: 'unqualified', Cold: 'unqualified', WIP: 'discovery' }[status] || 'marketing';
    history = history.map((h) => ({ ...h, stage: renamed(h.stage) }));
  } else {
    stage = legacyStage({
      status, funnel: stored, nextStep, touched: touched.has(id),
      activeLead: /^(y|yes|true|1)$/i.test(String(r.active_lead ?? '').trim()),
    });
    history = oldHistory(r.stage_history);
  }
  return blankPerson({
    id, name: String(r.name ?? ''), organization: String(r.organization || ''), role: String(r.role ?? ''),
    industry: String(r.industry || ''), project: String(r.project ?? ''), email: String(r.email ?? ''),
    phone: String(r.phone ?? ''), source: src, nextStep, stage, lostReason: String(r.lost_reason ?? ''),
    // Engaged people always have a follow-up; a Prospect, closed or Unqualified person may have none ("Not scheduled").
    followUpAt: r.follow_up_at ? String(r.follow_up_at)
      : ENGAGED_IDS.includes(stage) ? new Date(new Date(created).getTime() + DAY).toISOString() : '',
    reportsToId: num(r.reports_to_id), strength: Math.min(3, Math.max(1, Number(r.strength) || 1)),
    createdAt: created, foundAt: r.found_at ? String(r.found_at) : '',
    headline: String(r.headline ?? ''), notes: String(r.notes ?? ''), stageHistory: history,
  });
}

export const targetToSheet = (t) => ({
  target_id: t.id, company: t.company, industry: t.industry, hint: t.hint, source: t.source, list: t.list,
  project: t.project, status: t.status, person_id: t.personId ?? '', skipped_at: t.skippedAt || '', created_at: t.createdAt,
});
export const targetFromSheet = (r) => ({
  id: String(r.target_id), company: String(r.company ?? ''), industry: String(r.industry ?? ''), hint: String(r.hint ?? ''),
  source: SOURCE_IDS.find((s) => s.toLowerCase() === String(r.source || '').toLowerCase()) || 'Association',
  list: String(r.list ?? ''), project: String(r.project ?? ''), status: String(r.status || 'to_research'),
  personId: r.person_id === '' ? null : Number(r.person_id), skippedAt: r.skipped_at ? String(r.skipped_at) : '',
  createdAt: r.created_at ? String(r.created_at) : new Date().toISOString(),
});

// ───────────── derived ─────────────
export const byId = (id) => state.people.find((p) => p.id === id);

export const matchesFilters = (p) => (!state.ui.stage || p.stage === state.ui.stage) && matchesOtherFilters(p);

/** Every filter except the stage one (the stage strip counts with this). */
export function matchesOtherFilters(p) {
  const { search, account, industry } = state.ui;
  if (account && p.organization !== account) return false;
  if (industry && p.industry !== industry) return false;
  if (search) {
    const q = search.toLowerCase();
    const hay = `${p.name} ${p.organization} ${p.nextStep} ${p.role} ${p.project} ${p.industry}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** The Follow up board: one column per engaged stage, soonest follow-up first (late ones lead). */
export function columns() {
  const cols = Object.fromEntries(ENGAGED_IDS.map((id) => [id, []]));
  state.people.forEach((p) => { if (cols[p.stage] && matchesOtherFilters(p)) cols[p.stage].push(p); });
  const t = (p) => new Date(p.followUpAt).getTime();
  Object.values(cols).forEach((c) => c.sort((a, b) => t(a) - t(b)));
  return cols;
}

export const lateCount = () => state.people.filter((p) => isLate(p)).length;

/** Closed deals, kept as a record: counts overall and in the last 30 days (by when they reached the stage). */
export function closedStats(now = state.now) {
  const closedAt = (p) => new Date([...(p.stageHistory || [])].reverse().find((h) => h.stage === p.stage)?.at || 0).getTime();
  const count = (stage, since = 0) => state.people.filter((p) => p.stage === stage && closedAt(p) >= since).length;
  const month = now - 30 * DAY;
  return { won: count('won'), lost: count('lost'), wonMonth: count('won', month), lostMonth: count('lost', month) };
}

export function touchStats() {
  const now = state.now;
  const week = state.touches.filter((t) => now - new Date(t.date).getTime() < 7 * DAY).length;
  const wins = state.touches.filter((t) => now - new Date(t.date).getTime() < 30 * DAY && isWin(t.next_step)).length;
  return { week, wins };
}

export const touchesFor = (id) =>
  state.touches.filter((t) => t.person_id === id).sort((a, b) => new Date(b.date) - new Date(a.date));

export const isNew = (p) => p.foundAt && !state.touches.some((t) => t.person_id === p.id);

export function findsBetween(from, to = Infinity) {
  return state.people.filter((p) => {
    if (!p.foundAt) return false;
    const t = new Date(p.foundAt).getTime();
    return t >= from && t < to;
  });
}

export function queue() {
  const { source, project } = state.ui.today;
  return state.targets
    .filter((t) => t.status === 'to_research' && (!source || t.source === source) && (!project || t.project === project))
    .sort((a, b) => (a.skippedAt || '').localeCompare(b.skippedAt || '') || a.createdAt.localeCompare(b.createdAt));
}

export function sourceStats(id) {
  const wk = startOfWeek(state.now);
  return {
    foundWeek: findsBetween(wk).filter((p) => p.source === id).length,
    left: state.targets.filter((t) => t.source === id && t.status === 'to_research').length,
    engaged: state.people.filter((p) => p.source === id && isEngaged(p)).length,
    found: state.people.filter((p) => p.source === id && p.foundAt).length,
  };
}

export const accounts = () => [...new Set(state.people.map((p) => p.organization).filter(Boolean))].sort();
export function industries() {
  const all = new Set(state.people.map((p) => p.industry).filter(Boolean));
  const focus = state.groups.filter((g) => g.focus).map((g) => g.name);
  focus.forEach((f) => all.add(f));
  return { focus, other: [...all].filter((i) => !focus.includes(i)).sort() };
}

// ───────────── actions ─────────────
const nextId = () => state.people.reduce((m, p) => Math.max(m, p.id), 0) + 1;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function pushPerson(p, fields) {
  const s = toSheet(p);
  const out = { id: p.id };
  (fields || Object.keys(s)).forEach((f) => { out[f] = s[f]; });
  emit([{ op: 'upsertPerson', person: out }]);
}

/** Log a stage change in the history. */
function withHistory(p, patch) {
  if (!patch.stage || patch.stage === p.stage) return patch;
  return { ...patch, stageHistory: [...(p.stageHistory || []), { stage: patch.stage, at: new Date().toISOString() }] };
}

export function patchPerson(id, patch) {
  const p = byId(id);
  if (!p) return null;
  const before = toSheet(p);
  Object.assign(p, withHistory(p, patch));
  const after = toSheet(p);
  const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
  // Status and stage always travel together.
  if (changed.length) pushPerson(p, [...new Set([...changed, 'status', 'funnel_stage'])]);
  return p;
}

export function logTouch(p, nextStep, project) {
  const t = {
    touch_id: Date.now() + Math.floor(Math.random() * 1000), date: new Date().toISOString(),
    person_id: p.id, person: p.name, next_step: nextStep, project: project || '',
  };
  state.touches.push(t);
  emit([{ op: 'logTouch', touch: t }]);
  return t;
}

const tomorrow = () => new Date(Date.now() + DAY).toISOString();
/** The follow-up on joining a board stage: kept if it's sooner than the stage's gap, otherwise pulled in to it. */
function capped(p, stage, now = Date.now()) {
  const limit = now + cadence(stage) * HOUR;
  return dueBy(p, now) || new Date(p.followUpAt).getTime() > limit ? new Date(limit).toISOString() : p.followUpAt;
}

/** Save the person modal. Returns a toast message. */
export function savePerson(draft, original, { touch }) {
  const now = Date.now();
  const d = { ...draft, name: draft.name.trim(), nextStep: draft.nextStep.trim(), lostReason: (draft.lostReason || '').trim() };
  // Reaching out to someone Unqualified or Lost means you're working them again.
  if (touch && (d.stage === 'unqualified' || d.stage === 'lost')) d.stage = FIRST_ENGAGED;
  // With the follow-up date left as it was, the stage's rhythm sets it: a touch on the board → the full gap from now;
  // a new board stage → no later than its gap. Off the board, a touch with an overdue date leaves them due tomorrow.
  const unchanged = !original || d.followUpAt === original.followUpAt;
  const moved = original && original.stage !== d.stage;
  if (unchanged && isEngaged(d)) {
    if (touch) d.followUpAt = inCadence(d.stage, now);
    else if (moved) d.followUpAt = capped(d, d.stage, now);
  } else if (touch && unchanged && !isOff(d) && dueBy(d, now)) d.followUpAt = tomorrow();
  let p;
  if (original) {
    p = patchPerson(original.id, d);
  } else {
    const at = new Date().toISOString();
    p = blankPerson({ ...d, id: nextId(), createdAt: at, stageHistory: [{ stage: d.stage, at }] });
    state.people.push(p);
    emit([{ op: 'upsertPerson', person: { ...toSheet(p), notes: p.notes, industry_check: 'confirmed' } }]);
  }
  if (touch) logTouch(p, d.nextStep, d.project);
  if (touch && isWin(d.nextStep)) return `Win logged for ${p.name}`;
  if (touch) return `Touch logged for ${p.name}${d.project ? ' · ' + d.project : ''}${p.stage === 'prospect' ? ' · stays in Leads' : ''}`;
  if (moved && isOff(p)) return `${p.name} is ${stageLabel(p.stage)}${p.stage === 'won' ? ' ★' : ''} · off Follow up${p.stage === 'unqualified' ? '' : ', kept as a record'}`;
  if (moved) return `${p.name} saved · now ${stageLabel(p.stage)}`;
  return original ? `${p.name} saved` : `${p.name} added`;
}

export function removePerson(id) {
  state.people = state.people.filter((p) => p.id !== id);
  state.people.forEach((p) => { if (p.reportsToId === id) p.reportsToId = null; });
  emit([{ op: 'deletePerson', id }]);
}

/**
 * Set someone's stage (drag on the board, the person modal, keys, Leads buttons). Moving to a board stage
 * brings the follow-up within that stage's rhythm (1W, 1W, 48H, 24H). Returns a toast message.
 */
export function setStage(id, stage) {
  const p = byId(id);
  if (!p || p.stage === stage || !STAGE_IDS.includes(stage)) return '';
  const patch = { stage };
  const joins = !isEngaged(p) && ENGAGED_IDS.includes(stage);
  if (ENGAGED_IDS.includes(stage)) {
    const at = capped(p, stage);
    if (at !== p.followUpAt) patch.followUpAt = at;
  }
  patchPerson(id, patch);
  if (stage === 'unqualified') return `${p.name} is Unqualified · off Follow up and Leads`;
  if (stage === 'won') return `${p.name} is Won ★ · off Follow up, kept as a record`;
  if (stage === 'lost') return `${p.name} is Lost · off Follow up, kept as a record`;
  if (stage === 'prospect') return `${p.name} is back in Leads`;
  return `${p.name} is now ${stageLabel(stage)}${joins ? ' · on Follow up' : ''}${patch.followUpAt ? ` · due ${dueText(patch.followUpAt)}` : ''}`;
}
const dueText = (iso) => {
  const h = Math.round((new Date(iso).getTime() - Date.now()) / HOUR);
  return h <= 24 ? 'tomorrow' : h < 7 * 24 ? `in ${Math.round(h / 24)} days` : 'in a week';
};

/** `]` / `[`: one stage up or down the funnel (Prospect … Negotiation). Won, Lost and Unqualified don't step. */
export function stepStage(id, dir) {
  const p = byId(id);
  if (!p) return '';
  if (p.stage === 'unqualified') return `${p.name} is Unqualified · press U to bring them back`;
  if (isOff(p)) return `${p.name} is ${stageLabel(p.stage)} · open the record to change the stage`;
  const order = ['prospect', ...ENGAGED_IDS];
  const next = order[Math.min(order.length - 1, Math.max(0, order.indexOf(p.stage) + dir))];
  return next === p.stage ? '' : setStage(id, next);
}

/** `U`: to Unqualified, or back to Marketing. */
export const toggleUnqualified = (id) => { const p = byId(id); return p ? setStage(id, p.stage === 'unqualified' ? FIRST_ENGAGED : 'unqualified') : ''; };

/** Move someone to another hunting ground (drag a name onto a source on Leads, or the row's Source menu). */
export function setSource(id, source) {
  const p = byId(id);
  if (!p || p.source === source || (source && !SOURCE_IDS.includes(source))) return '';
  patchPerson(id, { source });
  return source ? `${p.name} moved to ${source}` : `${p.name} has no source now`;
}

/** Unqualified people, for the Leads page (filtered like To warm up), most recently marked first. */
export function unqualifiedLeads() {
  const { source } = state.ui.pool;
  const at = (p) => [...(p.stageHistory || [])].reverse().find((h) => h.stage === 'unqualified')?.at || addedAt(p) || '';
  return state.people
    .filter((p) => p.stage === 'unqualified' && (!source || p.source === source) && matchesLead(p))
    .map((p) => ({ p, at: at(p) }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.p.name.localeCompare(b.p.name));
}

export function snooze(id, hours, label) {
  const p = patchPerson(id, { followUpAt: new Date(Date.now() + hours * HOUR).toISOString() });
  return p ? `${p.name} · follow up ${label}` : '';
}

/** The Leads page: everyone not engaged yet (new, or gone cold). */
/** The Leads search box: matches a person or a company by any of their text. */
const leadQuery = () => state.ui.pool.search.trim().toLowerCase();
const hasQuery = (q, ...fields) => fields.join(' ').toLowerCase().includes(q);
export const matchesLead = (p, q = leadQuery()) => !q || hasQuery(q, p.name, p.organization, p.role, p.project, p.industry, p.source, p.nextStep, p.email, p.phone);
export const matchesTarget = (t, q = leadQuery()) => !q || hasQuery(q, t.company, t.industry, t.hint, t.list, t.project, byId(t.personId)?.name || '');

export function prospects() {
  const { source, sort } = state.ui.pool;
  const t = (p) => new Date(addedAt(p)).getTime();
  return state.people
    .filter((p) => p.stage === 'prospect' && (!source || p.source === source) && matchesLead(p))
    .sort((a, b) => (sort === 'old' ? t(a) - t(b) : t(b) - t(a)) || a.name.localeCompare(b.name));
}

export function prospectStats() {
  const pool = state.people.filter((p) => p.stage === 'prospect');
  const now = state.now;
  const end = startOfDay(now) + DAY;
  const due = (p) => new Date(p.followUpAt).getTime();
  return {
    total: pool.length,
    late: pool.filter((p) => due(p) <= now).length,
    today: pool.filter((p) => due(p) > now && due(p) < end).length,
    bySource: (id) => pool.filter((p) => (id ? p.source === id : true)).length,
  };
}

// ───────────── prospecting ─────────────
function pushTarget(t) {
  if (state.sync.v3) emit([{ op: 'upsertTarget', target: targetToSheet(t) }]);
}

/** A find: someone with a way to reach them. A Prospect in Leads, first message due tomorrow. */
export function saveFind(f, targetId) {
  const now = new Date();
  const p = blankPerson({
    id: nextId(), name: f.name.trim(), role: f.role.trim(), email: f.email.trim(), phone: f.phone.trim(),
    organization: f.organization.trim(), industry: f.industry.trim(), project: f.project || '', source: f.source,
    notes: f.why.trim(), nextStep: 'First message', followUpAt: new Date(now.getTime() + DAY).toISOString(),
    createdAt: now.toISOString(), foundAt: now.toISOString(),
    stage: 'prospect', stageHistory: [{ stage: 'prospect', at: now.toISOString() }],
  });
  state.people.push(p);
  emit([{ op: 'upsertPerson', person: { ...toSheet(p), notes: p.notes, industry_check: 'confirmed' } }]);
  const t = state.targets.find((x) => x.id === targetId);
  if (t) { t.status = 'found'; t.personId = p.id; pushTarget(t); }
  return p;
}

export function skipTarget(id) {
  const t = state.targets.find((x) => x.id === id);
  if (t) { t.skippedAt = new Date().toISOString(); pushTarget(t); }
}

export function setTargetStatus(id, status) {
  const t = state.targets.find((x) => x.id === id);
  if (t) { t.status = status; pushTarget(t); }
}

export function deleteTarget(id) {
  state.targets = state.targets.filter((t) => t.id !== id);
  if (state.sync.v3) emit([{ op: 'deleteTarget', id }]);
}

/** One company per line; optional ", industry" after the name. Skips companies already on that source. */
export function addTargets(source, list, project, text) {
  const seen = new Set(state.targets.filter((t) => t.source === source).map((t) => t.company.toLowerCase()));
  let added = 0;
  text.split(/\r?\n/).forEach((line, i) => {
    const [company, industry = '', ...rest] = line.split(/\t|,/).map((s) => s.trim());
    if (!company || seen.has(company.toLowerCase())) return;
    seen.add(company.toLowerCase());
    const t = {
      id: 't' + uid() + i, company, industry, hint: rest.join(', '), source, list: list.trim() || 'Untitled list',
      project: project || '', status: 'to_research', personId: null, skippedAt: '',
      createdAt: new Date(Date.now() + i).toISOString(),
    };
    state.targets.push(t);
    pushTarget(t);
    added += 1;
  });
  return added;
}

export function setSourceNote(id, where) {
  state.sourceNotes[id] = where;
  if (state.sync.v3) emit([{ op: 'upsertSource', source: { source: id, where } }]);
}

export const sourceWhere = (id) => state.sourceNotes[id] ?? SOURCES.find((s) => s.id === id)?.where ?? '';

export { startOfDay, startOfWeek };

// ───────────── bulk edits (spreadsheet multi-select) ─────────────
const names = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Set one stage on many people at once. Returns a toast message. */
export function bulkStage(ids, stage) {
  ids.forEach((id) => setStage(id, stage));
  return `${names(ids.length)} → ${stageLabel(stage)}`;
}

/** `]` / `[` on a multi-selection. */
export function bulkStep(ids, dir) {
  ids.forEach((id) => stepStage(id, dir));
  return `${names(ids.length)} moved ${dir > 0 ? 'up' : 'down'} a stage`;
}

export function bulkSnooze(ids, hours, label) {
  const at = new Date(Date.now() + hours * HOUR).toISOString();
  ids.forEach((id) => patchPerson(id, { followUpAt: at }));
  return `${names(ids.length)} · follow up ${label}`;
}

export function bulkSet(ids, field, value) {
  ids.forEach((id) => patchPerson(id, { [field]: value }));
  return `${names(ids.length)} · ${field} set to ${value || 'none'}`;
}

export function bulkRemove(ids) {
  ids.forEach((id) => removePerson(id));
  return `${names(ids.length)} removed`;
}
