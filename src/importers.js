// Reads the weekly figures workbooks and ranking files you upload in the admin area.
const XLSX = require('xlsx');
const { db } = require('./db');

const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/\(.*?\)/g, ' ')
  .replace(/\b(the|hotel|tavern|inn)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

function venueIndex(groupId) {
  const rows = groupId ? db.prepare('SELECT id, name, aliases FROM venues WHERE group_id = ?').all(groupId)
                       : db.prepare('SELECT id, name, aliases FROM venues').all();
  const idx = new Map();
  for (const v of rows) for (const n of [v.name, ...JSON.parse(v.aliases || '[]')]) idx.set(norm(n), v);
  return idx;
}

function readRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }));
  return sheets;
}

const pad = n => String(n).padStart(2, '0');
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
// Accepts Excel dates, 05/10/2025 (Australian day-first) and 2025-10-05.
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = XLSX.SSF.parse_date_code(v); return new Date(d.y, d.m - 1, d.d, 12); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1], 12); }
  return null;
}
// Weeks are stored by week-ending Sunday. A Monday-dated week moves to the Sunday it ends on.
function weekEnding(d) {
  const day = d.getDay();
  if (day === 1) d = new Date(d.getTime() + 6 * 86400000);
  return toISO(d);
}
const num = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : null;
};

// Two layouts are understood:
//  A) "wide" (the weekly figures workbook): Date | Venue A | Venue B | … (turnover) | Venue A | Venue B | … (profit)
//     or "Turnover"/"Profit" labels in the row above the venue names.
//  B) "long": columns Venue, Week ending, Turnover, Profit.
function parseFigures(buffer, groupId) {
  const idx = venueIndex(groupId);
  const out = []; const unmatched = new Set(); const notes = [];
  for (const sh of readRows(buffer)) {
    const rows = sh.rows;
    const hRow = rows.findIndex(r => r && r.some(c => /^(date|week ?ending|w\/?e|week)$/i.test(String(c || '').trim())));
    if (hRow < 0) continue;
    const head = rows[hRow].map(c => String(c || '').trim());
    const lc = head.map(h => h.toLowerCase());
    const vCol = lc.findIndex(h => h === 'venue'), toCol = lc.findIndex(h => h.startsWith('turnover')), prCol = lc.findIndex(h => h.startsWith('profit') || h === 'net');
    const dCol = lc.findIndex(h => /^(date|week ?ending|w\/?e|week)$/.test(h));
    if (vCol >= 0 && toCol >= 0 && prCol >= 0) {           // long layout
      for (const r of rows.slice(hRow + 1)) {
        const d = parseDate(r[dCol]); const v = idx.get(norm(r[vCol]));
        if (!d) continue; if (!v) { if (r[vCol]) unmatched.add(String(r[vCol])); continue; }
        const to = num(r[toCol]), pr = num(r[prCol]); if (to == null || pr == null) continue;
        out.push({ venue_id: v.id, venue: v.name, week: weekEnding(d), to, pr });
      }
      notes.push(`Sheet "${sh.name}": venue-per-row layout`);
      continue;
    }
    // wide layout
    const above = hRow > 0 ? rows[hRow - 1].map(c => String(c || '').toLowerCase()) : [];
    let kind = null; const cols = [];                       // [{col, venue, kind}]
    const seen = new Map();
    head.forEach((h, c) => {
      if (c === dCol || !h) return;
      if (above[c] && /turnover/.test(above[c])) kind = 'to';
      if (above[c] && /profit|net/.test(above[c])) kind = 'pr';
      if (/total|group|average|avg/i.test(h)) return;      // group or total columns are ignored
      const v = idx.get(norm(h));
      if (!v) { unmatched.add(h); return; }
      let k = kind;
      if (!k) { k = seen.has(v.id) ? 'pr' : 'to'; }        // first appearance = turnover, second = profit
      seen.set(v.id, true);
      cols.push({ col: c, v, kind: k });
    });
    const byKey = new Map();
    for (const r of rows.slice(hRow + 1)) {
      if (!r) continue; const d = parseDate(r[dCol]); if (!d) continue;
      const wk = weekEnding(d);
      for (const { col, v, kind: k } of cols) {
        const n = num(r[col]); if (n == null) continue;
        const key = v.id + '|' + wk; const e = byKey.get(key) || { venue_id: v.id, venue: v.name, week: wk, to: null, pr: null };
        e[k] = n; byKey.set(key, e);
      }
    }
    for (const e of byKey.values()) if (e.to != null && e.pr != null) out.push(e);
    if (cols.length) notes.push(`Sheet "${sh.name}": ${new Set(cols.map(c => c.v.name)).size} venues found`);
  }
  // Last value wins if a week appears twice.
  const final = new Map(out.map(e => [e.venue_id + '|' + e.week, e]));
  const list = [...final.values()];
  const venues = [...new Set(list.map(e => e.venue))];
  const weeks = list.map(e => e.week).sort();
  const negatives = list.filter(e => e.pr < 0 && Math.abs(e.pr) > e.to);   // the Silverwater-style entry error
  return { rows: list, venues, unmatched: [...unmatched].slice(0, 30), from: weeks[0], to: weeks.at(-1), notes,
    warnings: negatives.map(e => `${e.venue} w/e ${e.week}: profit ${e.pr.toLocaleString()} looks like an entry error — skipped`) };
}

function saveFigures(parsed) {
  const up = db.prepare(`INSERT INTO weekly_figures (venue_id, week_ending, turnover, profit) VALUES (?,?,?,?)
    ON CONFLICT(venue_id, week_ending) DO UPDATE SET turnover=excluded.turnover, profit=excluded.profit, updated_at=datetime('now')`);
  let n = 0;
  db.transaction(() => { for (const e of parsed.rows) { if (e.pr < 0 && Math.abs(e.pr) > e.to) continue; up.run(e.venue_id, e.week, e.to, e.pr); n++; } })();
  return n;
}

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function parsePeriod(v) {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}`;
  const s = String(v || '').trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}`;
  m = s.match(/^([a-z]{3})[a-z]*[\s-]+(\d{2,4})$/); if (m && MONTHS.includes(m[1])) { const y = m[2].length === 2 ? '20' + m[2] : m[2]; return `${y}-${pad(MONTHS.indexOf(m[1]) + 1)}`; }
  m = s.match(/^(\d{1,2})\/(\d{4})$/); if (m) return `${m[2]}-${pad(m[1])}`;
  return null;
}

// Rankings file: columns Venue, Month (e.g. 2026-10 or Oct 2026), Rank, and optionally Type (Monthly/Quarterly).
// Rows for venues EWC does not manage are saved as competitor ranks when the competitor is known.
function parseRankings(buffer) {
  const vidx = venueIndex(null);
  const cidx = new Map(db.prepare('SELECT id, name FROM competitors').all().map(c => [norm(c.name), c]));
  const rows = []; const unmatched = new Set();
  for (const sh of readRows(buffer)) {
    const hRow = sh.rows.findIndex(r => r && r.some(c => /^venue/i.test(String(c || ''))) && r.some(c => /rank/i.test(String(c || ''))));
    if (hRow < 0) continue;
    const lc = sh.rows[hRow].map(c => String(c || '').toLowerCase().trim());
    const vc = lc.findIndex(h => h.startsWith('venue')), pc = lc.findIndex(h => /^(month|period|date)/.test(h)),
      rc = lc.findIndex(h => h.startsWith('rank')), tc = lc.findIndex(h => h === 'type');
    for (const r of sh.rows.slice(hRow + 1)) {
      if (!r || !r[vc]) continue;
      const period = parsePeriod(r[pc]); const rank = num(r[rc]);
      if (!period || rank == null) continue;
      const type = tc >= 0 && /^q/i.test(String(r[tc] || '')) ? 'Q' : 'M';
      const v = vidx.get(norm(r[vc])); const c = v ? null : cidx.get(norm(r[vc]));
      if (!v && !c) { unmatched.add(String(r[vc])); continue; }
      rows.push({ venue_id: v && v.id, competitor_id: c && c.id, name: v ? v.name : c.name, period, rank: Math.round(rank), type });
    }
  }
  const periods = [...new Set(rows.map(r => r.period))].sort();
  return { rows, periods, venues: rows.filter(r => r.venue_id).length, competitors: rows.filter(r => r.competitor_id).length, unmatched: [...unmatched].slice(0, 30) };
}
function saveRankings(parsed) {
  const uv = db.prepare(`INSERT INTO rankings (venue_id, period_type, period, rank) VALUES (?,?,?,?) ON CONFLICT(venue_id, period_type, period) DO UPDATE SET rank=excluded.rank`);
  const uc = db.prepare(`INSERT INTO competitor_ranks (competitor_id, period_type, period, rank) VALUES (?,?,?,?) ON CONFLICT(competitor_id, period_type, period) DO UPDATE SET rank=excluded.rank`);
  db.transaction(() => { for (const r of parsed.rows) r.venue_id ? uv.run(r.venue_id, r.type, r.period, r.rank) : uc.run(r.competitor_id, r.type, r.period, r.rank); })();
  return parsed.rows.length;
}

module.exports = { parseFigures, saveFigures, parseRankings, saveRankings };
