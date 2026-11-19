// Packs the click-through preview (dist-preview) into ONE self-contained HTML file:
// every page, the portal, the performance dashboard, fonts, logo, Chart.js and the data, all inline.
//   node scripts/build-preview.js && node scripts/build-single.js
// Writes dist-single/EWC-Website-Preview.html (open in any browser) and dist-single/artifact.html (for the Claude link).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'dist-preview');
const OUT = path.join(ROOT, 'dist-single');
fs.mkdirSync(OUT, { recursive: true });
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const b64 = (f, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(SRC, f)).toString('base64');
const safeScript = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const IMG = {};
for (const f of fs.readdirSync(path.join(SRC, 'img'))) IMG['img/' + f] = b64('img/' + f, 'image/png');
const imgs = html => html.replace(/(src|href)="(img\/[^"]+)"/g, (m, a, p) => IMG[p] ? `${a}="${IMG[p]}"` : m);

// Page links become in-page addresses.
const LINKS = { 'index.html': '#home', 'about.html': '#about', 'services.html': '#services', 'team.html': '#team',
  'contact.html': '#contact', 'login.html': '#login', 'forgot.html': '#forgot', 'portal.html': '#/dashboard' };
const links = html => html.replace(/(href|action)="([a-z-]+\.html)(\?[^"#]*)?"/g, (m, a, p) => LINKS[p] ? `${a}="${LINKS[p]}"` : m);

const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); return i < 0 || j < 0 ? '' : s.slice(i + a.length, j); };
const body = html => between(html, '<body', '</body>').replace(/^[^>]*>/, '');
const stripScripts = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

// ---------- public pages: shared header and footer, one section per page ----------
const home = read('index.html');
const header = between(home, '<header class="site-header">', '</header>');
const footer = between(home, '<footer class="site-footer">', '</footer>');
const mainOf = html => between(html, '<main id="main">', '</main>');
const pages = { home: mainOf(home), about: mainOf(read('about.html')), services: mainOf(read('services.html')),
  team: mainOf(read('team.html')), contact: mainOf(read('contact.html')) };
const authBody = f => stripScripts(body(read(f))).replace('<main class="auth" id="main">', '<div class="auth">').replace(/<\/main>\s*$/, '</div>');
const login = authBody('login.html');
const forgot = authBody('forgot.html').replace(/id="identifier"/, 'id="f-identifier"').replace(/for="identifier"/, 'for="f-identifier"');
const portal = stripScripts(body(read('portal.html')));

// ---------- the performance dashboard, as its own document shown in the Gaming Figures frame ----------
let dash = read('figures-dashboard.html');
dash = dash.replace(/url\("dashboard\/fonts\/([^"]+)"\)/g, (m, f) => `url("${b64('dashboard/fonts/' + f, 'font/woff2')}")`);
dash = imgs(dash);
dash = dash.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
  if (f === 'preview-data.js' || f === 'js/preview-api.js') return '';
  if (f === 'js/dashboard-preview.js') return '<script>window.EWC_API=parent.EWC_API;window.EWC_PREVIEW_DATA=parent.EWC_PREVIEW_DATA;window.EWC_SCOPE="__SCOPE__";</script>\n<script>' +
    safeScript(read(f).replace("var scope = (location.hash || '').slice(1) || 'all';", "var scope = window.EWC_SCOPE || 'all';")) + '</script>';
  return '<script>' + safeScript(read(f)) + '</script>';
});

// ---------- scripts, patched to move between in-page sections instead of files ----------
// A fresh start on every sign-in and sign-out, so a second login never sees the first person's view.
let previewApi = read('js/preview-api.js').replace("location.href = 'portal.html';", "location.hash = '#/dashboard'; location.reload();");
let portalJs = read('js/portal.js')
  .replace("location.href = PREVIEW ? 'login.html' : '/login?set=1';", "location.hash = '#login'; location.reload();")
  .replace("location.href = 'login.html?out=1';", "location.hash = '#login'; location.reload();")
  .replace("if (PREVIEW && /sign in/i.test(e.message)) { location.href = 'login.html'; return; }", "if (PREVIEW && /sign in/i.test(e.message)) { location.hash = '#login'; return; }")
  .replace("    var h = location.hash.replace(/^#\\/?/, ''),", "    if (location.hash.indexOf('#/') !== 0) return;\n    var h = location.hash.replace(/^#\\/?/, ''),")
  .replace(`'<div class="fig-frame-wrap"><p class="muted fig-loading">Loading your performance dashboard…</p><iframe id="fig-frame" title="Executive Performance Dashboard" src="' + src + '"></iframe></div>');`,
           `'<div class="fig-frame-wrap"><p class="muted fig-loading">Loading your performance dashboard…</p><iframe id="fig-frame" title="Executive Performance Dashboard"></iframe></div>');\n    $('#fig-frame').srcdoc = window.EWC_DASH_HTML.replace('__SCOPE__', cur.id);`)
  .replace(/^(\/\*[^\n]*\*\/\s*)?\(function \(\) \{/, '$1window.EWC_START_PORTAL = function () {').replace(/\}\)\(\);\s*$/, '};');
for (const [label, s, must] of [['login redirect', previewApi, "location.hash = '#/dashboard'; location.reload();"], ['logout', portalJs, "location.hash = '#login'; location.reload();"], ['dashboard frame', portalJs, 'EWC_DASH_HTML'], ['route guard', portalJs, "indexOf('#/') !== 0"], ['lazy start', portalJs, 'EWC_START_PORTAL']])
  if (!s.includes(must)) throw new Error('Could not patch ' + label);

const chartJs = fs.readFileSync(path.join(ROOT, 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'), 'utf8');
const css = read('css/site.css') + '\n' + read('css/portal.css') + `
/* single-file page switching */
[data-page]{display:none}
body.show-home [data-page=home],body.show-about [data-page=about],body.show-services [data-page=services],body.show-team [data-page=team],body.show-contact [data-page=contact],
body.show-login [data-page=login],body.show-forgot [data-page=forgot],body.show-portal [data-page=portal]{display:block}
body.show-login .site-header,body.show-login .site-footer,body.show-forgot .site-header,body.show-forgot .site-footer,
body.show-portal .site-header,body.show-portal .site-footer{display:none}
body.show-portal{background:#F7F5F0;color:#141414;font-size:15.5px}
.preview-ribbon{background:#2a2210;color:#f1e3bd;border-bottom:1px solid #6b5626;font-size:13.5px;padding:8px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));text-align:center}
body.show-portal .preview-ribbon{display:none}`;

const router = `
(function () {
  var PAGES = ['home', 'about', 'services', 'team', 'contact', 'login', 'forgot'], started = false;
  function show() {
    var h = location.hash || '#home', name = h.indexOf('#/') === 0 ? 'portal' : h.slice(1).split('?')[0];
    if (name !== 'portal' && PAGES.indexOf(name) < 0) name = 'home';
    document.body.className = document.body.className.replace(/\\bshow-\\S+/g, '').trim() + ' show-' + name;
    document.querySelectorAll('.site-header .nav a').forEach(function (a) {
      var t = a.getAttribute('href'); if (t === '#' + name || (name === 'portal' && t === '#/dashboard')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var nav = document.getElementById('nav'); if (nav) nav.classList.remove('open');
    if (name === 'portal' && !started) { started = true; window.EWC_START_PORTAL(); }
    if (name !== 'portal') window.scrollTo(0, 0);
    var t = { home: 'Elson White Consulting', about: 'About Us', services: 'Services', team: 'Our Team', contact: 'Contact', login: 'Member Login', forgot: 'Forgot Password', portal: 'Member Portal' }[name];
    document.title = name === 'home' ? 'Elson White Consulting' : t + ' | Elson White Consulting';
  }
  window.addEventListener('hashchange', show);
  show();
})();`;

const content = `<title>Elson White Consulting</title>
<meta name="description" content="Elson White Consulting website and member portal — preview.">
<link rel="icon" href="${IMG['img/favicon.png']}">
<style>${css}</style>
<div class="preview-ribbon">Preview of the Elson White Consulting website · Member Login: westrydehotel / wrh123 (venue) · Stephanie.EWC / stephanie123 or candice.elsonwhite / preview-admin (admin)</div>
<header class="site-header">${links(imgs(header))}</header>
<main id="main">
${Object.entries(pages).map(([k, v]) => `<div data-page="${k}">${links(imgs(v))}</div>`).join('\n')}
</main>
<footer class="site-footer">${links(imgs(footer))}</footer>
<div data-page="login">${links(imgs(login))}</div>
<div data-page="forgot">${links(imgs(forgot))}</div>
<div data-page="portal">${links(imgs(portal))}</div>
<script>${safeScript(chartJs)}</script>
<script>${safeScript(read('preview-data.js'))}</script>
<script>window.EWC_DASH_HTML=${JSON.stringify(dash).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--')};</script>
<script>window.EWC_TOOL_HTML={${fs.readdirSync(path.join(SRC, 'tools')).map(f => JSON.stringify(f.replace(/\.html$/, '')) + ':' + JSON.stringify(read('tools/' + f)).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--')).join(',')}};</script>
<script>${safeScript(previewApi)}</script>
<script>${safeScript(read('js/site.js'))}</script>
<script>${safeScript(portalJs)}</script>
<script>${router}</script>
`;
fs.writeFileSync(path.join(OUT, 'artifact.html'), content);
fs.writeFileSync(path.join(OUT, 'EWC-Website-Preview.html'), `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${content}</body>
</html>
`);
console.log('Single file:', (fs.statSync(path.join(OUT, 'EWC-Website-Preview.html')).size / 1048576).toFixed(2), 'MB');
