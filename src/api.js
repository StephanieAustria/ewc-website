// JSON API used by the member portal. Every route checks the signed-in user's venues.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, DATA_DIR, audit, venueIdsFor, canSeeReport } = require('./db');
const { requireUser, requireAdmin, requireCsrf, issueToken, setPassword, MIN_PASSWORD } = require('./auth');
const mail = require('./mail');
const imp = require('./importers');
const aha = require('./aha');

const router = express.Router();
const SITE = () => process.env.SITE_URL || 'http://localhost:3000';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const gpLib = require('./gp');
const REPORT_TYPES = /\.(pdf|xlsx|xls|csv|pptx|docx)$/i;
const ATTACH_TYPES = /\.(pdf|xlsx|xls|csv|pptx|docx|png|jpe?g)$/i;
const store = dir => multer.diskStorage({
  destination: path.join(DATA_DIR, dir),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
});
const uploadReport = multer({ storage: store('reports'), limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (req, f, cb) => cb(null, REPORT_TYPES.test(f.originalname)) });
const uploadAttach = multer({ storage: store('attachments'), limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, ATTACH_TYPES.test(f.originalname)) });
const uploadData = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(null, /\.(xlsx|xls|csv)$/i.test(f.originalname)) });

router.use(requireUser);
router.use((req, res, next) => (req.method === 'GET' ? next() : requireCsrf(req, res, next)));

// ---------- who am I / what can I see ----------
router.get('/me', (req, res) => {
  const u = req.user;
  res.json({ id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, group: u.group_name,
    venue: u.venue_name, mustChange: !!u.must_change, csrf: req.csrf, emailConfigured: mail.configured(),
    tools: require('./tools').slugsFor(u) });
});

router.get('/venues', (req, res) => {
  const ids = venueIdsFor(req.user);
  if (!ids.length) return res.json([]);
  const rows = db.prepare(`SELECT v.id, v.name, v.suburb, v.lga, v.machines, g.name AS grp, g.id AS group_id,
      (SELECT MAX(week_ending) FROM weekly_figures w WHERE w.venue_id = v.id) AS latest_week,
      (SELECT COUNT(*) FROM weekly_figures w WHERE w.venue_id = v.id) AS weeks,
      (SELECT MAX(period) FROM rankings r WHERE r.venue_id = v.id AND r.period_type='M') AS latest_rank_month
    FROM venues v JOIN groups g ON g.id = v.group_id WHERE v.id IN (${ids.map(() => '?').join(',')}) ORDER BY g.name, v.name`).all(...ids);
  res.json(rows);
});

// Requested venue ids are always narrowed to the ones this user is allowed to see.
function allowedVenues(req) {
  const allowed = new Set(venueIdsFor(req.user));
  const asked = String(req.query.venues || '').split(',').map(Number).filter(Boolean);
  const list = asked.length ? asked.filter(id => allowed.has(id)) : [...allowed];
  return { list, refused: asked.length && list.length !== asked.length };
}

router.get('/figures', (req, res) => {
  const { list, refused } = allowedVenues(req);
  if (refused) return res.status(403).json({ error: 'You do not have access to one or more of those venues.' });
  if (!list.length) return res.json({ venues: [] });
  const ph = list.map(() => '?').join(',');
  const venues = db.prepare(`SELECT id, name FROM venues WHERE id IN (${ph}) ORDER BY name`).all(...list);
  const rows = db.prepare(`SELECT venue_id, week_ending, turnover, profit FROM weekly_figures WHERE venue_id IN (${ph}) ORDER BY week_ending`).all(...list);
  const by = new Map(venues.map(v => [v.id, { ...v, weeks: [] }]));
  for (const r of rows) by.get(r.venue_id).weeks.push([r.week_ending, r.turnover, r.profit]);
  res.json({ venues: [...by.values()] });
});

router.get('/figures.csv', (req, res) => {
  const { list, refused } = allowedVenues(req);
  if (refused || !list.length) return res.status(403).send('No access');
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : '0000';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : '9999';
  const ph = list.map(() => '?').join(',');
  const rows = db.prepare(`SELECT v.name, w.week_ending, w.turnover, w.profit FROM weekly_figures w JOIN venues v ON v.id = w.venue_id
    WHERE w.venue_id IN (${ph}) AND w.week_ending BETWEEN ? AND ? ORDER BY w.week_ending, v.name`).all(...list, from, to);
  const csv = ['Venue,Week ending,Turnover,Profit,RTV %', ...rows.map(r =>
    `"${r.name.replace(/"/g, '""')}",${r.week_ending},${r.turnover.toFixed(2)},${r.profit.toFixed(2)},${r.turnover ? (r.profit / r.turnover * 100).toFixed(2) : ''}`)].join('\r\n');
  audit(req.user.id, 'download_figures_csv', { venues: list.length, from, to });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="EWC-gaming-figures-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
});

router.get('/rankings', (req, res) => {
  const id = Number(req.query.venue);
  if (!venueIdsFor(req.user).includes(id)) return res.status(403).json({ error: 'You do not have access to that venue.' });
  const v = db.prepare('SELECT id, name, suburb, lga, machines FROM venues WHERE id = ?').get(id);
  const own = db.prepare('SELECT period_type, period, rank FROM rankings WHERE venue_id = ? ORDER BY period').all(id);
  const comps = db.prepare(`SELECT c.id, c.name, c.suburb, c.lga FROM venue_competitors vc JOIN competitors c ON c.id = vc.competitor_id WHERE vc.venue_id = ? ORDER BY c.name`).all(id);
  const cr = db.prepare('SELECT period_type, period, rank FROM competitor_ranks WHERE competitor_id = ? ORDER BY period');
  const shape = rows => ({ monthly: Object.fromEntries(rows.filter(r => r.period_type === 'M').map(r => [r.period, r.rank])),
                          quarterly: Object.fromEntries(rows.filter(r => r.period_type === 'Q').map(r => [r.period, r.rank])) });
  res.json({ venue: { ...v, ...shape(own) }, competitors: comps.map(c => ({ ...c, ...shape(cr.all(c.id)) })) });
});

router.get('/rankings-overview', (req, res) => {
  const ids = venueIdsFor(req.user);
  if (!ids.length) return res.json({ months: [], rows: [] });
  const ph = ids.map(() => '?').join(',');
  const months = db.prepare(`SELECT DISTINCT period FROM rankings WHERE period_type='M' AND venue_id IN (${ph}) ORDER BY period DESC LIMIT 13`).all(...ids).map(r => r.period).reverse();
  const rows = db.prepare(`SELECT v.id, v.name, g.name grp FROM venues v JOIN groups g ON g.id=v.group_id WHERE v.id IN (${ph}) ORDER BY g.name, v.name`).all(...ids);
  const get = db.prepare(`SELECT period, rank FROM rankings WHERE venue_id = ? AND period_type='M' AND period >= ?`);
  const getQ = db.prepare(`SELECT period, rank FROM rankings WHERE venue_id = ? AND period_type='Q' ORDER BY period DESC LIMIT 1`);
  res.json({ months, rows: rows.map(r => ({ ...r, ranks: Object.fromEntries(get.all(r.id, months[0] || '0').map(x => [x.period, x.rank])), lastQ: getQ.get(r.id) || null }))
    .filter(r => Object.keys(r.ranks).length) });
});

// ---------- the Executive Performance Dashboard (same layout as the client dashboards) ----------
const dashboardBuilder = require('../public/js/ewc-dashboard-data');
function scopeVenues(user, scope) {
  const allowed = new Set(venueIdsFor(user));
  const withFigures = id => db.prepare('SELECT 1 FROM weekly_figures WHERE venue_id = ? LIMIT 1').get(id);
  let ids = [], title = null;
  const m = String(scope || 'all').match(/^(all|g(\d+)|v(\d+))$/);
  if (!m) return null;
  if (m[2]) {
    const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(+m[2]); if (!g) return null;
    ids = db.prepare('SELECT id FROM venues WHERE group_id = ?').all(g.id).map(r => r.id);
    if (!ids.every(id => allowed.has(id))) return null;
    title = g.name;
  } else if (m[3]) {
    if (!allowed.has(+m[3])) return null;
    ids = [+m[3]];
  } else ids = [...allowed];
  ids = ids.filter(withFigures);
  return { ids, title };
}
function dashboardData(user, scope) {
  const sc = scopeVenues(user, scope);
  if (!sc) return null;
  const venues = sc.ids.map(id => {
    const v = db.prepare('SELECT id, name, suburb, figures_source FROM venues WHERE id = ?').get(id);
    const weeks = db.prepare('SELECT week_ending, turnover, profit FROM weekly_figures WHERE venue_id = ? ORDER BY week_ending').all(id).map(r => [r.week_ending, r.turnover, r.profit]);
    const daily = {};
    for (const r of db.prepare('SELECT * FROM venue_daily WHERE venue_id = ?').all(id)) (daily[r.year] = daily[r.year] || {})[r.quarter] = [JSON.parse(r.turnover_json), JSON.parse(r.profit_json)];
    return { ...v, weeks, daily };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const ranks = {};
  for (const v of venues) {
    const rows = db.prepare('SELECT period_type, period, rank FROM rankings WHERE venue_id = ?').all(v.id);
    ranks[v.name] = { monthly: Object.fromEntries(rows.filter(r => r.period_type === 'M').map(r => [r.period, r.rank])),
                      quarterly: Object.fromEntries(rows.filter(r => r.period_type === 'Q').map(r => [r.period, r.rank])) };
  }
  const rel = db.prepare('SELECT MAX(period) p FROM aha_releases').get().p || db.prepare("SELECT MAX(period) p FROM rankings WHERE period_type='M'").get().p;
  const sources = [...new Set(venues.map(v => v.figures_source).filter(Boolean))];
  const title = sc.title || (venues.length === 1 ? venues[0].name : 'Your venues');
  return dashboardBuilder.build(venues, ranks, { title, rankRelease: rel,
    source: sources.length === 1 ? sources[0].replace(/\.xlsx$/i, '') + ' weekly figures workbook' : 'weekly figures workbooks' });
}
router.get('/dashboard-data.js', (req, res) => {
  const out = dashboardData(req.user, req.query.scope);
  res.setHeader('Cache-Control', 'no-store');
  if (!out) return res.status(403).type('application/javascript').send('window.EWC_ERROR="You do not have access to those venues.";');
  audit(req.user.id, 'view_dashboard', { scope: req.query.scope });
  res.type('application/javascript').send('window.EWC_DATA=' + JSON.stringify(out.data) + ';window.EWC_RANKS=' + JSON.stringify(out.ranks) + ';');
});

// ---------- AHA NSW monthly rankings: the whole statewide list ----------
router.get('/aha/releases', (req, res) => {
  res.json(db.prepare('SELECT period, title, preliminary, rows_count, report_id, uploaded_at FROM aha_releases ORDER BY period DESC').all());
});
router.get('/aha/release', (req, res) => {
  const rel = req.query.period ? db.prepare('SELECT * FROM aha_releases WHERE period = ?').get(String(req.query.period))
                               : db.prepare('SELECT * FROM aha_releases ORDER BY period DESC LIMIT 1').get();
  if (!rel) return res.json({ release: null, rows: [], mine: [] });
  const mineV = db.prepare(`SELECT v.id, v.name, v.licence, g.name grp FROM venues v JOIN groups g ON g.id = v.group_id
    WHERE v.licence IS NOT NULL AND v.id IN (${venueIdsFor(req.user).map(() => '?').join(',') || 'NULL'})`).all(...venueIdsFor(req.user));
  const byLic = new Map(mineV.map(v => [v.licence, v]));
  const rows = db.prepare('SELECT ytd_rank, name, suburb, lga, licence, values_json FROM aha_rows WHERE release_id = ? ORDER BY ytd_rank').all(rel.id)
    .map(r => [r.ytd_rank, r.name, r.suburb, r.lga, JSON.parse(r.values_json), byLic.has(r.licence) ? byLic.get(r.licence).id : 0]);
  res.json({ release: { period: rel.period, title: rel.title, preliminary: !!rel.preliminary, columns: JSON.parse(rel.columns_json), reportId: rel.report_id },
    rows, mine: mineV.map(v => ({ id: v.id, name: v.name, group: v.grp })) });
});

// ---------- reports ----------
const CAT = { gp_weekly: 'Game Performance · Weekly', gp_monthly: 'Game Performance · Monthly', figures: 'Gaming Figures', rankings: 'Monthly Rankings', resource: 'Resources' };
router.get('/reports', (req, res) => {
  const cat = CAT[req.query.category] ? req.query.category : null;
  const rows = db.prepare(`SELECT r.*, g.name AS group_name, v.name AS venue_name FROM reports r LEFT JOIN groups g ON g.id = r.group_id
     LEFT JOIN venues v ON v.id = r.venue_id ${cat ? 'WHERE r.category = ?' : ''} ORDER BY COALESCE(r.period,'') DESC, r.uploaded_at DESC`).all(...(cat ? [cat] : []));
  // Venue members also see their own venue's part of a whole-group Game Performance report (online only).
  res.json(rows.map(r => ({ r, a: gpLib.access(req.user, r, canSeeReport) })).filter(x => x.a).map(({ r, a }) => ({ id: r.id, title: r.title, category: r.category, categoryLabel: CAT[r.category],
    period: r.period, group: r.group_name || (r.all_members ? 'All members' : ''), venue: r.venue_name, file: r.original_name, size: r.size, uploaded: r.uploaded_at, status: r.status,
    venueMembers: !!r.venue_members_can_see, online: !!r.view_venues, download: a === 'full' })));
});

// The Game Performance table to show online. Venue members get only their own venue's section of a group file.
router.get('/reports/:id/view', (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id));
  const a = gpLib.access(req.user, r, canSeeReport);
  const v = a && r.view_venues != null ? gpLib.readView(r.stored_name) : null;
  if (!v) return res.status(404).json({ error: 'Report not found.' });
  if (a === 'own') { v.sections = v.sections.filter(s => s.venue_id === req.user.venue_id); v.grand = null; v.grandTotal = null; }
  audit(req.user.id, 'view_report', { id: r.id });
  res.json({ id: r.id, title: r.title, category: r.category, period: r.period, download: a === 'full', ...v });
});

router.get('/reports/:id/download', (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id));
  if (!canSeeReport(req.user, r)) return res.status(404).json({ error: 'Report not found.' });   // same answer whether missing or forbidden
  audit(req.user.id, 'download_report', { id: r.id });
  res.download(path.join(DATA_DIR, 'reports', r.stored_name), r.original_name);
});

// ---------- ask a question ----------
router.post('/ask', uploadAttach.single('attachment'), async (req, res) => {
  const b = req.body || {};
  const subject = String(b.subject || '').trim().slice(0, 200), message = String(b.message || '').trim().slice(0, 8000);
  const category = String(b.category || 'General').slice(0, 60);
  if (!subject || !message) return res.status(400).json({ error: 'Please add a subject and a message.' });
  const u = req.user;
  const venueText = u.role === 'admin' ? 'EWC admin' : u.role === 'group' ? u.group_name : `${u.venue_name} (${u.group_name || ''})`.replace(' ()', '');
  const info = db.prepare(`INSERT INTO enquiries (kind, name, email, enquiry_type, subject, message, user_id, venue_text, attachment)
    VALUES ('member',?,?,?,?,?,?,?,?)`).run(u.name, u.email, category, subject, message, u.id, venueText, req.file ? req.file.filename : null);
  const status = await mail.send({
    to: mail.ENQUIRY_TO, replyTo: u.email || undefined,
    subject: `[Member Portal] ${venueText} — ${category}: ${subject}`,
    text: `Member: ${u.name} (${u.username})\nVenue / Account: ${venueText}\nEmail: ${u.email || 'not on file'}\nCategory: ${category}\nSubject: ${subject}\n\n${message}`,
    html: `<p><b>Member:</b> ${esc(u.name)} (${esc(u.username)})<br><b>Venue / Account:</b> ${esc(venueText)}<br><b>Email:</b> ${esc(u.email || 'not on file')}<br><b>Category:</b> ${esc(category)}</p><p><b>${esc(subject)}</b></p><p>${esc(message).replace(/\n/g, '<br>')}</p>`,
    attachments: req.file ? [{ filename: req.file.originalname, path: req.file.path }] : [],
  });
  db.prepare('UPDATE enquiries SET email_status = ? WHERE id = ?').run(status, info.lastInsertRowid);
  res.json({ ok: true, status });
});

router.post('/account/password', (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current || '', u.password_hash || '')) return res.status(400).json({ error: 'Your current password is not right.' });
  const err = setPassword(req.user.id, next);
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true, signedOut: true });
});

// ================= ADMIN =================
const admin = express.Router();
admin.use(requireAdmin);

admin.get('/overview', (req, res) => {
  const one = sql => db.prepare(sql).get();
  res.json({
    groups: db.prepare(`SELECT g.id, g.name, COUNT(v.id) venues FROM groups g LEFT JOIN venues v ON v.group_id = g.id GROUP BY g.id ORDER BY g.name`).all(),
    venues: db.prepare(`SELECT v.id, v.name, v.group_id, g.name grp, (SELECT MAX(week_ending) FROM weekly_figures w WHERE w.venue_id=v.id) latest_week,
       (SELECT MAX(period) FROM rankings r WHERE r.venue_id=v.id AND period_type='M') latest_rank FROM venues v JOIN groups g ON g.id=v.group_id ORDER BY g.name, v.name`).all(),
    counts: { users: one('SELECT COUNT(*) n FROM users').n, reports: one('SELECT COUNT(*) n FROM reports').n,
      enquiries: one('SELECT COUNT(*) n FROM enquiries').n, weeks: one('SELECT COUNT(*) n FROM weekly_figures').n },
    emailConfigured: mail.configured(),
  });
});

admin.get('/users', (req, res) => {
  const T = require('./tools');
  res.json(db.prepare(`SELECT u.id, u.username, u.email, u.name, u.role, u.active, u.must_change, u.last_login, u.created_at, u.tools,
      g.name group_name, v.name venue_name, (u.password_hash IS NOT NULL) has_password
    FROM users u LEFT JOIN groups g ON g.id=u.group_id LEFT JOIN venues v ON v.id=u.venue_id ORDER BY u.role, u.name`).all()
    .map(u => ({ ...u, tools: T.slugsFor(u) })));
});

async function sendInvite(user, purpose) {
  const token = issueToken(user.id, purpose);
  const link = `${SITE()}/set-password?token=${token}`;
  const status = await mail.send({ to: user.email, subject: purpose === 'invite' ? 'Your Elson White Consulting member portal account' : 'Reset your member portal password',
    text: `Hello ${user.name},\n\n${purpose === 'invite' ? 'An account has been set up for you on the Elson White Consulting member portal.' : 'A password reset was requested for your member portal account.'}\n\nYour username: ${user.username}\nSet your password here (link valid ${purpose === 'invite' ? '7 days' : '1 hour'}):\n${link}\n\nIf you did not expect this email, contact admin@elsonwhiteconsulting.com.au.\n\nElson White Consulting`,
    html: `<p>Hello ${esc(user.name)},</p><p>${purpose === 'invite' ? 'An account has been set up for you on the Elson White Consulting member portal.' : 'A password reset was requested for your member portal account.'}</p><p>Your username: <b>${esc(user.username)}</b></p><p><a href="${link}">Set your password</a> (link valid ${purpose === 'invite' ? '7 days' : '1 hour'}).</p><p>If you did not expect this email, contact admin@elsonwhiteconsulting.com.au.</p><p>Elson White Consulting</p>` });
  return { status, link };
}

admin.post('/users', async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ error: 'Username: 3–40 letters, numbers, dots, dashes or underscores.' });
  if (!['admin', 'group', 'venue'].includes(b.role)) return res.status(400).json({ error: 'Choose a role.' });
  const email = String(b.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'That email address does not look right.' });
  const group_id = b.role === 'group' ? Number(b.group_id) : null;
  const venue_id = b.role === 'venue' ? Number(b.venue_id) : null;
  if (b.role === 'group' && !db.prepare('SELECT 1 FROM groups WHERE id=?').get(group_id)) return res.status(400).json({ error: 'Choose the group.' });
  if (b.role === 'venue' && !db.prepare('SELECT 1 FROM venues WHERE id=?').get(venue_id)) return res.status(400).json({ error: 'Choose the venue.' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(400).json({ error: 'That username is taken.' });
  let hash = null, mustChange = 0;
  if (b.method === 'password') {
    if (!b.password || b.password.length < MIN_PASSWORD) return res.status(400).json({ error: `Temporary password: at least ${MIN_PASSWORD} characters.` });
    hash = bcrypt.hashSync(b.password, 12); mustChange = 1;
  } else if (!email) return res.status(400).json({ error: 'An email address is needed to send the set-up link.' });
  const info = db.prepare(`INSERT INTO users (username, email, name, password_hash, role, group_id, venue_id, must_change) VALUES (?,?,?,?,?,?,?,?)`)
    .run(username, email || null, String(b.name || username).trim().slice(0, 100), hash, b.role, group_id, venue_id, mustChange);
  audit(req.user.id, 'user_created', { username, role: b.role });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  let invite = null;
  if (b.method !== 'password') invite = await sendInvite(user, 'invite');
  res.json({ ok: true, id: user.id, invite });
});

admin.post('/users/:id/:action', async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const a = req.params.action;
  if (a === 'deactivate' || a === 'activate') {
    if (u.id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(a === 'activate' ? 1 : 0, u.id);
    if (a === 'deactivate') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  } else if (a === 'send-reset') {
    if (!u.email) return res.status(400).json({ error: 'This user has no email address. Set a temporary password instead.' });
    const r = await sendInvite(u, u.password_hash ? 'reset' : 'invite');
    audit(req.user.id, 'user_reset_sent', { id: u.id });
    return res.json({ ok: true, ...r });
  } else if (a === 'temp-password') {
    const pw = String((req.body || {}).password || '');
    if (pw.length < MIN_PASSWORD) return res.status(400).json({ error: `At least ${MIN_PASSWORD} characters.` });
    db.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').run(bcrypt.hashSync(pw, 12), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  } else if (a === 'tools') {
    // Which of the administrators' tools this person sees under My Tools.
    if (u.role !== 'admin') return res.status(400).json({ error: 'Only administrators have tools.' });
    const T = require('./tools');
    const list = T.clean(Array.isArray((req.body || {}).tools) ? req.body.tools : []);
    db.prepare('UPDATE users SET tools = ? WHERE id = ?').run(list.join(','), u.id);
    audit(req.user.id, 'user_tools', { id: u.id, tools: list });
    return res.json({ ok: true, tools: list });
  } else return res.status(400).json({ error: 'Unknown action.' });
  audit(req.user.id, 'user_' + a, { id: u.id });
  res.json({ ok: true });
});

admin.post('/reports', uploadReport.array('files', 20), (req, res) => {
  const b = req.body || {};
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Add at least one PDF, Excel, Word or PowerPoint file.' });
  if (!CAT[b.category]) return res.status(400).json({ error: 'Choose the report type.' });
  const group_id = Number(b.group_id);
  if (!db.prepare('SELECT 1 FROM groups WHERE id = ?').get(group_id)) return res.status(400).json({ error: 'Choose the group.' });
  const venue_id = b.venue_id ? Number(b.venue_id) : null;
  if (venue_id && !db.prepare('SELECT 1 FROM venues WHERE id = ? AND group_id = ?').get(venue_id, group_id)) return res.status(400).json({ error: 'That venue is not in this group.' });
  const period = String(b.period || '').slice(0, 10) || null;
  const ins = db.prepare(`INSERT INTO reports (title, category, period, group_id, venue_id, venue_members_can_see, original_name, stored_name, mime, size, status, uploaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ids = req.files.map(f => ins.run(
    (b.title && req.files.length === 1 ? b.title : f.originalname.replace(/\.[^.]+$/, '')).slice(0, 200), b.category, period, group_id, venue_id,
    b.venue_members === 'on' || b.venue_members === 'true' ? 1 : 0, f.originalname, f.filename, f.mimetype, f.size,
    b.status === 'draft' ? 'draft' : 'published', req.user.id).lastInsertRowid);
  audit(req.user.id, 'reports_uploaded', { ids, category: b.category, group_id });
  // Game Performance workbooks are also read for the online view (the download stays the original file).
  Promise.all(ids.map(id => gpLib.buildFromUpload(db.prepare('SELECT * FROM reports WHERE id = ?').get(id)).catch(() => null)))
    .then(v => res.json({ ok: true, ids, online: v.filter(Boolean).length }));
});

admin.post('/reports/:id/status', (req, res) => {
  const s = (req.body || {}).status === 'draft' ? 'draft' : 'published';
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(s, Number(req.params.id));
  res.json({ ok: true });
});
admin.delete('/reports/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM reports WHERE id = ?').run(r.id);
  fs.rm(path.join(DATA_DIR, 'reports', r.stored_name), () => {});
  fs.rm(gpLib.viewPath(r.stored_name), () => {});
  audit(req.user.id, 'report_deleted', { id: r.id, file: r.original_name });
  res.json({ ok: true });
});

admin.post('/import/figures', uploadData.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Add the weekly figures workbook (.xlsx or .csv).' });
  let parsed;
  try { parsed = imp.parseFigures(req.file.buffer, Number(req.body.group_id) || null); }
  catch (e) { return res.status(400).json({ error: 'That file could not be read: ' + e.message }); }
  if (!parsed.rows.length) return res.status(400).json({ error: 'No weekly figures found. The first column should be "Date" or "Week ending", then each venue’s turnover and profit columns.', unmatched: parsed.unmatched });
  const summary = { weeks: new Set(parsed.rows.map(r => r.week)).size, rows: parsed.rows.length, venues: parsed.venues, from: parsed.from, to: parsed.to,
    unmatched: parsed.unmatched, warnings: parsed.warnings, notes: parsed.notes };
  if (req.body.confirm !== 'yes') return res.json({ preview: true, ...summary });
  const saved = imp.saveFigures(parsed);
  audit(req.user.id, 'figures_imported', { file: req.file.originalname, saved, from: parsed.from, to: parsed.to });
  res.json({ saved, ...summary });
});

admin.post('/import/rankings', uploadData.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Add the rankings file (.xlsx or .csv).' });
  let parsed;
  try { parsed = imp.parseRankings(req.file.buffer); } catch (e) { return res.status(400).json({ error: 'That file could not be read: ' + e.message }); }
  if (!parsed.rows.length) return res.status(400).json({ error: 'No rankings found. Use columns Venue, Month, Rank (and optionally Type).', unmatched: parsed.unmatched });
  if (req.body.confirm !== 'yes') return res.json({ preview: true, ...parsed, rows: parsed.rows.length });
  const saved = imp.saveRankings(parsed);
  audit(req.user.id, 'rankings_imported', { file: req.file.originalname, saved });
  res.json({ saved, ...parsed, rows: parsed.rows.length });
});

const uploadPdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 }, fileFilter: (req, f, cb) => cb(null, /\.pdf$/i.test(f.originalname)) });
admin.post('/import/aha', uploadPdf.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Add the AHA NSW Gaming Rankings PDF.' });
  let parsed;
  try { parsed = await aha.parseAhaPdf(req.file.buffer); } catch (e) { return res.status(400).json({ error: 'That PDF could not be read: ' + e.message }); }
  if (parsed.rows.length < 50 || !parsed.period) return res.status(400).json({ error: 'This does not look like the AHA NSW Gaming Rankings list (no ranking table found).' });
  const match = aha.matchRows(parsed);
  const summary = { title: parsed.title, period: parsed.period, preliminary: parsed.preliminary, columns: parsed.columns, hotels: parsed.rows.length,
    replaces: !!db.prepare('SELECT 1 FROM aha_releases WHERE period = ?').get(parsed.period),
    venues: match.venues.filter(m => m.r).map(m => ({ name: m.x.name, ytd: m.r.ytd, values: m.r.values })).sort((a, b) => a.ytd - b.ytd),
    notFound: match.venues.filter(m => !m.r).map(m => m.x.name), competitors: match.competitors.filter(m => m.r).length };
  if (req.body.confirm !== 'yes') return res.json({ preview: true, ...summary });
  const stored = crypto.randomBytes(16).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(DATA_DIR, 'reports', stored), req.file.buffer);
  const old = db.prepare('SELECT report_id FROM aha_releases WHERE period = ?').get(parsed.period);
  if (old && old.report_id) db.prepare("UPDATE reports SET status = 'draft' WHERE id = ?").run(old.report_id);
  const reportId = db.prepare(`INSERT INTO reports (title, category, period, group_id, all_members, original_name, stored_name, mime, size, status, uploaded_by)
    VALUES (?, 'rankings', ?, NULL, 1, ?, ?, 'application/pdf', ?, 'published', ?)`).run(
    'AHA NSW ' + (parsed.preliminary ? 'Preliminary ' : '') + 'Gaming Rankings — ' + parsed.period, parsed.period, req.file.originalname, stored, req.file.size, req.user.id).lastInsertRowid;
  aha.saveRelease(parsed, match, req.user.id, reportId);
  audit(req.user.id, 'aha_release_imported', { period: parsed.period, hotels: parsed.rows.length });
  res.json({ saved: true, ...summary });
});

admin.get('/enquiries', (req, res) => {
  res.json(db.prepare('SELECT id, kind, name, company, email, phone, enquiry_type, subject, message, venue_text, attachment IS NOT NULL has_attachment, email_status, created_at FROM enquiries ORDER BY id DESC LIMIT 200').all());
});
admin.get('/enquiries/:id/attachment', (req, res) => {
  const e = db.prepare('SELECT attachment FROM enquiries WHERE id = ?').get(Number(req.params.id));
  if (!e || !e.attachment) return res.status(404).end();
  res.download(path.join(DATA_DIR, 'attachments', e.attachment));
});

const toolsLib = require('./tools');
admin.get('/tools', (req, res) => res.json(toolsLib.list(req.user)));
admin.get('/tools-all', (req, res) => res.json(toolsLib.TOOLS.map(t => ({ slug: t.slug, name: t.nav }))));
const uploadTool = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 }, fileFilter: (req, f, cb) => cb(null, /\.html?$/i.test(f.originalname)) });
admin.post('/tools/:slug', uploadTool.single('file'), (req, res) => {
  if (!toolsLib.slugsFor(req.user).includes(req.params.slug)) return res.status(403).json({ error: 'That tool is not one of yours.' });
  if (!req.file) return res.status(400).json({ error: 'Choose the tool’s .html file.' });
  try { toolsLib.replace(req.params.slug, req.file.buffer); } catch (e) { return res.status(400).json({ error: e.message }); }
  audit(req.user.id, 'tool_replaced', { slug: req.params.slug, file: req.file.originalname, size: req.file.size });
  res.json({ ok: true, tools: toolsLib.list(req.user) });
});

router.use('/admin', admin);
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : err.message });
  console.error(err); res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

module.exports = router;
module.exports.scopeVenues = scopeVenues;
