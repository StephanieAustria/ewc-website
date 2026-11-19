// Gives Stephanie's tools the website's light EWC look and the new EWC logo, without editing the tools themselves.
// Applied every time a tool is served, so a newer version uploaded through "Replace with newer version" is themed too.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const uri = (f, mime) => `data:${mime};base64,` + fs.readFileSync(path.join(ROOT, f)).toString('base64');
let A = null;
function assets() {
  if (!A) A = {
    lockup: uri('public/img/ewc-lockup-dark.png', 'image/png'),
    crest: fs.readFileSync(path.join(ROOT, 'seed', 'tools', 'ewc-crest.jpg')).toString('base64'),
  };
  return A;
}

const FONT_BODY = '"Aptos","Segoe UI",Calibri,"Helvetica Neue",Arial,sans-serif';
const FONT_HEAD = '"Aptos Display","Aptos","Segoe UI Variable Display","Segoe UI",Calibri,"Helvetica Neue",Arial,sans-serif';

// The website's palette: warm white page, white panels, black type, gold accents.
const BASE = `
html:root{color-scheme:light!important}
body{background:#F7F5F0!important;font-family:${FONT_BODY}!important;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:${FONT_HEAD}}
:focus-visible{outline:2px solid #C5A04A;outline-offset:2px}
`;

function css(slug, a) {
  if (slug === 'email-generator') return BASE + `
html:root{--gold:#C5A04A!important;--gold-d:#8A6A1F!important;--gold-soft:#F6EEDC!important;--ink:#141414!important;--paper:#FFFFFF!important;
  --muted:#6B655A!important;--line:#E2DACB!important;--soft:#F7F5F0!important;--soft2:#FBF9F4!important}
.top{background:#FFFFFF!important;color:#141414!important;border-bottom:3px solid #C5A04A!important;box-shadow:0 1px 2px rgba(60,45,10,.06)}
.top .brand small{display:none!important}
.top .brand::before{content:"";display:block;width:170px;height:36px;margin-bottom:4px;background:url("${a.lockup}") left center/contain no-repeat}
.top .brand b{color:#141414}
.top .btn{border-color:#C5A04A!important;color:#8A6A1F!important;background:#FFFFFF!important}
.top .btn:hover{background:#F6EEDC!important;color:#141414!important}
.btn.primary{background:#C5A04A!important;color:#1a1408!important;border-color:#C5A04A!important}
.btn.primary:hover{background:#E5C16B!important}
.btn{border-radius:4px!important}
.home .card,.cards .card{border-color:#E2DACB!important;border-radius:6px;box-shadow:0 1px 2px rgba(60,45,10,.05)}
.home .card:hover,.cards .card:hover{border-color:#C5A04A!important}
`;
  if (slug === 'game-performance') return BASE + `
html:root{
  --ink:#141414!important;--ink-soft:#4a453b!important;--ink-faint:#8a8274!important;--paper:#F7F5F0!important;--surface:#FFFFFF!important;
  --surface-sunken:#EFEAE0!important;--surface-hover:#FBF9F4!important;--line:#E2DACB!important;--line-strong:#CFC4AE!important;
  --brand:#9C7A2E!important;--brand-ink:#FFFFFF!important;--brand-soft:#F6EEDC!important;--brand-soft-line:#E4D3A6!important;
  --good:#0f7d6c!important;--good-soft:#e4f4f0!important;--warn:#9a6a10!important;--warn-soft:#faf1de!important;--critical:#b23b3b!important;--critical-soft:#fbeaea!important;
  --mfr-konami:#007a2e!important;--mfr-aristocrat:#2a78d6!important;--mfr-lnw:#d1447c!important;--mfr-unknown:#74716a!important;
  --mfr-konami-soft:#e4f3e8!important;--mfr-aristocrat-soft:#e6f0fc!important;--mfr-lnw-soft:#fbe9f0!important;--mfr-unknown-soft:#eeede9!important;
  --shadow-sm:0 1px 2px rgba(60,45,10,.06)!important;--shadow-md:0 6px 20px -6px rgba(60,45,10,.18)!important;--shadow-lg:0 20px 48px -12px rgba(60,45,10,.25)!important;
  --font-display:${FONT_HEAD}!important;--font-body:${FONT_BODY}!important}
.masthead{background:#FFFFFF!important;border-bottom:3px solid #C5A04A!important}
.brandmark .mark{width:170px!important;height:38px!important;border-radius:0!important;box-shadow:none!important;color:transparent!important;font-size:0!important;
  background:url("${a.lockup}") left center/contain no-repeat!important}
.brandmark .word{padding-left:14px;border-left:1px solid #E2DACB}
.brandmark .word span{display:none!important}
.btn{border-radius:4px!important}
.btn:not(.ghost){color:#FFFFFF}
`;
  if (slug === 'ranking-tools') return BASE + `
html:root{
  --bg:#F7F5F0!important;--panel:#FFFFFF!important;--panel2:#FBF9F4!important;--line:#E2DACB!important;--grid:#ECE6D8!important;
  --gold:#C5A04A!important;--gold2:#8A6A1F!important;--golddim:#E2D2A6!important;--goldfill:#C5A04A!important;
  --ink:#141414!important;--ink2:#4a453b!important;--muted:#6B655A!important;--good:#1f7a4a!important;--bad:#b23b2b!important;
  --title:${FONT_HEAD}!important;--body:${FONT_BODY}!important}
/* the slide previews show the PowerPoint exactly as exported, so they keep its black-and-gold look */
.slide{--bg:#070707;--panel:#131313;--panel2:#1a1a1a;--line:#2a2a2a;--grid:#222222;--gold:#d4af37;--gold2:#e8c65a;--golddim:#5a4a17;--goldfill:#d4af37;
  --ink:#f2f2f2;--ink2:#bdbdbd;--muted:#8a8a8a;--good:#5cc98a;--bad:#f07a70;color:var(--ink)}
header.site{background:rgba(255,255,255,.97)!important;border-bottom:3px solid #C5A04A!important;box-shadow:0 1px 2px rgba(60,45,10,.06)}
header.site .logo img{content:url("${a.lockup}");width:auto!important;height:40px!important;border-radius:0!important}
header.site .logo span{display:none!important}
.herologo{content:url("${a.lockup}");width:min(340px,70vw)!important;height:auto!important;border-radius:0!important}
nav.views a{color:#4a453b}
nav.views a:hover{color:#8A6A1F}
nav.views a[aria-current="page"]{background:#C5A04A!important;color:#1a1408!important}
thead th{background:#F6EEDC;color:#141414}
tbody td{background:#FFFFFF}
tbody tr:nth-child(even) td{background:#FBF9F4}
.slide thead th{background:#1d1d1d;color:var(--gold)}
.slide tbody td{background:#111}
.slide tbody tr:nth-child(even) td{background:#161616}
.card{box-shadow:0 1px 2px rgba(60,45,10,.05)}
.card:hover,.card:focus-visible{background:#FBF5E6!important}
.tempbanner{background:#FBF5E6!important;color:#5c4614!important}
.mail,.sheet{border-color:#E2DACB!important}
button,input,select{border-color:#CFC4AE}
`;
  if (slug === 'client-tools') return BASE + `
html:root{
  --bg:#F7F5F0!important;--surface:#FFFFFF!important;--surface-2:#FBF9F4!important;--line:#E2DACB!important;--line-soft:#ECE6D8!important;
  --fg:#141414!important;--muted:#6B655A!important;--faint:#8a8274!important;
  --gold:#9C7A2E!important;--gold-soft:#F6EEDC!important;--on-gold:#1a1408!important;
  --s-ty:#B8902F!important;--s-ly:#3A6EA5!important;
  --bad:#B4382C!important;--bad-soft:rgba(180,56,44,.09)!important;--good:#2E7D4F!important;--good-soft:rgba(46,125,79,.10)!important;
  --neutral:#6B6455!important;--neutral-soft:rgba(107,100,85,.10)!important;
  --f-display:${FONT_HEAD}!important;--f-body:${FONT_BODY}!important;color-scheme:light!important}
/* venue headings inside the tables keep the black-and-gold band, as in the exports */
html:root{--band:#141414!important;--band-fg:#F3EEE3!important;--band-gold:#E5B93B!important;--band-muted:#A79F8E!important}
header.band{background:#FFFFFF!important;color:#141414!important;border-bottom:3px solid #C5A04A!important;box-shadow:0 1px 2px rgba(60,45,10,.06)}
header.band .wrap{padding-block:18px 14px!important;align-items:center!important}
header.band .wrap>div:first-child{display:flex;align-items:center;gap:18px}
header.band .wrap>div:first-child::before{content:"";flex:none;width:170px;height:38px;background:url("${a.lockup}") left center/contain no-repeat}
header.band .eyebrow{display:none}
header.band h1{font-size:22px!important;margin:0!important;padding-left:18px;border-left:1px solid #E2DACB;color:#141414;letter-spacing:0;font-weight:600}
header.band h1 em{font-style:normal!important;color:#141414!important;font-weight:600!important}
.tabs button{color:#4a453b!important;border-radius:4px!important}
.tabs button:hover{color:#8A6A1F!important}
.tabs button[aria-current="page"]{background:#C5A04A!important;color:#1a1408!important;border-bottom-color:transparent!important}
.hello .lead{font-weight:600}
.hello .lead em{font-style:normal;color:#8A6A1F}
.tool{border-radius:6px!important;box-shadow:0 1px 2px rgba(60,45,10,.05)}
.tool:hover{border-color:#C5A04A!important}
.tool-ico{background:#141414!important;color:#C5A04A!important;border-radius:2px!important}
.btn-gold{background:#C5A04A!important;color:#1a1408!important;border-radius:4px!important}
.btn-gold:hover{background:#E5C16B!important;filter:none!important}
.btn-ghost{border-radius:4px!important;border-color:#CFC4AE!important}
.btn-ghost:hover{border-color:#C5A04A!important;color:#8A6A1F!important}
`;
  if (slug === 'quickchange-email') return BASE + `
html:root{--ink:#141414!important;--ink-soft:#4a453b!important;--paper:#F7F5F0!important;--paper-raised:#FFFFFF!important;--line:#E2DACB!important;
  --brass:#9C7A2E!important;--brass-soft:#F6EEDC!important;--serif:${FONT_HEAD}!important;--sans:${FONT_BODY}!important}
.wrap{max-width:900px!important;padding-top:0!important}
header.page-head{margin:0 calc(50% - 50vw) 32px!important;padding:18px max(24px,calc(50vw - 426px))!important;background:#FFFFFF;border-bottom:3px solid #C5A04A!important;
  display:grid;grid-template-columns:auto 1fr;column-gap:18px;align-items:center;box-shadow:0 1px 2px rgba(60,45,10,.06)}
header.page-head::before{content:"";grid-row:1 / span 3;width:170px;height:38px;background:url("${a.lockup}") left center/contain no-repeat;
  padding-right:18px;border-right:1px solid #E2DACB}
header.page-head h1{font-size:22px!important;font-weight:600!important;margin:0 0 2px!important}
header.page-head p{font-size:14px}
.offline-badge{justify-self:start}
.version-badge{background:#F6EEDC!important;color:#5c4614!important;border-color:#E4D3A6!important}
.dropzone{border-radius:6px!important;border-color:#CFC4AE!important}
.dropzone:hover,.dropzone.dragover{border-color:#C5A04A!important;background:#FBF5E6!important}
button.primary{background:#C5A04A!important;color:#1a1408!important;font-weight:700!important}
button.primary:hover:not(:disabled){background:#E5C16B!important}
@media (max-width:640px){header.page-head{grid-template-columns:1fr}header.page-head::before{grid-row:auto;border-right:0;margin-bottom:10px}}
`;
  return BASE;
}

function theme(slug, html) {
  const a = assets();
  if (slug === 'ranking-tools') {
    // Every embedded crest (header, hero, and the Excel / PowerPoint / PDF exports) becomes the new EWC crest.
    html = html.replace(/data:image\/jpeg;base64,[A-Za-z0-9+/=]{5000,}/g, 'data:image/jpeg;base64,' + a.crest);
  }
  const tag = `<style id="ewc-website-theme">${css(slug, a)}</style>`;
  // Appended at the very end: a tool's scripts can contain "</body>" inside export templates, so never splice into the middle.
  return html.replace(/\s*$/, '') + '\n' + tag + '\n';
}

module.exports = { theme };
