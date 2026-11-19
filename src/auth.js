// Sign-in, sessions, CSRF and role checks.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, audit } = require('./db');

const COOKIE = 'ewc_sid';
const SHORT_MS = 12 * 3600 * 1000;      // normal session: 12 hours
const LONG_MS = 30 * 24 * 3600 * 1000;  // "Remember me": 30 days
const PROD = process.env.NODE_ENV === 'production';
const MIN_PASSWORD = 10;

const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---- brute-force protection (per IP + username) ----
const failures = new Map();
function tooManyAttempts(key) {
  const f = failures.get(key);
  return f && f.count >= 5 && Date.now() - f.last < 15 * 60 * 1000;
}
function noteFailure(key) {
  const f = failures.get(key) || { count: 0, last: 0 };
  if (Date.now() - f.last > 15 * 60 * 1000) f.count = 0;
  f.count++; f.last = Date.now(); failures.set(key, f);
}

function cookieOpts(maxAge) {
  return { httpOnly: true, sameSite: 'lax', secure: PROD, path: '/', ...(maxAge ? { maxAge } : {}) };
}

function createSession(res, user, remember) {
  const id = rand(32);
  const ms = remember ? LONG_MS : SHORT_MS;
  db.prepare('INSERT INTO sessions (id, user_id, csrf, expires) VALUES (?,?,?,?)').run(sha(id), user.id, rand(24), Date.now() + ms);
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  res.cookie(COOKIE, id, cookieOpts(remember ? ms : undefined));
}

function destroySession(req, res) {
  const id = req.cookies[COOKIE];
  if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(id));
  res.clearCookie(COOKIE, { path: '/' });
}

// Attaches req.user and req.csrf when a valid session cookie is present.
function loadUser(req, res, next) {
  const id = req.cookies[COOKIE];
  if (id) {
    const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sha(id));
    if (s && s.expires > Date.now()) {
      const u = db.prepare(`SELECT u.id, u.username, u.email, u.name, u.role, u.group_id, u.venue_id, u.active, u.must_change, u.tools,
          g.name AS group_name, v.name AS venue_name
        FROM users u LEFT JOIN groups g ON g.id = u.group_id LEFT JOIN venues v ON v.id = u.venue_id
        WHERE u.id = ?`).get(s.user_id);
      if (u && u.active) { req.user = u; req.csrf = s.csrf; }
    } else if (s) db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);
  }
  next();
}

function verifyLogin(identifier, password, ip) {
  const key = `${ip}|${(identifier || '').toLowerCase()}`;
  if (tooManyAttempts(key)) return { error: 'Too many attempts. Please wait 15 minutes and try again.' };
  const u = db.prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND active = 1').get(identifier, identifier);
  if (!u || !u.password_hash || !bcrypt.compareSync(password || '', u.password_hash)) {
    noteFailure(key); audit(u && u.id, 'login_failed', { identifier });
    return { error: 'That username or password is not right.' };
  }
  failures.delete(key); audit(u.id, 'login');
  return { user: u };
}

function setPassword(userId, password) {
  if (!password || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  db.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').run(bcrypt.hashSync(password, 12), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);   // sign out everywhere
  audit(userId, 'password_set');
  return null;
}

// One-time links for "set up your account" (7 days) and "forgot password" (1 hour).
function issueToken(userId, purpose) {
  const token = rand(32);
  const ms = purpose === 'invite' ? 7 * 24 * 3600 * 1000 : 3600 * 1000;
  db.prepare('INSERT INTO password_tokens (token_hash, user_id, purpose, expires) VALUES (?,?,?,?)').run(sha(token), userId, purpose, Date.now() + ms);
  return token;
}
function readToken(token) {
  if (!token) return null;
  const t = db.prepare('SELECT * FROM password_tokens WHERE token_hash = ?').get(sha(token));
  if (!t || t.used || t.expires < Date.now()) return null;
  return t;
}
function useToken(token) { db.prepare('UPDATE password_tokens SET used = 1 WHERE token_hash = ?').run(sha(token)); }

// ---- guards ----
function requireUser(req, res, next) {
  if (!req.user) {
    if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in.' });
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Administrators only.' });
  next();
}
// State-changing API calls must carry the session's CSRF token.
function requireCsrf(req, res, next) {
  const t = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (!req.csrf || !t || t !== req.csrf) return res.status(403).json({ error: 'Your session expired. Refresh the page and try again.' });
  next();
}
// Anonymous forms (contact, login, password) use a double-submit cookie.
function formToken(req, res) {
  let t = req.cookies.ewc_form;
  if (!t) { t = rand(18); res.cookie('ewc_form', t, cookieOpts()); }
  return t;
}
function checkFormToken(req) {
  return req.cookies.ewc_form && req.body && req.body._form === req.cookies.ewc_form;
}

module.exports = { createSession, destroySession, loadUser, verifyLogin, setPassword, issueToken, readToken, useToken,
  requireUser, requireAdmin, requireCsrf, formToken, checkFormToken, MIN_PASSWORD };
