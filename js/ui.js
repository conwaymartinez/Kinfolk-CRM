// Tiny rendering helpers: tagged templates that escape by default.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function fmt(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

/** html`<p>${value}</p>` — values are escaped unless they are html`` results or raw(). */
export const html = (strings, ...vals) =>
  new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmt(vals[i]) : ''), ''));
export const raw = (s) => new Raw(s);

// ───────────── icons (stroke, currentColor) ─────────────
const P = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sources: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
};
export const icon = (name, size = 20) =>
  raw(`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`);

// ───────────── time ─────────────
export const HOUR = 36e5;
export const DAY = 864e5;

export function rel(iso, now) {
  const diff = new Date(iso).getTime() - now;
  const mins = Math.max(1, Math.round(Math.abs(diff) / 6e4));
  const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return diff < 0 ? `${label} late` : `in ${label}`;
}

export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
}

export function fromLocalInput(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString();
}

export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing t. */
export function startOfWeek(t = Date.now()) {
  const d = new Date(startOfDay(t));
  const dow = (d.getDay() + 6) % 7;
  return d.getTime() - dow * DAY;
}

export const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
