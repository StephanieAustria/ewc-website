/* Builds the data the Executive Performance Dashboard reads (window.EWC_DATA / window.EWC_RANKS)
   from weekly figures. Used by the server (Node) and by the static preview (browser). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EWCDashboard = factory();
})(this, function () {
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function d(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function iso(t) { return t.toISOString().slice(0, 10); }

  // venues: [{ name, weeks: [[weekEnding, turnover, profit]], daily: { year: { quarter: [[7 turnover],[7 profit]] } } }]
  // ranks:  { venueName: { monthly: {'2026-09': 59}, quarterly: {'2026-09': 55} } }
  // meta:   { title, location, rankRelease: '2026-09', source }
  function build(venues, ranks, meta) {
    meta = meta || {};
    var latest = '', first = '9999';
    venues.forEach(function (v) { v.weeks.forEach(function (w) { if (w[0] > latest) latest = w[0]; if (w[0] < first) first = w[0]; }); });
    var yearsSet = {};
    var out = venues.map(function (v) {
      var data = {};
      v.weeks.forEach(function (w) {
        var we = d(w[0]), y = we.getUTCFullYear(), m = we.getUTCMonth(), q = Math.floor(m / 3) + 1;
        yearsSet[y] = 1;
        var Y = data[y] || (data[y] = { totalTO: 0, totalPR: 0, weeks: 0, series: [], quarters: [1, 2, 3, 4].map(function (qq) {
          return { q: qq, to: 0, pr: 0, weeks: 0, months: [0, 1, 2].map(function (j) { return { key: MON[(qq - 1) * 3 + j], to: 0, pr: 0, weeks: 0 }; }),
            daily: [0, 0, 0, 0, 0, 0, 0], dailyPR: [0, 0, 0, 0, 0, 0, 0] }; }) });
        Y.totalTO += w[1]; Y.totalPR += w[2]; Y.weeks++;
        var Q = Y.quarters[q - 1]; Q.to += w[1]; Q.pr += w[2]; Q.weeks++;
        var M = Q.months[m % 3]; M.to += w[1]; M.pr += w[2]; M.weeks++;
        var start = new Date(we.getTime() - 6 * 864e5);           // the dashboard keys weeks by their Monday
        Y.series.push({ date: iso(start), q: q, to: w[1], pr: w[2] });
      });
      Object.keys(data).forEach(function (y) {
        var Y = data[y];
        Y.rtv = Y.totalTO ? +(Y.totalPR / Y.totalTO * 100).toFixed(2) : 0;
        Y.series.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        var yd = [0, 0, 0, 0, 0, 0, 0], ydp = [0, 0, 0, 0, 0, 0, 0], wsum = 0;
        Y.quarters.forEach(function (Q) {
          Q.rtv = Q.to ? +(Q.pr / Q.to * 100).toFixed(2) : 0;
          var dq = v.daily && v.daily[y] && v.daily[y][Q.q];
          if (dq) { Q.daily = dq[0].slice(); Q.dailyPR = dq[1].slice();
            if (Q.weeks) { wsum += Q.weeks; for (var i = 0; i < 7; i++) { yd[i] += dq[0][i] * Q.weeks; ydp[i] += dq[1][i] * Q.weeks; } } }
        });
        Y.daily = wsum ? yd.map(function (x) { return Math.round(x / wsum); }) : [0, 0, 0, 0, 0, 0, 0];
        Y.dailyPR = wsum ? ydp.map(function (x) { return Math.round(x / wsum); }) : [0, 0, 0, 0, 0, 0, 0];
      });
      return { name: v.name, location: v.suburb || '', data: data };
    });
    var years = Object.keys(yearsSet).map(Number).sort().slice(-5);   // the dashboard shows the last five years
    out.forEach(function (v) { Object.keys(v.data).forEach(function (y) { if (years.indexOf(+y) < 0) delete v.data[y]; }); });
    var L = latest ? d(latest) : new Date();
    // Open on the latest complete quarter, as the client dashboards do.
    var dy = L.getUTCFullYear(), dq = Math.floor(L.getUTCMonth() / 3) + 1, qEnd = new Date(Date.UTC(dy, dq * 3, 0));
    if (latest && (qEnd - L) / 864e5 >= 7) { dq--; if (!dq) { dq = 4; dy--; } }
    var latestLabel = latest ? L.getUTCDate() + ' ' + LONG[L.getUTCMonth()] + ' ' + L.getUTCFullYear() : '—';

    // ranks in the dashboard's keys: quarters 'YYYY-q', months 'YYYY-m'
    var RK = {};
    Object.keys(ranks || {}).forEach(function (n) {
      var r = ranks[n], q = {}, m = {};
      Object.keys(r.quarterly || {}).forEach(function (p) { var a = p.split('-'); q[a[0] + '-' + Math.ceil(+a[1] / 3)] = r.quarterly[p]; });
      Object.keys(r.monthly || {}).forEach(function (p) { var a = p.split('-'); m[a[0] + '-' + (+a[1])] = r.monthly[p]; });
      RK[n] = { q: q, m: m };
    });
    var rel = meta.rankRelease, rankNote = 'Ranking Position: AHA NSW quarterly ranking (monthly positions beneath) — lower is better.';
    if (rel) {
      var ra = rel.split('-'), rm = +ra[1];
      rankNote = 'Ranking Position: AHA NSW quarterly ranking (monthly positions beneath), from the ' + MON[rm - 1] + ' ' + ra[0] + ' rankings release — lower is better.' +
        (rm % 3 ? ' The ' + MON[Math.ceil(rm / 3) * 3 - 1] + ' ' + ra[0] + ' quarter is not yet published.' : (rm < 12 ? ' ' + MON[rm + 2] + ' ' + ra[0] + ' quarter not yet published.' : ''));
    }
    return {
      data: {
        generated: new Date().toISOString(), years: years, months: MON,
        hotels: [{ id: 'portal', name: meta.title || (out.length === 1 ? out[0].name : 'Your venues'), location: meta.location == null ? 'NSW' : meta.location, real: true, venues: out }],
        latestYear: L.getUTCFullYear(), defaultYear: dy, defaultQuarter: dq,
        dataToLabel: 'Data to week ending ' + latestLabel, rankNote: rankNote,
        footerNote: 'Source: ' + (meta.source || 'weekly figures workbook') + ' — actual Monday–Sunday turnover and actual weekly profit, ' + (first !== '9999' ? d(first).getUTCFullYear() : '') + ' to week ending ' + latestLabel + '. Weeks are grouped by their week-ending (Sunday) date.',
      },
      ranks: RK,
    };
  }
  return { build: build };
});
