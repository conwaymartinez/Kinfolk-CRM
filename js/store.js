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

export function statusOf(p, now) {
  if (p.cold) return 'cold';
  if (!p.contacted) return 'prospect';
  if (new Date(p.followUpAt).getTime() <= now) return 'late';
  return p.stage === 'wip' ? 'wip' : 'touch';
}
export const STATUS_LABEL = { prospect: 'Prospect', touch: 'Touch', wip: 'WIP', late: 'Late', cold: 'Cold' };

export function blankPerson(over = {}) {
  return {
    id: 0, name: '', organization: '', role: '', industry: '', project: '', email: '', phone: '', source: '',
    nextStep: '', followUpAt: new Date(Date.now() + DAY).toISOString(), stage: 'touch', contacted: true, cold: false,
    activeLead: false, reportsToId: null, strength: 1, createdAt: new Date().toISOString(), foundAt: '',
    headline: '', notes: '', ...over,
  };
}

/** Old local data (v2) → v3 shape. Funnel stages are dropped. */
function migrateV2() {
  const old = load('kinfolk-pipe-v2', null);
  if (!old) return null;
  return old.map((p) => blankPerson({
    id: p.id, name: p.name || '', organization: p.organization || '', role: p.role || '', industry: p.industry || '',
    project: p.project || '', email: p.email || '', phone: p.phone || '', nextStep: p.nextStep ?? p.lastTouch ?? '',
    followUpAt: p.followUpAt || new Date(Date.now() + DAY).toISOString(), stage: p.stage === 'wip' ? 'wip' : 'touch',
    contacted: p.contacted ?? true, cold: !!p.cold, reportsToId: p.reportsToId ?? null,
    strength: p.relationshipStrength || 1, createdAt: p.createdAt || new Date().toISOString(),
  }));
}

function demoPeople() {
  const h = (n) => new Date(Date.now() + n * HOUR).toISOString();
  const now = new Date().toISOString();
  return [
    blankPerson({ id: 1, name: 'Maya Chen', organization: 'Northstar Labs', industry: 'Technology', role: 'VP, Product', project: 'GCR', source: 'Social', nextStep: 'Send the product overview', followUpAt: h(3), activeLead: true, strength: 3 }),
    blankPerson({ id: 2, name: 'Sofia Alvarez', organization: 'Northstar Labs', industry: 'Technology', role: 'Director, Partnerships', project: 'AC', source: 'Search', nextStep: 'Book a discovery call', followUpAt: h(22), reportsToId: 1, strength: 2 }),
    blankPerson({ id: 3, name: 'Jon Bell', organization: 'Cedar & Co.', industry: 'Professional Services', role: 'Managing Partner', project: 'GCR', source: 'Events', nextStep: 'SV: Site visit Thursday', followUpAt: h(6), stage: 'wip', activeLead: true, strength: 2 }),
    blankPerson({ id: 4, name: 'Amara Okafor', organization: 'Cedar & Co.', industry: 'Professional Services', role: 'Operations Director', project: 'PNST', source: 'Manning', nextStep: 'Try calling again', followUpAt: h(-5), stage: 'wip', activeLead: true, reportsToId: 3 }),
    blankPerson({ id: 5, name: 'Nina Patel', organization: 'Cedar & Co.', industry: 'Professional Services', role: 'Engagement Lead', project: 'EN', source: 'Association', nextStep: 'Research current priorities', followUpAt: h(24), foundAt: now }),
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
export const state = {
  people: hasV3 ?? migrateV2() ?? demoPeople(),
  touches: load(K.touches, null) ?? load('kinfolk-touches-v1', []),
  targets: load(K.targets, null) ?? (hasV3 || load('kinfolk-pipe-v2', null) ? [] : demoTargets()),
  projects: meta?.projects ?? load('kinfolk-meta-v1', {}).projects ?? DEFAULT_PROJECTS,
  groups: meta?.groups ?? load('kinfolk-meta-v1', {}).groups ?? DEFAULT_GROUPS,
  sourceNotes: meta?.sourceNotes ?? {},
  goal: meta?.goal ?? 10,
  now: Date.now(),
  ui: {
    route: 'today', followView: 'pipeline', search: '', onlyActive: false, account: '', industry: '',
    sort: { key: 'followUpAt', dir: 1 }, selectedId: null, modal: null, toast: null,
    today: { source: '', project: '' }, sourceSel: 'Events', confirmRemove: false,
  },
  sync: { config: load(K.sync, null), status: 'local', message: '', lastSync: null, queued: 0, v3: false },
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
  const status = p.cold ? 'Cold' : p.contacted ? (p.stage === 'wip' ? 'WIP' : 'Touch') : 'Prospect';
  return {
    id: p.id, name: p.name, status, follow_up_at: status === 'Touch' || status === 'WIP' ? p.followUpAt : '',
    next_step: p.nextStep, project: p.project, organization: p.organization, role: p.role, industry: p.industry,
    reports_to_id: p.reportsToId ?? '', strength: p.strength, email: p.email, phone: p.phone, source: p.source,
    active_lead: p.activeLead ? 'Y' : '', found_at: p.foundAt || '', created_at: p.createdAt,
  };
}

export function fromSheet(r, touched) {
  const id = Number(r.id);
  const status = String(r.status || 'Prospect');
  const created = r.created_at ? String(r.created_at) : new Date().toISOString();
  const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const src = SOURCE_IDS.find((s) => s.toLowerCase() === String(r.source || '').trim().toLowerCase()) || '';
  return blankPerson({
    id, name: String(r.name ?? ''), organization: String(r.organization || ''), role: String(r.role ?? ''),
    industry: String(r.industry || ''), project: String(r.project ?? ''), email: String(r.email ?? ''),
    phone: String(r.phone ?? ''), source: src, nextStep: String(r.next_step ?? ''),
    followUpAt: r.follow_up_at ? String(r.follow_up_at) : new Date(new Date(created).getTime() + DAY).toISOString(),
    stage: status === 'WIP' ? 'wip' : 'touch',
    contacted: status === 'Touch' || status === 'WIP' || (status === 'Cold' && touched.has(id)),
    cold: status === 'Cold', activeLead: /^(y|yes|true|1)$/i.test(String(r.active_lead ?? '').trim()),
    reportsToId: num(r.reports_to_id), strength: Math.min(3, Math.max(1, Number(r.strength) || 1)),
    createdAt: created, foundAt: r.found_at ? String(r.found_at) : '',
    headline: String(r.headline ?? ''), notes: String(r.notes ?? ''),
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

export function matchesFilters(p) {
  const { search, onlyActive, account, industry } = state.ui;
  if (onlyActive && !p.activeLead) return false;
  if (account && p.organization !== account) return false;
  if (industry && p.industry !== industry) return false;
  if (search) {
    const q = search.toLowerCase();
    const hay = `${p.name} ${p.organization} ${p.nextStep} ${p.role} ${p.project} ${p.industry}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function columns() {
  const now = state.now;
  const cols = { touch: [], wip: [], late: [] };
  state.people.forEach((p) => {
    const s = statusOf(p, now);
    if (cols[s] && matchesFilters(p)) cols[s].push(p);
  });
  const t = (p) => new Date(p.followUpAt).getTime();
  Object.values(cols).forEach((c) => c.sort((a, b) => t(a) - t(b)));
  return cols;
}

export const lateCount = () => state.people.filter((p) => statusOf(p, state.now) === 'late').length;

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
    active: state.people.filter((p) => p.source === id && p.activeLead).length,
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

export function patchPerson(id, patch) {
  const p = byId(id);
  if (!p) return null;
  const before = toSheet(p);
  Object.assign(p, patch);
  const after = toSheet(p);
  const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
  if (changed.length) pushPerson(p, changed);
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

/** Save the person modal. Returns a toast message. */
export function savePerson(draft, original, { touch }) {
  const now = Date.now();
  const d = { ...draft, name: draft.name.trim(), nextStep: draft.nextStep.trim() };
  if (touch) {
    d.contacted = true;
    const unchanged = !original || d.followUpAt === original.followUpAt;
    if (unchanged && new Date(d.followUpAt).getTime() <= now) d.followUpAt = new Date(now + DAY).toISOString();
  }
  let p;
  if (original) {
    p = patchPerson(original.id, d);
  } else {
    p = blankPerson({ ...d, id: nextId(), createdAt: new Date().toISOString() });
    state.people.push(p);
    const s = toSheet(p);
    emit([{ op: 'upsertPerson', person: { ...s, notes: p.notes, industry_check: 'confirmed' } }]);
  }
  if (touch) logTouch(p, d.nextStep, d.project);
  if (touch && isWin(d.nextStep)) return `Win logged for ${p.name}`;
  if (touch) return `Touch logged for ${p.name}${d.project ? ' · ' + d.project : ''}${p.cold ? ' · moved to cold storage' : ''}`;
  return original ? `${p.name} saved` : `${p.name} added`;
}

export function removePerson(id) {
  state.people = state.people.filter((p) => p.id !== id);
  state.people.forEach((p) => { if (p.reportsToId === id) p.reportsToId = null; });
  emit([{ op: 'deletePerson', id }]);
}

/** Drag/keyboard move between Touch, WIP and Late. */
export function movePerson(id, to) {
  const p = byId(id);
  if (!p) return '';
  const now = Date.now();
  const from = statusOf(p, now);
  if (from === to) return '';
  if (to === 'late') {
    patchPerson(id, { followUpAt: new Date(now - 6e4).toISOString() });
    return `${p.name} marked late`;
  }
  const patch = { stage: to };
  if (from === 'late') patch.followUpAt = new Date(now + DAY).toISOString();
  patchPerson(id, patch);
  if (to === 'wip') {
    logTouch(p, p.nextStep, p.project);
    return `${p.name} moved to WIP · touch logged`;
  }
  return `${p.name} moved to Touch${from === 'late' ? ' · due tomorrow' : ''}`;
}

export function toggleCold(id) {
  const p = byId(id);
  if (!p) return '';
  if (!p.cold) { patchPerson(id, { cold: true }); return `${p.name} moved to cold storage`; }
  const patch = { cold: false };
  if (new Date(p.followUpAt).getTime() <= Date.now()) patch.followUpAt = new Date(Date.now() + DAY).toISOString();
  patchPerson(id, patch);
  return `${p.name} restored${p.contacted ? ' · due tomorrow' : ''}`;
}

export function snooze(id, hours, label) {
  const p = patchPerson(id, { followUpAt: new Date(Date.now() + hours * HOUR).toISOString() });
  return p ? `${p.name} · follow up ${label}` : '';
}

export function backToTouch(id) {
  const p = patchPerson(id, { stage: 'touch', cold: false, followUpAt: new Date(Date.now() + DAY).toISOString() });
  return p ? `${p.name} moved to Touch · due tomorrow` : '';
}

export function toggleActive(id) {
  const p = byId(id);
  if (!p) return '';
  patchPerson(id, { activeLead: !p.activeLead });
  return p.activeLead ? `${p.name} tagged Active lead` : `${p.name} no longer an Active lead`;
}

// ───────────── prospecting ─────────────
function pushTarget(t) {
  if (state.sync.v3) emit([{ op: 'upsertTarget', target: targetToSheet(t) }]);
}

/** A find: someone with a way to reach them. Goes to Follow up › Touch, first message due tomorrow. */
export function saveFind(f, targetId) {
  const now = new Date();
  const p = blankPerson({
    id: nextId(), name: f.name.trim(), role: f.role.trim(), email: f.email.trim(), phone: f.phone.trim(),
    organization: f.organization.trim(), industry: f.industry.trim(), project: f.project || '', source: f.source,
    notes: f.why.trim(), nextStep: 'First message', followUpAt: new Date(now.getTime() + DAY).toISOString(),
    stage: 'touch', contacted: true, createdAt: now.toISOString(), foundAt: now.toISOString(),
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
