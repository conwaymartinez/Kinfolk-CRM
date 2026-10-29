/**
 * Kinfolk ⇄ Google Sheets bridge — v3 (Today / Follow up / Sources).
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
 *  - The funnel columns from v2 (`funnel_stage`, `stage_history`) are left alone and no longer written.
 */

const VERSION = 3;
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
  'email', 'phone', 'source', 'active_lead', 'found_at', 'how_i_know', 'notes', 'legacy_id'];
// Fields Kinfolk may change. Everything else (headline, notes, geography…) is sheet-owned.
const WRITABLE = ['name', 'status', 'follow_up_at', 'next_step', 'project', 'organization', 'role', 'industry',
  'industry_check', 'reports_to_id', 'strength', 'created_at', 'email', 'phone', 'source', 'active_lead', 'found_at'];
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
      if (p.status === 'Touch' || p.status === 'WIP') p.follow_up_at = new Date(now.getTime() + 864e5);
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
