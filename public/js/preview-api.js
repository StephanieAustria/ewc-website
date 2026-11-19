/* PREVIEW ONLY — stands in for the server so the site can be clicked through as a static page.
   Sign-in here is simulated in the browser; the real website checks passwords on the server. */
(function () {
  window.EWC_PREVIEW = true;
  var USERS = {
    'westrydehotel': { pw: 'wrh123', id: 2, username: 'westrydehotel', name: 'West Ryde Hotel', role: 'venue', venue: 'West Ryde Hotel', group: 'West Ryde Hotel', email: null },
    'stephanie.ewc': { pw: 'stephanie123', id: 3, username: 'Stephanie.EWC', name: 'Stephanie Manuel', role: 'admin', email: null, tools: ['email-generator', 'ranking-tools', 'game-performance'] },
    'candice.elsonwhite': { pw: 'preview-admin', id: 1, username: 'candice.elsonwhite', name: 'Candice Elson-White', role: 'admin', email: 'admin@elsonwhiteconsulting.com.au', tools: ['client-tools', 'quickchange-email', 'ranking-tools'] },
  };
  function store(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); return v; }
    catch (e) { var o = {}; try { o = JSON.parse(window.name || '{}'); } catch (e2) {} if (v === undefined) return o[k] || null; if (v === null) delete o[k]; else o[k] = v; window.name = JSON.stringify(o); return v; }
  }
  // Tool choices made on the Members screen last for this browser session.
  function toolsOf(u) { var o = store('ewc_tools_' + u.id); try { if (o) return JSON.parse(o); } catch (e) {} return u.tools || []; }
  function me() { var u = store('ewc_user'); u = u && u.toLowerCase(); return u && USERS[u] ? USERS[u] : null; }

  // ----- login + contact forms on the static pages -----
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.matches('[data-login]')) {
      e.preventDefault();
      var id = f.identifier.value.trim().toLowerCase(), u = USERS[id] || Object.values(USERS).find(function (x) { return x.email && x.email === id; });
      var box = f.querySelector('.alert.err') || f.insertBefore(Object.assign(document.createElement('div'), { className: 'alert err' }), f.firstChild);
      if (!u || u.pw !== f.password.value) { box.textContent = 'That username or password is not right.'; return; }
      store('ewc_user', u.username); location.href = 'portal.html';
    } else if (f.matches('[data-validate]') && f.closest('.contact-grid')) {
      e.preventDefault();
      if ([].some.call(f.querySelectorAll('[required]'), function (i) { return !i.value.trim(); })) return;
      var ok = document.createElement('div'); ok.className = 'alert ok';
      ok.innerHTML = '<b>Preview: your enquiry was checked but not sent.</b><br>On the live website it is emailed straight to admin@elsonwhiteconsulting.com.au and saved in the portal’s Enquiries page.';
      f.parentNode.insertBefore(ok, f); f.reset(); ok.scrollIntoView({ block: 'center' });
    } else if (f.matches('[action$="forgot-password"], [action$="forgot.html"]')) {
      e.preventDefault(); var n = document.createElement('div'); n.className = 'alert ok'; n.textContent = 'Preview: on the live website a reset link is emailed (valid 1 hour).'; f.insertBefore(n, f.firstChild);
    }
  });

  // ----- portal API -----
  var D = window.EWC_PREVIEW_DATA, byId = {}, compByName = {};
  if (D) {
    D.venues.forEach(function (v, i) { v.id = i + 1; byId[v.id] = v; });
    D.groups = D.groups.map(function (g, i) { return { id: i + 1, name: g }; });
    var gid = {}; D.groups.forEach(function (g) { gid[g.name] = g.id; });
    D.venues.forEach(function (v) { v.group_id = gid[v.group]; });
    Object.keys(D.competitors).forEach(function (n) { compByName[n] = D.competitors[n]; });
  }
  var ENQ = [];
  function allowed(u) { return D.venues.filter(function (v) { return u.role === 'admin' || (u.role === 'venue' && v.name === u.venue); }); }
  function q(path) { var o = {}; (path.split('?')[1] || '').split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); o[p[0]] = decodeURIComponent(p[1] || ''); } }); return o; }
  function err(m, s) { var e = new Error(m); e.status = s; return Promise.reject(e); }
  var CATL = { gp_weekly: 'Game Performance · Weekly', gp_monthly: 'Game Performance · Monthly', figures: 'Gaming Figures', rankings: 'Monthly Rankings', resource: 'Resources' };

  window.EWC_API = function (path, opts) {
    var u = me(), method = (opts && opts.method) || 'GET', p = path.split('?')[0], Q = q(path);
    if (p === '/logout') { store('ewc_user', null); return Promise.resolve({}); }
    if (!u) return err('Please sign in.', 401);
    var mine = allowed(u), ids = mine.map(function (v) { return v.id; });
    if (method !== 'GET') {
      if (p === '/ask') { var fd = opts.form; ENQ.unshift({ id: ENQ.length + 1, kind: 'member', name: u.name, email: u.email, enquiry_type: fd.get('category'), subject: fd.get('subject'), message: fd.get('message'), venue_text: u.venue || 'EWC admin', email_status: 'preview — not sent', created_at: new Date().toISOString().replace('T', ' ') });
        return Promise.resolve({ ok: true, status: 'preview — not sent' }); }
      var tm = p.match(/^\/admin\/users\/(\d+)\/tools$/);
      if (tm && u.role === 'admin') { var picks = ((opts.body || {}).tools || []).filter(function (s) { return (D.tools || []).some(function (t) { return t.slug === s; }); });
        store('ewc_tools_' + tm[1], JSON.stringify(picks)); return Promise.resolve({ ok: true, tools: picks }); }
      return err('This works on the live website. In the preview nothing is saved or uploaded.', 400);
    }
    // Game Performance: administrators see every report, groups their group's, venue members their own venue's section.
    function gpAccess(r) {
      if (u.role === 'admin') return 'full';
      if (u.role === 'group') return mine.some(function (v) { return v.group === r.group; }) ? 'full' : null;
      return (r.venues || []).some(function (id) { return ids.indexOf(id) >= 0; }) ? (r.venue ? 'full' : 'own') : null;
    }
    var vm = p.match(/^\/reports\/(\d+)\/view$/);
    if (vm) {
      var rep = (D.gpReports || []).filter(function (r) { return String(r.id) === vm[1]; })[0], acc = rep && gpAccess(rep);
      if (!acc || !D.gpViews || !D.gpViews[rep.id]) return err('Report not found.', 404);
      var vw = JSON.parse(JSON.stringify(D.gpViews[rep.id]));
      if (acc === 'own') { vw.sections = vw.sections.filter(function (s) { return ids.indexOf(s.venue_id) >= 0; }); vw.grand = null; }
      vw.id = rep.id; vw.title = rep.title; vw.category = rep.category; vw.period = rep.period; vw.download = false;
      return Promise.resolve(vw);
    }
    switch (p) {
      case '/me': return Promise.resolve({ id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, group: u.group, venue: u.venue, mustChange: false, csrf: 'preview', emailConfigured: false, tools: u.role === 'admin' ? toolsOf(u) : [] });
      case '/venues': return Promise.resolve(mine.map(function (v) { var m = Object.keys(v.rank_monthly || {}).sort(); return { id: v.id, name: v.name, suburb: v.suburb, lga: v.lga, machines: v.machines, grp: v.group, group_id: v.group_id, latest_week: v.latest_week, weeks: v.weekly.length, latest_rank_month: m[m.length - 1] || null }; })
        .sort(function (a, b) { return (a.grp + a.name).localeCompare(b.grp + b.name); }));
      case '/figures': {
        var want = (Q.venues || '').split(',').map(Number).filter(Boolean);
        if (want.some(function (i) { return ids.indexOf(i) < 0; })) return err('You do not have access to one or more of those venues.', 403);
        var list = (want.length ? want.map(function (i) { return byId[i]; }) : mine).filter(function (v) { return v.weekly.length; });
        return Promise.resolve({ venues: list.map(function (v) { return { id: v.id, name: v.name, weeks: v.weekly }; }) });
      }
      case '/rankings': {
        var v = byId[+Q.venue]; if (!v || ids.indexOf(v.id) < 0) return err('You do not have access to that venue.', 403);
        return Promise.resolve({ venue: { id: v.id, name: v.name, suburb: v.suburb, lga: v.lga, machines: v.machines, monthly: v.rank_monthly || {}, quarterly: v.rank_quarterly || {} },
          competitors: (v.competitors || []).filter(function (n) { return compByName[n]; }).map(function (n) { var c = compByName[n]; return { name: n, suburb: c.suburb, lga: c.lga, monthly: c.monthly || {}, quarterly: c.quarterly || {} }; }) });
      }
      case '/rankings-overview': {
        var all = []; mine.forEach(function (v) { all = all.concat(Object.keys(v.rank_monthly || {})); });
        var months = Array.from(new Set(all)).sort().slice(-13);
        return Promise.resolve({ months: months, rows: mine.filter(function (v) { return Object.keys(v.rank_monthly || {}).length; }).map(function (v) {
          var r = {}; months.forEach(function (m) { if (v.rank_monthly[m] != null) r[m] = v.rank_monthly[m]; }); return { id: v.id, name: v.name, grp: v.group, ranks: r }; }) });
      }
      case '/reports': {
        var gpl = (D.gpReports || []).filter(function (r) { return gpAccess(r); }).map(function (r) {
          return { id: r.id, title: r.title, category: r.category, categoryLabel: r.category === 'gp_monthly' ? 'Game Performance · Monthly' : 'Game Performance · Weekly', period: r.period,
            group: r.group, venue: r.venue, file: r.file, size: r.size, status: 'published', online: true, download: false }; });
        var ahaL = D.aha ? [{ id: 1, title: 'AHA NSW Preliminary Gaming Rankings — ' + D.aha.period, category: 'rankings', categoryLabel: 'Monthly Rankings', period: D.aha.period, group: 'All members', venue: null, file: D.aha.file, status: 'published' }] : [];
        var allR = gpl.concat(ahaL).filter(function (r) { return !Q.category || r.category === Q.category; });
        return Promise.resolve(allR);
      }
      case '/reports-aha-only': return Promise.resolve(D.aha ? [{ id: 1, title: 'AHA NSW Preliminary Gaming Rankings — ' + D.aha.period, category: 'rankings', categoryLabel: 'Monthly Rankings', period: D.aha.period, group: 'All members', venue: null, file: D.aha.file, status: 'published' }] : []);
      case '/aha/releases': return Promise.resolve(D.aha ? [{ period: D.aha.period, title: D.aha.title, preliminary: D.aha.preliminary ? 1 : 0, rows_count: D.aha.rows.length, report_id: 1 }] : []);
      case '/aha/release': {
        if (!D.aha) return Promise.resolve({ release: null, rows: [], mine: [] });
        var lic = {}; mine.forEach(function (v) { if (v.licence) lic[v.licence] = v; });
        return Promise.resolve({ release: { period: D.aha.period, title: D.aha.title, preliminary: D.aha.preliminary, columns: D.aha.columns, reportId: 1 },
          rows: D.aha.rows.map(function (r) { return [r.ytd, r.name, r.suburb, r.lga, r.values, lic[r.licence] ? lic[r.licence].id : 0]; }),
          mine: mine.filter(function (v) { return v.licence; }).map(function (v) { return { id: v.id, name: v.name, group: v.group }; }) });
      }
      case '/admin/overview':
        return Promise.resolve({ groups: D.groups.map(function (g) { return { id: g.id, name: g.name, venues: D.venues.filter(function (v) { return v.group_id === g.id; }).length }; }),
          venues: D.venues.map(function (v) { var m = Object.keys(v.rank_monthly || {}).sort(); return { id: v.id, name: v.name, group_id: v.group_id, grp: v.group, latest_week: v.latest_week, latest_rank: m[m.length - 1] || null }; }).sort(function (a, b) { return (a.grp + a.name).localeCompare(b.grp + b.name); }),
          counts: {}, emailConfigured: false });
      case '/admin/users': return Promise.resolve([
        { id: 1, username: 'candice.elsonwhite', email: 'admin@elsonwhiteconsulting.com.au', name: 'Candice Elson-White', role: 'admin', active: 1, must_change: 0, has_password: 1, last_login: 'today', tools: toolsOf(USERS['candice.elsonwhite']) },
        { id: 3, username: 'Stephanie.EWC', email: null, name: 'Stephanie Manuel', role: 'admin', active: 1, must_change: 0, has_password: 1, last_login: 'today', tools: toolsOf(USERS['stephanie.ewc']) },
        { id: 2, username: 'westrydehotel', email: null, name: 'West Ryde Hotel', role: 'venue', venue_name: 'West Ryde Hotel', active: 1, must_change: 0, has_password: 1, last_login: null, tools: [] }]);
      case '/admin/enquiries': return Promise.resolve(ENQ);
      case '/admin/tools-all': return Promise.resolve((D.tools || []).map(function (t) { return { slug: t.slug, name: t.nav }; }));
      case '/admin/tools': return Promise.resolve((D.tools || []).filter(function (t) { return toolsOf(u).indexOf(t.slug) >= 0; }).map(function (t) { return { slug: t.slug, name: t.name, description: t.description, custom: false }; }));
    }
    return err('Not available in the preview.', 404);
  };
})();
