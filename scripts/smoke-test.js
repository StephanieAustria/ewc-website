// End-to-end checks of sign-in, access control, forms and imports on a throwaway database.
//   npm test
const os = require('os'), fs = require('fs'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ewc-test-'));
process.env.DATA_DIR = tmp;
process.env.INITIAL_ADMIN_PASSWORD = 'Test-Admin-Password-1';
delete process.env.SMTP_HOST;
const seeded = require('./seed');
const app = require('../server');
const XLSX = require('xlsx');
const { db } = require('../src/db');

let pass = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { failN++; console.log('  ✗', msg); } };

class Client {
  constructor(base) { this.base = base; this.jar = {}; this.csrf = null; }
  cookie() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(p, opts = {}) {
    const headers = Object.assign({ cookie: this.cookie() }, opts.headers || {});
    if (this.csrf && opts.method && opts.method !== 'GET') headers['x-csrf-token'] = this.csrf;
    const r = await fetch(this.base + p, { ...opts, headers, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) this.jar[k] = v; else delete this.jar[k]; }
    return r;
  }
  async formToken(p) { const h = await (await this.req(p)).text(); return (h.match(/name="_form" value="([^"]+)"/) || [])[1]; }
  async login(id, pw) {
    const t = await this.formToken('/login');
    const r = await this.req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _form: t, identifier: id, password: pw }) });
    if (r.status === 302) { const me = await (await this.req('/api/me')).json(); this.csrf = me.csrf; return me; }
    return null;
  }
  async json(p, opts) { const r = await this.req(p, opts); return { status: r.status, body: await r.json().catch(() => ({})) }; }
}

(async () => {
  await seeded;
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
  const vid = n => db.prepare('SELECT id FROM venues WHERE name = ?').get(n).id;
  const WR = vid('West Ryde Hotel'), KPT = vid('Kings Park Tavern');

  console.log('Venue member (westrydehotel)');
  const wr = new Client(base);
  const me = await wr.login('westrydehotel', 'wrh123');
  ok(me && me.role === 'venue' && me.venue === 'West Ryde Hotel', 'signs in as Venue Member for West Ryde Hotel');
  const v = await wr.json('/api/venues');
  ok(v.body.length === 1 && v.body[0].name === 'West Ryde Hotel', 'sees only 1 venue');
  ok((await wr.json('/api/figures?venues=' + KPT)).status === 403, 'blocked from another venue’s figures by changing the id');
  ok((await wr.json(`/api/figures?venues=${WR},${KPT}`)).status === 403, 'blocked when mixing in another venue');
  ok((await wr.json('/api/rankings?venue=' + KPT)).status === 403, 'blocked from another venue’s rankings');
  const f = await wr.json('/api/figures');
  ok(f.body.venues.length === 1 && f.body.venues[0].weeks.length > 200, 'gets West Ryde weekly figures (' + f.body.venues[0].weeks.length + ' weeks)');
  ok((await wr.json('/api/admin/users')).status === 403, 'blocked from admin pages');
  const noCsrf = await new Client(base); noCsrf.jar = { ...wr.jar };
  ok((await noCsrf.json('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: 'x', message: 'y' }) })).status === 403, 'question without CSRF token is refused');
  const fd = new FormData(); fd.set('category', 'Gaming figures'); fd.set('subject', 'Test question'); fd.set('message', 'Hello from the test');
  const ask = await wr.json('/api/ask', { method: 'POST', body: fd });
  ok(ask.status === 200, 'Ask a Question sends (' + ask.body.status + ')');

  console.log('Administrator (candice.elsonwhite)');
  const ad = new Client(base);
  const am = await ad.login('candice.elsonwhite', 'Test-Admin-Password-1');
  ok(am && am.role === 'admin' && am.mustChange, 'signs in and is asked to change the temporary password');
  ok((await ad.json('/api/venues')).body.length === 62, 'sees all 62 venues');
  const ch = await ad.json('/api/account/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current: 'Test-Admin-Password-1', next: 'A-new-admin-password-2' }) });
  ok(ch.status === 200, 'changes password');
  ok(!!(await ad.login('candice.elsonwhite', 'A-new-admin-password-2')), 'signs in with the new password');

  // create a group account by invite, then set its password from the link
  const mk = await ad.json('/api/admin/users', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Marlow test', username: 'marlowtest', email: 'test@example.com', role: 'group', group_id: db.prepare("SELECT id FROM groups WHERE name='Marlow Hotel Group'").get().id, method: 'invite' }) });
  ok(mk.status === 200 && mk.body.invite && /set-password\?token=/.test(mk.body.invite.link), 'creates a Group Account and produces a set-up link');
  const token = mk.body.invite.link.split('token=')[1];
  const mg = new Client(base);
  const t2 = await mg.formToken('/set-password?token=' + token);
  const sp = await mg.req('/set-password', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _form: t2, token, password: 'Marlow-password-123', confirm: 'Marlow-password-123' }) });
  ok(sp.status === 302, 'member sets their own password from the link');
  const mgm = await mg.login('marlowtest', 'Marlow-password-123');
  ok(mgm && mgm.role === 'group', 'group member signs in');
  ok((await mg.json('/api/venues')).body.length === 9, 'group member sees the 9 Marlow venues');

  // report upload: group-only file
  const up = new FormData(); up.set('category', 'gp_weekly'); up.set('period', '2026-11-01'); up.set('group_id', String(db.prepare("SELECT id FROM groups WHERE name='Marlow Hotel Group'").get().id));
  up.append('files', new Blob(['test-file']), 'MHG_GamePerformance_Weekly_2026-11-01.xlsx');
  const u = await ad.json('/api/admin/reports', { method: 'POST', body: up });
  ok(u.status === 200, 'admin uploads a weekly Game Performance file for Marlow');
  const rid = u.body.ids[0];
  ok((await mg.req('/api/reports/' + rid + '/download')).status === 200, 'Marlow group account can download it');
  ok((await wr.req('/api/reports/' + rid + '/download')).status === 404, 'West Ryde cannot download it');
  ok(!(await wr.json('/api/reports')).body.some(r => r.id === rid), 'and does not see it listed');

  // Game Performance online: the supplied MHG and Vauxhall reports
  const gpw = (await ad.json('/api/reports?category=gp_weekly')).body.filter(r => r.online);
  ok(gpw.length >= 37 && gpw.some(r => /Vauxhall/.test(r.title)), 'admin sees the weekly MHG and Vauxhall Game Performance reports online');
  const mhgId = gpw.find(r => r.group === 'Marlow Hotel Group' && r.period === '2026-11-15').id;
  const gv = await mg.json('/api/reports/' + mhgId + '/view');
  ok(gv.status === 200 && gv.body.sections.length === 9 && gv.body.sections[1].rows.some(r => r.line === 'avg') && gv.body.sections[1].rows.some(r => r.s), 'Marlow group reads the w/e 15 Nov report with colours and Floor Average line');
  ok((await wr.json('/api/reports/' + mhgId + '/view')).status === 404, 'West Ryde cannot read a Marlow report');
  const vxId = gpw.find(r => r.venue === 'Vauxhall Inn').id;
  ok((await mg.json('/api/reports/' + vxId + '/view')).status === 404, 'Marlow cannot read the Vauxhall report');
  await ad.json('/api/admin/users', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Coniston test', username: 'conistontest', role: 'venue', group_id: db.prepare("SELECT id FROM groups WHERE name='Marlow Hotel Group'").get().id, venue_id: db.prepare("SELECT id FROM venues WHERE name='Coniston Hotel'").get().id, method: 'password', password: 'Coniston-pass-1' }) });
  const cn = new Client(base); await cn.login('conistontest', 'Coniston-pass-1');
  const cnl = (await cn.json('/api/reports?category=gp_weekly')).body.find(r => r.id === mhgId);
  ok(cnl && cnl.download === false, 'a Coniston venue member sees the group report listed, view only');
  const cv = await cn.json('/api/reports/' + mhgId + '/view');
  ok(cv.status === 200 && cv.body.sections.length === 1 && cv.body.sections[0].name === 'Coniston Hotel' && !cv.body.grand, 'and reads only the Coniston section');
  ok((await cn.req('/api/reports/' + mhgId + '/download')).status === 404, 'but cannot download the whole-group file');

  console.log('Gaming figures dashboard and AHA rankings');
  const mg_id = db.prepare("SELECT id FROM groups WHERE name='Marlow Hotel Group'").get().id;
  const dj = await (await wr.req('/api/dashboard-data.js?scope=v' + WR)).text();
  ok(/window\.EWC_DATA=/.test(dj) && /West Ryde Hotel/.test(dj), 'West Ryde gets its own performance dashboard data');
  ok((await wr.req('/api/dashboard-data.js?scope=g' + mg_id)).status === 403, 'West Ryde cannot load the Marlow dashboard data');
  ok((await wr.req('/portal/figures-view?scope=v' + KPT)).status === 403, 'West Ryde cannot open another venue’s dashboard page');
  ok((await mg.req('/portal/figures-view?scope=g' + mg_id)).status === 200, 'Marlow group account opens its group dashboard');
  const rel = await wr.json('/api/aha/release');
  ok(rel.body.release && rel.body.release.period === '2026-09' && rel.body.rows.length > 1000, 'members see the whole September AHA list (' + rel.body.rows.length + ' hotels)');
  const mineRow = rel.body.rows.find(r => r[5]);
  ok(mineRow && mineRow[1] === 'West Ryde Hotel' && mineRow[4][3] === 108 && rel.body.rows.filter(r => r[5]).length === 1, 'only West Ryde is marked as theirs (Sep rank 108)');
  ok((await wr.req('/api/reports/' + rel.body.release.reportId + '/download')).status === 200, 'members can download the AHA rankings PDF');
  const pdfPath = path.join(__dirname, '..', 'seed', 'aha', 'AHA NSW Preliminary Gaming Rankings - September Quarter 2026.pdf');
  const ap = new FormData(); ap.append('file', new Blob([fs.readFileSync(pdfPath)]), 'aha.pdf');
  const apv = await ad.json('/api/admin/import/aha', { method: 'POST', body: ap });
  ok(apv.body.preview && apv.body.period === '2026-09' && apv.body.venues.length === 61, 'AHA PDF upload reads the list and finds 61 EWC venues');

  // figures import (wide layout like the weekly figures workbook)
  const ws = XLSX.utils.aoa_to_sheet([['Date', 'West Ryde', 'West Ryde'], ['22/11/2026', 1500000, 110000]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'WR'); const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const imf = () => { const x = new FormData(); x.append('file', new Blob([buf]), 'WR weekly.xlsx'); return x; };
  const pv = await ad.json('/api/admin/import/figures', { method: 'POST', body: imf() });
  ok(pv.body.preview && pv.body.rows === 1 && pv.body.venues[0] === 'West Ryde Hotel', 'figures import previews 1 new week for West Ryde');
  const x2 = imf(); x2.set('confirm', 'yes');
  const sv = await ad.json('/api/admin/import/figures', { method: 'POST', body: x2 });
  ok(sv.body.saved === 1, 'figures import saves after confirm');
  const after = (await wr.json('/api/figures')).body.venues[0].weeks.at(-1);
  ok(after[0] === '2026-11-22' && after[1] === 1500000, 'West Ryde now sees week ending 22 Nov 2026');

  // rankings import
  const rs = XLSX.utils.aoa_to_sheet([['Venue', 'Month', 'Rank'], ['West Ryde Hotel', 'Oct 2026', 101], ['Kings Park Tavern', '2026-10', 77]]);
  const rb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(rb, rs, 'R'); const rbuf = XLSX.write(rb, { type: 'buffer', bookType: 'csv' });
  const rf = new FormData(); rf.append('file', new Blob([rbuf]), 'oct.csv'); rf.set('confirm', 'yes');
  const ri = await ad.json('/api/admin/import/rankings', { method: 'POST', body: rf });
  ok(ri.body.saved === 2, 'rankings import saves October 2026 ranks');
  ok((await wr.json('/api/rankings?venue=' + WR)).body.venue.monthly['2026-10'] === 101, 'West Ryde sees its October rank');

  console.log('Stephanie and My Tools');
  const st = new Client(base);
  const sm = await st.login('Stephanie.EWC', 'stephanie123');
  ok(sm && sm.role === 'admin' && !sm.mustChange, 'Stephanie.EWC signs in as an administrator');
  ok((await st.json('/api/venues')).body.length === 62, 'Stephanie sees all 62 venues');
  const tl = await st.json('/api/admin/tools');
  ok(tl.body.length === 3 && tl.body.every(t => t.size > 100000), 'My Tools lists the EMAIL Generator, Ranking Tools and Game Performance tool');
  const tp = await st.req('/tools/email-generator');
  ok(tp.status === 200 && /EMAIL Generator Tools/.test(await tp.text()), 'Stephanie opens the EMAIL Generator inside the website');
  ok((await wr.req('/tools/ranking-tools')).status === 403, 'venue members cannot open the tools');
  ok((await new Client(base).req('/tools/ranking-tools')).status === 302, 'signed-out visitors are sent to the login page');
  ok((await st.req('/tools/client-tools')).status === 403, 'Stephanie cannot open Candice\'s Client Tools');
  const cl = await ad.json('/api/admin/tools');
  ok(cl.body.map(t => t.slug).join() === 'client-tools,quickchange-email,ranking-tools', 'Candice\'s My Tools are Client Tools, QuickChange Email and Ranking Tools');
  const cp = await ad.req('/tools/client-tools');
  ok(cp.status === 200 && /ewc-website-theme/.test(await cp.text()), 'Candice opens Client Tools in the website theme');
  ok((await ad.req('/tools/email-generator')).status === 403, 'Candice does not get Stephanie\'s EMAIL Generator');
  const ctl = new FormData(); ctl.append('file', new Blob(['<!doctype html><title>Test</title>']), 'tool.html');
  ok((await st.json('/api/admin/tools/client-tools', { method: 'POST', body: ctl })).status === 403, 'an administrator cannot replace someone else\'s tool');
  const sid = (await ad.json('/api/admin/users')).body.find(u => u.username === 'Stephanie.EWC').id;
  await ad.json('/api/admin/users/' + sid + '/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tools: ['email-generator', 'ranking-tools', 'game-performance', 'quickchange-email'] }) });
  ok((await st.req('/tools/quickchange-email')).status === 200, 'Members → Tools gives Stephanie QuickChange Email');
  const nt = new FormData(); nt.append('file', new Blob(['<!doctype html><title>Test</title>']), 'tool.html');
  ok((await wr.json('/api/admin/tools/ranking-tools', { method: 'POST', body: nt })).status === 403, 'venue members cannot replace a tool');

  console.log('Public website');
  const pub = new Client(base);
  const ct = await pub.formToken('/contact');
  const cf = await pub.req('/contact', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _form: ct, startedAt: String(Date.now() - 10000), name: 'Test Person', company: 'Test Venue', email: 'test@example.com', type: 'General Enquiry', subject: 'Hello', message: 'Testing the contact form' }) });
  ok(cf.status === 302 && /sent=1/.test(cf.headers.get('location')), 'contact form accepted');
  const eml = fs.readdirSync(path.join(tmp, 'outbox')).map(n => fs.readFileSync(path.join(tmp, 'outbox', n), 'utf8'));
  ok(eml.some(m => /To: admin@elsonwhiteconsulting\.com\.au/.test(m) && /Website enquiry/.test(m)), 'contact email addressed to admin@elsonwhiteconsulting.com.au');
  ok(eml.some(m => /To: admin@elsonwhiteconsulting\.com\.au/.test(m) && /Venue \/ Account: West Ryde Hotel/.test(m)), 'member question email names the venue');
  const bad = await pub.req('/contact', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _form: ct, name: '', email: 'nope' }) });
  ok(bad.status === 400, 'contact form rejects missing fields');

  const br = new Client(base); let locked = false;
  for (let i = 0; i < 6; i++) { const t = await br.formToken('/login'); const r = await br.req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _form: t, identifier: 'westrydehotel', password: 'wrong' + i }) }); if (i === 5) locked = /Too many attempts/.test(await r.text()); }
  ok(locked, 'repeated wrong passwords are locked out for 15 minutes');
  const hashes = db.prepare('SELECT password_hash FROM users').all();
  ok(hashes.every(h => !h.password_hash || h.password_hash.startsWith('$2')), 'passwords are stored as bcrypt hashes, never plain text');

  server.close();
  console.log(`\n${pass} passed, ${failN} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failN ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
