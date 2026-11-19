// Small enhancements for the public pages (menu, password peek, form checks).
(function () {
  var t = document.querySelector('.menu-toggle'), n = document.getElementById('nav');
  if (t && n) t.addEventListener('click', function () { var o = n.classList.toggle('open'); t.setAttribute('aria-expanded', o); });
  document.querySelectorAll('[data-peek]').forEach(function (b) {
    b.addEventListener('click', function () { var i = document.getElementById(b.dataset.peek); i.type = i.type === 'password' ? 'text' : 'password'; b.setAttribute('aria-label', i.type === 'password' ? 'Show password' : 'Hide password'); });
  });
  document.querySelectorAll('[data-year]').forEach(function (e) { e.textContent = new Date().getFullYear(); });
  document.querySelectorAll('form[data-validate]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      var bad = [].filter.call(f.querySelectorAll('[required]'), function (i) { return !i.value.trim() || (i.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.value)); });
      f.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); i.style.borderColor = ''; });
      if (bad.length) { e.preventDefault(); bad.forEach(function (i) { i.setAttribute('aria-invalid', 'true'); i.style.borderColor = '#c0503c'; }); bad[0].focus(); }
    });
  });
})();
