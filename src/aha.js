// Reads the monthly AHA NSW Gaming Rankings PDF (the whole statewide list) and saves it as a release.
const pdf = require('pdf-parse/lib/pdf-parse.js');
const { db } = require('./db');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = n => String(n).padStart(2, '0');
const num = s => { if (s == null || s === '-' || s === '–' || s === '') return null; const n = Number(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\(.*?\)/g, ' ').replace(/,.*$/, ' ')
  .replace(/\b(the|hotel|hotels|tavern|inn|motel|bar|pub)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

async function parseAhaPdf(buffer) {
  const lines = [];   // each: [{x, s}]
  const render = page => page.getTextContent().then(tc => {
    const rows = [];
    for (const it of tc.items) {
      const y = it.transform[5], x = it.transform[4], s = it.str.trim();
      if (!s) continue;
      // Some rows run the LGA and licence number together in one piece of text.
      const lm = s.match(/^(.*\S)\s+(LIQ[A-Z]?\d+)$/i);
      const parts = lm ? [{ x, s: lm[1] }, { x: x + 1, s: lm[2] }] : [{ x, s }];
      let r = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!r) { r = { y, items: [] }; rows.push(r); }
      r.items.push(...parts);
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => lines.push(r.items.sort((a, b) => a.x - b.x)));
    return '';
  });
  const meta = await pdf(buffer, { pagerender: render });

  const text = lines.map(l => l.map(i => i.s).join(' '));
  const title = text.find(t => /GAMING RANKINGS/i.test(t)) || '';
  const year = +((title.match(/(20\d\d)/) || [])[1] || new Date().getFullYear());
  const prelim = /PRELIMINARY/i.test(title);
  // Column headings after the licence number, e.g. "SEP QTR | Jul Aug Sep"
  const headIdx = lines.findIndex(l => l.some(i => /Licence/i.test(i.s)));
  const licX = headIdx >= 0 ? lines[headIdx].find(i => /Licence/i.test(i.s)).x : 540;
  const headTokens = [];
  for (let k = Math.max(0, headIdx - 2); k <= headIdx + 2 && k < lines.length; k++)
    for (const i of lines[k]) if (i.x > licX + 40) headTokens.push(...i.s.split(/\s+/).map(t => ({ x: i.x, t })));
  const columns = [];
  const qtr = headTokens.findIndex(t => /^QTR$/i.test(t.t));
  if (qtr >= 0) {
    const mTok = headTokens.find(t => MONTHS.includes(t.t.slice(0, 3).toLowerCase()) && /^[A-Z]{3,}$/.test(t.t));
    const m = mTok ? MONTHS.indexOf(mTok.t.slice(0, 3).toLowerCase()) + 1 : null;
    if (m) columns.push({ type: 'Q', label: mTok.t.slice(0, 3).toUpperCase() + ' QTR', period: `${year}-${pad(m)}` });
  }
  const used = new Set(columns.map(c => c.label.slice(0, 3).toLowerCase()));
  for (const t of headTokens) {
    const k = t.t.slice(0, 3).toLowerCase();
    if (!MONTHS.includes(k) || /^[A-Z]{3,}$/.test(t.t) && qtr >= 0 && used.has(k) && !columns.some(c => c.type === 'M' && c.label.toLowerCase() === k)) {
      if (!MONTHS.includes(k)) continue;
      if (/^[A-Z]{3,}$/.test(t.t)) continue;   // the "SEP" of "SEP QTR"
    }
    if (columns.some(c => c.type === 'M' && c.label.toLowerCase() === k)) continue;
    columns.push({ type: 'M', label: t.t.slice(0, 1).toUpperCase() + k.slice(1), period: `${year}-${pad(MONTHS.indexOf(k) + 1)}` });
  }
  // A January release's "Dec" column belongs to the year before.
  const lastM = Math.max(...columns.filter(c => c.type === 'M').map(c => +c.period.slice(5)));
  columns.forEach(c => { if (+c.period.slice(5) > lastM) c.period = `${year - 1}-${c.period.slice(5)}`; });
  const period = columns.filter(c => c.type === 'M').map(c => c.period).sort().pop();

  const rows = [];
  for (const l of lines) {
    const li = l.findIndex(i => /^LIQ[A-Z]?\d+/i.test(i.s));
    if (li < 1) continue;
    const rank = num(l[0].s); if (rank == null) continue;
    let mid = l.slice(1, li).map(i => i.s);
    let lga = mid.pop() || '', suburbParts = [];
    while (mid.length > 1 && /^[A-Z0-9'’.\- ]+$/.test(mid[mid.length - 1]) && /[A-Z]/.test(mid[mid.length - 1])) suburbParts.unshift(mid.pop());
    const name = mid.join(' ');
    const vals = l.slice(li + 1).map(i => i.s).join(' ').split(/\s+/).filter(Boolean).map(num);
    while (vals.length < columns.length) vals.unshift(null);
    rows.push({ ytd: rank, name, suburb: suburbParts.join(' '), lga, licence: l[li].s.replace(/\s+/g, ''), values: vals.slice(-columns.length) });
  }
  return { title: title.trim(), preliminary: prelim, period, columns, rows, pages: meta.numpages };
}

// Links each EWC venue and tracked competitor to its AHA row (by licence number once known, else name + suburb).
function matchRows(parsed) {
  const venues = db.prepare('SELECT id, name, suburb, aliases, licence FROM venues').all();
  const comps = db.prepare('SELECT id, name, suburb, licence FROM competitors').all();
  const byLic = new Map(parsed.rows.map(r => [r.licence, r]));
  const key = (n, s) => norm(n) + '|' + String(s || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  const byKey = new Map(), byName = new Map();
  for (const r of parsed.rows) { byKey.set(key(r.name, r.suburb), r); const k = norm(r.name); byName.set(k, byName.has(k) ? null : r); }
  const find = (names, suburb, licence) => {
    if (licence && byLic.get(licence)) return byLic.get(licence);
    for (const n of names) { const r = byKey.get(key(n, suburb)); if (r) return r; }
    for (const n of names) { const r = byName.get(norm(n)); if (r && (!suburb || String(r.suburb).toLowerCase() === String(suburb).toLowerCase())) return r; }
    if (suburb) {                                                                   // same suburb, shared main word
      const words = new Set(names.flatMap(n => norm(n).split(' ')).filter(w => w.length > 3));
      const cands = parsed.rows.filter(r => String(r.suburb).toLowerCase() === String(suburb).toLowerCase() && norm(r.name).split(' ').some(w => words.has(w)));
      if (cands.length === 1) return cands[0];
    }
    return null;
  };
  const v = venues.map(x => ({ x, r: find([x.name, ...JSON.parse(x.aliases || '[]')], x.suburb, x.licence) }));
  const c = comps.map(x => ({ x, r: find([x.name], x.suburb, x.licence) }));
  return { venues: v, competitors: c };
}

function saveRelease(parsed, match, userId, reportId) {
  const tx = db.transaction(() => {
    const ex = db.prepare('SELECT id FROM aha_releases WHERE period = ?').get(parsed.period);
    if (ex) db.prepare('DELETE FROM aha_releases WHERE id = ?').run(ex.id);
    const id = db.prepare(`INSERT INTO aha_releases (period, title, columns_json, preliminary, report_id, rows_count, uploaded_by) VALUES (?,?,?,?,?,?,?)`)
      .run(parsed.period, parsed.title, JSON.stringify(parsed.columns), parsed.preliminary ? 1 : 0, reportId || null, parsed.rows.length, userId || null).lastInsertRowid;
    const ins = db.prepare('INSERT OR REPLACE INTO aha_rows (release_id, ytd_rank, name, suburb, lga, licence, values_json) VALUES (?,?,?,?,?,?,?)');
    for (const r of parsed.rows) ins.run(id, r.ytd, r.name, r.suburb, r.lga, r.licence, JSON.stringify(r.values));
    const upV = db.prepare(`INSERT INTO rankings (venue_id, period_type, period, rank) VALUES (?,?,?,?) ON CONFLICT(venue_id, period_type, period) DO UPDATE SET rank=excluded.rank`);
    const upC = db.prepare(`INSERT INTO competitor_ranks (competitor_id, period_type, period, rank) VALUES (?,?,?,?) ON CONFLICT(competitor_id, period_type, period) DO UPDATE SET rank=excluded.rank`);
    const setVL = db.prepare('UPDATE venues SET licence = ? WHERE id = ?'), setCL = db.prepare('UPDATE competitors SET licence = ? WHERE id = ?');
    for (const { x, r } of match.venues) if (r) { setVL.run(r.licence, x.id); parsed.columns.forEach((c, i) => { if (r.values[i] != null) upV.run(x.id, c.type, c.period, r.values[i]); }); }
    for (const { x, r } of match.competitors) if (r) { setCL.run(r.licence, x.id); parsed.columns.forEach((c, i) => { if (r.values[i] != null) upC.run(x.id, c.type, c.period, r.values[i]); }); }
    return id;
  });
  return tx();
}

module.exports = { parseAhaPdf, matchRows, saveRelease };
