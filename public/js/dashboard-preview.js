/* PREVIEW ONLY — builds the dashboard data in the browser from the preview data set, for the signed-in preview user. */
(function () {
  var scope = (location.hash || '').slice(1) || 'all';
  var D = window.EWC_PREVIEW_DATA;
  Promise.all([window.EWC_API('/venues')]).then(function (r) {
    var mine = r[0].filter(function (v) { return v.weeks > 0; }), ids, title = null;
    if (/^v\d+$/.test(scope)) ids = mine.filter(function (v) { return 'v' + v.id === scope; }).map(function (v) { return v.id; });
    else if (/^g\d+$/.test(scope)) { ids = mine.filter(function (v) { return 'g' + v.group_id === scope; }).map(function (v) { return v.id; }); title = (mine.find(function (v) { return 'g' + v.group_id === scope; }) || {}).grp; }
    else ids = mine.map(function (v) { return v.id; });
    if (!ids.length) { document.body.innerHTML = '<p style="color:#ccc;font:16px sans-serif;padding:40px">You do not have access to those venues.</p>'; return; }
    return window.EWC_API('/figures?venues=' + ids.join(',')).then(function (f) {
      var byName = {}; D.venues.forEach(function (v) { byName[v.name] = v; });
      var venues = f.venues.map(function (v) { var s = byName[v.name]; return { name: v.name, suburb: s.suburb, weeks: v.weeks, daily: s.daily || {} }; });
      var ranks = {}; venues.forEach(function (v) { var s = byName[v.name]; ranks[v.name] = { monthly: s.rank_monthly || {}, quarterly: s.rank_quarterly || {} }; });
      var src = venues.length === 1 && byName[venues[0].name].figures_source ? String(byName[venues[0].name].figures_source).replace(/\.xlsx$/i, '') + ' weekly figures workbook' : 'weekly figures workbooks';
      var out = window.EWCDashboard.build(venues, ranks, { title: title || (venues.length === 1 ? venues[0].name : 'Your venues'), rankRelease: D.aha ? D.aha.period : null, source: src });
      window.EWC_RANKS = out.ranks; window.EWC_DATA = out.data;
    });
  });
})();
