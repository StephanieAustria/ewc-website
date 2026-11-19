// Builds a static, click-through preview of the website into ./dist-preview (used for the Claude preview link).
// The preview carries the real figures and rankings and simulates sign-in in the browser, so keep its link private.
//   node scripts/build-preview.js
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const icon = require('../src/icons');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-preview');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });

const PAGES = { '/': 'index.html', '/about': 'about.html', '/services': 'services.html', '/team': 'team.html', '/contact': 'contact.html',
  '/login': 'login.html', '/portal': 'portal.html', '/forgot-password': 'forgot.html', '/logout': 'login.html' };
const href = p => PAGES[p] || p.replace(/^\//, '');

const base = { toolList: require('../src/tools').TOOLS, preview: true, user: null, href, icon, year: new Date().getFullYear(), formToken: () => 'preview', query: {},
  form: {}, errors: [], startedAt: 0, error: null, identifier: '', sent: false };
const render = (view, file, p, extra) => {
  const html = ejs.render(fs.readFileSync(path.join(ROOT, 'views', view + '.ejs'), 'utf8'), { ...base, path: p, ...extra },
    { filename: path.join(ROOT, 'views', view + '.ejs') });
  fs.writeFileSync(path.join(OUT, file), html);
};
render('home', 'index.html', '/', { title: 'Gaming Consultancy & Performance Insights' });
render('about', 'about.html', '/about', { title: 'About Us' });
render('services', 'services.html', '/services', { title: 'Services' });
render('team', 'team.html', '/team', { title: 'Our Team' });
render('contact', 'contact.html', '/contact', { title: 'Contact' });
render('login', 'login.html', '/login', { title: 'Member Login' });
render('forgot', 'forgot.html', '/forgot-password', { title: 'Forgot Password' });
render('portal', 'portal.html', '/portal', { title: 'Member Portal' });

// dist tools: the administrators' tools, for the preview's My Tools pages
fs.mkdirSync(path.join(OUT, 'tools'), { recursive: true });
const toolTheme = require('../src/tool-theme');
for (const f of fs.readdirSync(path.join(ROOT, 'seed', 'tools')).filter(n => n.endsWith('.html')))
  fs.writeFileSync(path.join(OUT, 'tools', f), toolTheme.theme(f.replace(/\.html$/, ''), fs.readFileSync(path.join(ROOT, 'seed', 'tools', f), 'utf8')));
fs.mkdirSync(path.join(OUT, 'dashboard', 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'public', 'dashboard', 'fonts'))) fs.copyFileSync(path.join(ROOT, 'public', 'dashboard', 'fonts', f), path.join(OUT, 'dashboard', 'fonts', f));
for (const f of ['dc-runtime.js', 'react.production.min.js', 'react-dom.production.min.js']) fs.copyFileSync(path.join(ROOT, 'public', 'dashboard', f), path.join(OUT, 'dashboard', f));
fs.writeFileSync(path.join(OUT, 'figures-dashboard.html'), fs.readFileSync(path.join(ROOT, 'views', 'dashboard-template.html'), 'utf8')
  .replace(/__BASE__/g, '').replace('__DATA_SCRIPTS__', '<script src="preview-data.js"></script><script src="js/preview-api.js"></script><script src="js/ewc-dashboard-data.js"></script><script src="js/dashboard-preview.js"></script>'));
for (const f of ['css/site.css', 'css/portal.css', 'js/site.js', 'js/portal.js', 'js/preview-api.js', 'js/ewc-dashboard-data.js', 'js/dashboard-preview.js', 'img/ewc-lockup.png', 'img/ewc-lockup-dark.png', 'img/ewc-mark.png', 'img/ewc-stacked.png', 'img/favicon.png'])
  fs.copyFileSync(path.join(ROOT, 'public', f), path.join(OUT, f));
const data = JSON.parse(JSON.stringify(require('../seed/ewc-data.json')));
// Licence numbers link venues to the AHA list (they are set when the AHA release is loaded by `npm run seed`).
const { db } = require('../src/db');
const lic = Object.fromEntries(db.prepare('SELECT name, licence FROM venues WHERE licence IS NOT NULL').all().map(r => [r.name, r.licence]));
data.venues.forEach(v => { v.licence = lic[v.name] || null; });
// Ranks in the preview follow the database (Ranking Room history plus the latest AHA release).
for (const v of data.venues) {
  const vid = (db.prepare('SELECT id FROM venues WHERE name = ?').get(v.name) || {}).id;
  if (!vid) continue;
  const rows = db.prepare('SELECT period_type, period, rank FROM rankings WHERE venue_id = ?').all(vid);
  v.rank_monthly = Object.fromEntries(rows.filter(r => r.period_type === 'M').map(r => [r.period, r.rank]));
  v.rank_quarterly = Object.fromEntries(rows.filter(r => r.period_type === 'Q').map(r => [r.period, r.rank]));
}
const ahaFiles = fs.readdirSync(path.join(ROOT, 'seed', 'aha')).filter(n => /^\d{4}-\d{2}\.json$/.test(n)).sort();
if (ahaFiles.length) data.aha = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'aha', ahaFiles.pop()), 'utf8'));
data.tools = require('../src/tools').TOOLS;
// Game Performance reports and their online copies (venue ids follow the preview's own venue list, matched by name).
{
  const gpLib = require('../src/gp');
  const pid = Object.fromEntries(data.venues.map((v, i) => [v.name, i + 1]));   // preview-api numbers venues 1, 2, 3… in this order
  const dbName = Object.fromEntries(db.prepare('SELECT id, name FROM venues').all().map(r => [r.id, r.name]));
  const reps = db.prepare(`SELECT r.*, g.name AS group_name, v.name AS venue_name FROM reports r LEFT JOIN groups g ON g.id = r.group_id
    LEFT JOIN venues v ON v.id = r.venue_id WHERE r.category IN ('gp_weekly','gp_monthly') AND r.view_venues IS NOT NULL AND r.status = 'published'
    ORDER BY r.period DESC`).all();
  data.gpReports = []; data.gpViews = {};
  for (const r of reps) {
    const v = gpLib.readView(r.stored_name); if (!v) continue;
    v.sections.forEach(s => { s.venue_id = s.venue_id ? pid[dbName[s.venue_id]] || null : null; });
    data.gpViews[r.id] = v;
    data.gpReports.push({ id: r.id, title: r.title, category: r.category, period: r.period, group: r.group_name, venue: r.venue_name, file: r.original_name, size: r.size,
      venues: [...new Set(v.sections.map(s => s.venue_id).filter(Boolean))] });
  }
}
fs.writeFileSync(path.join(OUT, 'preview-data.js'), 'window.EWC_PREVIEW_DATA=' + JSON.stringify(data) + ';');

// The published front page is wrapped in its own document skeleton, so index.html is written without one.
const idx = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')
  .replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<body>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '')
  .replace(/<title>[^<]*<\/title>/, '<title>Elson White Consulting</title>');
fs.writeFileSync(path.join(OUT, 'index.html'), idx);
console.log('Preview built in', OUT, fs.readdirSync(OUT));
