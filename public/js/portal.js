/* Elson White Consulting — member portal (runs in the browser; all data comes from /api, which checks access). */
(function () {
  'use strict';
  var PREVIEW = !!window.EWC_PREVIEW;

  // ---------- API ----------
  var ME = null;
  function api(path, opts) {
    if (window.EWC_API) return window.EWC_API(path, opts || {});
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (init.method !== 'GET' && ME) init.headers['X-CSRF-Token'] = ME.csrf;
    if (opts.form) init.body = opts.form;
    else if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch('/api' + path, init).then(function (r) {
      if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent('/portal' + location.hash); throw new Error('Please sign in.'); }
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong.'); e.data = j; throw e; } return j; });
    });
  }

  // ---------- helpers ----------
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var nf0 = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
  function money(n) { return n == null || isNaN(n) ? '—' : (n < 0 ? '-$' : '$') + nf0.format(Math.abs(n)); }
  function short(n) { if (n == null || isNaN(n)) return '—'; var a = Math.abs(n), s = n < 0 ? '-$' : '$';
    return a >= 1e9 ? s + (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? s + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + (a / 1e3).toFixed(1) + 'K' : s + nf0.format(a); }
  function pct(n, d) { return n == null || isNaN(n) ? '—' : n.toFixed(d == null ? 2 : d) + '%'; }
  function change(cur, prev) { if (!prev) return null; return (cur - prev) / Math.abs(prev) * 100; }
  function delta(c, label) { if (c == null || !isFinite(c)) return '<span class="d">No comparison available</span>';
    if (Math.abs(c) < 0.05) return '<span class="d">No change <span class="muted">' + (label || 'vs same period last year') + '</span></span>';
    return '<span class="d ' + (c >= 0 ? 'up' : 'down') + '">' + (c >= 0 ? '▲ +' : '▼ ') + c.toFixed(1) + '% <span class="muted">' + (label || 'vs same period last year') + '</span></span>'; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function d2(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = d2(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function niceDate(s) { if (!s) return '—'; var d = d2(s); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function monthLabel(p) { var a = p.split('-'); return MON[+a[1] - 1] + ' ' + a[0]; }
  function qLabel(p) { var a = p.split('-'); return 'Q' + Math.ceil(+a[1] / 3) + ' ' + a[0]; }
  function weekNo(s) { var d = d2(s); var start = Date.UTC(d.getUTCFullYear(), 0, 1); return Math.floor((d - start) / 864e5 / 7) + 1; }
  function icon(n) { var P = { chart: '<path d="M4 44h40"/><rect x="7" y="30" width="7" height="12"/><rect x="18" y="22" width="7" height="20"/><rect x="29" y="26" width="7" height="16"/><path d="M8 24l12-9 9 6 13-12"/>', coins: '<ellipse cx="20" cy="12" rx="12" ry="5"/><path d="M8 12v8c0 3 5 5 12 5s12-2 12-5v-8M8 20v8c0 3 5 5 12 5M32 22c4 1 8 3 8 6 0 3-5 5-12 5s-12-2-12-5"/>', percent: '<path d="M10 38L38 10"/><circle cx="13" cy="13" r="5"/><circle cx="35" cy="35" r="5"/>', trophy: '<path d="M16 6h16v10a8 8 0 0 1-16 0z"/><path d="M16 9H9v3a6 6 0 0 0 7 6M32 9h7v3a6 6 0 0 1-7 6"/><path d="M24 24v8M17 42h14M19 42l1-10h8l1 10"/>', doc: '<path d="M12 4h17l9 9v31H12z"/><path d="M29 4v9h9"/>', down: '<path d="M24 6v26M14 22l10 10 10-10M8 42h32"/>', venue: '<path d="M6 42V18l18-12 18 12v24"/><path d="M18 42V28h12v14"/>' };
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>'; }
  function toast(msg) { var t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 6000); }
  function view(html) { var v = $('#view'); v.innerHTML = html; v.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  function fail(e) { view('<div class="notice err">' + esc(e.message || e) + '</div>'); }

  // ---------- charts ----------
  var charts = [];
  function clearCharts() { charts.forEach(function (c) { c.destroy(); }); charts = []; }
  var GOLD = '#B8902F', GOLD2 = '#C5A04A', GRID = 'rgba(20,20,20,.08)', TXT = '#5d574b';
  var PALETTE = ['#B8902F', '#3E7CC4', '#C8507A', '#2E9A72', '#8A5CC4', '#D07A2C', '#5E9A2E', '#A88A1E', '#3A8FA8', '#B85C5C', '#7D7D7D', '#2A9DB0'];
  function chart(canvas, cfg) {
    if (!window.Chart) return;
    Chart.defaults.color = TXT; Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { boxWidth: 12, color: '#3b372f' } } } }, cfg.options || {});
    charts.push(new Chart(canvas, cfg));
  }

  // ---------- data ----------
  var VENUES = [], figCache = {};
  function accessibleWithFigures() { return VENUES.filter(function (v) { return v.weeks > 0; }); }
  function getFigures(ids) {
    var key = ids.slice().sort().join(',');
    if (figCache[key]) return Promise.resolve(figCache[key]);
    return api('/figures?venues=' + key).then(function (r) { figCache[key] = r; return r; });
  }
  function combine(fig) {             // weekly totals across the chosen venues
    var m = {};
    fig.venues.forEach(function (v) { v.weeks.forEach(function (w) { var e = m[w[0]] || (m[w[0]] = [0, 0, 0]); e[0] += w[1]; e[1] += w[2]; e[2]++; }); });
    return Object.keys(m).sort().map(function (d) { return { d: d, to: m[d][0], pr: m[d][1], n: m[d][2] }; });
  }
  function sumRange(weeks, a, b) { var t = 0, p = 0, n = 0; weeks.forEach(function (w) { if (w.d >= a && w.d <= b) { t += w.to; p += w.pr; n++; } }); return { to: t, pr: p, n: n }; }
  function periods(latest) {
    var y = +latest.slice(0, 4), m = +latest.slice(5, 7), qs = Math.floor((m - 1) / 3) * 3 + 1;
    var list = [
      { id: 'ytd', label: 'Year to date (' + y + ')', a: y + '-01-01', b: latest },
      { id: 'qtd', label: 'Quarter to date (Q' + Math.ceil(m / 3) + ' ' + y + ')', a: y + '-' + String(qs).padStart(2, '0') + '-01', b: latest },
      { id: 'l4', label: 'Last 4 weeks', a: addDays(latest, -27), b: latest },
      { id: 'l13', label: 'Last 13 weeks', a: addDays(latest, -90), b: latest },
      { id: 'l52', label: 'Last 52 weeks', a: addDays(latest, -363), b: latest },
    ];
    for (var yy = y - 1; yy >= y - 4; yy--) list.push({ id: 'y' + yy, label: 'Calendar year ' + yy, a: yy + '-01-01', b: yy + '-12-31' });
    return list;
  }
  function selFromHash(q) {
    var all = accessibleWithFigures();
    if (q.v && q.v !== 'all') { var id = +q.v; if (all.some(function (v) { return v.id === id; })) return [id]; }
    if (q.g) { var g = all.filter(function (v) { return String(v.group_id) === q.g; }).map(function (v) { return v.id; }); if (g.length) return g; }
    return all.map(function (v) { return v.id; });
  }
  function venuePicker(q, withAll) {
    var all = accessibleWithFigures(), groups = {};
    all.forEach(function (v) { (groups[v.grp] = groups[v.grp] || []).push(v); });
    var multiGroup = Object.keys(groups).length > 1, cur = q.v ? 'v' + q.v : q.g ? 'g' + q.g : 'all';
    var h = '<select id="pick-venue">';
    if (withAll !== false && all.length > 1) h += '<option value="all"' + (cur === 'all' ? ' selected' : '') + '>All my venues (' + all.length + ')</option>';
    Object.keys(groups).sort().forEach(function (g) {
      h += '<optgroup label="' + esc(g) + '">';
      if (multiGroup && groups[g].length > 1) h += '<option value="g' + groups[g][0].group_id + '"' + (cur === 'g' + groups[g][0].group_id ? ' selected' : '') + '>' + esc(g) + ' — all ' + groups[g].length + ' venues</option>';
      groups[g].forEach(function (v) { h += '<option value="v' + v.id + '"' + (cur === 'v' + v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>'; });
      h += '</optgroup>';
    });
    return h + '</select>';
  }
  function bindPicker(route, extra) {
    var s = $('#pick-venue'); if (!s) return;
    s.addEventListener('change', function () {
      var v = s.value, q = Object.assign({}, extra || {});
      if (v[0] === 'v') q.v = v.slice(1); else if (v[0] === 'g') q.g = v.slice(1);
      go(route, q);
    });
  }
  function go(route, q) { var qs = Object.keys(q || {}).filter(function (k) { return q[k] != null && q[k] !== ''; }).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&'); location.hash = '#/' + route + (qs ? '?' + qs : ''); }
  function selLabel(ids) { if (ids.length === 1) { var v = VENUES.find(function (x) { return x.id === ids[0]; }); return v ? v.name : ''; } return ids.length + ' venues'; }

  // =====================================================================
  // DASHBOARD
  // =====================================================================
  function dashboard(q) {
    var ids = selFromHash(q);
    if (!ids.length) return view(head('Member Portal', 'Venue Dashboard', 'Your venue figures will appear here once EWC has loaded them.') + '<div class="empty-state"><b>No figures yet</b>Your weekly gaming figures have not been loaded for your account yet. Ask EWC if you expected to see them.</div>');
    return getFigures(ids).then(function (fig) {
      var weeks = combine(fig); if (!weeks.length) return view('<div class="empty-state"><b>No weekly figures</b></div>');
      var latest = weeks[weeks.length - 1].d, ps = periods(latest), p = ps.find(function (x) { return x.id === q.p; }) || ps[0];
      var cur = sumRange(weeks, p.a, p.b), prev = sumRange(weeks, addDays(p.a, -364), addDays(p.b, -364));
      var single = ids.length === 1 ? VENUES.find(function (v) { return v.id === ids[0]; }) : null;
      var html = head('Member Portal', single ? single.name : (q.g ? (VENUES.find(function (v) { return String(v.group_id) === q.g; }) || {}).grp : 'Venue Dashboard'),
        'Gaming figures to week ending ' + niceDate(latest) + ' · ' + esc(p.label) + ' (' + niceDate(p.a < weeks[0].d ? weeks[0].d : p.a) + ' – ' + niceDate(p.b > latest ? latest : p.b) + ')',
        '<div><label for="pick-venue">Venue</label>' + venuePicker(q) + '</div><div><label for="pick-period">Period</label><select id="pick-period">' +
        ps.map(function (x) { return '<option value="' + x.id + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></div>');
      var rtv = cur.to ? cur.pr / cur.to * 100 : null, rtvPrev = prev.to ? prev.pr / prev.to * 100 : null;
      html += '<div class="kpis">' +
        kpi('coins', 'Turnover', short(cur.to), delta(change(cur.to, prev.to))) +
        kpi('chart', 'Gaming profit', short(cur.pr), delta(change(cur.pr, prev.pr))) +
        kpi('percent', 'RTV (profit ÷ turnover)', pct(rtv), rtvPrev == null ? '<span class="d">No comparison available</span>' : '<span class="d ' + (rtv >= rtvPrev ? 'up' : 'down') + '">' + (rtv >= rtvPrev ? '▲ +' : '▼ ') + (rtv - rtvPrev).toFixed(2) + ' pts <span class="muted">vs last year</span></span>') +
        (single ? kpi('trophy', 'AHA monthly rank', single.latest_rank_month ? '<span id="k-rank">…</span>' : '—', '<span class="d">' + (single.latest_rank_month ? monthLabel(single.latest_rank_month) + ' · lower is better' : 'Not ranked by AHA') + '</span>')
                : kpi('venue', 'Venues included', String(ids.length), '<span class="d">Avg weekly profit ' + short(cur.n ? cur.pr / cur.n / ids.length : null) + ' per venue</span>')) +
        '</div>';
      html += '<div class="grid-2"><section class="card"><div class="card-head"><div><h2>Week-by-week profit</h2><p class="sub">' + p.b.slice(0, 4) + ' vs ' + (p.b.slice(0, 4) - 1) + ', by week of the year</p></div></div><div class="chart-box"><canvas id="c-weekly"></canvas></div></section>' +
        '<section class="card"><div class="card-head"><div><h2>' + icon('trophy') + 'Venue ranking</h2><p class="sub">Latest AHA NSW monthly rank — lower is better</p></div><a href="#/rankings' + (single ? '?v=' + single.id : '') + '">View full rankings →</a></div><div id="d-ranks"><p class="muted">Loading…</p></div></section></div>';
      html += '<div class="grid-2"><section class="card"><div class="card-head"><div><h2>Weekly turnover by year</h2><p class="sub">Each line is one calendar year</p></div></div><div class="chart-box"><canvas id="c-years"></canvas></div></section>' +
        '<section class="card"><div class="card-head"><div><h2>' + icon('doc') + 'Latest reports</h2><p class="sub">Game Performance, figures and rankings files</p></div><a href="#/reports">View all reports →</a></div><div id="d-reports"><p class="muted">Loading…</p></div></section></div>';
      html += single ? '<section class="card"><div class="card-head"><div><h2>Quarterly performance</h2><p class="sub">Calendar quarters, ' + p.b.slice(0, 4) + ' compared with ' + (p.b.slice(0, 4) - 1) + '</p></div></div><div id="d-quarters"></div></section>'
                     : '<section class="card"><div class="card-head"><div><h2>Turnover and profit by venue</h2><p class="sub">' + esc(p.label) + '</p></div><a href="#/figures-weekly?' + (q.g ? 'g=' + q.g : '') + '">Open weekly figures →</a></div><div id="d-split"></div></section>';
      view(html);
      $('#pick-period').addEventListener('change', function (e) { go('dashboard', Object.assign({}, q, { p: e.target.value })); });
      bindPicker('dashboard', { p: q.p });

      // weekly profit, this year vs last
      var y = +p.b.slice(0, 4), byWk = function (yr) { var o = {}; weeks.forEach(function (w) { if (+w.d.slice(0, 4) === yr) o[weekNo(w.d)] = w.pr; }); return o; };
      var a = byWk(y), b = byWk(y - 1), wks = []; for (var i = 1; i <= 53; i++) if (a[i] != null || b[i] != null) wks.push(i);
      chart($('#c-weekly'), { type: 'line', data: { labels: wks.map(function (w) { return 'Wk ' + w; }),
        datasets: [{ label: String(y), data: wks.map(function (w) { return a[w] == null ? null : a[w]; }), borderColor: GOLD, backgroundColor: 'rgba(229,193,107,.15)', fill: true, tension: .25, pointRadius: 0, borderWidth: 2.5 },
          { label: String(y - 1), data: wks.map(function (w) { return b[w] == null ? null : b[w]; }), borderColor: '#9b9283', borderDash: [5, 4], tension: .25, pointRadius: 0, borderWidth: 1.6 }] },
        options: { scales: { x: { grid: { color: GRID }, ticks: { maxTicksLimit: 13 } }, y: { grid: { color: GRID }, ticks: { callback: function (v) { return short(v); } } } },
          plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + money(c.parsed.y); } } } } } });
      // turnover by year
      var years = {}; weeks.forEach(function (w) { (years[w.d.slice(0, 4)] = years[w.d.slice(0, 4)] || {})[weekNo(w.d)] = w.to; });
      var yl = Object.keys(years).sort().slice(-5), labels = []; for (var k = 1; k <= 52; k++) labels.push(k);
      chart($('#c-years'), { type: 'line', data: { labels: labels.map(function (w) { return 'Wk ' + w; }), datasets: yl.map(function (yy, i) {
        var last = i === yl.length - 1; return { label: yy, data: labels.map(function (w) { return years[yy][w] == null ? null : years[yy][w]; }), borderColor: last ? GOLD : ['#9aa4b3', '#7a8597', '#5f6b7a', '#3d4654'][i % 4], borderWidth: last ? 2.6 : 1.3, pointRadius: 0, tension: .25 }; }) },
        options: { scales: { x: { grid: { color: GRID }, ticks: { maxTicksLimit: 13 } }, y: { grid: { color: GRID }, ticks: { callback: function (v) { return short(v); } } } },
          plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + money(c.parsed.y); } } } } } });

      if (single) {
        var qt = '<div class="tbl-wrap"><table class="t"><thead><tr><th>Quarter</th><th>Turnover ' + y + '</th><th>Turnover ' + (y - 1) + '</th><th>Change</th><th>Profit ' + y + '</th><th>Profit ' + (y - 1) + '</th><th>Change</th><th>RTV ' + y + '</th></tr></thead><tbody>';
        for (var qn = 1; qn <= 4; qn++) {
          var qa = y + '-' + String(qn * 3 - 2).padStart(2, '0') + '-01', qb = y + '-' + String(qn * 3).padStart(2, '0') + '-31'; if (qb > latest) qb = latest; if (qa > latest) continue;
          var c1 = sumRange(weeks, qa, qb), c0 = sumRange(weeks, addDays(qa, -364), addDays(qb, -364));
          if (!c1.n && !c0.n) continue;
          var ch1 = change(c1.to, c0.to), ch2 = change(c1.pr, c0.pr);
          qt += '<tr><td>Q' + qn + (c1.n && c1.n < 13 ? ' <span class="muted small">(' + c1.n + ' wks)</span>' : '') + '</td><td>' + (c1.n ? money(c1.to) : '—') + '</td><td>' + money(c0.to) + '</td><td class="' + (ch1 >= 0 ? 'up' : 'down') + '">' + (c1.n && ch1 != null ? ch1.toFixed(1) + '%' : '—') + '</td><td>' + (c1.n ? money(c1.pr) : '—') + '</td><td>' + money(c0.pr) + '</td><td class="' + (ch2 >= 0 ? 'up' : 'down') + '">' + (c1.n && ch2 != null ? ch2.toFixed(1) + '%' : '—') + '</td><td>' + (c1.to ? pct(c1.pr / c1.to * 100) : '—') + '</td></tr>';
        }
        $('#d-quarters').innerHTML = qt + '</tbody></table></div><p class="muted small" style="margin-top:8px">A part quarter is compared with the same weeks last year.</p>';
      } else {
        var rows = fig.venues.map(function (v) { var w = v.weeks.map(function (x) { return { d: x[0], to: x[1], pr: x[2] }; }); var c = sumRange(w, p.a, p.b), o = sumRange(w, addDays(p.a, -364), addDays(p.b, -364)); return { name: v.name, c: c, o: o }; })
          .filter(function (r) { return r.c.n; }).sort(function (x, y2) { return y2.c.to - x.c.to; });
        var tot = rows.reduce(function (s, r) { s.to += r.c.to; s.pr += r.c.pr; return s; }, { to: 0, pr: 0 });
        $('#d-split').innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th>Venue</th><th>Turnover</th><th>Share</th><th>Profit</th><th>RTV</th><th>Profit vs LY</th></tr></thead><tbody>' +
          rows.map(function (r) { var ch = change(r.c.pr, r.o.pr); return '<tr><td>' + esc(r.name) + '</td><td>' + money(r.c.to) + '</td><td>' + pct(r.c.to / tot.to * 100, 1) + '</td><td>' + money(r.c.pr) + '</td><td>' + pct(r.c.pr / r.c.to * 100) + '</td><td class="' + (ch >= 0 ? 'up' : 'down') + '">' + (ch == null ? '—' : (ch >= 0 ? '+' : '') + ch.toFixed(1) + '%') + '</td></tr>'; }).join('') +
          '</tbody><tfoot><tr><td>Total</td><td>' + money(tot.to) + '</td><td>100%</td><td>' + money(tot.pr) + '</td><td>' + pct(tot.pr / tot.to * 100) + '</td><td></td></tr></tfoot></table></div>';
      }
      // ranks + reports
      api('/rankings-overview').then(function (r) {
        var m = r.months[r.months.length - 1];
        var list = r.rows.filter(function (x) { return x.ranks[m] != null && (!single || x.id === single.id || ids.indexOf(x.id) >= 0); });
        if (single) { var me = r.rows.find(function (x) { return x.id === single.id; }); var el = $('#k-rank'); if (el) el.textContent = me && me.ranks[m] != null ? '#' + me.ranks[m] : '—'; }
        if (!list.length) { $('#d-ranks').innerHTML = '<p class="muted">No AHA ranking for this selection.</p>'; return; }
        if (single) {
          var me2 = list[0], ms = r.months.filter(function (mm) { return me2.ranks[mm] != null; }).slice(-6).reverse();
          $('#d-ranks').innerHTML = '<ul class="rank-list">' + ms.map(function (mm) { return '<li><b>#' + me2.ranks[mm] + '</b><span>' + monthLabel(mm) + '</span><small></small></li>'; }).join('') + '</ul>';
        } else {
          list.sort(function (x, y2) { return x.ranks[m] - y2.ranks[m]; });
          $('#d-ranks').innerHTML = '<p class="muted small" style="margin-bottom:6px">' + monthLabel(m) + '</p><ul class="rank-list">' + list.slice(0, 8).map(function (x) { var pm = r.months[r.months.length - 2], mv = x.ranks[pm] != null ? x.ranks[pm] - x.ranks[m] : null;
            return '<li><b>#' + x.ranks[m] + '</b><span>' + esc(x.name) + '</span><small class="' + (mv > 0 ? 'up' : mv < 0 ? 'down' : '') + '">' + (mv == null ? '' : mv > 0 ? '▲ ' + mv : mv < 0 ? '▼ ' + (-mv) : '—') + '</small></li>'; }).join('') + '</ul>';
        }
      }).catch(function () { $('#d-ranks').innerHTML = '<p class="muted">Rankings unavailable.</p>'; });
      api('/reports').then(function (list) { $('#d-reports').innerHTML = fileList(list.slice(0, 5), 'No reports have been published to your account yet.'); }).catch(function () {});
    });
  }
  function kpi(ic, l, v, d) { return '<div class="kpi">' + icon(ic) + '<div><div class="l">' + l + '</div><div class="v">' + v + '</div>' + d + '</div></div>'; }
  function head(eyebrow, title, sub, filters) {
    return '<div class="p-head"><div><p class="eyebrow">' + esc(eyebrow) + '</p><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (filters ? '<div class="p-filters">' + filters + '</div>' : '') + '</div>';
  }

  // =====================================================================
  // GAMING FIGURES
  // =====================================================================
  function figuresWeekly(q) {
    var ids = selFromHash(q);
    if (!ids.length) return view(head('Gaming Figures', 'Weekly Gaming Figures') + '<div class="empty-state"><b>No figures yet</b>Weekly figures have not been loaded for your account.</div>');
    return getFigures(ids).then(function (fig) {
      var weeks = combine(fig), latest = weeks[weeks.length - 1].d;
      var from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : addDays(latest, -7 * 25), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : latest;
      var lyMap = {}; weeks.forEach(function (w) { lyMap[w.d] = w; });
      var rows = weeks.filter(function (w) { return w.d >= from && w.d <= to; }).reverse();
      var tot = rows.reduce(function (s, w) { s.to += w.to; s.pr += w.pr; return s; }, { to: 0, pr: 0 });
      var html = '<p style="margin-bottom:10px"><a class="link" href="#/figures">← Back to the performance dashboard</a></p>' + head('Gaming Figures', 'Weekly Gaming Figures', esc(selLabel(ids)) + ' · weeks ending Sunday · latest week ' + niceDate(latest),
        '<div><label for="pick-venue">Venue</label>' + venuePicker(q) + '</div><div><label for="f-from">From</label><input type="date" id="f-from" value="' + from + '" min="' + weeks[0].d + '" max="' + latest + '"></div><div><label for="f-to">To</label><input type="date" id="f-to" value="' + to + '" min="' + weeks[0].d + '" max="' + latest + '"></div>' +
        '<div><button class="btn btn-gold btn-sm" id="f-csv" type="button">' + icon('down').replace('<svg ', '<svg width="18" height="18" ') + 'Download CSV</button></div>');
      html += '<div class="kpis">' + kpi('coins', 'Turnover', short(tot.to), '<span class="d">' + rows.length + ' weeks shown</span>') + kpi('chart', 'Gaming profit', short(tot.pr), '<span class="d">Average ' + short(rows.length ? tot.pr / rows.length : null) + ' a week</span>') +
        kpi('percent', 'RTV', pct(tot.to ? tot.pr / tot.to * 100 : null), '<span class="d">Profit ÷ turnover</span>') + kpi('venue', 'Venues', String(ids.length), '<span class="d">' + esc(selLabel(ids)) + '</span>') + '</div>';
      html += '<section class="card" style="margin-bottom:18px"><div class="chart-box"><canvas id="c-fig"></canvas></div></section>';
      html += '<section class="card"><div class="card-head"><div><h2>Week by week</h2><p class="sub">Each week compared with the same week last year (52 weeks earlier)</p></div></div><div class="tbl-wrap" style="max-height:560px"><table class="t"><thead><tr><th>Week ending</th><th>Turnover</th><th>Profit</th><th>RTV</th><th>Turnover LY</th><th>Profit LY</th><th>Profit change</th></tr></thead><tbody>' +
        rows.map(function (w) { var ly = lyMap[addDays(w.d, -364)], ch = ly ? change(w.pr, ly.pr) : null;
          return '<tr><td>' + niceDate(w.d) + (w.n < ids.length ? ' <span class="muted small">(' + w.n + '/' + ids.length + ' venues)</span>' : '') + '</td><td>' + money(w.to) + '</td><td>' + money(w.pr) + '</td><td>' + pct(w.to ? w.pr / w.to * 100 : null) + '</td><td>' + (ly ? money(ly.to) : '—') + '</td><td>' + (ly ? money(ly.pr) : '—') + '</td><td class="' + (ch >= 0 ? 'up' : 'down') + '">' + (ch == null ? '—' : (ch >= 0 ? '+' : '') + ch.toFixed(1) + '%') + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td>Total</td><td>' + money(tot.to) + '</td><td>' + money(tot.pr) + '</td><td>' + pct(tot.to ? tot.pr / tot.to * 100 : null) + '</td><td></td><td></td><td></td></tr></tfoot></table></div></section>';
      view(html);
      bindPicker('figures-weekly', { from: q.from, to: q.to });
      ['#f-from', '#f-to'].forEach(function (s) { $(s).addEventListener('change', function () { go('figures-weekly', Object.assign({}, q, { from: $('#f-from').value, to: $('#f-to').value })); }); });
      $('#f-csv').addEventListener('click', function () {
        var lines = ['Venue,Week ending,Turnover,Profit,RTV %'];
        fig.venues.forEach(function (v) { v.weeks.forEach(function (w) { if (w[0] >= from && w[0] <= to) lines.push('"' + v.name.replace(/"/g, '""') + '",' + w[0] + ',' + w[1].toFixed(2) + ',' + w[2].toFixed(2) + ',' + (w[1] ? (w[2] / w[1] * 100).toFixed(2) : '')); }); });
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
        a.download = 'EWC-gaming-figures-' + from + '-to-' + to + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      });
      var asc = rows.slice().reverse();
      chart($('#c-fig'), { data: { labels: asc.map(function (w) { return niceDate(w.d); }), datasets: [
        { type: 'bar', label: 'Turnover', data: asc.map(function (w) { return w.to; }), backgroundColor: 'rgba(197,160,74,.75)', yAxisID: 'y', order: 2 },
        { type: 'line', label: 'Profit', data: asc.map(function (w) { return w.pr; }), borderColor: '#141414', backgroundColor: '#141414', yAxisID: 'y1', pointRadius: 2, tension: .2, order: 1 }] },
        options: { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { grid: { color: GRID }, ticks: { callback: function (v) { return short(v); } }, title: { display: true, text: 'Turnover' } },
          y1: { position: 'right', grid: { display: false }, ticks: { callback: function (v) { return short(v); } }, title: { display: true, text: 'Profit' } } },
          plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + money(c.parsed.y); } } } } } });
    });
  }

  // ---------- Gaming Figures: the Executive Performance Dashboard ----------
  function scopes() {
    var all = accessibleWithFigures(), groups = {}, list = [];
    all.forEach(function (v) { (groups[v.group_id] = groups[v.group_id] || { name: v.grp, venues: [] }).venues.push(v); });
    var gids = Object.keys(groups).sort(function (a, b) { return groups[a].name.localeCompare(groups[b].name); });
    gids.forEach(function (g) {
      var G = groups[g];
      if (ME.role !== 'venue' && G.venues.length > 1) list.push({ id: 'g' + g, label: G.name + ' — all ' + G.venues.length + ' venues', group: G.name });
      G.venues.forEach(function (v) { list.push({ id: 'v' + v.id, label: v.name, group: G.name }); });
    });
    return list;
  }
  function figures(q) {
    var list = scopes();
    if (!list.length) return view(head('Gaming Figures', 'Gaming Figures') + '<div class="empty-state"><b>No figures yet</b>Your weekly gaming figures have not been loaded for your account.</div>');
    var cur = list.find(function (s) { return s.id === q.s; }) || list[0];
    var opts = '', lastG = null;
    list.forEach(function (s) { if (s.group !== lastG) { if (lastG !== null) opts += '</optgroup>'; opts += '<optgroup label="' + esc(s.group) + '">'; lastG = s.group; }
      opts += '<option value="' + s.id + '"' + (s.id === cur.id ? ' selected' : '') + '>' + esc(s.label) + '</option>'; });
    opts += '</optgroup>';
    var src = PREVIEW ? 'figures-dashboard.html#' + cur.id : '/portal/figures-view?scope=' + encodeURIComponent(cur.id);
    view('<div class="fig-bar"><div class="p-filters">' + (list.length > 1 ? '<div><label for="fig-scope">Showing</label><select id="fig-scope">' + opts + '</select></div>' : '') +
      '</div><a class="btn btn-outline btn-sm" href="#/figures-weekly' + (cur.id[0] === 'v' ? '?v=' + cur.id.slice(1) : cur.id[0] === 'g' ? '?g=' + cur.id.slice(1) : '') + '">Week-by-week table &amp; CSV download</a></div>' +
      '<div class="fig-frame-wrap"><p class="muted fig-loading">Loading your performance dashboard…</p><iframe id="fig-frame" title="Executive Performance Dashboard" src="' + src + '"></iframe></div>');
    var sel = $('#fig-scope'); if (sel) sel.addEventListener('change', function () { go('figures', { s: sel.value }); });
    var fr = $('#fig-frame'), timer = setInterval(function () {
      if (!document.body.contains(fr)) { clearInterval(timer); return; }
      try { var h = fr.contentDocument.documentElement.scrollHeight; if (h > 400) { fr.style.height = h + 'px'; var l = $('.fig-loading'); if (l) l.remove(); } } catch (e) {}
    }, 400);
  }

  // =====================================================================
  // RANKINGS
  // =====================================================================
  var AHA = {};   // release cache by period
  function getRelease(period) {
    var k = period || 'latest'; if (AHA[k]) return Promise.resolve(AHA[k]);
    return api('/aha/release' + (period ? '?period=' + period : '')).then(function (r) { AHA[k] = r; if (r.release) AHA[r.release.period] = r; return r; });
  }
  var LONGM = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function colTitle(c) { var m = +c.period.slice(5); return c.type === 'Q' ? LONGM[m - 1] + ' Quarter' : LONGM[m - 1] + ' Month'; }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function rankings(q) {
    return Promise.all([api('/aha/releases'), getRelease(q.r)]).then(function (res) {
      var releases = res[0], R = res[1];
      if (!R.release) return view(head('Monthly Rankings', 'AHA NSW Rankings') + '<div class="empty-state"><b>No AHA rankings yet</b>EWC uploads the AHA NSW Gaming Rankings each month.</div>');
      var rel = R.release, cols = rel.columns, mIdx = cols.length - 1, qIdx = cols.findIndex(function (c) { return c.type === 'Q'; });
      var relLabel = LONGM[+rel.period.slice(5) - 1] + ' ' + rel.period.slice(0, 4);
      var mineRows = R.rows.filter(function (r) { return r[5]; });
      // group the member's venues the way EWC's monthly email does
      var groups = {}; R.mine.forEach(function (v) { (groups[v.group] = groups[v.group] || []).push(v.id); });
      var gnames = Object.keys(groups).sort();
      var gsel = q.g && groups[q.g] ? q.g : gnames[0];
      var html = head('Monthly Rankings', 'AHA NSW ' + relLabel + ' Rankings', (rel.preliminary ? 'Preliminary rankings' : 'Rankings') + ' for ' + nf0.format(R.rows.length) + ' NSW hotels · lower is better',
        '<div><label for="r-rel">Release</label><select id="r-rel">' + releases.map(function (x) { return '<option value="' + x.period + '"' + (x.period === rel.period ? ' selected' : '') + '>' + LONGM[+x.period.slice(5) - 1] + ' ' + x.period.slice(0, 4) + (x.preliminary ? ' (preliminary)' : '') + '</option>'; }).join('') + '</select></div>' +
        (rel.reportId ? '<div><a class="btn btn-gold btn-sm" href="' + (PREVIEW ? '#' : '/api/reports/' + rel.reportId + '/download') + '" data-file="' + rel.reportId + '">' + icon('down').replace('<svg ', '<svg width="18" height="18" ') + 'AHA rankings PDF</a></div>' : ''));

      // 1. Your rankings — same table as the monthly email
      if (gnames.length) {
        var gr = mineRows.filter(function (r) { return groups[gsel].indexOf(r[5]) >= 0; }).sort(function (a, b) { var k = qIdx >= 0 ? qIdx : mIdx; return (a[4][k] || 9999) - (b[4][k] || 9999); });
        html += '<section class="rk-card">' + (gnames.length > 1 ? '<div class="tabs rk-tabs">' + gnames.map(function (g) { return '<button type="button" data-g="' + esc(g) + '" aria-pressed="' + (g === gsel) + '">' + esc(g) + '</button>'; }).join('') + '</div>' : '') +
          '<div class="rk-band"><b>' + esc(gsel) + '</b><span>' + LONGM[+rel.period.slice(5) - 1] + ' Monthly Rankings</span></div>' +
          '<div class="tbl-wrap rk-wrap"><table class="rk"><thead><tr><th class="v">Venue</th><th class="y">Yearly Ranking</th>' + (qIdx >= 0 ? '<th class="q">' + colTitle(cols[qIdx]) + '</th>' : '') + '<th class="m">' + colTitle(cols[mIdx]) + '</th></tr></thead><tbody>' +
          gr.map(function (r) { return '<tr><td class="v"><a href="#/rankings?r=' + rel.period + '&v=' + r[5] + (q.g ? '&g=' + encodeURIComponent(q.g) : '') + '">' + esc(r[1]) + '</a></td><td class="y">' + nf0.format(r[0]) + '</td>' + (qIdx >= 0 ? '<td class="q">' + (r[4][qIdx] == null ? '—' : nf0.format(r[4][qIdx])) + '</td>' : '') + '<td class="m">' + (r[4][mIdx] == null ? '—' : nf0.format(r[4][mIdx])) + '</td></tr>'; }).join('') +
          '</tbody></table></div></section>';
      } else if (ME.role !== 'admin') html += '<div class="notice info">Your venue is not in the AHA NSW hotel rankings (clubs are ranked separately).</div>';

      // 2. one venue in detail
      var vid = +q.v || (mineRows.length ? (mineRows.filter(function (r) { return !gnames.length || groups[gsel].indexOf(r[5]) >= 0; })[0] || mineRows[0])[5] : 0);
      html += '<div id="rk-detail"></div>';

      // 3. the whole list
      var lgas = Array.from(new Set(R.rows.map(function (r) { return r[3]; }))).sort();
      html += '<section class="card" style="margin-top:18px"><div class="card-head"><div><h2>' + icon('trophy') + 'Full AHA NSW list · ' + relLabel + '</h2><p class="sub">Every ranked hotel in NSW, ordered by year-to-date rank. Your venues are highlighted.</p></div></div>' +
        '<div class="p-filters" style="margin-bottom:12px"><div><label for="aha-q">Search hotel or suburb</label><input id="aha-q" type="search" placeholder="e.g. Parramatta" value="' + esc(q.s || '') + '"></div>' +
        '<div><label for="aha-lga">LGA</label><select id="aha-lga"><option value="">All LGAs</option>' + lgas.map(function (l) { return '<option' + (l === q.l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></div>' +
        (mineRows.length ? '<div><label class="check" style="margin-top:26px"><input type="checkbox" id="aha-mine"' + (q.m === '1' ? ' checked' : '') + '> My venues only</label></div>' : '') + '</div>' +
        '<div class="tbl-wrap"><table class="t aha"><thead><tr><th>YTD rank</th><th class="l">Hotel</th><th class="l">Suburb</th><th class="l">LGA</th>' + cols.map(function (c) { return '<th>' + (c.type === 'Q' ? c.label : c.label) + '</th>'; }).join('') + '</tr></thead><tbody id="aha-body"></tbody></table></div>' +
        '<div class="aha-pager"><span id="aha-count" class="muted small"></span><span><button class="btn btn-outline btn-sm" id="aha-prev" type="button">Previous</button> <button class="btn btn-outline btn-sm" id="aha-next" type="button">Next</button></span></div>' +
        '<p class="muted small" style="margin-top:10px">' + esc(rel.title) + '. These rankings are produced for AHA NSW members and are based on ' + (rel.preliminary ? 'preliminary data that may change' : 'final data') + '.</p></section>';
      view(html);

      $('#r-rel').addEventListener('change', function (e) { go('rankings', { r: e.target.value }); });
      $$('.rk-tabs button').forEach(function (b) { b.addEventListener('click', function () { go('rankings', { r: rel.period, g: b.dataset.g }); }); });
      // full list paging and filters
      var page = 0, PER = 50;
      function filtered() {
        var t = ($('#aha-q').value || '').toLowerCase().trim(), l = $('#aha-lga').value, m = $('#aha-mine') && $('#aha-mine').checked;
        return R.rows.filter(function (r) { return (!t || (r[1] + ' ' + r[2]).toLowerCase().indexOf(t) >= 0) && (!l || r[3] === l) && (!m || r[5]); });
      }
      function draw() {
        var f = filtered(), pages = Math.max(1, Math.ceil(f.length / PER)); if (page >= pages) page = pages - 1;
        $('#aha-body').innerHTML = f.slice(page * PER, page * PER + PER).map(function (r) {
          return '<tr' + (r[5] ? ' class="me"' : '') + ' id="aha-' + r[0] + '"><td>' + nf0.format(r[0]) + '</td><td class="l">' + esc(r[1]) + '</td><td class="l">' + esc(r[2]) + '</td><td class="l">' + esc(r[3]) + '</td>' + r[4].map(function (v) { return '<td>' + (v == null ? '—' : nf0.format(v)) + '</td>'; }).join('') + '</tr>'; }).join('') || '<tr><td colspan="9" class="l muted">No hotels match.</td></tr>';
        $('#aha-count').textContent = f.length ? 'Showing ' + (page * PER + 1) + '–' + Math.min(f.length, page * PER + PER) + ' of ' + nf0.format(f.length) + ' hotels' : '';
        $('#aha-prev').disabled = page === 0; $('#aha-next').disabled = page >= pages - 1;
      }
      ['#aha-q', '#aha-lga', '#aha-mine'].forEach(function (s) { var el = $(s); if (el) el.addEventListener(s === '#aha-q' ? 'input' : 'change', function () { page = 0; draw(); }); });
      $('#aha-prev').addEventListener('click', function () { page--; draw(); });
      $('#aha-next').addEventListener('click', function () { page++; draw(); });
      draw();
      if (vid) venueDetail(vid, rel, R);
    });
  }

  // One venue: commentary in the style of EWC's monthly ranking email, trend vs local competitors, history table.
  function venueDetail(vid, rel, R) {
    var box = $('#rk-detail'); if (!box) return;
    api('/rankings?venue=' + vid).then(function (rk) {
      var M = rk.venue.monthly, months = Object.keys(M).sort().filter(function (m) { return m <= rel.period; });
      var last12 = months.slice(-12), cur = M[rel.period], name = rk.venue.name;
      var txt = '';
      if (last12.length >= 4 && cur != null) {
        var worst = last12.reduce(function (a, b) { return M[b] > M[a] ? b : a; }), best = last12.reduce(function (a, b) { return M[b] < M[a] ? b : a; });
        var tail = last12.slice(-4).map(function (m) { return M[m]; });
        var recent = last12.slice(-3).reduce(function (a, m) { return a + M[m]; }, 0) / 3, before = last12.slice(-6, -3).reduce(function (a, m) { return a + M[m]; }, 0) / Math.max(1, last12.slice(-6, -3).length);
        var dir = recent < before - 5 ? 'The trend over the last three months is upward' : recent > before + 5 ? 'The last three months have eased compared with the three before' : 'The last three months have held steady';
        txt += '<p><b>12 month view.</b> Over the last ' + last12.length + ' months the monthly rank ranged from #' + M[best] + ' in ' + monthLabel(best) + ' to #' + M[worst] + ' in ' + monthLabel(worst) + '. ' + dir + ': ' + tail.slice(0, -1).join(', ') + ' and now ' + tail[tail.length - 1] + '.</p>';
      }
      var local = rk.competitors.filter(function (c) { return c.monthly[rel.period] != null; }).map(function (c) { return { n: c.name, r: c.monthly[rel.period] }; });
      if (cur != null && local.length) {
        var all = local.concat([{ n: name, r: cur, me: true }]).sort(function (a, b) { return a.r - b.r; });
        var pos = all.findIndex(function (x) { return x.me; }) + 1, ahead = all.slice(pos).slice(0, 3), above = all[pos - 2];
        txt += '<p><b>Local position.</b> Within the local comparison venues, ' + esc(name) + ' ranked ' + ord(pos) + ' of ' + all.length + ' in ' + LONGM[+rel.period.slice(5) - 1] + '.' +
          (ahead.length ? ' It finished ahead of ' + ahead.map(function (x) { return esc(x.n) + ' (' + x.r + ')'; }).join(', ').replace(/, ([^,]*)$/, ' and $1') + '.' : '') +
          (above ? ' It was ' + (cur - above.r) + ' place' + (cur - above.r === 1 ? '' : 's') + ' behind ' + esc(above.n) + ' (' + above.r + ').' : ' It was the highest ranked of the group.') + '</p>';
      }
      var per = months.slice(-13), comps = rk.competitors.slice().sort(function (a, b) { return (a.monthly[rel.period] || 9999) - (b.monthly[rel.period] || 9999); });
      box.innerHTML = '<div class="grid-2" style="margin-top:18px"><section class="card"><div class="card-head"><div><h2>' + esc(name) + ' · ranking trend</h2><p class="sub">Monthly AHA rank vs local comparison venues · rank axis inverted so higher is better</p></div></div><div class="chart-box tall"><canvas id="c-rank"></canvas></div></section>' +
        '<section class="card"><div class="card-head"><div><h2>' + esc(LONGM[+rel.period.slice(5) - 1]) + ' ranking update</h2><p class="sub">Written from the AHA figures</p></div></div><div class="rk-notes">' + (txt || '<p class="muted">Not enough ranking history for a summary yet.</p>') + '</div></section></div>' +
        '<section class="card"><div class="card-head"><div><h2>Monthly ranks · last 13 months</h2></div></div><div class="tbl-wrap"><table class="t"><thead><tr><th>Venue</th>' + per.map(function (m) { return '<th>' + monthLabel(m) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        [{ name: name, me: true, r: M }].concat(comps.map(function (c) { return { name: c.name + (c.suburb ? ' · ' + c.suburb : ''), r: c.monthly }; })).map(function (row) {
          return '<tr' + (row.me ? ' class="me"' : '') + '><td>' + esc(row.name) + '</td>' + per.map(function (m) { return '<td>' + (row.r[m] != null ? row.r[m] : '—') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></section>';
      var ds = [{ label: name, data: per.map(function (m) { return M[m] == null ? null : M[m]; }), borderColor: GOLD, backgroundColor: GOLD, borderWidth: 4, pointRadius: 3, tension: .2, spanGaps: true }];
      comps.forEach(function (c, i) { ds.push({ label: c.name, data: per.map(function (m) { return c.monthly[m] == null ? null : c.monthly[m]; }), borderColor: PALETTE[(i + 1) % PALETTE.length] + 'B0', borderWidth: 1.4, pointRadius: 0, tension: .2, spanGaps: true }); });
      chart($('#c-rank'), { type: 'line', data: { labels: per.map(monthLabel), datasets: ds },
        options: { interaction: { mode: 'nearest', intersect: false }, scales: { y: { reverse: true, grid: { color: GRID }, title: { display: true, text: 'Rank (1 = best)' } }, x: { grid: { display: false } } },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { mode: 'index', itemSort: function (a, b) { return a.parsed.y - b.parsed.y; }, callbacks: { label: function (c) { return '#' + c.parsed.y + '  ' + c.dataset.label; } } } } } });
    }).catch(function (e) { box.innerHTML = '<div class="notice err">' + esc(e.message) + '</div>'; });
  }

  // =====================================================================
  // REPORTS
  // =====================================================================
  function fileList(list, empty) {
    if (!list.length) return '<p class="muted">' + esc(empty) + '</p>';
    return '<ul class="files">' + list.map(function (r) {
      return '<li>' + icon('doc') + '<div><b>' + esc(r.title) + '</b>' + (r.status === 'draft' ? '<span class="tag draft">Draft</span>' : '') + '<div class="meta">' + esc(r.categoryLabel) + (r.period ? ' · ' + esc(r.period) : '') + ' · ' + esc(r.venue || r.group || '') + ' · ' + esc((r.file.split('.').pop() || '').toUpperCase()) + '</div></div>' +
        (r.online ? '<a class="dl" href="#/game-performance?t=' + (r.category === 'gp_monthly' ? 'monthly' : 'weekly') + '&o=' + encodeURIComponent(r.venue || r.group) + '&id=' + r.id + '">' + icon('analysis') + 'View</a>' : '') +
        (r.download === false ? '' : '<a class="dl" href="' + (PREVIEW ? '#' : '/api/reports/' + r.id + '/download') + '" data-file="' + r.id + '">' + icon('down') + 'Download</a>') + '</li>'; }).join('') + '</ul>';
  }
  // Game Performance: each report read online (same colours and lines as the Excel), plus the original file.
  var GP_COLS = [['install', 'Install Date'], ['gmid', 'GMID'], ['serial', 'Serial No.'], ['game', 'Game Type'], ['to', 'T/O Rank', 'n'], ['pr', 'Profit Rank', 'n'],
    ['rev', '$ Revenue', 'm'], ['turn', '$ Turnover', 'm'], ['lpj', 'LPJ Wins', 'm'], ['links', 'Links']];
  function gpMoney(v) { if (v === '' || v == null || isNaN(v)) return ''; var n = Number(v); return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function gpDay(d, long) { if (!d) return ''; var x = new Date(d + 'T12:00:00Z'); return x.toLocaleDateString('en-AU', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }); }
  function gpCell(r, c) {
    var v = r[c[0]], st = r.s && r.s[c[0]], css = '';
    if (st) { var p = st.split('/'); if (p[0]) css += 'background:#' + p[0] + ';'; if (p[1]) css += 'color:#' + p[1] + ';'; }
    var shown = c[2] === 'm' ? gpMoney(v) : (v == null ? '' : v);
    return '<td class="' + (c[2] ? 'r' : 'l') + (c[0] === 'game' ? ' gp-game' : '') + (st ? ' gp-hl' : '') + '"' + (css ? ' style="' + css + '"' : '') + '>' + esc(shown) + '</td>';
  }
  function gpSection(sec) {
    var cols = GP_COLS.filter(function (c) { return c[0] !== 'install' || sec.rows.some(function (r) { return r.install; }); })
      .filter(function (c) { return c[0] !== 'pr' || sec.rows.some(function (r) { return r.pr != null; }); })
      .filter(function (c) { return c[0] !== 'links' || sec.rows.some(function (r) { return r.links; }); });
    var t = sec.total || {}, net = sec.net;
    var h = '<section class="card gp-sec"><div class="gp-band"><div><b>' + esc(sec.name) + '</b><span>' + sec.rows.length + ' machines</span></div>' +
      '<dl><div><dt>Turnover</dt><dd>' + gpMoney(t.turn) + '</dd></div><div><dt>Revenue</dt><dd>' + gpMoney(t.rev) + '</dd></div>' +
      (net ? '<div><dt>Net after LPJ</dt><dd>' + gpMoney(net.rev) + '</dd></div>' : '') + '</dl></div>';
    h += '<div class="table-wrap gp-wrap"><table class="gp-table"><thead><tr>' + cols.map(function (c) { return '<th class="' + (c[2] ? 'r' : 'l') + '">' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += sec.rows.map(function (r) {
      return '<tr' + (r.line ? ' class="gp-line-' + r.line + '"' : '') + '>' + cols.map(function (c) { return gpCell(r, c); }).join('') + '</tr>' +
        (r.line ? '<tr class="gp-linelabel gp-ll-' + r.line + '"><td colspan="' + cols.length + '"><span>' + (r.line === 'avg' ? 'Floor Average Line' : 'Bottom 20% Line') + '</span></td></tr>' : '');
    }).join('');
    h += '</tbody><tfoot><tr><td class="l" colspan="' + cols.map(function (c) { return c[0]; }).indexOf('rev') + '">Total for ' + esc(sec.name) + '</td><td class="r">' + gpMoney(t.rev) + '</td><td class="r">' + gpMoney(t.turn) + '</td><td class="r">' + (t.lpj ? gpMoney(t.lpj) : '') + '</td>' + (cols.some(function (c) { return c[0] === 'links'; }) ? '<td></td>' : '') + '</tr>' +
      (net ? '<tr class="gp-net"><td class="l" colspan="' + cols.map(function (c) { return c[0]; }).indexOf('rev') + '">Net after LPJ</td><td class="r">' + gpMoney(net.rev) + '</td><td class="r">' + gpMoney(net.turn) + '</td><td></td>' + (cols.some(function (c) { return c[0] === 'links'; }) ? '<td></td>' : '') + '</tr>' : '') + '</tfoot></table></div></section>';
    return h;
  }
  function gameperf(q) {
    var tab = q.t === 'monthly' ? 'gp_monthly' : 'gp_weekly';
    return api('/reports?category=' + tab).then(function (list) {
      var html = head('Game Performance', 'Game Performance Reports', 'Machine-by-machine performance: turnover and profit ranks, Floor Average and Bottom 20% lines, links and game conversions.');
      html += '<div class="tabs"><button type="button" data-t="weekly" aria-pressed="' + (tab === 'gp_weekly') + '">Weekly reports</button><button type="button" data-t="monthly" aria-pressed="' + (tab === 'gp_monthly') + '">Monthly reports</button></div>';
      var online = list.filter(function (r) { return r.online; });
      if (!list.length) {
        html += '<section class="card"><div class="empty-state"><b>No ' + (tab === 'gp_weekly' ? 'weekly' : 'monthly') + ' Game Performance reports yet</b>' + (ME.role === 'admin' ? 'Upload them in <a class="link" href="#/admin/data">Data &amp; Uploads</a>. Weekly reports are one file per group.' : 'Your reports appear here as soon as EWC publishes them.') + '</div></section>';
        view(html); bindTabs(); return;
      }
      // choose the account (group or venue file) and the period
      var owners = []; online.forEach(function (r) { var o = r.venue || r.group; if (owners.indexOf(o) < 0) owners.push(o); }); owners.sort();
      var owner = owners.indexOf(q.o) >= 0 ? q.o : owners[0];
      var mine = online.filter(function (r) { return (r.venue || r.group) === owner; });
      var cur = mine.filter(function (r) { return String(r.id) === String(q.id); })[0] || mine[0];
      if (cur) {
        html += '<section class="card gp-controls"><div class="gp-pick">' +
          (owners.length > 1 ? '<label>Account<select id="gp-owner">' + owners.map(function (o) { return '<option' + (o === owner ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>' : '') +
          '<label>' + (tab === 'gp_weekly' ? 'Week ending' : 'Four weeks ending') + '<select id="gp-period">' + mine.map(function (r) { return '<option value="' + r.id + '"' + (r === cur ? ' selected' : '') + '>' + gpDay(r.period, true) + '</option>'; }).join('') + '</select></label>' +
          '<label id="gp-venue-wrap" hidden>Venue<select id="gp-venue"></select></label></div>' +
          '<div class="gp-actions">' + (cur.download ? '<a class="btn btn-outline btn-sm" href="' + (PREVIEW ? '#' : '/api/reports/' + cur.id + '/download') + '" data-file="' + cur.id + '">' + icon('down') + 'Download Excel</a>' : '') + '</div></section>' +
          '<div id="gp-body"><section class="card"><p class="muted">Loading the report…</p></section></div>';
      }
      var files = list.filter(function (r) { return r.download; });
      if (files.length) html += '<details class="card gp-files"><summary><b>All ' + (tab === 'gp_weekly' ? 'weekly' : 'monthly') + ' files</b> <span class="muted">' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' to download</span></summary>' + fileList(files) + '</details>';
      view(html); bindTabs();
      if (!cur) return;
      $('#gp-period').onchange = function () { go('game-performance', { t: q.t, o: owner, id: this.value }); };
      if ($('#gp-owner')) $('#gp-owner').onchange = function () { go('game-performance', { t: q.t, o: this.value }); };
      return api('/reports/' + cur.id + '/view').then(function (v) {
        var secs = v.sections || [];
        var draw = function (which) {
          var show = which === 'all' ? secs : secs.filter(function (s) { return s.name === which; });
          var tt = show.reduce(function (a, s) { var t = s.total || {}; a.turn += t.turn || 0; a.rev += t.rev || 0; a.net += (s.net ? s.net.rev : t.rev || 0); a.n += s.rows.length; return a; }, { turn: 0, rev: 0, net: 0, n: 0 });
          $('#gp-body').innerHTML =
            '<section class="card gp-head"><div><p class="eyebrow">' + (tab === 'gp_weekly' ? 'Weekly' : 'Monthly') + ' Game Performance</p><h2>' + esc(which === 'all' ? owner : which) + '</h2>' +
            '<p class="sub">' + gpDay(v.start, true) + ' – ' + gpDay(v.end, true) + (show.length > 1 ? ' · ' + show.length + ' venues' : '') + '</p></div>' +
            '<div class="kpis gp-kpis"><div class="kpi"><span>Turnover</span><b>' + gpMoney(tt.turn) + '</b></div><div class="kpi"><span>Revenue</span><b>' + gpMoney(tt.rev) + '</b></div>' +
            '<div class="kpi"><span>Net after LPJ</span><b>' + gpMoney(tt.net) + '</b></div><div class="kpi"><span>Machines</span><b>' + tt.n + '</b></div></div>' +
            '<p class="gp-legend"><span class="gp-key gp-key-avg"></span>Floor Average Line <span class="gp-key gp-key-b20"></span>Bottom 20% Line <span class="muted">· Colours follow the EWC game-type key in the Excel report.</span></p></section>' +
            show.map(gpSection).join('');
        };
        if (secs.length > 1) {
          $('#gp-venue-wrap').hidden = false;
          $('#gp-venue').innerHTML = '<option value="all">All venues</option>' + secs.map(function (s) { return '<option>' + esc(s.name) + '</option>'; }).join('');
          if (q.v && secs.some(function (s) { return s.name === q.v; })) $('#gp-venue').value = q.v;
          $('#gp-venue').onchange = function () { q.v = this.value; draw(this.value); };
        }
        draw($('#gp-venue').value || 'all');
      }).catch(function (e) { $('#gp-body').innerHTML = '<section class="card"><div class="notice err">' + esc(e.message) + '</div></section>'; });
    });
    function bindTabs() { $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { go('game-performance', { t: b.dataset.t }); }); }); }
  }
  function reports() {
    return api('/reports').then(function (list) {
      var cats = [['gp_weekly', 'Game Performance · Weekly'], ['gp_monthly', 'Game Performance · Monthly'], ['figures', 'Gaming Figures'], ['rankings', 'Monthly Rankings'], ['resource', 'Resources']];
      var html = head('Reports & Resources', 'Reports & Resources', 'Every file EWC has published to your account, newest first.');
      html += cats.map(function (c) { var l = list.filter(function (r) { return r.category === c[0]; });
        return '<section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>' + icon('doc') + esc(c[1]) + '</h2><p class="sub">' + l.length + ' file' + (l.length === 1 ? '' : 's') + '</p></div></div>' + fileList(l, 'Nothing published here yet.') + '</section>'; }).join('');
      view(html);
    });
  }

  // =====================================================================
  // ASK A QUESTION
  // =====================================================================
  function ask() {
    var venueText = ME.role === 'admin' ? 'EWC administrator' : ME.role === 'group' ? ME.group : ME.venue + (ME.group && ME.group !== ME.venue ? ' (' + ME.group + ')' : '');
    view(head('Support', 'Ask a Question', 'Questions about your reports, gaming figures, rankings or account go straight to the EWC team at admin@elsonwhiteconsulting.com.au.') +
      '<section class="card"><div id="ask-msg"></div><form class="p-form" id="ask-form">' +
      '<div><label for="a-name">Member name</label><input id="a-name" value="' + esc(ME.name) + '" readonly></div>' +
      '<div><label for="a-venue">Venue / account</label><input id="a-venue" value="' + esc(venueText) + '" readonly></div>' +
      '<div><label for="a-email">Email</label><input id="a-email" value="' + esc(ME.email || 'Not on file — EWC will reply through your venue contact') + '" readonly></div>' +
      '<div><label for="a-cat">Enquiry category</label><select id="a-cat" name="category">' + ['Game Performance report', 'Gaming figures', 'Monthly rankings', 'My account or sign-in', 'Other'].map(function (o) { return '<option>' + o + '</option>'; }).join('') + '</select></div>' +
      '<div class="full"><label for="a-subject">Subject</label><input id="a-subject" name="subject" required maxlength="200"></div>' +
      '<div class="full"><label for="a-message">Message</label><textarea id="a-message" name="message" required maxlength="8000"></textarea></div>' +
      '<div class="full"><label for="a-file">Attachment <span class="muted">(optional · PDF, Excel, Word, PowerPoint or image, up to 10 MB)</span></label><input id="a-file" name="attachment" type="file" accept=".pdf,.xlsx,.xls,.csv,.docx,.pptx,.png,.jpg,.jpeg"></div>' +
      '<div class="full"><button class="btn btn-gold" type="submit">Send question</button></div></form></section>');
    $('#ask-form').addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, msg = $('#ask-msg');
      if (!f.subject.value.trim() || !f.message.value.trim()) { msg.innerHTML = '<div class="notice err">Please add a subject and a message.</div>'; return; }
      var fd = new FormData(f); var btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
      api('/ask', { method: 'POST', form: fd }).then(function (r) {
        msg.innerHTML = '<div class="notice ok"><b>Thank you — your question has been sent to the EWC team.</b> ' + (r.status && r.status.indexOf('outbox') >= 0 ? '<br><span class="small">(Email sending is not switched on yet, so it was saved for the team to see in the portal.)</span>' : 'They will reply by email.') + '</div>';
        f.reset(); btn.disabled = false; btn.textContent = 'Send question';
      }).catch(function (err) { msg.innerHTML = '<div class="notice err">' + esc(err.message) + '</div>'; btn.disabled = false; btn.textContent = 'Send question'; });
    });
  }

  // =====================================================================
  // ACCOUNT
  // =====================================================================
  function account(q) {
    var forced = ME.mustChange;
    view(head('My Account', forced ? 'Choose a new password' : 'My Account', forced ? 'Your account was set up with a temporary password. Choose your own to continue.' : 'Signed in as ' + esc(ME.username) + ' · ' + esc(roleLabel(ME))) +
      '<section class="card"><div id="pw-msg"></div><form class="p-form" id="pw-form">' +
      '<div class="full"><label for="pw-cur">Current password</label><input id="pw-cur" type="password" autocomplete="current-password" required></div>' +
      '<div><label for="pw-new">New password</label><input id="pw-new" type="password" autocomplete="new-password" minlength="10" required><p class="hint">At least 10 characters. A short phrase is easiest to remember.</p></div>' +
      '<div><label for="pw-new2">Confirm new password</label><input id="pw-new2" type="password" autocomplete="new-password" required></div>' +
      '<div class="full"><button class="btn btn-gold" type="submit">Save new password</button></div></form></section>');
    $('#pw-form').addEventListener('submit', function (e) {
      e.preventDefault(); var m = $('#pw-msg');
      if ($('#pw-new').value !== $('#pw-new2').value) { m.innerHTML = '<div class="notice err">The two new passwords do not match.</div>'; return; }
      api('/account/password', { method: 'POST', body: { current: $('#pw-cur').value, next: $('#pw-new').value } })
        .then(function () { m.innerHTML = '<div class="notice ok">Password changed. Please sign in again.</div>'; setTimeout(function () { location.href = PREVIEW ? 'login.html' : '/login?set=1'; }, 1400); })
        .catch(function (err) { m.innerHTML = '<div class="notice err">' + esc(err.message) + '</div>'; });
    });
  }
  function roleLabel(u) { return u.role === 'admin' ? 'Company Administrator — all venues' : u.role === 'group' ? 'Group Account — ' + u.group : 'Venue Member — ' + u.venue; }

  // =====================================================================
  // ADMIN
  // =====================================================================
  var OV = null;
  function overview() { return api('/admin/overview').then(function (o) { OV = o; return o; }); }
  function groupOpts(sel) { return OV.groups.map(function (g) { return '<option value="' + g.id + '"' + (String(sel) === String(g.id) ? ' selected' : '') + '>' + esc(g.name) + ' (' + g.venues + ')</option>'; }).join(''); }
  function venueOpts(gid) { return '<option value="">Whole group</option>' + OV.venues.filter(function (v) { return !gid || String(v.group_id) === String(gid); }).map(function (v) { return '<option value="' + v.id + '">' + esc(v.name) + '</option>'; }).join(''); }

  function adminData() {
    return overview().then(function (o) {
      var maxW = o.venues.reduce(function (m, v) { return v.latest_week > m ? v.latest_week : m; }, '');
      var html = head('Administration', 'Data & Uploads', 'Publish reports and keep the gaming figures and rankings up to date. Every upload shows a preview before anything changes.');
      if (!o.emailConfigured) html += '<div class="notice info"><b>Email is not switched on yet.</b> Enquiries and set-up links are saved in the portal (Enquiries page) until SMTP settings are added — see the publishing guide.</div>';
      // 1. upload reports
      html += '<div class="grid-2e"><section class="card"><div class="card-head"><div><h2>1 · Upload reports</h2><p class="sub">Game Performance (weekly, one file per group), monthly reports, rankings packs and resources</p></div></div><div id="up-msg"></div>' +
        '<form class="p-form" id="up-form" style="grid-template-columns:1fr 1fr">' +
        '<div><label for="up-cat">Report type</label><select id="up-cat" name="category"><option value="gp_weekly">Game Performance · Weekly</option><option value="gp_monthly">Game Performance · Monthly</option><option value="figures">Gaming Figures</option><option value="rankings">Monthly Rankings</option><option value="resource">Resource</option></select></div>' +
        '<div><label for="up-period">Period</label><input id="up-period" name="period" type="date"><p class="hint">Week-ending date, or any day in the month for monthly reports.</p></div>' +
        '<div><label for="up-group">Group</label><select id="up-group" name="group_id">' + groupOpts() + '</select></div>' +
        '<div><label for="up-venue">Venue</label><select id="up-venue" name="venue_id">' + venueOpts(o.groups[0] && o.groups[0].id) + '</select></div>' +
        '<div class="full"><label class="check" style="font-weight:400"><input type="checkbox" name="venue_members" id="up-vm"> Venue members in this group can also see a whole-group file</label><p class="hint">Leave unticked so only the Group Account sees other venues’ machines. Single-venue groups are ticked for you.</p></div>' +
        '<div class="full"><label for="up-files">Files</label><input id="up-files" name="files" type="file" multiple required accept=".pdf,.xlsx,.xls,.csv,.pptx,.docx"></div>' +
        '<div><label for="up-status">Status</label><select id="up-status" name="status"><option value="published">Publish now</option><option value="draft">Save as draft (admins only)</option></select></div>' +
        '<div style="align-self:end"><button class="btn btn-gold" type="submit">Upload</button></div></form></section>';
      // 2/3 imports
      html += '<div class="stack"><section class="card"><div class="card-head"><div><h2>2 · Weekly gaming figures</h2><p class="sub">Upload the weekly figures workbook (the “Weekly Figures … (TL Copy)” file)</p></div></div><div id="imp-f-msg"></div>' +
        '<form class="p-form" id="imp-f" style="grid-template-columns:1fr 1fr"><div><label for="imp-f-g">Group</label><select id="imp-f-g" name="group_id"><option value="">Match any venue</option>' + groupOpts() + '</select></div>' +
        '<div><label for="imp-f-file">Workbook</label><input id="imp-f-file" name="file" type="file" accept=".xlsx,.xls,.csv" required></div>' +
        '<div class="full"><button class="btn btn-gold btn-sm" type="submit">Check file</button> <span class="muted small">Nothing is saved until you confirm.</span></div></form></section>' +
        '<section class="card"><div class="card-head"><div><h2>3 · AHA monthly rankings</h2><p class="sub">Upload the AHA NSW Gaming Rankings PDF each month. Members see the whole list and their own venues’ ranks.</p></div></div><div id="imp-a-msg"></div>' +
        '<form class="p-form" id="imp-a" style="grid-template-columns:1fr auto"><div><label for="imp-a-file">AHA rankings PDF</label><input id="imp-a-file" name="file" type="file" accept=".pdf" required></div>' +
        '<div style="align-self:end"><button class="btn btn-gold btn-sm" type="submit">Check file</button></div></form>' +
        '<details style="margin-top:12px"><summary class="muted small" style="cursor:pointer">Or upload ranks as a spreadsheet (Venue, Month, Rank)</summary><div id="imp-r-msg" style="margin-top:10px"></div>' +
        '<form class="p-form" id="imp-r" style="grid-template-columns:1fr auto;margin-top:8px"><div><label for="imp-r-file">Rankings file</label><input id="imp-r-file" name="file" type="file" accept=".xlsx,.xls,.csv" required></div>' +
        '<div style="align-self:end"><button class="btn btn-outline btn-sm" type="submit">Check file</button></div></form></details></section></div></div>';
      // freshness
      html += '<section class="card" style="margin-bottom:18px"><div class="card-head"><div><h2>Data freshness</h2><p class="sub">Latest week of figures and latest ranking month held for each venue</p></div></div><div class="tbl-wrap" style="max-height:520px"><table class="t"><thead><tr><th>Venue</th><th class="l">Group</th><th>Latest figures (w/e)</th><th>Latest rank month</th></tr></thead><tbody>' +
        o.venues.map(function (v) { var st = !v.latest_week ? 'none' : v.latest_week >= addDays(maxW, -7) ? 'fresh' : 'stale';
          return '<tr><td>' + esc(v.name) + '</td><td class="l">' + esc(v.grp) + '</td><td><span class="pill ' + st + '">' + (v.latest_week ? niceDate(v.latest_week) : 'No figures') + '</span></td><td>' + (v.latest_rank ? monthLabel(v.latest_rank) : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
      html += '<section class="card"><div class="card-head"><div><h2>Published files</h2><p class="sub">Everything uploaded, including drafts</p></div></div><div id="adm-files"><p class="muted">Loading…</p></div></section>';
      view(html);

      var g = $('#up-group'), vs = $('#up-venue'), vm = $('#up-vm');
      function syncGroup() { vs.innerHTML = venueOpts(g.value); var grp = OV.groups.find(function (x) { return String(x.id) === g.value; }); vm.checked = grp && grp.venues === 1; }
      g.addEventListener('change', syncGroup); syncGroup();
      $('#up-form').addEventListener('submit', function (e) {
        e.preventDefault(); var f = e.target, fd = new FormData(f), m = $('#up-msg');
        var p = $('#up-period').value; if (p && $('#up-cat').value !== 'gp_weekly') fd.set('period', p.slice(0, 7));
        api('/admin/reports', { method: 'POST', form: fd }).then(function (r) { m.innerHTML = '<div class="notice ok">' + r.ids.length + ' file' + (r.ids.length > 1 ? 's' : '') + ' uploaded.</div>'; f.reset(); syncGroup(); loadFiles(); })
          .catch(function (err) { m.innerHTML = '<div class="notice err">' + esc(err.message) + '</div>'; });
      });
      importFlow('#imp-f', '#imp-f-msg', '/admin/import/figures', function (r) {
        return '<b>' + r.rows + ' venue-weeks found</b> · ' + r.weeks + ' weeks · ' + niceDate(r.from) + ' to ' + niceDate(r.to) + '<br>Venues: ' + esc(r.venues.join(', ')) +
          (r.unmatched && r.unmatched.length ? '<br><span class="down">Columns not matched to a venue (ignored): ' + esc(r.unmatched.join(', ')) + '</span>' : '') +
          (r.warnings && r.warnings.length ? '<ul>' + r.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '');
      });
      importFlow('#imp-r', '#imp-r-msg', '/admin/import/rankings', function (r) {
        return '<b>' + r.rows + ' ranks found</b> · ' + r.venues + ' for EWC venues, ' + r.competitors + ' for competitors · periods ' + esc(r.periods.join(', ')) +
          (r.unmatched && r.unmatched.length ? '<br><span class="down">Not matched (ignored): ' + esc(r.unmatched.join(', ')) + '</span>' : '');
      });
      importFlow('#imp-a', '#imp-a-msg', '/admin/import/aha', function (r) {
        var ci = r.columns.length - 1;
        return '<b>' + esc(r.title) + '</b><br>' + nf0.format(r.hotels) + ' hotels · columns ' + esc(r.columns.map(function (c) { return c.label; }).join(', ')) + (r.replaces ? '<br><b>This replaces the ' + monthLabel(r.period) + ' release already loaded.</b>' : '') +
          '<br>Found ' + r.venues.length + ' EWC venues and ' + r.competitors + ' tracked competitors.' + (r.notFound.length ? ' <span class="down">Not in this list: ' + esc(r.notFound.join(', ')) + '</span>' : '') +
          '<div class="tbl-wrap" style="margin-top:8px;max-height:220px"><table class="t"><thead><tr><th>Venue</th><th>YTD</th>' + r.columns.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          r.venues.map(function (v) { return '<tr><td>' + esc(v.name) + '</td><td>' + v.ytd + '</td>' + v.values.map(function (x) { return '<td>' + (x == null ? '—' : x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      });
      loadFiles();
    });
  }
  function importFlow(formSel, msgSel, url, describe) {
    var form = $(formSel), msg = $(msgSel), pending = null;
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var fd = new FormData(form); pending = fd;
      msg.innerHTML = '<p class="muted">Reading file…</p>';
      api(url, { method: 'POST', form: fd }).then(function (r) {
        msg.innerHTML = '<div class="notice info">' + describe(r) + '<div style="margin-top:10px"><button class="btn btn-gold btn-sm" type="button" data-confirm>Save and publish</button> <button class="btn btn-outline btn-sm" type="button" data-cancel>Cancel</button></div></div>';
        msg.querySelector('[data-cancel]').onclick = function () { msg.innerHTML = ''; };
        msg.querySelector('[data-confirm]').onclick = function () {
          var fd2 = new FormData(form); fd2.set('confirm', 'yes');
          api(url, { method: 'POST', form: fd2 }).then(function (r2) { msg.innerHTML = '<div class="notice ok">Saved' + (typeof r2.saved === 'number' ? ' ' + r2.saved + ' rows' : '') + '. Members see the update straight away.</div>'; figCache = {}; AHA = {}; form.reset(); })
            .catch(function (err) { msg.innerHTML = '<div class="notice err">' + esc(err.message) + '</div>'; });
        };
      }).catch(function (err) { msg.innerHTML = '<div class="notice err">' + esc(err.message) + (err.data && err.data.unmatched && err.data.unmatched.length ? '<br>Not matched: ' + esc(err.data.unmatched.join(', ')) : '') + '</div>'; });
    });
  }
  function loadFiles() {
    api('/reports').then(function (list) {
      var el = $('#adm-files'); if (!el) return;
      if (!list.length) { el.innerHTML = '<p class="muted">No files uploaded yet.</p>'; return; }
      el.innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th>File</th><th class="l">Type</th><th class="l">Group / venue</th><th class="l">Period</th><th class="l">Status</th><th></th></tr></thead><tbody>' + list.map(function (r) {
        return '<tr><td><a class="link" href="' + (PREVIEW ? '#' : '/api/reports/' + r.id + '/download') + '">' + esc(r.title) + '</a></td><td class="l">' + esc(r.categoryLabel) + '</td><td class="l">' + esc(r.venue || r.group) + (r.venueMembers ? ' <span class="tag">+ venue members</span>' : '') + '</td><td class="l">' + esc(r.period || '') + '</td><td class="l">' + esc(r.status) + '</td>' +
          '<td><button class="dl" data-toggle="' + r.id + '" data-s="' + (r.status === 'draft' ? 'published' : 'draft') + '">' + (r.status === 'draft' ? 'Publish' : 'Unpublish') + '</button><button class="dl" data-del="' + r.id + '">Delete</button></td></tr>'; }).join('') + '</tbody></table></div>';
      $$('[data-del]', el).forEach(function (b) { b.onclick = function () { if (confirm('Delete this file for everyone?')) api('/admin/reports/' + b.dataset.del, { method: 'DELETE' }).then(loadFiles).catch(function (e) { toast(e.message); }); }; });
      $$('[data-toggle]', el).forEach(function (b) { b.onclick = function () { api('/admin/reports/' + b.dataset.toggle + '/status', { method: 'POST', body: { status: b.dataset.s } }).then(loadFiles); }; });
    });
  }

  function adminUsers() {
    return Promise.all([overview(), api('/admin/users'), api('/admin/tools-all')]).then(function (res) {
      var users = res[1], ALLT = res[2];
      var tname = function (s) { var t = ALLT.find(function (x) { return x.slug === s; }); return t ? t.name : s; };
      var html = head('Administration', 'Members', 'Create accounts and choose what each person can see. Members set their own password from an emailed link.');
      html += '<div class="grid-2e"><section class="card"><div class="card-head"><div><h2>Add a member</h2><p class="sub">Group Accounts see every venue in their group; Venue Members see one venue</p></div></div><div id="u-msg"></div><form class="p-form" id="u-form" style="grid-template-columns:1fr 1fr">' +
        '<div><label for="u-name">Name</label><input id="u-name" name="name" required placeholder="e.g. West Ryde Hotel — Nick"></div>' +
        '<div><label for="u-username">Username</label><input id="u-username" name="username" required pattern="[a-z0-9._-]{3,40}" placeholder="e.g. westrydehotel"></div>' +
        '<div class="full"><label for="u-email">Email</label><input id="u-email" name="email" type="email" placeholder="Where the set-up link is sent"></div>' +
        '<div><label for="u-role">Access</label><select id="u-role" name="role"><option value="venue">Venue Member — one venue</option><option value="group">Group Account — whole group</option><option value="admin">Company Administrator — everything</option></select></div>' +
        '<div id="u-scope"></div>' +
        '<div class="full"><label for="u-method">How they get their password</label><select id="u-method" name="method"><option value="invite">Email them a set-up link (recommended)</option><option value="password">I’ll set a temporary password and tell them</option></select></div>' +
        '<div class="full" id="u-pw" hidden><label for="u-password">Temporary password</label><input id="u-password" name="password" type="text" minlength="10" autocomplete="off"><p class="hint">They must change it the first time they sign in.</p></div>' +
        '<div class="full"><button class="btn btn-gold" type="submit">Create account</button></div></form></section>' +
        '<section class="card"><div class="card-head"><div><h2>How members get access</h2></div></div><ol class="steps"><li>You create the account here and choose the group or venue.</li><li>They receive an email from EWC with their username and a link to set their own password (valid 7 days).</li><li>They sign in at Member Login. “Forgot password?” emails them a fresh link (valid 1 hour).</li><li>To remove access, deactivate the account — they are signed out at once.</li></ol></section></div>';
      html += '<section class="card"><div class="card-head"><div><h2>All accounts</h2><p class="sub">' + users.length + ' accounts</p></div></div><div class="tbl-wrap"><table class="t"><thead><tr><th>Name</th><th class="l">Username</th><th class="l">Access</th><th class="l">Email</th><th class="l">Last sign-in</th><th class="l">Status</th><th></th></tr></thead><tbody>' +
        users.map(function (u) { return '<tr><td>' + esc(u.name) + '</td><td class="l">' + esc(u.username) + '</td><td class="l">' + esc(u.role === 'admin' ? 'Administrator' : u.role === 'group' ? 'Group · ' + u.group_name : 'Venue · ' + u.venue_name) + (u.role === 'admin' ? '<br><span class="muted small">Tools: ' + esc((u.tools || []).map(tname).join(', ') || 'none') + '</span>' : '') + '</td><td class="l">' + esc(u.email || '—') + '</td><td class="l">' + esc(u.last_login ? u.last_login.slice(0, 16) : 'Never') + '</td><td class="l">' + (u.active ? (u.has_password ? (u.must_change ? 'Must change password' : 'Active') : 'Invite sent') : 'Deactivated') + '</td>' +
          '<td>' + (u.email ? '<button class="dl" data-act="send-reset" data-id="' + u.id + '">Send link</button>' : '') + '<button class="dl" data-act="temp-password" data-id="' + u.id + '">Temp password</button>' + (u.role === 'admin' ? '<button class="dl" data-tools-edit="' + u.id + '">Tools</button>' : '') + (u.id !== ME.id ? '<button class="dl" data-act="' + (u.active ? 'deactivate' : 'activate') + '" data-id="' + u.id + '">' + (u.active ? 'Deactivate' : 'Reactivate') + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
      view(html);
      function scope() { var r = $('#u-role').value; $('#u-scope').innerHTML = r === 'group' ? '<label for="u-group">Group</label><select id="u-group" name="group_id">' + groupOpts() + '</select>' : r === 'venue' ? '<label for="u-venue">Venue</label><select id="u-venue" name="venue_id">' + OV.venues.map(function (v) { return '<option value="' + v.id + '">' + esc(v.name) + ' · ' + esc(v.grp) + '</option>'; }).join('') + '</select>' : '<p class="hint" style="margin-top:28px">Sees and manages everything.</p>'; }
      $('#u-role').addEventListener('change', scope); scope();
      $('#u-method').addEventListener('change', function () { $('#u-pw').hidden = this.value !== 'password'; });
      $('#u-form').addEventListener('submit', function (e) {
        e.preventDefault(); var f = e.target, body = {}; new FormData(f).forEach(function (v, k) { body[k] = v; });
        api('/admin/users', { method: 'POST', body: body }).then(function (r) {
          $('#u-msg').innerHTML = '<div class="notice ok">Account created.' + (r.invite ? ' Set-up email: ' + esc(r.invite.status) + '.' + (r.invite.status.indexOf('outbox') >= 0 ? '<br>Until email is switched on, send them this link yourself: <code style="word-break:break-all">' + esc(r.invite.link) + '</code>' : '') : ' Tell them their username and temporary password.') + '</div>';
          setTimeout(adminUsers, r.invite && r.invite.status.indexOf('outbox') >= 0 ? 15000 : 1200);
        }).catch(function (err) { $('#u-msg').innerHTML = '<div class="notice err">' + esc(err.message) + '</div>'; });
      });
      $$('[data-tools-edit]').forEach(function (b) { b.onclick = function () {
        var u = users.find(function (x) { return String(x.id) === b.dataset.toolsEdit; }), tr = b.closest('tr'), nx = tr.nextElementSibling;
        if (nx && nx.classList.contains('tools-row')) { nx.remove(); return; }
        var row = document.createElement('tr'); row.className = 'tools-row';
        row.innerHTML = '<td colspan="7" class="l"><b>My Tools for ' + esc(u.name) + '</b><div class="tool-picks">' + ALLT.map(function (t) { return '<label><input type="checkbox" value="' + esc(t.slug) + '"' + ((u.tools || []).indexOf(t.slug) >= 0 ? ' checked' : '') + '> ' + esc(t.name) + '</label>'; }).join('') + '</div><button class="btn btn-gold btn-sm" type="button">Save tools</button></td>';
        tr.after(row);
        row.querySelector('button').onclick = function () {
          var picks = $$('input:checked', row).map(function (i) { return i.value; });
          api('/admin/users/' + u.id + '/tools', { method: 'POST', body: { tools: picks } }).then(function () {
            toast('Tools saved for ' + u.name + '.' + (u.id === ME.id ? ' Reloading your menu…' : ''));
            if (u.id === ME.id) setTimeout(function () { location.reload(); }, 900); else adminUsers();
          }).catch(function (e) { toast(e.message); });
        };
      }; });
      $$('[data-act]').forEach(function (b) { b.onclick = function () {
        var a = b.dataset.act, body = {};
        if (a === 'temp-password') { var pw = prompt('New temporary password (at least 10 characters). They must change it at next sign-in:'); if (!pw) return; body.password = pw; }
        if (a === 'deactivate' && !confirm('Deactivate this account? They are signed out immediately.')) return;
        api('/admin/users/' + b.dataset.id + '/' + a, { method: 'POST', body: body }).then(function (r) {
          if (r.link) toast('Link ' + (r.status.indexOf('outbox') >= 0 ? 'saved (email not switched on yet). Send it yourself:\n\n' : 'emailed.\n\n') + r.link);
          adminUsers();
        }).catch(function (e) { toast(e.message); });
      }; });
    });
  }

  function adminEnquiries() {
    return api('/admin/enquiries').then(function (list) {
      var html = head('Administration', 'Enquiries', 'Website enquiries and member questions. Each one is also emailed to admin@elsonwhiteconsulting.com.au.');
      html += '<section class="card">' + (list.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>Received</th><th class="l">From</th><th class="l">Venue / company</th><th class="l">Type</th><th class="l">Subject &amp; message</th><th class="l">Email</th></tr></thead><tbody>' +
        list.map(function (e) { return '<tr><td>' + esc(e.created_at.slice(0, 16)) + '</td><td class="l">' + esc(e.name) + '<br><span class="muted small">' + esc(e.email || '') + (e.phone ? ' · ' + esc(e.phone) : '') + '</span></td><td class="l">' + esc(e.venue_text || e.company || '') + '</td><td class="l">' + (e.kind === 'member' ? 'Member · ' : 'Website · ') + esc(e.enquiry_type || '') + '</td><td class="l" style="white-space:normal;min-width:280px"><b>' + esc(e.subject) + '</b><br>' + esc(e.message).replace(/\n/g, '<br>') + (e.has_attachment ? '<br><a class="link" href="' + (PREVIEW ? '#' : '/api/admin/enquiries/' + e.id + '/attachment') + '">Attachment</a>' : '') + '</td><td class="l">' + esc(e.email_status || '') + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<div class="empty-state"><b>No enquiries yet</b>Contact-form messages and member questions will appear here.</div>') + '</section>';
      view(html);
    });
  }

  // =====================================================================
  // MY TOOLS (administrators): the EMAIL Generator, Ranking Tools and Game Performance tool, full width
  // =====================================================================
  function toolView(slug) {
    return api('/admin/tools').then(function (list) {
      var t = list.find(function (x) { return x.slug === slug; });
      if (!t) return view('<div class="notice err">That tool is not available.</div>');
      var url = PREVIEW ? null : '/tools/' + slug;
      view('<div class="tool-bar"><div><p class="eyebrow">My Tools</p><h1>' + esc(t.name) + '</h1><p class="muted small">' + esc(t.description) + '</p></div>' +
        '<div class="tool-actions">' + (url ? '<a class="btn btn-outline btn-sm" href="' + url + '" target="_blank" rel="noopener">Open in new tab</a>' : '') +
        '<label class="btn btn-outline btn-sm tool-up" for="tool-file">Replace with newer version</label><input id="tool-file" type="file" accept=".html,.htm" hidden></div></div>' +
        '<div id="tool-msg"></div><div class="tool-frame-wrap"><iframe id="tool-frame" title="' + esc(t.name) + '"></iframe></div>' +
        '<p class="muted small" style="margin-top:8px">' + (t.custom ? 'Your uploaded version' : 'Version included with the website') + (t.updated ? ' · ' + esc(t.updated.slice(0, 10)) : '') + '. Exports download to this computer; publish them to members under Data &amp; Uploads.</p>');
      var fr = $('#tool-frame');
      if (window.EWC_TOOL_HTML && window.EWC_TOOL_HTML[slug]) fr.srcdoc = window.EWC_TOOL_HTML[slug];
      else fr.src = PREVIEW ? 'tools/' + slug + '.html' : url;
      $('#tool-file').addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        var fd = new FormData(); fd.append('file', f);
        api('/admin/tools/' + slug, { method: 'POST', form: fd }).then(function () { $('#tool-msg').innerHTML = '<div class="notice ok">' + esc(t.name) + ' updated to ' + esc(f.name) + '.</div>'; fr.src = url + '?v=' + Date.now(); })
          .catch(function (err) { $('#tool-msg').innerHTML = '<div class="notice err">' + esc(err.message) + '</div>'; });
      });
    });
  }

  // ---------- router ----------
  var ROUTES = { dashboard: dashboard, figures: figures, 'figures-weekly': figuresWeekly, rankings: rankings, 'game-performance': gameperf, reports: reports, ask: ask, account: account,
    'admin/data': adminData, 'admin/users': adminUsers, 'admin/enquiries': adminEnquiries };
  function route() {
    clearCharts();
    var h = location.hash.replace(/^#\/?/, ''), parts = h.split('?'), name = parts[0] || 'dashboard', q = {};
    (parts[1] || '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
    if (ME.mustChange && name !== 'account') { location.hash = '#/account'; return; }
    if ((name.indexOf('admin/') === 0 || name.indexOf('tools/') === 0) && ME.role !== 'admin') name = 'dashboard';
    if (name.indexOf('tools/') === 0 && (ME.tools || []).indexOf(name.slice(6)) < 0) name = 'dashboard';
    var fn = name.indexOf('tools/') === 0 ? function () { return toolView(name.slice(6)); } : (ROUTES[name] || dashboard);
    $$('.p-nav a').forEach(function (a) { var on = a.dataset.r === name || (name === 'figures-weekly' && a.dataset.r === 'figures'); a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#side').classList.remove('open');
    var r = fn(q); if (r && r.catch) r.catch(fail);
  }

  // ---------- start ----------
  document.addEventListener('click', function (e) {
    var d = e.target.closest && e.target.closest('[data-file]');
    if (d && PREVIEW) { e.preventDefault(); toast('Report files are not included in this preview. On the live website this downloads the file securely.'); }
  });
  var mb = $('.p-menu'); if (mb) mb.addEventListener('click', function () { var o = $('#side').classList.toggle('open'); mb.setAttribute('aria-expanded', o); });
  var lo = $('[data-logout]'); if (lo && PREVIEW) lo.addEventListener('submit', function (e) { e.preventDefault(); window.EWC_API('/logout', { method: 'POST' }); location.href = 'login.html?out=1'; });

  api('/me').then(function (me) {
    ME = me;
    $('#who-name').textContent = me.name; $('#who-scope').textContent = roleLabel(me);
    if (me.role === 'admin') $('.p-admin').hidden = false;
    $$('[data-tool]').forEach(function (a) { a.hidden = (me.tools || []).indexOf(a.dataset.tool) < 0; });
    var tl = $('.p-tools-label'); if (tl) tl.hidden = !(me.tools || []).length;
    return api('/venues');
  }).then(function (v) { VENUES = v; window.addEventListener('hashchange', route); route(); })
    .catch(function (e) { if (PREVIEW && /sign in/i.test(e.message)) { location.href = 'login.html'; return; } fail(e); });
})();
