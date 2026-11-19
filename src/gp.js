// Reads a Game Performance workbook ("GAME PERFORMANCE — MACHINE PERFORMANCE", weekly or monthly) into a compact
// form the portal can show online, keeping the colour coding, Floor Average / Bottom 20% lines and totals.
const ExcelJS = require('exceljs');

// Column headings → field names. Columns are found by their heading, so older layouts (data from column C,
// "Denomination" holding the turnover rank) read the same as the current one.
const HEAD = [[/^install/, 'install'], [/^gmid/, 'gmid'], [/^serial/, 'serial'], [/^game type/, 'game'], [/^t\/o rank|^denomination/, 'to'],
  [/^profit rank/, 'pr'], [/revenue/, 'rev'], [/turnover/, 'turn'], [/^lpj/, 'lpj'], [/^remarks/, 'remarks'], [/^links/, 'links']];
const hex = c => (c && typeof c.argb === 'string' ? c.argb.slice(-6).toUpperCase() : null);
const num = v => (v && typeof v === 'object' && 'result' in v ? v.result : v);
const txt = v => { v = num(v); if (v == null) return ''; if (v instanceof Date) return v.toISOString().slice(0, 10); if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join(''); return v; };
const isoDay = s => { const d = new Date(String(s) + ' 12:00 UTC'); return isNaN(d) ? null : d.toISOString().slice(0, 10); };

function style(cell) {
  const f = cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern !== 'none' ? hex(cell.fill.fgColor) : null;
  const c = cell.font && cell.font.color ? hex(cell.font.color) : null;
  if (!f && (!c || c === '000000')) return null;
  return (f || '') + '/' + (c && c !== '000000' ? c : '');
}

function bottomLine(cell) {
  const b = cell.border && cell.border.bottom;
  if (!b || !b.style) return null;
  const c = hex(b.color) || '000000';
  return c === 'FFFFFF' ? null : c;
}

async function parseGp(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find(s => /performance/i.test(s.name)) || wb.worksheets[0];
  const out = { title: '', start: null, end: null, venuesLabel: '', sections: [], grand: null, grandTotal: null };
  let sec = null, cols = null, last = 0;
  const day = v => (v instanceof Date ? v.toISOString().slice(0, 10) : isoDay(v));
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = []; row.eachCell(c => { const v = txt(c.value); if (v !== '' && v != null) cells.push({ c, v, t: String(v).trim() }); });
    if (!cells.length) return;
    const lab = t => t.toLowerCase().replace(/\s+:/, ':').replace(/\s+/g, ' ');
    const after = l => { const i = cells.findIndex(x => lab(x.t) === l); return i >= 0 ? cells[i + 1] : undefined; };
    if (!out.title && /game performance/i.test(cells[0].t)) out.title = cells[0].t;
    if (after('start date:')) { out.start = day(num(after('start date:').c.value)); const e = after('end date:'); out.end = e ? day(num(e.c.value)) : null; return; }
    if (after('venues:')) { out.venuesLabel = after('venues:').t; return; }
    if (!cols) {                                                          // the column-heading row
      if (!cells.some(x => /^gmid$/i.test(x.t))) return;
      cols = {};
      for (const x of cells) { const h = lab(x.t); const m = HEAD.find(([re]) => re.test(h)); if (m && !cols[m[1]]) cols[m[1]] = x.c.col; }
      last = Math.max(...Object.values(cols));
      return;
    }
    const first = cells[0], a = first.t, inTable = first.c.col <= last;
    if (!inTable) return;
    const get = k => (cols[k] ? row.getCell(cols[k]) : null);
    const money = { rev: Number(num((get('rev') || {}).value)) || 0, turn: Number(num((get('turn') || {}).value)) || 0 };
    if (/^Net After LPJ\s*[—-]\s*GRAND TOTAL/i.test(a)) { out.grand = money; return; }
    if (/^Total for /i.test(a)) { if (sec) sec.total = { ...money, lpj: Number(num((get('lpj') || {}).value)) || 0 }; return; }
    if (/^Net After LPJ/i.test(a)) { if (sec) sec.net = money; return; }
    if (/^Grand Total/i.test(a)) { out.grandTotal = { ...money, lpj: Number(num((get('lpj') || {}).value)) || 0 }; return; }
    const gameCell = get('game');
    if (typeof first.v === 'string' && (!gameCell || gameCell.value == null) && !/^\d+$/.test(a)) {
      const m = a.match(/^(.*?)\s*\((\d+)\)\s*$/);
      sec = { name: m ? m[1] : a, code: m ? m[2] : null, rows: [], total: null, net: null };
      out.sections.push(sec); return;
    }
    if (!sec || !gameCell || gameCell.value == null) return;
    const r = {}, s = {};
    let line = null;
    for (const [key, col] of Object.entries(cols)) {
      const cell = row.getCell(col); const v = txt(cell.value);
      if (v !== '' && v != null) r[key] = typeof v === 'number' ? Math.round(v * 100) / 100 : String(v).trim();
      const st = style(cell); if (st && !/^FFFFFF\/$/.test(st)) s[key] = st;
      if (!line && (key === 'gmid' || key === 'turn')) line = bottomLine(cell);
    }
    const rem = String(r.remarks || '');
    if (/floor average/i.test(rem)) r.line = 'avg'; else if (/bottom 20/i.test(rem)) r.line = 'b20';
    else if (line) r.line = line === 'FF0000' ? 'b20' : 'avg';
    if (r.remarks && /line$/i.test(String(r.remarks))) delete r.remarks;
    if (Object.keys(s).length) r.s = s;
    sec.rows.push(r);
  });
  return out;
}

// Older files colour the games with conditional formatting, which is not stored as cell colours: give each machine the
// colours it has in a newer report (same serial and game).
function fillColours(gp, newer) {
  const map = new Map();
  for (const g of newer) for (const sec of g.sections) for (const r of sec.rows) if (r.s && r.serial) map.set(r.serial + '|' + r.game, r.s);
  for (const sec of gp.sections) for (const r of sec.rows) if (!r.s && map.has(r.serial + '|' + r.game)) r.s = map.get(r.serial + '|' + r.game);
  return gp;
}

// Links each section to an EWC venue: licence number first (LIQH4 + the code in brackets), then the name.
function matchVenues(gp, venues) {
  const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)|,/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const sec of gp.sections) {
    let v = sec.code && venues.find(x => x.licence && x.licence.replace(/\D/g, '').replace(/^4?0*/, '').endsWith(sec.code.replace(/^0+/, '')));
    if (!v) v = venues.find(x => norm(x.name) === norm(sec.name)) || venues.find(x => norm(sec.name).startsWith(norm(x.name)) || norm(x.name).startsWith(norm(sec.name)));
    sec.venue_id = v ? v.id : null;
  }
  return gp;
}

// ---------- the online copy kept beside each uploaded Game Performance file ----------
const fs = require('fs');
const path = require('path');
function viewPath(stored) { const { DATA_DIR } = require('./db'); return path.join(DATA_DIR, 'reports', stored + '.view.json'); }
function readView(stored) { try { return JSON.parse(fs.readFileSync(viewPath(stored), 'utf8')); } catch (e) { return null; } }

// Links the sections to venues, writes the online copy and records which venues it covers.
function saveView(report, gp) {
  const { db } = require('./db');
  matchVenues(gp, db.prepare('SELECT id, name, licence FROM venues').all());
  fs.writeFileSync(viewPath(report.stored_name), JSON.stringify(gp));
  const ids = [...new Set(gp.sections.map(s => s.venue_id).filter(Boolean))];
  db.prepare('UPDATE reports SET view_venues = ? WHERE id = ?').run(ids.join(','), report.id);
  return gp;
}

// After an upload: reads the workbook, borrows game colours from this group's latest report if the file has none.
async function buildFromUpload(report) {
  const { db, DATA_DIR } = require('./db');
  if (!/^gp_/.test(report.category) || !/\.xlsx$/i.test(report.original_name)) return null;
  const gp = await parseGp(fs.readFileSync(path.join(DATA_DIR, 'reports', report.stored_name)));
  if (!gp.sections.length) return null;
  const prev = db.prepare("SELECT stored_name FROM reports WHERE group_id = ? AND id <> ? AND view_venues IS NOT NULL ORDER BY period DESC LIMIT 3").all(report.group_id, report.id)
    .map(r => readView(r.stored_name)).filter(Boolean);
  fillColours(gp, prev);
  return saveView(report, gp);
}

// What a signed-in person may see of a Game Performance report online: 'full' (the whole file),
// 'own' (only their venue's section of a whole-group file) or null.
function access(user, r, canSeeReport) {
  if (!user || !r) return null;
  if (canSeeReport(user, r)) return 'full';
  if (user.role === 'venue' && r.status === 'published' && r.view_venues && r.view_venues.split(',').map(Number).includes(user.venue_id)) return 'own';
  return null;
}

module.exports = { parseGp, matchVenues, fillColours, readView, saveView, buildFromUpload, access, viewPath };
