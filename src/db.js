// Database layer: SQLite file in ./data (kept out of the public folder).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'reports'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'attachments'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'outbox'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ewc.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS venues (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL,
  group_id INTEGER NOT NULL REFERENCES groups(id), suburb TEXT, lga TEXT, machines INTEGER,
  aliases TEXT DEFAULT '[]', figures_source TEXT
);
CREATE TABLE IF NOT EXISTS weekly_figures (
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  week_ending TEXT NOT NULL, turnover REAL NOT NULL, profit REAL NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (venue_id, week_ending)
);
CREATE TABLE IF NOT EXISTS rankings (
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('M','Q')), period TEXT NOT NULL, rank INTEGER NOT NULL,
  PRIMARY KEY (venue_id, period_type, period)
);
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, suburb TEXT, lga TEXT
);
CREATE TABLE IF NOT EXISTS competitor_ranks (
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL, period TEXT NOT NULL, rank INTEGER NOT NULL,
  PRIMARY KEY (competitor_id, period_type, period)
);
CREATE TABLE IF NOT EXISTS venue_competitors (
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  PRIMARY KEY (venue_id, competitor_id)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, email TEXT COLLATE NOCASE,
  name TEXT NOT NULL, password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','group','venue')),
  group_id INTEGER REFERENCES groups(id), venue_id INTEGER REFERENCES venues(id),
  active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS password_tokens (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('gp_weekly','gp_monthly','figures','rankings','resource')),
  period TEXT, group_id INTEGER REFERENCES groups(id), venue_id INTEGER REFERENCES venues(id),
  venue_members_can_see INTEGER NOT NULL DEFAULT 0,
  original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT, size INTEGER,
  status TEXT NOT NULL DEFAULT 'published', uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT, company TEXT, email TEXT, phone TEXT,
  enquiry_type TEXT, subject TEXT, message TEXT, user_id INTEGER REFERENCES users(id), venue_text TEXT,
  attachment TEXT, email_status TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, detail TEXT,
  at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS venue_daily (
  venue_id INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  year INTEGER NOT NULL, quarter INTEGER NOT NULL, turnover_json TEXT NOT NULL, profit_json TEXT NOT NULL,
  PRIMARY KEY (venue_id, year, quarter)
);
CREATE TABLE IF NOT EXISTS aha_releases (
  id INTEGER PRIMARY KEY, period TEXT UNIQUE NOT NULL, title TEXT, columns_json TEXT NOT NULL,
  preliminary INTEGER NOT NULL DEFAULT 1, report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  rows_count INTEGER, uploaded_by INTEGER REFERENCES users(id), uploaded_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS aha_rows (
  release_id INTEGER NOT NULL REFERENCES aha_releases(id) ON DELETE CASCADE,
  ytd_rank INTEGER, name TEXT NOT NULL, suburb TEXT, lga TEXT, licence TEXT, values_json TEXT NOT NULL,
  PRIMARY KEY (release_id, licence, name)
);
CREATE INDEX IF NOT EXISTS idx_fig_week ON weekly_figures(week_ending);
CREATE INDEX IF NOT EXISTS idx_aha_rows ON aha_rows(release_id, ytd_rank);
CREATE INDEX IF NOT EXISTS idx_reports_group ON reports(group_id, category);
`);

// Columns added after the first release (safe to run on an existing database).
for (const [t, c, def] of [['venues', 'licence', 'TEXT'], ['competitors', 'licence', 'TEXT'], ['reports', 'all_members', 'INTEGER NOT NULL DEFAULT 0'], ['users', 'tools', 'TEXT'], ['reports', 'view_venues', 'TEXT']]) {
  if (!db.prepare(`PRAGMA table_info(${t})`).all().some(r => r.name === c)) {
    db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`);
    // Candice's own tools (Client Tools, QuickChange Email, Ranking Tools); everyone else keeps the standard set.
    if (c === 'tools') db.prepare("UPDATE users SET tools = 'client-tools,quickchange-email,ranking-tools' WHERE username = 'candice.elsonwhite'").run();
  }
}

function audit(userId, action, detail) {
  db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?,?,?)')
    .run(userId || null, action, detail ? JSON.stringify(detail) : null);
}

// Which venues a signed-in user may see. Every data route goes through this.
function venueIdsFor(user) {
  if (!user) return [];
  if (user.role === 'admin') return db.prepare('SELECT id FROM venues').all().map(r => r.id);
  if (user.role === 'group') return db.prepare('SELECT id FROM venues WHERE group_id = ?').all(user.group_id).map(r => r.id);
  if (user.role === 'venue') return user.venue_id ? [user.venue_id] : [];
  return [];
}

function canSeeReport(user, r) {
  if (!user || !r) return false;
  if (user.role === 'admin') return true;
  if (r.status !== 'published') return false;
  if (r.all_members) return true;                       // e.g. the monthly AHA rankings PDF
  if (user.role === 'group') return r.group_id === user.group_id;
  if (user.role === 'venue') {
    const v = db.prepare('SELECT group_id FROM venues WHERE id = ?').get(user.venue_id);
    if (!v || r.group_id !== v.group_id) return false;
    if (r.venue_id) return r.venue_id === user.venue_id;
    return !!r.venue_members_can_see;
  }
  return false;
}

module.exports = { db, DATA_DIR, audit, venueIdsFor, canSeeReport };
