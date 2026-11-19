// Stephanie's working tools, available to administrators inside the portal.
// The built-in copies live in seed/tools; a newer version uploaded in the portal is kept in DATA_DIR/tools and wins.
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

// nav = the sidebar label, icon = one of src/icons.js.
const TOOLS = [
  { slug: 'client-tools', nav: 'Client Tools', icon: 'desk', name: 'EWC Client Tools', description: 'Game Performance tables per venue (turnover and profit ranks, floor average and bottom 20% lines, Excel and PDF) and the QuickChange Email Maker.' },
  { slug: 'quickchange-email', nav: 'QuickChange Email', icon: 'send', name: 'QuickChange Email', description: 'MAXsys QuickChange Authorisation Reports to ready-to-paste venue emails, sorted into installations, disposals and conversions, with floor numbers from the Clearance Report.' },
  { slug: 'email-generator', nav: 'EMAIL Generator', icon: 'mail', name: 'EMAIL Generator Tools', description: 'Invoice emails, Game Performance clean-up (Game Performance, Net Meter and EGM dumps to the EWC Excel), weekly figures email and QuickChange emails.' },
  { slug: 'ranking-tools', nav: 'Ranking Tools', icon: 'trophy', name: 'EWC Ranking Tools', description: 'AHA ranking graphs, ranking extraction, preliminary rankings and ranking emails, with Excel, PDF and PowerPoint exports.' },
  { slug: 'game-performance', nav: 'GP Report tool', icon: 'analysis', name: 'EWC Game Performance', description: 'Monthly Game Performance report from the raw Maxgaming, Current EGM and Net Meter dumps: Full Report or Machine Performance Only.' },
];
// Each administrator has their own set of tools (users.tools, comma-separated). Without one they get the standard set.
const STANDARD = ['email-generator', 'ranking-tools', 'game-performance'];
const DIRECTOR = ['client-tools', 'quickchange-email', 'ranking-tools'];
function slugsFor(user) {
  if (!user || user.role !== 'admin') return [];
  const own = String(user.tools || '').split(',').map(s => s.trim()).filter(s => TOOLS.some(t => t.slug === s));
  return user.tools != null && user.tools !== '' ? own : STANDARD.slice();
}
function forUser(user) { const s = slugsFor(user); return TOOLS.filter(t => s.includes(t.slug)); }
function clean(list) { return TOOLS.map(t => t.slug).filter(s => (list || []).includes(s)); }
const UPLOADED = path.join(DATA_DIR, 'tools');
fs.mkdirSync(UPLOADED, { recursive: true });
const BUILTIN = path.join(__dirname, '..', 'seed', 'tools');

function file(slug) {
  const up = path.join(UPLOADED, slug + '.html');
  return fs.existsSync(up) ? up : path.join(BUILTIN, slug + '.html');
}
function list(user) {
  return (user ? forUser(user) : TOOLS).map(t => { const f = file(t.slug); const st = fs.existsSync(f) ? fs.statSync(f) : null;
    return { ...t, updated: st ? st.mtime.toISOString() : null, size: st ? st.size : 0, custom: f.startsWith(UPLOADED) }; });
}
function replace(slug, buffer) {
  if (!TOOLS.some(t => t.slug === slug)) throw new Error('Unknown tool.');
  const head = buffer.slice(0, 4000).toString('utf8');
  if (!/<html|<!doctype/i.test(head)) throw new Error('That file is not an HTML page.');
  const target = path.join(UPLOADED, slug + '.html');
  if (fs.existsSync(target)) fs.copyFileSync(target, path.join(UPLOADED, slug + '.previous.html'));
  fs.writeFileSync(target, buffer);
}
// Tools load their libraries from these CDNs and save files in the browser.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; " +
  "connect-src 'self' data: blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; worker-src 'self' blob: data:; frame-ancestors 'self'";
module.exports = { TOOLS, STANDARD, DIRECTOR, slugsFor, forUser, clean, file, list, replace, CSP };
