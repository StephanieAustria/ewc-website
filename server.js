// Elson White Consulting — website and member portal.
//   npm start            (after `npm run seed` once)
require('./src/env');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { db, audit } = require('./src/db');
const auth = require('./src/auth');
const mail = require('./src/mail');
const api = require('./src/api');

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'", 'data:'], frameAncestors: ["'none'"],
    formAction: ["'self'"], upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
  } },
  crossOriginEmbedderPolicy: false,
}));
app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(auth.loadUser);

// Static files. The public folder holds only the website's own assets — never reports or data.
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', index: false }));
app.get('/vendor/chart.umd.min.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'), { maxAge: '30d' }));

// Values every page template can use.
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.year = new Date().getFullYear();
  res.locals.preview = false;
  res.locals.icon = require('./src/icons');
  res.locals.toolList = require('./src/tools').TOOLS;
  res.locals.href = p => p;
  res.locals.path = req.path;
  res.locals.formToken = () => auth.formToken(req, res);
  next();
});

// ---------------- public website ----------------
const page = (view, title, extra = {}) => (req, res) => res.render(view, { title, ...extra, query: req.query });
app.get('/', page('home', 'Gaming Consultancy & Performance Insights'));
app.get('/about', page('about', 'About Us'));
app.get('/services', page('services', 'Services'));
app.get('/team', page('team', 'Our Team'));
app.get('/contact', (req, res) => res.render('contact', { title: 'Contact', query: req.query, form: {}, errors: [], startedAt: Date.now() }));

// Contact form → admin@elsonwhiteconsulting.com.au (spam checks: hidden field, minimum fill time, per-IP limit).
const contactHits = new Map();
const TYPES = ['Gaming Consultancy', 'Gaming Performance Reporting', 'Gaming Room Design', 'General Enquiry', 'Other'];
app.post('/contact', async (req, res) => {
  const b = req.body || {};
  const form = { name: (b.name || '').trim(), company: (b.company || '').trim(), email: (b.email || '').trim(), phone: (b.phone || '').trim(),
    type: b.type || '', subject: (b.subject || '').trim(), message: (b.message || '').trim() };
  const errors = [];
  if (!auth.checkFormToken(req)) errors.push('Your form expired. Please send it again.');
  if (!form.name) errors.push('Please enter your full name.');
  if (!form.company) errors.push('Please enter your company or venue.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errors.push('Please enter a valid email address.');
  if (!TYPES.includes(form.type)) errors.push('Please choose an enquiry type.');
  if (!form.subject) errors.push('Please enter a subject.');
  if (form.message.length < 5) errors.push('Please enter a message.');
  const bot = b.website || (Date.now() - Number(b.startedAt || 0) < 2500);
  const ip = req.ip; const hits = (contactHits.get(ip) || []).filter(t => Date.now() - t < 3600e3);
  if (hits.length >= 5) errors.push('Too many enquiries from this connection. Please email admin@elsonwhiteconsulting.com.au directly.');
  if (errors.length) return res.status(400).render('contact', { title: 'Contact', query: {}, form, errors, startedAt: Date.now() });
  if (bot) return res.redirect('/contact?sent=1');            // quietly drop likely spam
  hits.push(Date.now()); contactHits.set(ip, hits);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const info = db.prepare(`INSERT INTO enquiries (kind, name, company, email, phone, enquiry_type, subject, message) VALUES ('public',?,?,?,?,?,?,?)`)
    .run(form.name.slice(0, 120), form.company.slice(0, 160), form.email.slice(0, 160), form.phone.slice(0, 40), form.type, form.subject.slice(0, 200), form.message.slice(0, 8000));
  const status = await mail.send({
    to: mail.ENQUIRY_TO, replyTo: form.email,
    subject: `[Website enquiry] ${form.type}: ${form.subject}`,
    text: `Name: ${form.name}\nCompany / Venue: ${form.company}\nEmail: ${form.email}\nPhone: ${form.phone || '—'}\nEnquiry type: ${form.type}\nSubject: ${form.subject}\n\n${form.message}`,
    html: `<p><b>Name:</b> ${esc(form.name)}<br><b>Company / Venue:</b> ${esc(form.company)}<br><b>Email:</b> ${esc(form.email)}<br><b>Phone:</b> ${esc(form.phone || '—')}<br><b>Enquiry type:</b> ${esc(form.type)}</p><p><b>${esc(form.subject)}</b></p><p>${esc(form.message).replace(/\n/g, '<br>')}</p>`,
  });
  db.prepare('UPDATE enquiries SET email_status = ? WHERE id = ?').run(status, info.lastInsertRowid);
  res.redirect('/contact?sent=1');
});

// ---------------- sign in / accounts ----------------
const safeNext = n => (typeof n === 'string' && /^\/portal(\/|$|#|\?)/.test(n) ? n : '/portal');
app.get('/login', (req, res) => req.user ? res.redirect('/portal') : res.render('login', { title: 'Member Login', error: null, query: req.query, identifier: '' }));
app.post('/login', (req, res) => {
  const { identifier, password, remember } = req.body || {};
  if (!auth.checkFormToken(req)) return res.status(400).render('login', { title: 'Member Login', error: 'Your form expired. Please try again.', query: {}, identifier });
  const r = auth.verifyLogin(String(identifier || '').trim(), password, req.ip);
  if (r.error) return res.status(401).render('login', { title: 'Member Login', error: r.error, query: {}, identifier });
  auth.createSession(res, r.user, remember === 'on');
  res.redirect(safeNext(req.query.next));
});
app.post('/logout', (req, res) => { auth.destroySession(req, res); res.redirect('/login?out=1'); });

app.get('/forgot-password', (req, res) => res.render('forgot', { title: 'Forgot Password', sent: false }));
app.post('/forgot-password', async (req, res) => {
  const id = String((req.body || {}).identifier || '').trim();
  if (auth.checkFormToken(req) && id) {
    const u = db.prepare('SELECT * FROM users WHERE (username = ? OR email = ?) AND active = 1').get(id, id);
    if (u && u.email) {
      const token = auth.issueToken(u.id, 'reset');
      const link = `${process.env.SITE_URL || 'http://localhost:' + PORT}/set-password?token=${token}`;
      await mail.send({ to: u.email, subject: 'Reset your member portal password',
        text: `Hello ${u.name},\n\nUse this link within 1 hour to set a new password:\n${link}\n\nYour username: ${u.username}\n\nIf you did not ask for this, ignore this email.\n\nElson White Consulting` });
      audit(u.id, 'reset_requested');
    }
  }
  res.render('forgot', { title: 'Forgot Password', sent: true });   // same answer either way
});

app.get('/set-password', (req, res) => {
  const t = auth.readToken(req.query.token);
  const u = t && db.prepare('SELECT username, name FROM users WHERE id = ?').get(t.user_id);
  res.render('set-password', { title: 'Set Your Password', valid: !!t, token: req.query.token || '', u, error: null, min: auth.MIN_PASSWORD });
});
app.post('/set-password', (req, res) => {
  const { token, password, confirm } = req.body || {};
  const t = auth.readToken(token);
  const u = t && db.prepare('SELECT username, name FROM users WHERE id = ?').get(t.user_id);
  const render = error => res.status(400).render('set-password', { title: 'Set Your Password', valid: !!t, token, u, error, min: auth.MIN_PASSWORD });
  if (!t) return render('This link has expired or was already used. Ask EWC for a new one.');
  if (!auth.checkFormToken(req)) return render('Your form expired. Please try again.');
  if (password !== confirm) return render('The two passwords do not match.');
  const err = auth.setPassword(t.user_id, password);
  if (err) return render(err);
  auth.useToken(token);
  res.redirect('/login?set=1');
});

// ---------------- member portal ----------------
// The Executive Performance Dashboard page, shown inside the portal's Gaming Figures section.
const DASH = require('fs').readFileSync(path.join(__dirname, 'views', 'dashboard-template.html'), 'utf8');
app.get('/portal/figures-view', auth.requireUser, (req, res) => {
  const scope = String(req.query.scope || 'all');
  if (!api.scopeVenues(req.user, scope)) return res.status(403).send('You do not have access to those venues.');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(DASH.replace(/__BASE__/g, '/').replace('__DATA_SCRIPTS__',
    `<script src="/api/dashboard-data.js?scope=${encodeURIComponent(scope)}"></script>`));
});
// Administrators' tools (EMAIL Generator, Ranking Tools, Game Performance), never shown to members.
const tools = require('./src/tools');
app.get('/tools/:slug', auth.requireUser, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send('Administrators only.');
  const t = tools.TOOLS.find(x => x.slug === req.params.slug);
  if (!t) return res.status(404).send('Tool not found.');
  if (!tools.slugsFor(req.user).includes(t.slug)) return res.status(403).send('That tool is not in your My Tools.');
  res.setHeader('Content-Security-Policy', tools.CSP);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(require('./src/tool-theme').theme(t.slug, require('fs').readFileSync(tools.file(t.slug), 'utf8')));
});
app.get('/portal', auth.requireUser, (req, res) => res.render('portal', { title: 'Member Portal' }));
app.use('/api', api);

app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /portal\nDisallow: /api\nAllow: /\n'));
app.use((req, res) => res.status(404).render('404', { title: 'Page not found' }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`EWC website running on http://localhost:${PORT}  (email ${mail.configured() ? 'configured' : 'not configured — saved to data/outbox'})`));
}
module.exports = app;
