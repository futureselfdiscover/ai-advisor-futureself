// compass-site.js
// Loaded on EVERY page by the site-wide snippet (widget/hivebrite-site-loader.html).
// It does nothing until rollout.js turns Compass on for the current page, so the
// snippet can be installed now and the rollout flipped later with a push.
// Pages that already have their own Compass HTML block keep working as before.
(function () {
  var BASE = 'https://ai-advisor-futureself.vercel.app/';
  if (window.__CMP_SITE__) return;
  window.__CMP_SITE__ = true;

  function matches(path, list) {
    if (!Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      var p = String(list[i] || '');
      if (p && (path === p || path.indexOf(p.replace(/\/$/, '') + '/') === 0)) return true;
    }
    return false;
  }
  function load() {
    if (document.getElementById('fs-overlay-loader')) return;   // a page block already loaded it
    var s = document.createElement('script');
    s.id = 'fs-overlay-loader';
    s.src = BASE + 'widget-overlay.js?v=' + Date.now();
    document.head.appendChild(s);
  }
  function decide(cfg) {
    var path = window.location.pathname || '/';
    if (!cfg || matches(path, cfg.exclude)) return;
    if (cfg.site_wide === true || matches(path, cfg.pages)) load();
  }
  function start() {
    // a new copy at most every 5 minutes, so a rollout change spreads quickly
    var r = document.createElement('script');
    r.src = BASE + 'rollout.js?v=' + Math.floor(Date.now() / 300000);
    r.onload = function () { decide(window.__CMP_ROLLOUT__); };
    r.onerror = function () { /* no switch file means off: never show by accident */ };
    document.head.appendChild(r);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
