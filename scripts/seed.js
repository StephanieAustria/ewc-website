// Loads the EWC data pulled from the Claude artifacts (seed/ewc-data.json) into the database
// and creates the two test accounts. Safe to re-run: figures and rankings are upserted.
//   node scripts/seed.js
require('../src/env');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');
const data = require('../seed/ewc-data.json');

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Other names the same venue goes by in the workbooks and dashboards (used when importing files).
const ALIASES = {
  'Commercial Hotel': ['Commercial Hotel, Parramatta', 'Commercial Parramatta'],
  'Meridian Hotel': ['Meridian Hotel, Hurstville', 'Meridian'],
  'Victoria Hotel': ['Victoria Hotel, Annandale'],
  'Regent Hotel': ['Regent', 'Regent Hotel Kingsford'],
  'Bank Tavern Kogarah': ['Bank Tavern', 'Bank'],
  'Doonside Hotel': ['Doonside'],
  'Peach Tree Inn Hotel': ['Peachtree Inn Hotel', 'Peachtree', 'Peach Tree'],
  'Royal Hotel (Carlton)': ['Royal Hotel', 'Royal Carlton'],
  'The Mill Hotel (Milperra)': ['The Mill Hotel', 'Mill Hotel', 'The Mill'],
  'Silverwater Hotel': ['Silverwater'],
  'Hillside Hotel': ['Hillside'],
  'The Governor Hotel': ['Governor', 'Governor Hotel'],
  'Commercial Hotel, Tumut': ['Commercial', 'Commercial Tumut'],
  'The Winston': ['Winston', 'The Winston Hotel', 'Winston Hotel'],
  'West Ryde Hotel': ['West Ryde', 'WRH'],
  'Sharks Kareela': ['Sharks Hotel', 'Sharks'],
  'Woolpack Hotel': ['Woolpack'],
  'Kings Park Tavern': ['Kings Park'],
  'Coniston Hotel': ['Coniston'],
  'Intersection Tavern': ['Intersection'],
  'Budgie': ['Budgewoi Hotel', 'Budgewoi'],
  'Australian': ['Australian Hotel'],
  'Exchange': ['The Beaumont Exchange Hotel', 'Beaumont Exchange'],
  'St George Belmore': ['St George Hotel'],
  'Vineyard': ['Vineyard Hotel'],
  'Wagon': ['The Wagon', 'Wagon Hotel'],
  'Rydalmere': ['Rydalmere Tavern'],
  'Glenquarie': ['Glenquarie Tavern'],
  'Lone Pine': ['Lone Pine Tavern'],
  'Agincourt': ['Agincourt Hotel'],
  'Shoal Bay': ['Shoal Bay Resort', 'Shoal Bay Country Club'],
};

const tx = db.transaction(() => {
  const insGroup = db.prepare('INSERT INTO groups (name, slug) VALUES (?, ?) ON CONFLICT(name) DO NOTHING');
  data.groups.forEach(g => insGroup.run(g, slug(g)));
  const gid = name => db.prepare('SELECT id FROM groups WHERE name = ?').get(name).id;

  const upVenue = db.prepare(`INSERT INTO venues (name, slug, group_id, suburb, lga, machines, aliases, figures_source)
    VALUES (@name, @slug, @group_id, @suburb, @lga, @machines, @aliases, @figures_source)
    ON CONFLICT(name) DO UPDATE SET group_id=excluded.group_id, suburb=COALESCE(excluded.suburb, venues.suburb),
      lga=COALESCE(excluded.lga, venues.lga), machines=COALESCE(excluded.machines, venues.machines),
      aliases=excluded.aliases, figures_source=COALESCE(excluded.figures_source, venues.figures_source)`);
  const upWeek = db.prepare(`INSERT INTO weekly_figures (venue_id, week_ending, turnover, profit) VALUES (?,?,?,?)
    ON CONFLICT(venue_id, week_ending) DO UPDATE SET turnover=excluded.turnover, profit=excluded.profit, updated_at=datetime('now')`);
  const upRank = db.prepare(`INSERT INTO rankings (venue_id, period_type, period, rank) VALUES (?,?,?,?)
    ON CONFLICT(venue_id, period_type, period) DO UPDATE SET rank=excluded.rank`);
  const upComp = db.prepare(`INSERT INTO competitors (name, suburb, lga) VALUES (?,?,?)
    ON CONFLICT(name) DO UPDATE SET suburb=COALESCE(excluded.suburb, competitors.suburb), lga=COALESCE(excluded.lga, competitors.lga)`);
  const upCompRank = db.prepare(`INSERT INTO competitor_ranks (competitor_id, period_type, period, rank) VALUES (?,?,?,?)
    ON CONFLICT(competitor_id, period_type, period) DO UPDATE SET rank=excluded.rank`);
  const link = db.prepare('INSERT OR IGNORE INTO venue_competitors (venue_id, competitor_id) VALUES (?,?)');

  for (const [name, c] of Object.entries(data.competitors)) {
    upComp.run(name, c.suburb || null, c.lga || null);
    const cid = db.prepare('SELECT id FROM competitors WHERE name = ?').get(name).id;
    for (const [p, r] of Object.entries(c.monthly || {})) if (Number.isFinite(r)) upCompRank.run(cid, 'M', p, r);
    for (const [p, r] of Object.entries(c.quarterly || {})) if (Number.isFinite(r)) upCompRank.run(cid, 'Q', p, r);
  }

  const upDaily = db.prepare(`INSERT INTO venue_daily (venue_id, year, quarter, turnover_json, profit_json) VALUES (?,?,?,?,?)
    ON CONFLICT(venue_id, year, quarter) DO UPDATE SET turnover_json=excluded.turnover_json, profit_json=excluded.profit_json`);
  for (const v of data.venues) {
    upVenue.run({ name: v.name, slug: slug(v.name), group_id: gid(v.group), suburb: v.suburb || null, lga: v.lga || null,
      machines: v.machines || null, aliases: JSON.stringify(ALIASES[v.name] || []), figures_source: v.figures_source || null });
    const vid = db.prepare('SELECT id FROM venues WHERE name = ?').get(v.name).id;
    for (const [d, to, pr] of v.weekly) upWeek.run(vid, d, to, pr);
    for (const [y, qs] of Object.entries(v.daily || {})) for (const [q, [to, pr]] of Object.entries(qs)) upDaily.run(vid, +y, +q, JSON.stringify(to), JSON.stringify(pr));
    for (const [p, r] of Object.entries(v.rank_monthly || {})) if (Number.isFinite(r)) upRank.run(vid, 'M', p, r);
    for (const [p, r] of Object.entries(v.rank_quarterly || {})) if (Number.isFinite(r)) upRank.run(vid, 'Q', p, r);
    for (const cn of v.competitors || []) {
      const c = db.prepare('SELECT id FROM competitors WHERE name = ?').get(cn);
      if (c) link.run(vid, c.id);
    }
  }
});
tx();
db.prepare("UPDATE venues SET suburb = 'McGraths Hill' WHERE name = 'Australian' AND suburb IS NULL").run();

// ---- AHA NSW monthly ranking releases (the whole statewide list) ----
const fs = require('fs'), path = require('path'), cryptoLib = require('crypto');
const { DATA_DIR } = require('../src/db');
const aha = require('../src/aha');
const ahaDir = path.join(__dirname, '..', 'seed', 'aha');
for (const f of fs.existsSync(ahaDir) ? fs.readdirSync(ahaDir).filter(n => /^\d{4}-\d{2}\.json$/.test(n)) : []) {
  const rel = JSON.parse(fs.readFileSync(path.join(ahaDir, f), 'utf8'));
  if (db.prepare('SELECT 1 FROM aha_releases WHERE period = ?').get(rel.period)) continue;
  let reportId = null;
  if (rel.file && fs.existsSync(path.join(ahaDir, rel.file))) {
    const stored = cryptoLib.randomBytes(16).toString('hex') + '.pdf';
    fs.copyFileSync(path.join(ahaDir, rel.file), path.join(DATA_DIR, 'reports', stored));
    reportId = db.prepare(`INSERT INTO reports (title, category, period, group_id, all_members, original_name, stored_name, mime, size, status)
      VALUES (?, 'rankings', ?, NULL, 1, ?, ?, 'application/pdf', ?, 'published')`).run(
      'AHA NSW ' + (rel.preliminary ? 'Preliminary ' : '') + 'Gaming Rankings — ' + rel.period, rel.period, rel.file, stored, fs.statSync(path.join(ahaDir, rel.file)).size).lastInsertRowid;
  }
  aha.saveRelease(rel, aha.matchRows(rel), null, reportId);
  console.log('AHA release loaded:', rel.period, rel.rows.length, 'hotels');
}

// ---- Test accounts -------------------------------------------------------
function ensureUser({ username, name, email, role, group, venue, password, mustChange }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return null;
  const group_id = group ? db.prepare('SELECT id FROM groups WHERE name = ?').get(group).id : null;
  const venue_id = venue ? db.prepare('SELECT id FROM venues WHERE name = ?').get(venue).id : null;
  db.prepare(`INSERT INTO users (username, email, name, password_hash, role, group_id, venue_id, must_change)
    VALUES (?,?,?,?,?,?,?,?)`).run(username, email || null, name, bcrypt.hashSync(password, 12), role, group_id, venue_id, mustChange ? 1 : 0);
  return password;
}

const adminPw = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
const createdAdmin = ensureUser({ username: 'candice.elsonwhite', name: 'Candice Elson-White', email: 'admin@elsonwhiteconsulting.com.au',
  role: 'admin', password: adminPw, mustChange: true });
ensureUser({ username: 'Stephanie.EWC', name: 'Stephanie Manuel', role: 'admin',
  password: process.env.STEPHANIE_PASSWORD || 'stephanie123', mustChange: false });
ensureUser({ username: 'westrydehotel', name: 'West Ryde Hotel', role: 'venue', venue: 'West Ryde Hotel',
  password: process.env.TEST_VENUE_PASSWORD || 'wrh123', mustChange: false });

// Each administrator's own tools (Members → Tools changes them later).
db.prepare("UPDATE users SET tools = 'client-tools,quickchange-email,ranking-tools' WHERE username = 'candice.elsonwhite' AND tools IS NULL").run();
db.prepare("UPDATE users SET tools = 'email-generator,ranking-tools,game-performance' WHERE username = 'Stephanie.EWC' AND tools IS NULL").run();

// Game Performance reports supplied by EWC (seed/reports/gp/manifest.json): each is published to its group, and read
// for the online view. Newest first, so older files can borrow the game colours of newer ones.
async function seedGameReports() {
  const gpLib = require('../src/gp');
  const dir = path.join(__dirname, '..', 'seed', 'reports', 'gp');
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) return 0;
  const list = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).sort((a, b) => b.period.localeCompare(a.period));
  const done = {}; let n = 0;
  for (const m of list) {
    if (db.prepare('SELECT 1 FROM reports WHERE original_name = ? AND category = ?').get(m.file, m.category)) continue;
    const g = db.prepare('SELECT id FROM groups WHERE name = ?').get(m.group); if (!g) continue;
    const v = m.venue ? db.prepare('SELECT id FROM venues WHERE name = ?').get(m.venue) : null;
    const stored = crypto.randomBytes(16).toString('hex') + '.xlsx';
    fs.copyFileSync(path.join(dir, m.file), path.join(DATA_DIR, 'reports', stored));
    const id = db.prepare(`INSERT INTO reports (title, category, period, group_id, venue_id, original_name, stored_name, mime, size, status)
      VALUES (?,?,?,?,?,?,?,?,?,'published')`).run(m.title, m.category, m.period, g.id, v ? v.id : null, m.file, stored,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fs.statSync(path.join(dir, m.file)).size).lastInsertRowid;
    const gp = await gpLib.parseGp(fs.readFileSync(path.join(dir, m.file)));
    gpLib.fillColours(gp, done[m.group] || []);
    (done[m.group] = done[m.group] || []).unshift(gp);
    gpLib.saveView({ id, stored_name: stored }, gp);
    n++;
  }
  return n;
}

const counts = {
  groups: db.prepare('SELECT COUNT(*) n FROM groups').get().n,
  venues: db.prepare('SELECT COUNT(*) n FROM venues').get().n,
  weeks: db.prepare('SELECT COUNT(*) n FROM weekly_figures').get().n,
  rankings: db.prepare('SELECT COUNT(*) n FROM rankings').get().n,
  competitors: db.prepare('SELECT COUNT(*) n FROM competitors').get().n,
};
module.exports = seedGameReports().then(n => {
  counts.gameReports = n;
  console.log('Seeded:', counts);
if (createdAdmin) console.log(`Admin account created: candice.elsonwhite / temporary password: ${createdAdmin}  (must be changed at first sign-in)`);
});
