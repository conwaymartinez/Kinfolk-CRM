/**
 * Kinfolk ⇄ Google Sheets bridge — v7 (sales stages: Marketing, Discovery, Proposal, Negotiation; Won and Lost).
 *
 * Paste this whole file into Extensions ▸ Apps Script of the Kinfolk Database sheet,
 * run `setup` once, then Deploy ▸ New deployment ▸ Web app
 *   Execute as: Me    Who has access: Anyone
 * Already deployed an older version? Deploy ▸ Manage deployments ▸ edit ▸ Version: New version.
 *
 * What changed in v3:
 *  - People gain `active_lead`, `found_at`, `phone`; `source`, `email`, `phone` are now writable.
 *  - New tabs, created automatically: `Targets` (company lists to research) and `Sources` (where to look).
 *  - Writes keep formula cells intact wherever they sit, and missing columns are added at the end.
 *
 * What changed in v4:
 *  - The funnel columns (`funnel_stage`, `stage_history`) are read and written again.
 *    Cold = not engaged yet (status Cold); Attention / Interest / Desire / Action are on Follow up.
 *  - `follow_up_at` is kept for Cold people too: the Cold pool runs on the same follow-up timer.
 *
 * What changed in v5:
 *  - One marker per person: `funnel_stage` = prospect | attention | interest | desire | action | cold.
 *    Prospect = not engaged yet (Sources). Attention…Action = Follow up. Cold = dead end for now (nowhere).
 *  - `status` is a read-only mirror for the Dashboard: Prospect / Touch / Cold. `active_lead` is retired.
 *  - The first time v5 runs it migrates every row once (Kinfolk menu ▸ Migrate to stages shows the result),
 *    after copying People to a "People before v5" backup tab.
 *
 * What changed in v6:
 *  - The "don't revive" stage is Unqualified (it was Cold). Being in Leads (stage prospect) is what cold means now.
 *  - A v5 sheet is updated once: funnel_stage and stage_history "cold" → "unqualified". Status stays "Cold" for them,
 *    so the old dropdown and the Dashboard keep working.
 *
 * What changed in v7:
 *  - The board stages are Marketing / Discovery / Proposal / Negotiation (follow up every 1W / 1W / 48H / 24H).
 *    A v6 sheet is updated once: attention → marketing, interest → discovery, desire → proposal, action → negotiation,
 *    in funnel_stage and stage_history.
 *  - New record-only stages Won and Lost (off the board; Status "Cold", like Unqualified). New column `lost_reason`.
 */

const VERSION = 7;
const STAGES_PROP = 'KINFOLK_STAGES_V5';
const UNQUALIFIED_PROP = 'KINFOLK_STAGES_V6';
const SALES_PROP = 'KINFOLK_STAGES_V7';
const TZ = 'Asia/Manila';
const TOKEN_PROP = 'KINFOLK_TOKEN';

const PEOPLE = 'People';
const TOUCHES = 'Touches';
const PROJECTS = 'Projects';
const GROUPS = 'Groups';
const STAGING = 'Staging';
const TARGETS = 'Targets';
const SOURCES = 'Sources';

const PEOPLE_FIELDS = ['id', 'name', 'status', 'follow_up_at', 'next_step', 'project', 'organization', 'role',
  'industry', 'industry_check', 'reports_to_id', 'strength', 'created_at', 'updated_at', 'headline', 'geography',
  'email', 'phone', 'source', 'active_lead', 'found_at', 'how_i_know', 'notes', 'legacy_id', 'funnel_stage', 'stage_history',
  'lost_reason'];
// Fields Kinfolk may change. Everything else (headline, notes, geography…) is sheet-owned.
const WRITABLE = ['name', 'status', 'follow_up_at', 'next_step', 'project', 'organization', 'role', 'industry',
  'industry_check', 'reports_to_id', 'strength', 'created_at', 'email', 'phone', 'source', 'found_at',
  'funnel_stage', 'stage_history', 'lost_reason'];
// Only written when Kinfolk creates the person.
const ON_CREATE = ['id', 'headline', 'notes'];
const TOUCH_FIELDS = ['touch_id', 'date', 'person_id', 'person', 'next_step', 'project'];
const TARGET_FIELDS = ['target_id', 'company', 'industry', 'hint', 'source', 'list', 'project', 'status', 'person_id',
  'skipped_at', 'created_at', 'updated_at'];
const SOURCE_FIELDS = ['source', 'where'];
const SOURCE_NAMES = ['Events', 'Manning', 'Search', 'Social', 'Association'];
const DATE_FIELDS = ['follow_up_at', 'created_at', 'updated_at', 'date', 'found_at', 'skipped_at'];

// ───────────────────────────── menu ─────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kinfolk')
    .addItem('Promote staging', 'promoteStaging')
    .addItem('Rename group…', 'renameGroupPrompt')
    .addItem('Refresh formulas', 'refreshFormulas')
    .addItem('Migrate to stages (v7)', 'migrateStagesMenu')
    .addItem('Merge duplicate people…', 'mergeDuplicatesMenu')
    .addSeparator()
    .addItem('Show sync token', 'showToken')
    .addItem('Setup / reset token', 'setup')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  ensureSheets_();
  const token = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROP, token);
  migrateStages_();
  refreshFormulas();
  try {
    SpreadsheetApp.getUi().alert('Kinfolk sync token', 'Copy this into Kinfolk ▸ Sync settings:\n\n' + token +
      '\n\nNext: Deploy ▸ New deployment ▸ Web app (Execute as: Me, Who has access: Anyone).', SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { Logger.log('Token: ' + token); }
}

function showToken() {
  const t = PropertiesService.getScriptProperties().getProperty(TOKEN_PROP) || '(none yet – run Setup)';
  SpreadsheetApp.getUi().alert('Kinfolk sync token', t, SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Creates Targets / Sources tabs and any missing People columns. Safe to run repeatedly. */
function ensureSheets_() {
  const ss = SpreadsheetApp.getActive();
  ensureColumns_(sheet_(ss, PEOPLE, PEOPLE_FIELDS), PEOPLE_FIELDS);
  ensureColumns_(sheet_(ss, TOUCHES, TOUCH_FIELDS), TOUCH_FIELDS);
  ensureColumns_(sheet_(ss, TARGETS, TARGET_FIELDS), TARGET_FIELDS);
  const src = sheet_(ss, SOURCES, SOURCE_FIELDS);
  ensureColumns_(src, SOURCE_FIELDS);
  const have = readTable_(SOURCES, SOURCE_FIELDS).map(function (r) { return String(r.source); });
  SOURCE_NAMES.forEach(function (n) { if (have.indexOf(n) < 0) src.appendRow([n, '']); });
}

function sheet_(ss, name, fields) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, fields.length).setValues([fields]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureColumns_(sh, fields) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = fields.filter(function (f) { return header.indexOf(f) < 0; });
  if (!missing.length) return;
  const start = header.filter(String).length ? lastCol + 1 : 1;
  sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold');
}

// ───────────────────────────── web app ─────────────────────────────

function doGet(e) {
  return handle_(e.parameter || {}, null);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  return handle_(e.parameter || {}, body);
}

function handle_(params, body) {
  const token = (body && body.token) || params.token;
  const expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
  if (!expected || token !== expected) return json_({ ok: false, error: 'unauthorized' });

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    ensureSheets_();
    migrateStages_();
    const ops = (body && body.ops) || [];
    const results = [];
    if (ops.length) {
      const ctx = {
        people: table_(PEOPLE, 'id'),
        touches: table_(TOUCHES, 'touch_id'),
        targets: table_(TARGETS, 'target_id'),
        sources: table_(SOURCES, 'source'),
      };
      ops.forEach(function (op) {
        try { results.push(apply_(ctx, op)); }
        catch (err) { results.push({ ok: false, op: op.op, error: String(err) }); }
      });
      refreshFormulas();
    }
    const out = { ok: true, version: VERSION, results: results, serverTime: new Date().toISOString() };
    if (!body || body.pull) out.data = readAll_();
    return json_(out);
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── read ─────────────────────────────

function readAll_() {
  return {
    version: VERSION,
    people: readTable_(PEOPLE, PEOPLE_FIELDS).filter(function (p) { return p.id !== '' && p.name !== ''; }),
    touches: readTable_(TOUCHES, TOUCH_FIELDS).filter(function (t) { return t.touch_id !== ''; }),
    projects: readTable_(PROJECTS, ['project']).map(function (r) { return String(r.project).trim(); }).filter(String),
    groups: readTable_(GROUPS, ['industry', 'focus']).filter(function (g) { return g.industry !== ''; })
      .map(function (g) { return { name: String(g.industry).trim(), focus: String(g.focus).toUpperCase() === 'Y' }; }),
    targets: readTable_(TARGETS, TARGET_FIELDS).filter(function (t) { return t.target_id !== '' && t.company !== ''; }),
    sources: readTable_(SOURCES, SOURCE_FIELDS).filter(function (s) { return s.source !== ''; }),
  };
}

function readTable_(name, fields) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const header = values[0].map(String);
  const idx = fields.map(function (f) { return header.indexOf(f); });
  return values.slice(1).map(function (row) {
    const o = {};
    fields.forEach(function (f, i) {
      let v = idx[i] >= 0 ? row[idx[i]] : '';
      if (v instanceof Date) v = v.toISOString();
      o[f] = v;
    });
    return o;
  });
}

// ───────────────────────────── write ─────────────────────────────

/** A sheet plus a header → column map and a key → row map. */
function table_(name, keyField) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  const lastCol = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const col = {};
  header.forEach(function (h, i) { if (h) col[h] = i + 1; });
  const rowOf = {};
  let lastRow = 1;
  if (sh.getLastRow() > 1 && col[keyField]) {
    sh.getRange(2, col[keyField], sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) {
      if (r[0] !== '') { rowOf[String(r[0])] = i + 2; lastRow = i + 2; }
    });
  }
  return { sh: sh, col: col, width: lastCol, rowOf: rowOf, lastRow: lastRow };
}

function coerce_(field, v) {
  if (v === null || v === undefined) return '';
  if (DATE_FIELDS.indexOf(field) >= 0 && v !== '') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : d;
  }
  return v;
}

/** Writes `fields` of `obj` into the row for `key` (appending if new). Formula cells are preserved. */
function writeRow_(t, key, obj, fields) {
  let row = t.rowOf[key];
  const isNew = !row;
  if (isNew) { row = t.lastRow + 1; t.lastRow = row; t.rowOf[key] = row; }
  const range = t.sh.getRange(row, 1, 1, t.width);
  const vals = range.getValues()[0];
  const formulas = range.getFormulas()[0];
  fields.forEach(function (f) { if (t.col[f] && f in obj) vals[t.col[f] - 1] = coerce_(f, obj[f]); });
  if (t.col.updated_at) vals[t.col.updated_at - 1] = new Date();
  range.setValues([vals.map(function (v, i) { return formulas[i] || v; })]);
  return isNew;
}

function deleteRow_(t, key) {
  const row = t.rowOf[key];
  if (!row) return false;
  t.sh.deleteRow(row);
  delete t.rowOf[key];
  Object.keys(t.rowOf).forEach(function (k) { if (t.rowOf[k] > row) t.rowOf[k] -= 1; });
  t.lastRow -= 1;
  return true;
}

function apply_(ctx, op) {
  switch (op.op) {
    case 'upsertPerson': return upsertPerson_(ctx, op.person || {});
    case 'deletePerson': return { ok: true, id: op.id, deleted: deleteRow_(ctx.people, String(op.id)) };
    case 'logTouch': return logTouch_(ctx, op.touch || {});
    case 'upsertTarget': return upsertTarget_(ctx, op.target || {});
    case 'deleteTarget': return { ok: true, id: op.id, deleted: deleteRow_(ctx.targets, String(op.id)) };
    case 'upsertSource': return upsertSource_(ctx, op.source || {});
    case 'renameGroup': return renameGroup(op.from, op.to);
    default: return { ok: false, error: 'unknown op ' + op.op };
  }
}

function upsertPerson_(ctx, p) {
  if (p.id === undefined || p.id === null || p.id === '') return { ok: false, error: 'missing id' };
  const key = String(p.id);
  const isNew = !ctx.people.rowOf[key];
  const fields = WRITABLE.concat(isNew ? ON_CREATE : []);
  writeRow_(ctx.people, key, p, fields);
  return { ok: true, id: p.id, created: isNew };
}

function logTouch_(ctx, t) {
  if (!t.touch_id) return { ok: false, error: 'missing touch_id' };
  const key = String(t.touch_id);
  if (ctx.touches.rowOf[key]) return { ok: true, touch_id: t.touch_id, duplicate: true };
  writeRow_(ctx.touches, key, t, TOUCH_FIELDS);
  return { ok: true, touch_id: t.touch_id };
}

function upsertTarget_(ctx, t) {
  if (!t.target_id) return { ok: false, error: 'missing target_id' };
  const created = writeRow_(ctx.targets, String(t.target_id), t, TARGET_FIELDS);
  return { ok: true, target_id: t.target_id, created: created };
}

function upsertSource_(ctx, s) {
  if (!s.source) return { ok: false, error: 'missing source' };
  writeRow_(ctx.sources, String(s.source), s, SOURCE_FIELDS);
  return { ok: true, source: s.source };
}

// ───────────────────────────── formulas ─────────────────────────────

/** Copies row-2 formulas in every formula column down to the last data row. */
function refreshFormulas() {
  const ss = SpreadsheetApp.getActive();
  [[PEOPLE, 'id'], [TOUCHES, 'touch_id']].forEach(function (pair) {
    const sh = ss.getSheetByName(pair[0]);
    if (!sh || sh.getLastRow() < 3) return;
    const lastCol = sh.getLastColumn();
    const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const idCol = header.indexOf(pair[1]) + 1;
    if (!idCol) return;
    const ids = sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues();
    let lastData = 1;
    ids.forEach(function (r, i) { if (r[0] !== '') lastData = i + 2; });
    const formulas = sh.getRange(2, 1, 1, lastCol).getFormulas()[0];
    formulas.forEach(function (f, i) {
      if (!f) return;
      const src = sh.getRange(2, i + 1);
      if (lastData > 2) src.copyTo(sh.getRange(3, i + 1, lastData - 2, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      const extra = sh.getLastRow() - lastData;
      if (extra > 0) sh.getRange(lastData + 1, i + 1, extra, 1).clearContent();
    });
  });
}

// ───────────────────────────── groups ─────────────────────────────

function renameGroup(from, to) {
  from = String(from || '').trim(); to = String(to || '').trim();
  if (!from || !to || from === to) return { ok: false, error: 'from/to required' };
  const ss = SpreadsheetApp.getActive();
  const groups = ss.getSheetByName(GROUPS);
  const gv = groups.getRange(2, 1, Math.max(groups.getLastRow() - 1, 1), 1).getValues().map(function (r) { return String(r[0]).trim(); });
  const fromRow = gv.indexOf(from), toRow = gv.indexOf(to);
  if (fromRow >= 0 && toRow >= 0) groups.deleteRow(fromRow + 2);
  else if (fromRow >= 0) groups.getRange(fromRow + 2, 1).setValue(to);
  else if (toRow < 0) groups.appendRow([to, 'N']);
  const people = ss.getSheetByName(PEOPLE);
  const header = people.getRange(1, 1, 1, people.getLastColumn()).getValues()[0].map(String);
  const c = header.indexOf('industry') + 1;
  if (people.getLastRow() > 1) {
    const rng = people.getRange(2, c, people.getLastRow() - 1, 1);
    const vals = rng.getValues();
    let n = 0;
    vals.forEach(function (r) { if (String(r[0]).trim() === from) { r[0] = to; n++; } });
    rng.setValues(vals);
    return { ok: true, renamed: n };
  }
  return { ok: true, renamed: 0 };
}

function renameGroupPrompt() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Rename group', 'Current group name:', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const b = ui.prompt('Rename group', 'New name for "' + a.getResponseText() + '":', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const r = renameGroup(a.getResponseText(), b.getResponseText());
  ui.alert(r.ok ? 'Renamed ' + r.renamed + ' people.' : r.error);
}

// ───────────────────────────── staging ─────────────────────────────

/** Rows with Action = Add become new People; Merge fills blanks on the person with the same name. */
function promoteStaging() {
  const ss = SpreadsheetApp.getActive();
  const st = ss.getSheetByName(STAGING);
  if (!st || st.getLastRow() < 2) return;
  ensureSheets_();
  const values = st.getRange(1, 1, st.getLastRow(), st.getLastColumn()).getValues();
  const h = values[0].map(String);
  const at = function (row, f) { const i = h.indexOf(f); return i >= 0 ? row[i] : ''; };
  const t = table_(PEOPLE, 'id');
  const names = t.sh.getLastRow() > 1 ? t.sh.getRange(2, t.col.name, t.sh.getLastRow() - 1, 1).getValues() : [];
  const rowByName = {};
  names.forEach(function (r, i) { if (r[0]) rowByName[String(r[0]).trim().toLowerCase()] = i + 2; });
  let nextId = Object.keys(t.rowOf).reduce(function (m, k) { return Math.max(m, Number(k) || 0); }, 0) + 1;
  const now = new Date();
  let added = 0, merged = 0, skipped = 0;
  const fields = ['name', 'organization', 'role', 'industry', 'status', 'next_step', 'project', 'headline', 'geography',
    'email', 'phone', 'source', 'active_lead', 'how_i_know', 'notes'];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const action = String(at(row, 'action')).trim();
    const name = String(at(row, 'name')).trim();
    if (!name || !action) continue;
    if (action === 'Skip') { skipped++; clearStagingRow_(st, r + 1, h); continue; }
    if (action === 'Add') {
      const p = { id: nextId++, created_at: now, strength: 1, status: 'Prospect', industry_check: 'needs review' };
      fields.forEach(function (f) { const v = at(row, f); if (v !== '') p[f] = v; });
      if (p.industry) p.industry_check = 'auto';
      // Staging's Status column may hold a stage (Marketing…, or an old name like Attention) or an old status (Touch / WIP / Cold).
      const typed = renamed_(String(at(row, 'stage') || p.status).trim().toLowerCase());
      const stage = STAGE_IDS.indexOf(typed) >= 0 ? typed : ({ touch: 'marketing', wip: 'discovery' })[typed] || 'prospect';
      p.funnel_stage = stage;
      p.status = statusFor_(stage);
      p.stage_history = JSON.stringify([{ stage: stage, at: now.toISOString() }]);
      delete p.active_lead;
      if (OFF_IDS.indexOf(stage) < 0) p.follow_up_at = new Date(now.getTime() + 864e5);
      writeRow_(t, String(p.id), p, Object.keys(p));
      rowByName[name.toLowerCase()] = t.rowOf[String(p.id)];
      added++;
    } else if (action === 'Merge') {
      const target = rowByName[name.toLowerCase()];
      if (!target) continue;
      fields.forEach(function (f) {
        const v = at(row, f);
        if (v === '' || !t.col[f]) return;
        const cell = t.sh.getRange(target, t.col[f]);
        if (f === 'notes') cell.setValue([cell.getValue(), v].filter(String).join(' · '));
        else if (cell.getValue() === '') cell.setValue(v);
      });
      merged++;
    } else continue;
    clearStagingRow_(st, r + 1, h);
  }
  refreshFormulas();
  SpreadsheetApp.getUi().alert('Staging promoted', added + ' added · ' + merged + ' merged · ' + skipped + ' skipped.\nOpen Kinfolk (or press Pull) to see them.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function clearStagingRow_(st, row, header) {
  header.forEach(function (f, i) {
    if (f !== 'possible_duplicate') st.getRange(row, i + 1).clearContent();
  });
}

// ───────────────────────────── stages (v5, v6, v7) ─────────────────────────────
// Kept in step with legacyStage in js/store.js.

const STAGE_IDS = ['prospect', 'marketing', 'discovery', 'proposal', 'negotiation', 'won', 'lost', 'unqualified'];
const ENGAGED_IDS = ['marketing', 'discovery', 'proposal', 'negotiation'];
const OFF_IDS = ['won', 'lost', 'unqualified'];
/** v6 board names → v7. */
const SALES_NAMES = { attention: 'marketing', interest: 'discovery', desire: 'proposal', action: 'negotiation' };
/** Any older stage name → today's: v5's "cold" is Unqualified; v6's Attention…Action are Marketing…Negotiation. */
function renamed_(stage) { return stage === 'cold' ? 'unqualified' : SALES_NAMES[stage] || stage; }
const DEAD_END = /^\s*(out of (network|geography|country|help)|rejected|complete rejection|parked|no way in|ignored|master'?s student|cannot until)/i;
const NO_REPLY = /no reply|not replying|email not working|^\s*retap/i;

/** The Dashboard-friendly mirror of a stage. Unqualified, Won and Lost are "Cold" (off the pipeline): the old dropdown has only Prospect / Touch / Cold. */
function statusFor_(stage) {
  return stage === 'prospect' ? 'Prospect' : OFF_IDS.indexOf(stage) >= 0 ? 'Cold' : 'Touch';
}

/** One stage from the old markers (Status, funnel_stage, active_lead, next step, whether they were ever touched). */
function legacyStage_(status, funnel, activeLead, nextStep, touched) {
  const f = SALES_NAMES[funnel] || funnel;
  const engaged = ENGAGED_IDS.indexOf(f) >= 0 ? f : '';
  const out = status === 'Cold' || status === 'Prospect' || status === 'Unqualified';
  let s;
  if (DEAD_END.test(nextStep)) s = 'unqualified';
  else if (out) s = touched && String(nextStep).trim() && !NO_REPLY.test(nextStep) ? (engaged || 'marketing') : 'prospect';
  else s = engaged || (status === 'WIP' ? 'discovery' : 'marketing');
  if (activeLead && s !== 'unqualified' && ['prospect', 'marketing', 'discovery'].indexOf(s) >= 0) s = 'proposal';
  return s;
}

/**
 * Runs once: gives every People row one stage, mirrors it into Status, logs it in stage_history and clears
 * active_lead. People is first copied to a "People before v5" tab. Returns counts, or null if already done.
 */
function migrateStages_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(STAGES_PROP)) {
    const a = renameStages_({ cold: 'unqualified' }, UNQUALIFIED_PROP);
    const b = renameStages_(SALES_NAMES, SALES_PROP);
    return b || a;
  }
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(PEOPLE);
  if (!sh || sh.getLastRow() < 2) { props.setProperty(STAGES_PROP, new Date().toISOString()); return {}; }
  const backupName = 'People before v5';
  if (!ss.getSheetByName(backupName)) sh.copyTo(ss).setName(backupName);

  const touched = {};
  readTable_(TOUCHES, ['person_id']).forEach(function (t) { if (t.person_id !== '') touched[String(t.person_id)] = true; });

  const n = sh.getLastRow() - 1;
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = function (f) { return header.indexOf(f) + 1; };
  const get = function (f) { return col(f) ? sh.getRange(2, col(f), n, 1).getValues().map(function (r) { return r[0]; }) : null; };
  const ids = get('id'), status = get('status'), funnel = get('funnel_stage'), history = get('stage_history');
  const active = get('active_lead'), next = get('next_step');
  const now = new Date().toISOString();
  const counts = {};
  const outStage = [], outStatus = [], outHistory = [], outActive = [];
  for (let i = 0; i < n; i++) {
    if (ids[i] === '') { outStage.push([funnel ? funnel[i] : '']); outStatus.push([status[i]]); outHistory.push([history ? history[i] : '']); outActive.push([active ? active[i] : '']); continue; }
    const stage = legacyStage_(String(status[i]).trim(), String(funnel ? funnel[i] : '').trim().toLowerCase(),
      /^(y|yes|true|1)$/i.test(String(active ? active[i] : '').trim()), String(next ? next[i] : ''), !!touched[String(ids[i])]);
    let h = [];
    try { h = JSON.parse(String((history && history[i]) || '[]')); if (!Array.isArray(h)) h = []; } catch (e) { h = []; }
    // In the old history "cold" meant "not engaged yet", which is Prospect now.
    h = h.map(function (x) { return x && x.stage ? { stage: x.stage === 'cold' ? 'prospect' : renamed_(x.stage), at: x.at } : x; });
    if (!h.length || h[h.length - 1].stage !== stage) h.push({ stage: stage, at: now });
    outStage.push([stage]); outStatus.push([statusFor_(stage)]); outHistory.push([JSON.stringify(h)]); outActive.push(['']);
    counts[stage] = (counts[stage] || 0) + 1;
  }
  sh.getRange(2, col('funnel_stage'), n, 1).setValues(outStage);
  sh.getRange(2, col('status'), n, 1).setValues(outStatus);
  sh.getRange(2, col('stage_history'), n, 1).setValues(outHistory);
  if (col('active_lead')) sh.getRange(2, col('active_lead'), n, 1).setValues(outActive);
  props.setProperty(STAGES_PROP, now);
  props.setProperty(UNQUALIFIED_PROP, now);
  props.setProperty(SALES_PROP, now);
  return counts;
}

/**
 * Runs once per property on a sheet already on stages: renames stages in funnel_stage and stage_history.
 * v6: "cold" → "unqualified". v7: attention / interest / desire / action → marketing / discovery / proposal / negotiation.
 * Returns the stage counts afterwards, or null if this rename already ran.
 */
function renameStages_(map, prop) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(prop)) return null;
  const sh = SpreadsheetApp.getActive().getSheetByName(PEOPLE);
  const n = sh ? sh.getLastRow() - 1 : 0;
  const counts = {};
  if (n > 0) {
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const fc = header.indexOf('funnel_stage') + 1, hc = header.indexOf('stage_history') + 1;
    const to = function (v) { const k = String(v).trim().toLowerCase(); return map[k] || v; };
    if (fc) {
      const f = sh.getRange(2, fc, n, 1).getValues().map(function (r) {
        const v = to(r[0]);
        if (v !== '') counts[v] = (counts[v] || 0) + 1;
        return [v];
      });
      sh.getRange(2, fc, n, 1).setValues(f);
    }
    if (hc) {
      const h = sh.getRange(2, hc, n, 1).getValues().map(function (r) {
        let a;
        try { a = JSON.parse(String(r[0] || '[]')); } catch (e) { return r; }
        if (!Array.isArray(a)) return r;
        return [JSON.stringify(a.map(function (x) { return x && x.stage ? { stage: to(x.stage), at: x.at } : x; }))];
      });
      sh.getRange(2, hc, n, 1).setValues(h);
    }
  }
  props.setProperty(prop, new Date().toISOString());
  return counts;
}

function migrateStagesMenu() {
  ensureSheets_();
  const ui = SpreadsheetApp.getUi();
  const counts = migrateStages_();
  if (!counts) {
    ui.alert('Already on stages', 'This sheet was migrated on ' + PropertiesService.getScriptProperties().getProperty(SALES_PROP) +
      '. The original People tab is in "People before v5".', ui.ButtonSet.OK);
    return;
  }
  ui.alert('Migrated to stages', STAGE_IDS.map(function (s) { return s + ': ' + (counts[s] || 0); }).join('\n') +
    '\n\nThe original People tab is saved as "People before v5".', ui.ButtonSet.OK);
}

// ───────────────────────────── duplicates ─────────────────────────────

/** "Mark LLado", "mark llado" and "Mark Lllado" all become "marklado". */
function nameKey_(v) {
  return String(v || '').toLowerCase().replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}

/**
 * Groups People rows that are the same person: the same name once case, spaces and doubled letters are ignored.
 * A row with no name whose next step is someone's name (a name typed into the wrong cell) joins that group.
 * The kept row is the one touched most recently (then the most advanced stage, then the newest).
 */
function findDuplicates_() {
  const t = table_(PEOPLE, 'id');
  const n = t.sh.getLastRow() - 1;
  if (n < 1) return { t: t, groups: [] };
  const rows = t.sh.getRange(2, 1, n, t.width).getValues();
  const at = function (r, f) { return t.col[f] ? r[t.col[f] - 1] : ''; };
  const lastTouch = {};
  readTable_(TOUCHES, ['person_id', 'date']).forEach(function (x) {
    const k = String(x.person_id), d = new Date(x.date).getTime() || 0;
    if (!lastTouch[k] || d > lastTouch[k]) lastTouch[k] = d;
  });
  const people = rows.map(function (r, i) {
    return { row: i + 2, id: String(at(r, 'id')), name: String(at(r, 'name')).trim(), next: String(at(r, 'next_step')).trim(),
      stage: String(at(r, 'funnel_stage')).trim().toLowerCase(), created: new Date(at(r, 'created_at')).getTime() || 0, values: r };
  }).filter(function (p) { return p.id !== ''; });
  const byKey = {};
  people.forEach(function (p) { if (p.name) (byKey[nameKey_(p.name)] = byKey[nameKey_(p.name)] || []).push(p); });
  people.forEach(function (p) {
    const k = nameKey_(p.next);
    if (!p.name && k.length >= 4 && byKey[k]) byKey[k].push(p);
  });
  const rank = function (p) { const s = renamed_(p.stage); return STAGE_IDS.indexOf(s) >= 0 && s !== 'unqualified' && s !== 'lost' ? STAGE_IDS.indexOf(s) : -1; };
  const groups = Object.keys(byKey).filter(function (k) { return byKey[k].length > 1; }).map(function (k) {
    const g = byKey[k].slice().sort(function (a, b) {
      return (lastTouch[b.id] || 0) - (lastTouch[a.id] || 0) || rank(b) - rank(a) || b.created - a.created;
    });
    return { keep: g[0], drop: g.slice(1) };
  });
  return { t: t, groups: groups };
}

/**
 * Merges each group into its kept row: blank cells on the kept row are filled from the others (never formula
 * cells, never the name), notes are joined, touches move to the kept person, and the other rows are deleted.
 */
function mergeDuplicates_(found) {
  const t = found.t;
  const formulas = t.sh.getRange(2, 1, 1, t.width).getFormulas()[0];
  const tt = table_(TOUCHES, 'touch_id');
  const tn = tt.sh.getLastRow() - 1;
  const tp = tn > 0 && tt.col.person_id ? tt.sh.getRange(2, tt.col.person_id, tn, 1).getValues() : [];
  const tname = tn > 0 && tt.col.person ? tt.sh.getRange(2, tt.col.person, tn, 1).getValues() : [];
  const remove = [];
  found.groups.forEach(function (g) {
    const keep = g.keep.values.slice();
    g.drop.forEach(function (d) {
      Object.keys(t.col).forEach(function (f) {
        const i = t.col[f] - 1;
        if (formulas[i] || f === 'name' || f === 'id' || f === 'stage_history') return;
        if (f === 'notes' && d.values[i] !== '' && String(keep[i]).indexOf(String(d.values[i])) < 0) {
          keep[i] = [keep[i], d.values[i]].filter(String).join(' · ');
        } else if (keep[i] === '' && d.values[i] !== '') keep[i] = d.values[i];
      });
      remove.push(d.row);
    });
    const range = t.sh.getRange(g.keep.row, 1, 1, t.width);
    const f = range.getFormulas()[0];
    range.setValues([keep.map(function (v, i) { return f[i] || v; })]);
    const ids = g.drop.map(function (d) { return d.id; });
    tp.forEach(function (r, i) {
      if (ids.indexOf(String(r[0])) >= 0) { r[0] = Number(g.keep.id) || g.keep.id; if (tname[i]) tname[i][0] = g.keep.name; }
      else if (String(r[0]) === g.keep.id && tname[i]) tname[i][0] = g.keep.name;
    });
  });
  if (tp.length) tt.sh.getRange(2, tt.col.person_id, tn, 1).setValues(tp);
  if (tname.length) tt.sh.getRange(2, tt.col.person, tn, 1).setValues(tname);
  remove.sort(function (a, b) { return b - a; }).forEach(function (r) { t.sh.deleteRow(r); });
  refreshFormulas();
  return remove.length;
}

function mergeDuplicatesMenu() {
  ensureSheets_();
  const ui = SpreadsheetApp.getUi();
  const found = findDuplicates_();
  if (!found.groups.length) { ui.alert('No duplicates', 'Every person in People has a different name.', ui.ButtonSet.OK); return; }
  const label = function (p) { return (p.name || '(no name, next step "' + p.next + '")') + ' · row ' + p.row; };
  const list = found.groups.map(function (g) {
    return 'Keep ' + label(g.keep) + '\n  merge in: ' + g.drop.map(label).join('; ');
  }).join('\n\n');
  const ok = ui.alert('Merge duplicate people?', list + '\n\nTouches move to the kept person and the other rows are deleted. ' +
    'Undo with Edit ▸ Undo or File ▸ Version history.', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const n = mergeDuplicates_(findDuplicates_());
    ui.alert('Merged', n + ' duplicate row' + (n === 1 ? '' : 's') + ' removed. Open Kinfolk (or press Pull) to see the result.', ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}
