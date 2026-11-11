// widget-overlay.js
// The single source of truth for how Compass LOOKS, on every page (home included).
// Injects the widget CSS + markup, optionally the home-page banner, then loads
// widget.js (shared BEHAVIOR).
//   - Look changes: edit this file.   - Behavior changes: edit widget.js.
//   - The home page Hivebrite block only holds a tiny loader + #fs-banner-slot.
(function () {
  // ---- icons: one consistent 24px stroke set --------------------------------
  var I = {
    compass: '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="12" r="9.25"/><g class="cmp-needle"><path d="M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z" class="cmp-needle-fill"/></g><circle cx="12" cy="12" r="0.9" class="cmp-dot"/></svg>',
    navigate: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M4 11.2 19.5 4.5 12.8 20l-1.9-6.9Z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M20 14.5a2 2 0 0 1-2 2H8.5L4.5 20V6a2 2 0 0 1 2-2H18a2 2 0 0 1 2 2Z"/><path d="M8.5 9h7M8.5 12h4.5"/></svg>',
    profile: '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 19.5c.9-3.6 3.8-5.6 7.25-5.6s6.35 2 7.25 5.6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M10.5 3.5 12 8.6l5.1 1.5L12 11.6 10.5 16.7 9 11.6 3.9 10.1 9 8.6Z"/><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    reset: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/></svg>',
    send: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    flag: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M5.5 20.5V4"/><path d="M5.5 4.5h11.5l-2.3 4.25 2.3 4.25H5.5"/></svg>',
    notepad: '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 2.5v3M15 2.5v3M8.5 10.5h7M8.5 14h7M8.5 17.5h4"/></svg>',
    grip: '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="9" cy="7" r="1.1"/><circle cx="15" cy="7" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="17" r="1.1"/><circle cx="15" cy="17" r="1.1"/></svg>',
    plus: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="m5.5 12.5 4 4 9-9.5"/></svg>',
    orient: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M4 6h10M4 12h7M4 18h12"/><path d="M18 4.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M9.5 3.5h5l-.8 5.2 3.3 3.3v1.5H7v-1.5l3.3-3.3Z"/><path d="M12 13.5v7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>',
    task: '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="4.5" y="4.5" width="15" height="15" rx="4"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>',
    recal: '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="12" r="7.5"/><path d="M14.6 9.4 13 13l-3.6 1.6L11 11Z"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2"/></svg>',
    find: '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
    up: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="m6 9 6 6 6-6"/></svg>',
    thumb: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M7.5 10.5v9H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 10.5Z"/><path d="M7.5 10.5 11 4.2a1.9 1.9 0 0 1 3.4 1.5l-.9 3.8h4.6a2 2 0 0 1 2 2.4l-1.3 6a2 2 0 0 1-2 1.6H7.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>'
  };

  // Home banner: the same slate look as the Compass panel, a one-line promise, three
  // quick starts that open Compass and ask right away, and one clear button. Once
  // rollout.js turns Compass on site-wide it also says so and offers the tour.
  var BANNER_STARTS = [
    ['Plan my week', 'Help me plan what to focus on this week for my career.'],
    ['Find internships', 'Help me find internships that fit my background.'],
    ['Prep for an interview', 'Help me prepare for an upcoming interview.']
  ];
  function bannerHTML() {
    var everywhere = !!(window.__CMP_ROLLOUT__ && window.__CMP_ROLLOUT__.site_wide);
    var toured = false; try { toured = localStorage.getItem('cmp_tour_v1') === 'done'; } catch (e) {}
    var sub = everywhere
      ? 'Now on every page. Find me in the bottom corner whenever you need a hand.'
      : 'Ask about careers, classes or recruiting. I remember your goals and point you to the right pages.';
    var chips = '';
    for (var k = 0; k < BANNER_STARTS.length; k++) {
      chips += '<button type="button" class="cmp-bn-chip" onclick="cmpBannerAsk(' + k + ')">' + BANNER_STARTS[k][0] + '</button>';
    }
    return '<div id="cmp-banner">' +
      '<div class="cmp-banner-left">' +
        '<div class="cmp-banner-icon">' + I.compass + '</div>' +
        '<div class="cmp-banner-copy">' +
          '<div class="cmp-banner-title">Meet Compass, your FutureSelf advisor</div>' +
          '<div class="cmp-banner-text" id="cmp-banner-text">' + sub + '</div>' +
          '<div class="cmp-bn-chips">' + chips + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="cmp-banner-right">' +
        '<span class="cmp-banner-cta" role="button" tabindex="0" onclick="cmpOpenChat()"><span id="cmp-banner-cta-label">Open Compass</span>' + I.arrow + '</span>' +
        (everywhere && !toured ? '<button type="button" class="cmp-bn-tour" onclick="cmpBannerTour()">Take the tour</button>' : '') +
      '</div>' +
      '<button class="cmp-banner-x" onclick="cmpDismiss(event)" aria-label="Dismiss">' + I.close + '</button>' +
    '</div>';
  }
  window.cmpBannerAsk = function (k) {
    var q = BANNER_STARTS[k] && BANNER_STARTS[k][1];
    if (q && window.cmpAsk) window.cmpAsk(q); else if (window.cmpOpenChat) window.cmpOpenChat();
  };

  // fills the home-page slot if this page has one; safe to call repeatedly
  function mountBanner() {
    var slot = document.getElementById('fs-banner-slot');
    if (slot && !document.getElementById('cmp-banner')) slot.innerHTML = bannerHTML();
  }
  // rollout.js can arrive after the banner is drawn; redraw it with the right wording
  window.cmpBannerRefresh = function () {
    var b = document.getElementById('cmp-banner');
    if (b && b.className.indexOf('hidden') === -1 && b.parentNode) b.parentNode.innerHTML = bannerHTML();
  };

  // widget already on the page (overlay loaded twice): just make sure the banner is there
  if (document.getElementById('cmp-bubble')) { mountBanner(); return; }

  var css = `
  #cmp-widget-root, #cmp-banner {
    --cmp-navy: #2B3E50;      /* FutureSelf nav slate */
    --cmp-navy-2: #34495E;
    --cmp-blue: #2A67D8;      /* link-blue accent */
    --cmp-blue-dk: #2155B5;
    --cmp-tint: #EEF3FB;
    --cmp-tint-2: #F6F8FC;
    --cmp-line: #DDE4EE;
    --cmp-ink: #1F2A37;
    --cmp-muted: #5D6B7C;
    --cmp-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --cmp-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --cmp-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  #cmp-widget-root *, #cmp-banner * { box-sizing: border-box; }
  /* neutralize host-site element styles (Hivebrite button/heading/link rules) */
  #cmp-widget-root button, #cmp-widget-root input, #cmp-widget-root textarea,
  #cmp-banner button {
    font-family: var(--cmp-font); letter-spacing: normal; text-transform: none;
    margin: 0; min-height: 0; min-width: 0; line-height: normal; outline: none;
  }
  #cmp-widget-root .cmp-ask-row { margin: 8px 16px 0; }
  #cmp-widget-root #cmp-input { line-height: 1.5; }
  #cmp-widget-root .cmp-send { margin-bottom: 2px; }
  #cmp-widget-root button:focus:not(:focus-visible), #cmp-banner button:focus:not(:focus-visible) { outline: none; box-shadow: none; }
  /* message text: host paragraph/list rules can't resize or recolor it */
  #cmp-widget-root .cmp-msg p, #cmp-widget-root .cmp-msg ul, #cmp-widget-root .cmp-msg ol,
  #cmp-widget-root .cmp-msg li, #cmp-widget-root .cmp-msg strong, #cmp-widget-root .cmp-msg em {
    font-family: inherit; font-size: inherit; line-height: inherit; letter-spacing: inherit;
  }
  #cmp-widget-root .cmp-msg p, #cmp-widget-root .cmp-msg li { color: inherit; }
  #cmp-widget-root .cmp-msg code { font-size: 12px; }
  #cmp-widget-root .cmp-ai p { margin: 0 0 8px; padding: 0; }
  #cmp-widget-root .cmp-ai p:last-child { margin-bottom: 0; }
  #cmp-widget-root .cmp-ai ul, #cmp-widget-root .cmp-ai ol { margin: 2px 0 8px; padding: 0 0 0 20px; list-style-position: outside; }
  #cmp-widget-root .cmp-ai ul { list-style-type: disc; }
  #cmp-widget-root .cmp-ai ol { list-style-type: decimal; }
  #cmp-widget-root .cmp-ai li { margin: 3px 0; padding: 0 0 0 2px; }
  #cmp-widget-root img, #cmp-widget-root svg { max-width: none; }
  /* placeholder text clears as soon as a field is clicked */
  #cmp-widget-root input:focus::placeholder, #cmp-widget-root textarea:focus::placeholder { color: transparent; }
  .cmp-i {
    width: 100%; height: 100%; fill: none; stroke: currentColor;
    stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    display: block; pointer-events: none;
  }
  .cmp-i .cmp-needle-fill { fill: currentColor; fill-opacity: 0.18; }
  .cmp-i .cmp-dot { fill: currentColor; stroke: none; }
  .cmp-i .cmp-needle { transform-origin: 12px 12px; transition: transform 0.7s var(--cmp-spring); }

  /* ================= launcher: compass bubble + fan-out actions ================= */
  #cmp-launcher {
    position: fixed; bottom: 28px; right: 28px;
    width: 58px; height: 58px; z-index: 2147483647;
    font-family: var(--cmp-font);
  }
  #cmp-bubble {
    position: relative; width: 58px; height: 58px; border-radius: 50%;
    border: none; padding: 0; cursor: pointer; color: #fff;
    background: radial-gradient(120% 120% at 30% 15%, #3E5670 0%, var(--cmp-navy) 55%);
    box-shadow: 0 10px 28px rgba(43,62,80,0.32), inset 0 1px 0 rgba(255,255,255,0.14);
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.25s var(--cmp-spring), box-shadow 0.25s ease;
  }
  #cmp-bubble::before {
    content: ""; position: absolute; inset: -3px; border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0 72%, rgba(170,196,228,0.55) 88%, transparent 100%);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
    animation: cmpOrbit 8s linear infinite; pointer-events: none;
  }
  @keyframes cmpOrbit { to { transform: rotate(360deg); } }
  #cmp-bubble:hover { transform: scale(1.06); box-shadow: 0 14px 34px rgba(43,62,80,0.38); }
  #cmp-bubble:active { transform: scale(0.94); }
  #cmp-bubble:focus-visible, .cmp-sat:focus-visible, .cmp-tab:focus-visible { outline: 3px solid rgba(42,103,216,0.45); outline-offset: 3px; }
  .cmp-bubble-icon {
    position: absolute; width: 28px; height: 28px;
    transition: transform 0.35s var(--cmp-spring), opacity 0.2s ease;
  }
  .cmp-bubble-close { width: 22px; height: 22px; opacity: 0; transform: rotate(-90deg) scale(0.5); }
  #cmp-launcher.dial .cmp-bubble-compass .cmp-needle,
  #cmp-bubble:hover .cmp-needle { transform: rotate(360deg); }
  #cmp-launcher.chat-open .cmp-bubble-compass { opacity: 0; transform: rotate(90deg) scale(0.5); }
  #cmp-launcher.chat-open .cmp-bubble-close { opacity: 1; transform: rotate(0) scale(1); }
  #cmp-launcher.chat-open #cmp-bubble::before { animation: none; opacity: 0; }

  .cmp-dial { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
  .cmp-sat {
    position: absolute; left: 0; top: 0; width: 46px; height: 46px; padding: 12px;
    border-radius: 50%; border: 1px solid var(--cmp-line); cursor: pointer;
    background: rgba(255,255,255,0.96); color: var(--cmp-navy);
    box-shadow: 0 8px 22px rgba(43,62,80,0.16);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    opacity: 0; pointer-events: none;
    transform: translate(-50%, -50%) translate(0, 0) scale(0.35);
    transition: transform 0.42s var(--cmp-spring), opacity 0.2s ease,
                background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    transition-delay: calc((3 - var(--i)) * 25ms);
  }
  #cmp-launcher.dial .cmp-sat {
    opacity: 1; pointer-events: auto;
    transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(1);
    transition-delay: calc(var(--i) * 45ms);
  }
  #cmp-launcher.dial .cmp-sat:hover, #cmp-launcher.dial .cmp-sat:focus-visible {
    background: var(--cmp-blue); color: #fff; border-color: var(--cmp-blue);
    box-shadow: 0 0 0 6px rgba(42,103,216,0.14), 0 0 22px 2px rgba(42,103,216,0.45), 0 12px 26px rgba(42,103,216,0.30);
    transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(1.22);
    transition-delay: 0s; z-index: 2;
  }
  /* the others step back so the hovered one reads clearly */
  #cmp-launcher.dial .cmp-dial:hover .cmp-sat:not(:hover) {
    opacity: 0.55;
    transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(0.9);
    transition-delay: 0s;
  }
  .cmp-sat .cmp-i { transition: transform 0.35s var(--cmp-spring); }
  #cmp-launcher.dial .cmp-sat:hover .cmp-i { transform: scale(1.06) rotate(-6deg); }
  .cmp-tip {
    position: absolute; left: 50%; bottom: calc(100% + 8px);
    transform: translate(-50%, 6px) scale(0.9); white-space: nowrap;
    background: var(--cmp-blue); color: #fff; font-size: 12px; font-weight: 700;
    padding: 5px 11px; border-radius: 999px; letter-spacing: 0.2px;
    box-shadow: 0 6px 16px rgba(42,103,216,0.35);
    opacity: 0; pointer-events: none;
    transition: opacity 0.16s ease, transform 0.22s var(--cmp-spring);
  }
  .cmp-tip::after {
    content: ""; position: absolute; left: 50%; top: 100%; margin-left: -5px;
    border: 5px solid transparent; border-top-color: var(--cmp-blue);
  }
  .cmp-sat:hover .cmp-tip, .cmp-sat:focus-visible .cmp-tip { opacity: 1; transform: translate(-50%, 0) scale(1); }

  /* ================= chat window ================= */
  #cmp-chat {
    position: fixed; bottom: 100px; right: 28px;
    width: 400px; height: 680px; max-height: calc(100vh - 124px);
    border-radius: 20px; background: #fff; border: 1px solid var(--cmp-line);
    z-index: 2147483646; font-family: var(--cmp-font); color: var(--cmp-ink);
    box-shadow: 0 24px 60px rgba(43,62,80,0.18), 0 4px 14px rgba(43,62,80,0.06);
    display: flex; flex-direction: column; overflow: hidden;
    opacity: 0; visibility: hidden; pointer-events: none;
    transform: translateY(14px) scale(0.97); transform-origin: bottom right;
    transition: opacity 0.22s ease, transform 0.32s var(--cmp-ease), visibility 0s linear 0.32s;
  }
  #cmp-chat.open {
    opacity: 1; visibility: visible; pointer-events: auto; transform: none;
    transition: opacity 0.22s ease, transform 0.36s var(--cmp-ease), visibility 0s;
  }

  .cmp-hdr {
    position: relative; overflow: hidden; flex-shrink: 0;
    background: linear-gradient(160deg, #2F4356 0%, var(--cmp-navy) 55%, #2A3C4D 100%);
    padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
  }
  .cmp-hdr::before {
    content: ""; position: absolute; left: 0; right: 0; top: 0; height: 100%; pointer-events: none;
    background:
      linear-gradient(90deg, transparent 35%, rgba(255,255,255,0.22) 100%) top / 100% 1px no-repeat,
      linear-gradient(200deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 45%);
  }
  .cmp-hdr::after {
    content: ""; position: absolute; right: -60px; top: -80px; width: 220px; height: 220px;
    background: radial-gradient(closest-side, rgba(150,180,215,0.16), transparent);
    animation: cmpGlow 16s ease-in-out infinite alternate; pointer-events: none;
  }
  @keyframes cmpGlow { from { transform: translate(0, 0); } to { transform: translate(-70px, 30px); } }
  .cmp-hdr-left { display: flex; align-items: center; gap: 11px; position: relative; z-index: 1; }
  .cmp-hdr-icon {
    width: 36px; height: 36px; border-radius: 11px; padding: 7px; color: #fff;
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18);
  }
  .cmp-hdr-icon .cmp-needle { animation: cmpNeedleIdle 6s ease-in-out infinite; }
  /* the header compass starts the tour; while it spins the script drives the needle */
  .cmp-hdr-icon { cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
  .cmp-hdr-icon:hover, .cmp-hdr-icon:focus-visible { background: rgba(255,255,255,0.17); border-color: rgba(255,255,255,0.3); box-shadow: 0 0 0 4px rgba(255,255,255,0.06); outline: none; }
  .cmp-hdr-icon.cmp-spinning .cmp-needle { animation: none; transition: none; }
  @keyframes cmpNeedleIdle { 0%, 100% { transform: rotate(0deg); } 45% { transform: rotate(18deg); } 60% { transform: rotate(-8deg); } }
  .cmp-hdr-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.1px; }
  .cmp-hdr-beta {
    font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 0.6px;
    border: 1px solid rgba(255,255,255,0.3); border-radius: 5px;
    padding: 1px 5px; margin-left: 6px; vertical-align: 2px;
  }
  .cmp-hdr-sub { font-size: 11.5px; color: rgba(255,255,255,0.62); margin-top: 1px; }
  .cmp-hdr-right { display: flex; align-items: center; gap: 4px; position: relative; z-index: 1; }
  .cmp-icon-btn {
    width: 32px; height: 32px; padding: 7px; border: none; border-radius: 9px; cursor: pointer;
    background: transparent; color: rgba(255,255,255,0.72);
    transition: background 0.2s ease, color 0.2s ease;
  }
  .cmp-icon-btn:hover { background: rgba(255,255,255,0.10); color: #fff; }
  .cmp-icon-btn:active { background: rgba(255,255,255,0.16); }
  /* X turns a quarter and reset a half while hovered, easing back when the mouse leaves.
     Locked with !important: a site-wide rule (e.g. every button lifting or scaling on
     hover, or every svg getting its own transition) would otherwise stack on top, move
     the button under the cursor, flip hover on and off, and make the icon twitch. */
  #cmp-widget-root .cmp-icon-btn, #cmp-widget-root .cmp-icon-btn:hover,
  #cmp-widget-root .cmp-icon-btn:active, #cmp-widget-root .cmp-icon-btn:focus {
    transform: none !important; translate: none !important; scale: none !important; rotate: none !important;
    animation: none !important; filter: none !important; box-shadow: none !important;
    transition: background 0.2s ease, color 0.2s ease !important;
    width: 32px !important; height: 32px !important; padding: 7px !important; flex-shrink: 0;
  }
  #cmp-widget-root .cmp-icon-btn .cmp-i {
    width: 18px !important; height: 18px !important; margin: 0 !important;
    transform-origin: 50% 50% !important; animation: none !important;
    translate: none !important; scale: none !important; rotate: none !important;
    transition: none !important; transform: none !important;
  }
  #cmp-widget-root #cmp-np-x, #cmp-widget-root #cmp-np-x:hover, #cmp-widget-root #cmp-np-x:active {
    transform: none !important; translate: none !important; scale: none !important; rotate: none !important; animation: none !important;
  }
  #cmp-widget-root #cmp-np-x .cmp-i { animation: none !important; translate: none !important; scale: none !important; rotate: none !important; transform-origin: 50% 50% !important; }
  #cmp-widget-root .cmp-icon-btn .cmp-i, #cmp-widget-root .cmp-icon-btn .cmp-i *,
  #cmp-widget-root #cmp-np-x .cmp-i, #cmp-widget-root #cmp-np-x .cmp-i * {
    shape-rendering: geometricPrecision !important; vector-effect: none !important;
  }
  #cmp-widget-root .cmp-icon-btn .cmp-i *, #cmp-widget-root #cmp-np-x .cmp-i * {
    transform: none !important; transition: none !important; animation: none !important;
    stroke-width: inherit !important; stroke: currentColor !important;
  }
  #cmp-widget-root .cmp-x .cmp-i, #cmp-widget-root .cmp-reset .cmp-i, #cmp-widget-root #cmp-np-x .cmp-i {
    will-change: transform; transform: rotate(0deg) !important;
    transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1) !important;
  }
  @media (hover: hover) {
    #cmp-widget-root .cmp-x:hover .cmp-i, #cmp-widget-root #cmp-np-x:hover .cmp-i { transform: rotate(90deg) !important; }
    #cmp-widget-root .cmp-reset:hover .cmp-i { transform: rotate(-180deg) !important; }
  }

  /* tabs */
  .cmp-tabs {
    position: relative; display: grid; grid-template-columns: repeat(4, 1fr);
    padding: 0 8px; border-bottom: 1px solid var(--cmp-line); flex-shrink: 0; background: #fff;
  }
  .cmp-tab {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: none; border: none; cursor: pointer; padding: 11px 4px 10px;
    font: 600 12.5px var(--cmp-font); color: var(--cmp-muted);
    transition: color 0.15s ease;
  }
  .cmp-tab .cmp-tab-i { width: 16px; height: 16px; transition: transform 0.25s var(--cmp-spring); }
  .cmp-tab:hover { color: var(--cmp-ink); }
  .cmp-tab:hover .cmp-tab-i { transform: translateY(-1px) scale(1.08); }
  .cmp-tab.active { color: var(--cmp-blue); }
  .cmp-tab-ink {
    position: absolute; bottom: -1px; left: 8px; height: 2.5px; border-radius: 2px;
    width: calc((100% - 16px) / 4); background: var(--cmp-blue);
    transform: translateX(calc(var(--t, 0) * 100%));
    transition: transform 0.35s var(--cmp-ease);
  }

  .cmp-views { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
  .cmp-view { display: none; flex: 1; min-height: 0; flex-direction: column; }
  .cmp-view.active { display: flex; animation: cmpViewIn 0.32s var(--cmp-ease); }
  @keyframes cmpViewIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .cmp-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 16px; }
  .cmp-scroll::-webkit-scrollbar, #cmp-body::-webkit-scrollbar { width: 6px; }
  .cmp-scroll::-webkit-scrollbar-thumb, #cmp-body::-webkit-scrollbar-thumb { background: #D5DDEA; border-radius: 3px; }

  /* ---- chat view ---- */
  #cmp-body {
    flex: 1; min-height: 0; padding: 18px 16px 10px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px; position: relative;
  }
  .cmp-row { display: flex; gap: 10px; align-items: flex-end; animation: cmpRise 0.32s var(--cmp-ease); }
  .cmp-row-ai { align-items: flex-start; }
  @keyframes cmpRise {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: none; }
  }
  .cmp-av {
    width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; padding: 5px; margin-top: 1px;
    background: var(--cmp-navy); color: #fff;
    animation: cmpPop 0.36s var(--cmp-spring);
  }
  .cmp-av svg { width: 100% !important; height: 100% !important; }
  .cmp-row-ai .cmp-av { transition: opacity 0.3s ease, transform 0.3s var(--cmp-ease); }
  .cmp-row-ai:not(.cmp-latest) .cmp-av { opacity: 0; transform: scale(0.6); animation: none; }
  @keyframes cmpPop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
  .cmp-msg { font-size: 13.5px; line-height: 1.62; word-break: break-word; }
  .cmp-ai { flex: 1; min-width: 0; color: var(--cmp-ink); padding-top: 2px; }
  .cmp-ai p { margin: 0 0 8px; }
  .cmp-ai p:last-child { margin-bottom: 0; }
  .cmp-ai .cmp-h { font-weight: 700; color: var(--cmp-navy); margin-top: 4px; }
  .cmp-ai ul, .cmp-ai ol { margin: 2px 0 8px; padding-left: 20px; }
  .cmp-ai ul:last-child, .cmp-ai ol:last-child { margin-bottom: 0; }
  .cmp-ai li { margin: 3px 0; padding-left: 2px; }
  .cmp-ai li::marker { color: var(--cmp-blue); font-weight: 600; }
  .cmp-ai strong { font-weight: 650; color: var(--cmp-navy); }
  .cmp-ai code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; background: var(--cmp-tint); border-radius: 5px; padding: 1px 5px;
  }
  .cmp-ai a { color: #4C6C93; font-weight: 650; text-decoration: none; transition: color 0.15s ease; }
  .cmp-ai a:hover { color: #2F5583; }
  .cmp-usr {
    background: var(--cmp-tint); color: var(--cmp-navy);
    border-radius: 16px; border-bottom-right-radius: 5px;
    padding: 9px 14px; max-width: 80%; margin-left: auto; white-space: pre-wrap;
  }

  .cmp-think { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
  .cmp-think-tail { padding-top: 10px; transition: opacity 0.26s ease, transform 0.26s ease; }
  .cmp-think-out { opacity: 0; transform: translateY(-3px); }
  /* three soft dots on a small ring; each crosses through the center to the far side
     and back, a beat behind the one before, so they weave past each other */
  .cmp-orbit { position: relative; width: 22px; height: 22px; flex-shrink: 0; animation: cmpOrbitTurn 7.2s linear infinite; }
  .cmp-orbit > span { position: absolute; inset: 0; transform: rotate(var(--a)); }
  .cmp-orbit i {
    position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px 0 0 -2.5px;
    border-radius: 50%; background: #B3C2D6;
    animation: cmpCross 1.05s cubic-bezier(0.62, 0, 0.38, 1) var(--d) infinite alternate both;
  }
  .cmp-orbit > span:nth-child(2) i { background: #C3D0E0; }
  .cmp-orbit > span:nth-child(3) i { background: #A6B7CD; }
  @keyframes cmpCross {
    0%   { transform: translateX(8px) scale(1); }
    50%  { transform: translateX(0) scale(0.62); }
    100% { transform: translateX(-8px) scale(1); }
  }
  @keyframes cmpOrbitTurn { to { transform: rotate(360deg); } }
  .cmp-think-label {
    font-size: 12px; font-weight: 500; display: inline-block; letter-spacing: 0.1px;
    background: linear-gradient(90deg, #8693A5 30%, #3A4E62 50%, #8693A5 70%);
    background-size: 220% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    animation: cmpShimmer 2.8s linear infinite;
  }
  @keyframes cmpShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  .cmp-think-swap { animation: cmpSwap 0.34s ease; }
  @keyframes cmpSwap { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  #cmp-typing .cmp-av .cmp-needle { animation: cmpSpin 1.4s var(--cmp-ease) infinite; }
  @keyframes cmpSpin { to { transform: rotate(360deg); } }

  #cmp-qr { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 16px 10px; flex-shrink: 0; }
  .cmp-pill {
    font: 600 12px var(--cmp-font); border: 1px solid var(--cmp-line); border-radius: 999px;
    padding: 6px 13px; color: var(--cmp-navy); background: #fff;
    cursor: pointer; white-space: nowrap;
    transition: background 0.15s, transform 0.15s, border-color 0.15s, color 0.15s;
    animation: cmpPillIn 0.3s var(--cmp-ease) backwards;
  }
  .cmp-pill:nth-child(1) { animation-delay: 0.04s; }
  .cmp-pill:nth-child(2) { animation-delay: 0.10s; }
  .cmp-pill:nth-child(3) { animation-delay: 0.16s; }
  .cmp-pill:nth-child(4) { animation-delay: 0.22s; }
  @keyframes cmpPillIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .cmp-pill:hover { background: var(--cmp-tint); border-color: #B9CCF2; color: var(--cmp-blue); transform: translateY(-1px); }
  .cmp-pill:active { transform: scale(0.96); }

  .cmp-bar { padding: 10px 14px 12px; display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0; }
  #cmp-input {
    flex: 1; border: 1px solid var(--cmp-line); border-radius: 14px; background: var(--cmp-tint-2);
    padding: 11px 14px; font: 13.5px/1.5 var(--cmp-font); color: var(--cmp-ink); outline: none;
    resize: none; overflow-y: auto; min-height: 44px; max-height: 190px;
    white-space: pre-wrap; word-break: break-word;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  #cmp-input::placeholder { color: #8A96AD; }
  #cmp-input:focus { border-color: var(--cmp-blue); background: #fff; box-shadow: 0 0 0 4px rgba(42,103,216,0.10); }
  .cmp-send {
    width: 40px; height: 40px; border-radius: 12px; border: none; cursor: pointer; padding: 10px;
    background: var(--cmp-blue); color: #fff; flex-shrink: 0; margin-bottom: 2px;
    box-shadow: 0 6px 14px rgba(42,103,216,0.28);
    transition: transform 0.15s var(--cmp-spring), background 0.15s;
  }
  .cmp-send:hover { background: var(--cmp-blue-dk); transform: translateY(-1px); }
  .cmp-send:hover .cmp-i { transform: translateY(-2px); }
  .cmp-send .cmp-i { transition: transform 0.2s var(--cmp-ease); }
  .cmp-send:active { transform: scale(0.92); }
  .cmp-pwr { text-align: center; font-size: 10.5px; color: #66727F; padding: 0 0 8px; flex-shrink: 0; }


  /* ---- Waypoints: every question is a stop you can jump back to or resume from ---- */
  .cmp-view[data-view="chat"] { position: relative; }
  .cmp-wp-btn {
    position: absolute; top: 10px; right: 12px; z-index: 3;
    display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
    padding: 5px 7px; border-radius: 999px; border: 1px solid var(--cmp-line);
    background: rgba(255,255,255,0.92); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    font: 600 11.5px var(--cmp-font); color: var(--cmp-muted);
    box-shadow: 0 4px 12px rgba(43,62,80,0.08);
    transition: color 0.15s, border-color 0.15s, box-shadow 0.2s;
    animation: cmpPillIn 0.3s var(--cmp-ease);
  }
  .cmp-wp-btn[hidden] { display: none; }
  /* reserve room for the chip, and fade messages softly as they scroll under it */
  /* collapsed to flag + count so it covers almost nothing; the label slides out on hover */
  .cmp-has-wp #cmp-body { padding-top: 40px; }
  .cmp-wp-btn:hover, .cmp-wp-btn:focus-visible, .cmp-wp-btn[aria-expanded="true"] { color: var(--cmp-blue); border-color: #BCD0F0; box-shadow: 0 6px 16px rgba(43,62,80,0.12); }
  .cmp-wp-btn-i { width: 14px; height: 14px; flex-shrink: 0; }
  /* the label slides open after the flag. Animating a grid column from 0fr to 1fr lands
     exactly on the label's own width (smooth, no stall at the end) */
  .cmp-wp-label {
    display: inline-grid; grid-template-columns: 0fr; margin-right: -5px; opacity: 0;
    transition: grid-template-columns 0.34s cubic-bezier(0.22, 0.8, 0.24, 1) 0.06s, margin 0.34s cubic-bezier(0.22, 0.8, 0.24, 1) 0.06s, opacity 0.18s ease 0.04s;
  }
  .cmp-wp-label > span { min-width: 0; overflow: hidden; white-space: nowrap; }
  .cmp-wp-btn:hover .cmp-wp-label, .cmp-wp-btn:focus-visible .cmp-wp-label, .cmp-wp-btn[aria-expanded="true"] .cmp-wp-label {
    grid-template-columns: 1fr; margin-right: 0; opacity: 1;
    transition: grid-template-columns 0.34s cubic-bezier(0.22, 0.8, 0.24, 1), margin 0.34s cubic-bezier(0.22, 0.8, 0.24, 1), opacity 0.22s ease 0.08s;
  }
  .cmp-wp-count {
    min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px;
    background: var(--cmp-tint); color: var(--cmp-blue); font-size: 10.5px; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .cmp-wp-panel {
    position: absolute; top: 44px; left: 12px; right: 12px; z-index: 4; max-height: 72%;
    display: flex; flex-direction: column; overflow: hidden;
    background: #fff; border: 1px solid var(--cmp-line); border-radius: 16px;
    box-shadow: 0 18px 44px rgba(43,62,80,0.18);
    transform-origin: top right; animation: cmpPanelIn 0.28s var(--cmp-ease);
  }
  .cmp-wp-panel[hidden] { display: none; }
  @keyframes cmpPanelIn { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
  .cmp-wp-head { padding: 14px 16px 10px; border-bottom: 1px solid var(--cmp-line); }
  .cmp-wp-title { font-size: 13.5px; font-weight: 700; color: var(--cmp-navy); }
  .cmp-wp-sub { font-size: 11.5px; color: var(--cmp-muted); margin-top: 2px; }
  #cmp-wp-list { overflow-y: auto; padding: 8px 8px 10px; }
  .cmp-wp-item {
    position: relative; display: flex; gap: 12px; padding: 9px 8px 9px 6px; border-radius: 12px;
    transition: background 0.15s; animation: cmpPillIn 0.3s var(--cmp-ease) backwards;
  }
  .cmp-wp-item:hover { background: var(--cmp-tint-2); }
  .cmp-wp-rail { position: relative; width: 14px; flex-shrink: 0; display: flex; justify-content: center; }
  .cmp-wp-rail::before {
    content: ""; position: absolute; top: -9px; bottom: -9px; width: 2px; background: var(--cmp-line);
  }
  .cmp-wp-item:first-child .cmp-wp-rail::before { top: 12px; }
  .cmp-wp-item:last-child .cmp-wp-rail::before { bottom: calc(100% - 12px); }
  .cmp-wp-dot {
    position: relative; margin-top: 4px; width: 10px; height: 10px; border-radius: 50%;
    background: #fff; border: 2px solid #AEBBCC; transition: border-color 0.15s, transform 0.2s var(--cmp-spring), background 0.15s;
  }
  .cmp-wp-item:hover .cmp-wp-dot { border-color: var(--cmp-blue); transform: scale(1.2); }
  .cmp-wp-item.current .cmp-wp-dot { background: var(--cmp-blue); border-color: var(--cmp-blue); box-shadow: 0 0 0 4px rgba(42,103,216,0.15); }
  .cmp-wp-main { flex: 1; min-width: 0; }
  .cmp-wp-q {
    font-size: 13px; font-weight: 600; color: var(--cmp-ink); line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .cmp-wp-meta { font-size: 11px; color: #66727F; margin-top: 2px; }
  .cmp-wp-acts { display: flex; gap: 6px; margin-top: 7px; }
  .cmp-wp-act {
    font: 600 11.5px var(--cmp-font); border-radius: 8px; padding: 4px 9px; cursor: pointer;
    border: 1px solid var(--cmp-line); background: #fff; color: var(--cmp-navy);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .cmp-wp-act:hover { border-color: #BCD0F0; color: var(--cmp-blue); }
  .cmp-wp-act.primary { background: var(--cmp-blue); border-color: var(--cmp-blue); color: #fff; }
  .cmp-wp-act.primary:hover { background: var(--cmp-blue-dk); color: #fff; }
  .cmp-flash .cmp-usr { animation: cmpFlash 1.6s ease; }
  .cmp-flash + .cmp-row-ai .cmp-ai { animation: cmpFlashText 1.6s ease; }
  @keyframes cmpFlash {
    0%, 100% { box-shadow: 0 0 0 0 rgba(42,103,216,0); }
    20%, 60% { box-shadow: 0 0 0 3px rgba(42,103,216,0.35); }
  }
  @keyframes cmpFlashText { 0%, 100% { background: transparent; } 20%, 60% { background: rgba(42,103,216,0.06); } }
  .cmp-flash + .cmp-row-ai .cmp-ai { border-radius: 8px; }
  .cmp-branch {
    display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--cmp-muted);
    animation: cmpRise 0.3s var(--cmp-ease);
  }
  .cmp-branch::before, .cmp-branch::after { content: ""; flex: 1; height: 1px; background: var(--cmp-line); }
  .cmp-branch-i { width: 13px; height: 13px; color: var(--cmp-blue); }
  .cmp-branch button {
    border: none; background: none; padding: 0; cursor: pointer; font: 700 11.5px var(--cmp-font); color: var(--cmp-blue);
  }
  .cmp-branch button:hover { text-decoration: underline; }
  /* the flag on a resumed path: click to catch the answer up */
  #cmp-widget-root .cmp-branch-flag {
    width: 24px; height: 24px; padding: 5px; margin: 0 -4px; border-radius: 7px; color: var(--cmp-blue);
    transform-origin: 30% 85%; transition: background 0.15s ease;
  }
  #cmp-widget-root .cmp-branch-flag:hover { background: var(--cmp-tint-2); text-decoration: none; }
  #cmp-widget-root .cmp-branch-flag:focus-visible { outline: 2px solid #BCD0F0; outline-offset: 1px; }
  #cmp-widget-root .cmp-branch-flag:disabled { cursor: default; }
  .cmp-branch-flag svg { width: 14px !important; height: 14px !important; display: block; }
  .cmp-branch-flag.done svg path { fill: currentColor; fill-opacity: 0.2; }
  .cmp-branch-flag.cmp-wave { animation: cmpFlagWave 0.42s ease-in-out 1; }
  /* quick sideways shakes, like a flag snapping in the wind */
  @keyframes cmpFlagWave {
    0%, 100% { transform: none; } 25% { transform: translateX(-1px) rotate(-5deg); }
    55% { transform: translateX(0.75px) rotate(3deg); } 80% { transform: rotate(-1deg); }
  }

  /* confirmation pop-up above the reply box */
  .cmp-view[data-view="chat"] { position: relative; }
  .cmp-toast {
    position: absolute; left: 16px; right: 16px; bottom: 78px; z-index: 4; margin: 0 auto; width: fit-content;
    display: flex; align-items: center; gap: 9px;
    padding: 9px 12px 9px 10px; border-radius: 12px; background: #F3F5F8; border: 1px solid #E2E8F0;
    box-shadow: 0 10px 26px -8px rgba(23,37,58,0.22); font-size: 12.5px; color: var(--cmp-ink); line-height: 1.35;
    animation: cmpToastIn 0.28s var(--cmp-ease) both;
  }
  .cmp-toast.out { animation: cmpToastOut 0.2s ease both; }
  .cmp-toast b { font-weight: 650; color: var(--cmp-navy); }
  .cmp-toast-i { width: 18px; height: 18px; flex-shrink: 0; color: var(--cmp-blue); }
  .cmp-toast-i svg { width: 18px !important; height: 18px !important; }
  .cmp-toast-i svg path { stroke-dasharray: 22; animation: cmpDraw 0.4s 0.1s ease both; }
  #cmp-widget-root .cmp-toast button { border: 0; background: none; padding: 0 0 0 4px; cursor: pointer; font: 650 12.5px var(--cmp-font); color: var(--cmp-blue); flex-shrink: 0; }
  @keyframes cmpToastIn { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
  @keyframes cmpToastOut { to { opacity: 0; transform: translateY(6px); } }


  /* ================= notepad: floating, draggable, notes + to-do ================= */
  .cmp-np-btn { position: relative; }
  .cmp-np-dot {
    position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-radius: 50%;
    background: #7FB2FF; box-shadow: 0 0 0 2px var(--cmp-navy);
  }
  .cmp-np-dot[hidden] { display: none; }
  .cmp-np-dot.cmp-np-dot-glow { animation: cmpDotGlow 2.6s ease-in-out infinite; }
  @keyframes cmpDotGlow {
    0%, 100% { box-shadow: 0 0 0 2px var(--cmp-navy), 0 0 0 2px rgba(127,178,255,0); }
    50% { box-shadow: 0 0 0 2px var(--cmp-navy), 0 0 8px 3px rgba(127,178,255,0.55); }
  }
  #cmp-notepad {
    position: fixed; left: 40px; top: 120px; width: 320px; height: 520px; max-height: calc(100vh - 32px);
    z-index: 2147483646; display: flex; flex-direction: column; overflow: hidden;
    background: #fff; border: 1px solid var(--cmp-line); border-radius: 18px;
    box-shadow: 0 22px 54px rgba(43,62,80,0.18), 0 3px 10px rgba(43,62,80,0.06);
    font-family: var(--cmp-font); color: var(--cmp-ink);
    animation: cmpNpIn 0.32s var(--cmp-ease);
  }
  #cmp-notepad[hidden] { display: none; }
  #cmp-notepad.cmp-np-dragging { box-shadow: 0 30px 70px rgba(43,62,80,0.26); transition: none; user-select: none; }
  @keyframes cmpNpIn { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
  .cmp-np-hdr {
    display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 12px; cursor: grab; touch-action: none;
    background: var(--cmp-tint-2); border-bottom: 1px solid var(--cmp-line); flex-shrink: 0;
  }
  .cmp-np-dragging .cmp-np-hdr { cursor: grabbing; }
  .cmp-np-grip { width: 16px; height: 16px; color: #8290A2; }
  .cmp-np-grip .cmp-i { fill: currentColor; stroke: none; }
  .cmp-np-title { flex: 1; font-size: 13.5px; font-weight: 700; color: var(--cmp-navy); }
  #cmp-widget-root .cmp-np-x {
    width: 28px; height: 28px; padding: 6px; border: none; border-radius: 8px; cursor: pointer;
    background: transparent; color: var(--cmp-muted); transition: background 0.2s ease, color 0.2s ease;
  }
  #cmp-widget-root .cmp-np-x:hover { background: #E9EEF6; color: var(--cmp-navy); }
  .cmp-np-tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; padding: 0 10px; border-bottom: 1px solid var(--cmp-line); flex-shrink: 0; }
  #cmp-widget-root .cmp-np-tab {
    background: none; border: none; cursor: pointer; padding: 10px 4px 9px;
    font: 600 12.5px var(--cmp-font); color: var(--cmp-muted); transition: color 0.15s ease;
  }
  #cmp-widget-root .cmp-np-tab.active { color: var(--cmp-blue); }
  .cmp-np-count {
    display: inline-flex; min-width: 17px; height: 17px; padding: 0 5px; margin-left: 3px; border-radius: 999px;
    align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700;
    background: var(--cmp-tint); color: var(--cmp-blue); vertical-align: 1px;
  }
  .cmp-np-count:empty { display: none; }
  .cmp-np-ink {
    position: absolute; bottom: -1px; left: 10px; width: calc((100% - 20px) / 2); height: 2.5px; border-radius: 2px;
    background: var(--cmp-blue); transform: translateX(calc(var(--t, 0) * 100%)); transition: transform 0.35s var(--cmp-ease);
  }
  .cmp-np-view { display: none; flex: 1; min-height: 0; flex-direction: column; }
  .cmp-np-view.active { display: flex; animation: cmpViewIn 0.28s var(--cmp-ease); }
  #cmp-widget-root #cmp-np-notes {
    flex: 1; resize: none; border: none; outline: none; padding: 14px 16px; margin: 0;
    font: 13.5px var(--cmp-font); line-height: 22px; color: var(--cmp-ink);
    background-color: #fff;
    background-image: repeating-linear-gradient(transparent 0 21px, #EEF2F8 21px 22px);
    background-position: 0 14px; background-size: 100% 22px; background-attachment: local;
  }
  .cmp-np-foot { padding: 6px 14px 9px; font-size: 10.5px; color: #66727F; flex-shrink: 0; transition: color 0.3s ease; }
  .cmp-np-foot.saving { color: var(--cmp-blue); }
  .cmp-np-add { display: flex; gap: 8px; padding: 12px 12px 6px; flex-shrink: 0; margin: 0; }
  #cmp-np-input {
    flex: 1; min-width: 0; border: 1px solid var(--cmp-line); border-radius: 11px; background: var(--cmp-tint-2);
    padding: 9px 12px; font: 13px var(--cmp-font); color: var(--cmp-ink); outline: none;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  #cmp-np-input:focus { border-color: var(--cmp-blue); background: #fff; box-shadow: 0 0 0 4px rgba(42,103,216,0.10); }
  #cmp-widget-root .cmp-np-add button {
    width: 36px; height: 36px; flex-shrink: 0; padding: 9px; border: none; border-radius: 11px; cursor: pointer;
    background: var(--cmp-blue); color: #fff; transition: background 0.15s, transform 0.15s var(--cmp-spring);
  }
  #cmp-widget-root .cmp-np-add button:hover { background: var(--cmp-blue-dk); }
  #cmp-widget-root .cmp-np-add button:active { transform: scale(0.92); }
  .cmp-np-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 8px 12px; }
  .cmp-np-empty { text-align: center; color: #66727F; font-size: 12.5px; padding: 34px 18px; line-height: 1.55; }
  .cmp-todo {
    position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 8px 8px; border-radius: 10px;
    transition: background 0.15s ease, opacity 0.35s ease, max-height 0.4s var(--cmp-ease), padding 0.4s var(--cmp-ease);
    max-height: 120px; animation: cmpPillIn 0.28s var(--cmp-ease);
  }
  .cmp-todo:hover { background: var(--cmp-tint-2); }
  .cmp-todo.cmp-flash-np { animation: cmpTodoFlash 1.6s ease; }
  @keyframes cmpTodoFlash { 0%, 100% { background: transparent; } 20%, 60% { background: rgba(42,103,216,0.10); } }
  .cmp-todo.leaving { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
  #cmp-widget-root .cmp-chk {
    position: relative; width: 19px; height: 19px; flex-shrink: 0; margin-top: 1px; padding: 0; cursor: pointer;
    border-radius: 50%; border: 1.75px solid #B6C3D6; background: #fff; color: #fff;
    transition: border-color 0.15s ease, background 0.2s ease, transform 0.2s var(--cmp-spring);
  }
  #cmp-widget-root .cmp-chk:hover { border-color: var(--cmp-blue); }
  .cmp-chk .cmp-i { position: absolute; inset: 2px; width: 13px; height: 13px; stroke-width: 2.4; stroke-dasharray: 22; stroke-dashoffset: 22; transition: stroke-dashoffset 0.3s ease 0.08s; }
  .cmp-todo.done .cmp-chk, #cmp-widget-root .cmp-todo.done .cmp-chk { background: var(--cmp-blue); border-color: var(--cmp-blue); }
  .cmp-todo.done .cmp-chk .cmp-i { stroke-dashoffset: 0; }
  .cmp-todo.popping .cmp-chk { animation: cmpChkPop 0.45s var(--cmp-spring); }
  @keyframes cmpChkPop { 0% { transform: scale(1); } 40% { transform: scale(1.28); } 100% { transform: scale(1); } }
  .cmp-burst { position: absolute; left: 17px; top: 17px; width: 0; height: 0; pointer-events: none; }
  .cmp-burst i {
    position: absolute; width: 5px; height: 5px; margin: -2.5px; border-radius: 50%; background: var(--cmp-blue);
    animation: cmpBurst 0.6s ease-out forwards;
  }
  .cmp-burst i:nth-child(even) { background: #7FB2FF; width: 4px; height: 4px; }
  @keyframes cmpBurst { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(-17px) scale(0.4); } }
  .cmp-todo-t { position: relative; flex: 1; min-width: 0; font-size: 13px; line-height: 1.45; color: var(--cmp-ink); overflow-wrap: anywhere; transition: color 0.3s ease; }
  .cmp-todo-t::after {
    content: ""; position: absolute; left: 0; top: 0.72em; height: 1.5px; width: 0; background: #98A3B8;
    transition: width 0.35s ease;
  }
  .cmp-todo.done .cmp-todo-t { color: #98A3B8; }
  .cmp-todo.done .cmp-todo-t::after { width: 100%; }
  .cmp-todo-from { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; font-size: 10.5px; font-weight: 600; color: var(--cmp-blue); vertical-align: 1px; }
  .cmp-todo-from .cmp-i { width: 11px; height: 11px; }
  #cmp-widget-root .cmp-todo-del {
    width: 22px; height: 22px; padding: 4px; border: none; border-radius: 6px; cursor: pointer; flex-shrink: 0;
    background: transparent; color: #8290A2; opacity: 0; transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;
  }
  .cmp-todo:hover .cmp-todo-del, #cmp-widget-root .cmp-todo-del:focus-visible { opacity: 1; }
  #cmp-widget-root .cmp-todo-del:hover { color: #C2410C; background: #FFF1EA; }
  @media (hover: none) { #cmp-widget-root .cmp-todo-del { opacity: 1; } }
  #cmp-widget-root .cmp-np-done-h {
    display: flex; align-items: center; gap: 6px; width: 100%; margin: 12px 0 2px; padding: 4px 8px; border: none; background: none; cursor: pointer;
    font: 700 11px var(--cmp-font); color: #66727F; letter-spacing: 0.6px; text-transform: uppercase; text-align: left;
  }
  .cmp-np-done-h .cmp-i { width: 12px; height: 12px; transition: transform 0.2s ease; }
  .cmp-np-done-h[aria-expanded="false"] .cmp-i { transform: rotate(-90deg); }


  /* restoring after a page change: no entrance animations, it should look like it never left */
  #cmp-widget-root.cmp-instant, #cmp-widget-root.cmp-instant * { animation: none !important; transition: none !important; }

  /* company / community mentions that have a FutureSelf page */
  /* every link in a reply (FutureSelf pages, companies, communities) is grayish-blue text, no highlight */
  #cmp-widget-root .cmp-ai a, #cmp-widget-root .cmp-ai a:visited { color: #4C6C93; text-decoration: none; background: none; padding: 0; margin: 0; }
  #cmp-widget-root .cmp-ai a:hover { color: #2F5583; text-decoration: none; }
  /* companies and communities: quiet gray until they have a page, then a grayish-blue link (no chip) */
  .cmp-ai .cmp-entity { color: #687585; font-weight: 600; }
  #cmp-widget-root .cmp-ai a.cmp-dir-link, #cmp-widget-root .cmp-ai a.cmp-dir-link:visited {
    background: none; padding: 0; margin: 0; color: #4C6C93; font-weight: 650; border-radius: 0;
  }
  #cmp-widget-root .cmp-ai a.cmp-dir-link:hover { background: none; color: #2F5583; }

  /* notepad settings */
  .cmp-np-settings {
    position: absolute; top: 46px; right: 10px; z-index: 3; width: 248px; padding: 12px;
    background: #fff; border: 1px solid var(--cmp-line); border-radius: 14px;
    box-shadow: 0 16px 36px rgba(43,62,80,0.16); animation: cmpPanelIn 0.24s var(--cmp-ease);
  }
  .cmp-np-settings[hidden] { display: none; }
  .cmp-np-settings-t { font-size: 11px; font-weight: 700; color: #66727F; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 8px; }
  .cmp-np-opt { display: flex; gap: 9px; align-items: flex-start; cursor: pointer; padding: 6px 4px; border-radius: 9px; }
  .cmp-np-opt:hover { background: var(--cmp-tint-2); }
  .cmp-np-opt input { margin: 2px 0 0; accent-color: var(--cmp-blue); width: 15px; height: 15px; flex-shrink: 0; }
  .cmp-np-opt b { display: block; font-size: 12.5px; font-weight: 650; color: var(--cmp-ink); }
  .cmp-np-opt small { display: block; font-size: 11.5px; color: var(--cmp-muted); line-height: 1.4; margin-top: 2px; }
  #cmp-widget-root .cmp-np-opt-btn {
    width: 100%; margin-top: 6px; padding: 7px 10px; border-radius: 9px; border: 1px solid var(--cmp-line); background: #fff;
    font: 600 12px var(--cmp-font); color: var(--cmp-navy); cursor: pointer; text-align: left;
  }
  #cmp-widget-root .cmp-np-opt-btn:hover { border-color: #BCD0F0; background: var(--cmp-tint-2); }
  .cmp-np-settings-f { font-size: 10.5px; color: #66727F; margin-top: 9px; }
  #cmp-widget-root .cmp-np-opt-btn:disabled { color: #A3AFBE; cursor: default; background: #fff; border-color: var(--cmp-line); }


  /* settings extras */
  .cmp-np-settings { width: 262px; }
  .cmp-np-opt-h { font-size: 11px; font-weight: 700; color: #66727F; letter-spacing: 0.6px; text-transform: uppercase; margin: 10px 4px 6px; }
  .cmp-np-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px; border-radius: 10px; background: #EEF2F7; margin: 0 2px; }
  #cmp-widget-root .cmp-np-seg button {
    border: none; border-radius: 8px; padding: 6px 4px; cursor: pointer; background: transparent;
    font: 600 11.5px var(--cmp-font); color: var(--cmp-muted); transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }
  #cmp-widget-root .cmp-np-seg button[aria-checked="true"] { background: #fff; color: var(--cmp-navy); box-shadow: 0 1px 3px rgba(43,62,80,0.14); }
  .cmp-np-seg-help { font-size: 11px; color: var(--cmp-muted); line-height: 1.4; margin: 6px 4px 2px; min-height: 30px; }

  /* notes footer: Orient + Undo */
  .cmp-np-foot { display: flex; align-items: center; gap: 8px; }
  .cmp-np-foot #cmp-np-saved { flex: 1; }
  #cmp-widget-root .cmp-np-orient {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px 6px 9px; border-radius: 999px; cursor: pointer;
    border: 1px solid var(--cmp-line); background: #fff; color: var(--cmp-navy); font: 600 12px var(--cmp-font);
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  #cmp-widget-root .cmp-np-orient .cmp-i { width: 15px; height: 15px; transition: transform 0.35s var(--cmp-spring); }
  #cmp-widget-root .cmp-np-orient:hover { border-color: #BCD0F0; background: var(--cmp-tint-2); color: var(--cmp-blue); }
  #cmp-widget-root .cmp-np-orient:hover .cmp-i { transform: rotate(-8deg) scale(1.08); }
  #cmp-widget-root .cmp-np-orient[disabled] { opacity: 0.5; cursor: default; }
  #cmp-widget-root .cmp-np-orient.working span { background: linear-gradient(90deg, #8693A5 30%, var(--cmp-navy) 50%, #8693A5 70%); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: cmpShimmer 1.6s linear infinite; }
  #cmp-widget-root .cmp-np-undo {
    border: none; background: none; padding: 4px 6px; cursor: pointer; font: 700 11.5px var(--cmp-font); color: var(--cmp-blue);
  }
  #cmp-widget-root .cmp-np-undo:hover { text-decoration: underline; }
  #cmp-widget-root .cmp-np-undo[hidden] { display: none; }
  .cmp-np-confirm {
    position: absolute; right: 12px; bottom: 48px; z-index: 4; width: 250px; padding: 13px;
    background: #fff; border: 1px solid var(--cmp-line); border-radius: 14px;
    box-shadow: 0 16px 36px rgba(43,62,80,0.18); animation: cmpPanelIn 0.24s var(--cmp-ease); transform-origin: bottom right;
  }
  .cmp-np-confirm[hidden] { display: none; }
  .cmp-np-confirm-t { font-size: 13px; font-weight: 700; color: var(--cmp-navy); }
  .cmp-np-confirm-s { font-size: 12px; color: var(--cmp-muted); line-height: 1.5; margin-top: 4px; }
  .cmp-np-confirm-a { display: flex; justify-content: flex-end; gap: 6px; margin-top: 11px; }
  #cmp-widget-root .cmp-np-confirm-a button {
    padding: 6px 12px; border-radius: 9px; cursor: pointer; font: 600 12px var(--cmp-font);
    border: 1px solid var(--cmp-line); background: #fff; color: var(--cmp-muted);
  }
  #cmp-widget-root .cmp-np-confirm-a .cmp-np-c-yes { background: var(--cmp-blue); border-color: var(--cmp-blue); color: #fff; }
  #cmp-widget-root .cmp-np-confirm-a .cmp-np-c-yes:hover { background: var(--cmp-blue-dk); }
  #cmp-np-notes.cmp-np-fresh { animation: cmpNotesFresh 0.9s ease; }
  @keyframes cmpNotesFresh { 0% { background-color: rgba(42,103,216,0.06); } 100% { background-color: transparent; } }

  /* the reward: small, quick, then out of the way */
  .cmp-np-toast {
    position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 4;
    display: flex; align-items: flex-start; gap: 11px; padding: 12px 12px 11px;
    background: #F3F5F8; color: var(--cmp-ink); border: 1px solid #E2E7EE; border-radius: 14px;
    box-shadow: 0 14px 30px rgba(43,62,80,0.14);
    animation: cmpToastIn 0.42s var(--cmp-spring);
    transition: opacity 0.24s ease, transform 0.24s ease;
  }
  .cmp-np-toast.out { opacity: 0; transform: translateY(8px); }
  @keyframes cmpToastIn { from { opacity: 0; transform: translateY(14px) scale(0.96); } to { opacity: 1; transform: none; } }
  .cmp-np-toast-i {
    position: relative; width: 28px; height: 28px; padding: 6px; border-radius: 50%; flex-shrink: 0;
    background: var(--cmp-blue); color: #fff; animation: cmpChkPop 0.5s var(--cmp-spring) 0.1s backwards;
  }
  .cmp-np-toast-i .cmp-i { stroke-width: 2.6; stroke-dasharray: 22; stroke-dashoffset: 22; animation: cmpDraw 0.35s ease 0.25s forwards; }
  @keyframes cmpDraw { to { stroke-dashoffset: 0; } }
  .cmp-np-toast-i i {
    position: absolute; inset: -3px; border-radius: 50%; border: 1.5px solid rgba(42,103,216,0.45);
    animation: cmpRing 0.9s ease-out 0.15s forwards; opacity: 0;
  }
  .cmp-np-toast-i i:nth-of-type(2) { animation-delay: 0.32s; }
  .cmp-np-toast-i i:nth-of-type(3) { animation-delay: 0.49s; }
  @keyframes cmpRing { 0% { opacity: 0.9; transform: scale(0.8); } 100% { opacity: 0; transform: scale(1.9); } }
  .cmp-np-toast-m { flex: 1; min-width: 0; }
  .cmp-np-toast-t { font-size: 13px; font-weight: 700; color: var(--cmp-navy); }
  .cmp-np-toast-s { font-size: 11.5px; color: var(--cmp-muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: line-through; text-decoration-color: #B6C3D6; }
  .cmp-np-toast-c { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; color: var(--cmp-muted); cursor: pointer; }
  .cmp-np-toast-c input { margin: 0; accent-color: var(--cmp-blue); width: 13px; height: 13px; }
  #cmp-widget-root .cmp-np-toast-x {
    flex-shrink: 0; padding: 5px 9px; border-radius: 8px; border: none; cursor: pointer;
    background: #fff; color: var(--cmp-navy); border: 1px solid #E2E7EE; font: 600 11.5px var(--cmp-font); transition: background 0.15s ease, border-color 0.15s ease;
  }
  #cmp-widget-root .cmp-np-toast-x:hover { background: var(--cmp-tint); border-color: #BCD0F0; }


  /* to-do: groups, steps, review, Compass tag that links back to its conversation */
  .cmp-np-group { font-size: 10.5px; font-weight: 700; color: #66727F; letter-spacing: 0.6px; text-transform: uppercase; margin: 12px 8px 2px; }
  .cmp-np-group:first-child { margin-top: 4px; }
  .cmp-todo-body { flex: 1; min-width: 0; }
  .cmp-todo-body .cmp-todo-t { display: block; }
  #cmp-widget-root button.cmp-todo-from {
    border: none; background: none; padding: 0; cursor: pointer; font: 600 10.5px var(--cmp-font);
    color: var(--cmp-blue); border-radius: 5px;
  }
  #cmp-widget-root button.cmp-todo-from:hover { text-decoration: underline; }
  .cmp-steps { margin: 6px 0 2px; display: flex; flex-direction: column; gap: 3px; }
  .cmp-step { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; color: var(--cmp-muted); line-height: 1.4; cursor: pointer; }
  #cmp-widget-root .cmp-step-chk {
    width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px; padding: 0; border-radius: 4px; cursor: pointer;
    border: 1.5px solid #C2CCDA; background: #fff; color: #fff; transition: background 0.15s ease, border-color 0.15s ease;
  }
  #cmp-widget-root .cmp-step-chk .cmp-i { width: 10px; height: 10px; margin: 0 auto; stroke-width: 2.6; opacity: 0; transition: opacity 0.15s ease; }
  #cmp-widget-root .cmp-step.done .cmp-step-chk { background: #7FA4E0; border-color: #7FA4E0; }
  #cmp-widget-root .cmp-step.done .cmp-step-chk .cmp-i { opacity: 1; }
  .cmp-step.done span { text-decoration: line-through; text-decoration-color: #B6C3D6; color: #A3AEBE; }
  .cmp-step-prog { font-size: 10.5px; color: #66727F; margin-left: 6px; font-weight: 600; }
  #cmp-widget-root .cmp-np-review {
    display: flex; align-items: center; justify-content: center; gap: 7px; width: calc(100% - 8px); margin: 12px 4px 4px;
    padding: 8px 10px; border-radius: 11px; border: 1px dashed #C9D6EA; background: #fff; cursor: pointer;
    font: 600 12px var(--cmp-font); color: var(--cmp-muted); transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  #cmp-widget-root .cmp-np-review .cmp-i { width: 14px; height: 14px; color: var(--cmp-blue); }
  #cmp-widget-root .cmp-np-review:hover { border-style: solid; border-color: #BCD0F0; background: var(--cmp-tint-2); color: var(--cmp-ink); }

  /* to-do change card in chat */
  .cmp-sug-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .cmp-sug-list li { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: var(--cmp-ink); line-height: 1.45; }
  .cmp-sug-list input { margin: 2px 0 0; accent-color: var(--cmp-blue); width: 14px; height: 14px; flex-shrink: 0; }
  .cmp-sug-op { font-size: 10px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; color: var(--cmp-blue); background: #fff; border: 1px solid var(--cmp-line); border-radius: 5px; padding: 0 5px; margin-right: 5px; }
  .cmp-sug-sub { display: block; color: var(--cmp-muted); font-size: 12px; }

  /* ---- suggestion cards in chat ---- */
  .cmp-sug {
    display: flex; gap: 11px; align-items: flex-start; margin-left: 36px; padding: 11px 12px;
    border: 1px solid var(--cmp-line); border-radius: 14px; background: var(--cmp-tint-2);
    animation: cmpRise 0.34s var(--cmp-ease); transition: opacity 0.25s ease, transform 0.25s ease, background 0.3s ease;
  }
  .cmp-sug-out { opacity: 0; transform: translateY(4px); }
  .cmp-sug-i { width: 28px; height: 28px; padding: 6px; border-radius: 9px; flex-shrink: 0; background: #fff; color: var(--cmp-blue); border: 1px solid var(--cmp-line); }
  .cmp-sug-main { flex: 1; min-width: 0; }
  .cmp-sug-q { font-size: 13px; line-height: 1.5; color: var(--cmp-ink); }
  .cmp-sug-q strong { color: var(--cmp-navy); font-weight: 650; }
  .cmp-sug-item { display: block; margin-top: 6px; padding: 6px 9px; border-radius: 8px; background: #fff; border: 1px dashed #C9D6EA; font-size: 12.5px; font-weight: 600; color: var(--cmp-navy); }
  .cmp-sug-acts { display: flex; gap: 6px; margin-top: 9px; }
  #cmp-widget-root .cmp-sug-acts button {
    font: 600 12px var(--cmp-font); padding: 6px 12px; border-radius: 9px; cursor: pointer;
    border: 1px solid var(--cmp-line); background: #fff; color: var(--cmp-muted); transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  #cmp-widget-root .cmp-sug-acts .cmp-sug-yes { background: var(--cmp-blue); border-color: var(--cmp-blue); color: #fff; }
  #cmp-widget-root .cmp-sug-acts .cmp-sug-yes:hover { background: var(--cmp-blue-dk); }
  #cmp-widget-root .cmp-sug-acts .cmp-sug-no:hover { color: var(--cmp-ink); border-color: #BCD0F0; }
  .cmp-sug-done { background: #fff; }
  .cmp-sug-ok { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12.5px; color: var(--cmp-muted); min-height: 28px; animation: cmpViewIn 0.3s var(--cmp-ease); }
  .cmp-sug-tick { width: 16px; height: 16px; color: #1E7A46; }
  #cmp-widget-root .cmp-sug-open {
    border: none; background: var(--cmp-tint); color: var(--cmp-blue); font: 700 12px var(--cmp-font);
    padding: 4px 10px; border-radius: 999px; cursor: pointer; box-shadow: 0 0 0 0 rgba(42,103,216,0.35);
    animation: cmpOpenPulse 1.8s ease 0.3s 2;
  }
  #cmp-widget-root .cmp-sug-open:hover { background: var(--cmp-blue); color: #fff; }
  @keyframes cmpOpenPulse { 0% { box-shadow: 0 0 0 0 rgba(42,103,216,0.35); } 70% { box-shadow: 0 0 0 7px rgba(42,103,216,0); } 100% { box-shadow: 0 0 0 0 rgba(42,103,216,0); } }

  /* ---- waypoint details: tucked away until asked for ---- */
  .cmp-wp-q-row { display: flex; align-items: flex-start; gap: 6px; }
  .cmp-wp-q-row .cmp-wp-q { flex: 1; min-width: 0; }
  #cmp-widget-root .cmp-wp-more {
    width: 20px; height: 20px; padding: 3px; margin-top: 0; border: none; border-radius: 6px; cursor: pointer; flex-shrink: 0;
    background: transparent; color: #8290A2; transition: color 0.15s, background 0.15s, transform 0.25s var(--cmp-ease);
  }
  #cmp-widget-root .cmp-wp-more:hover { color: var(--cmp-blue); background: var(--cmp-tint); }
  .cmp-wp-item.open .cmp-wp-more { transform: rotate(180deg); color: var(--cmp-blue); }
  .cmp-wp-detail {
    display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 0.28s var(--cmp-ease), opacity 0.2s ease, margin 0.28s ease;
  }
  .cmp-wp-detail > div { overflow: hidden; }
  .cmp-wp-item.open .cmp-wp-detail { grid-template-rows: 1fr; opacity: 1; margin-top: 6px; }
  .cmp-wp-item.open .cmp-wp-meta { display: none; }
  .cmp-wp-dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 11px; line-height: 1.45; }
  .cmp-wp-dl dt { color: #66727F; margin: 0; }
  .cmp-wp-dl dd { color: var(--cmp-muted); margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .cmp-wp-tag { display: inline-block; padding: 0 6px; border-radius: 999px; background: var(--cmp-tint); color: var(--cmp-blue); font-weight: 600; margin: 0 3px 2px 0; }

  @media (max-width: 480px) {
    #cmp-notepad { width: calc(100vw - 24px); height: 62vh; z-index: 2147483647; }
    #cmp-np-input, #cmp-np-notes { font-size: 16px; }
    .cmp-sug { margin-left: 0; }
  }

  /* gate / consent screens */
  .cmp-center-screen {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 24px 22px; text-align: center; gap: 14px; animation: cmpRise 0.35s var(--cmp-ease);
  }
  .cmp-center-icon {
    width: 54px; height: 54px; border-radius: 16px; background: var(--cmp-tint);
    display: flex; align-items: center; justify-content: center;
  }
  .cmp-center-icon svg { width: 26px; height: 26px; fill: none; stroke: var(--cmp-blue); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .cmp-center-title { font-size: 16px; font-weight: 700; color: var(--cmp-navy); }
  .cmp-center-text { font-size: 13px; color: var(--cmp-muted); line-height: 1.55; max-width: 300px; }
  .cmp-checklist { width: 100%; max-width: 290px; display: flex; flex-direction: column; gap: 8px; margin: 4px 0; }
  .cmp-check-item {
    display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 9px 12px;
    border-radius: 10px; background: var(--cmp-tint-2); border: 1px solid var(--cmp-line); text-align: left;
    animation: cmpPillIn 0.32s var(--cmp-ease) backwards;
  }
  .cmp-check-item:nth-child(2) { animation-delay: 0.06s; }
  .cmp-check-item:nth-child(3) { animation-delay: 0.12s; }
  .cmp-check-item:nth-child(4) { animation-delay: 0.18s; }
  .cmp-check-item:nth-child(5) { animation-delay: 0.24s; }
  .cmp-check-item.done { color: #1E7A46; }
  .cmp-check-item.todo { color: var(--cmp-muted); }
  .cmp-check-mark {
    width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
  }
  .cmp-check-item.done .cmp-check-mark { background: #D3F2DF; color: #1E7A46; }
  .cmp-check-item.todo .cmp-check-mark { background: #fff; border: 1.5px solid #C9D3E3; }
  .cmp-center-btn, .cmp-cta {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    background: var(--cmp-blue); color: #fff !important; border: none; border-radius: 12px;
    padding: 11px 22px; font: 700 13px var(--cmp-font); cursor: pointer; text-decoration: none;
    box-shadow: 0 8px 18px rgba(42,103,216,0.26);
    transition: background 0.15s, transform 0.18s var(--cmp-spring), box-shadow 0.15s;
  }
  .cmp-center-btn:hover, .cmp-cta:hover { background: var(--cmp-blue-dk); transform: translateY(-2px); box-shadow: 0 12px 24px rgba(42,103,216,0.3); }
  .cmp-center-btn:active, .cmp-cta:active { transform: scale(0.97); }
  .cmp-cta .cmp-i { width: 16px; height: 16px; }

  /* ---- navigate view ---- */
  .cmp-search {
    display: flex; align-items: center; gap: 8px; margin: 14px 16px 2px; padding: 0 12px;
    border: 1px solid var(--cmp-line); border-radius: 12px; background: var(--cmp-tint-2);
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  .cmp-search:focus-within { border-color: var(--cmp-blue); background: #fff; box-shadow: 0 0 0 4px rgba(42,103,216,0.10); }
  .cmp-search .cmp-i { width: 16px; height: 16px; color: #8290A2; flex-shrink: 0; }
  .cmp-ask-row {
    display: flex; align-items: center; gap: 10px; width: calc(100% - 32px); margin: 8px 16px 0;
    padding: 9px 12px; border-radius: 12px; border: 1px dashed #C9D6EA; background: #fff; cursor: pointer;
    font: 500 12.5px var(--cmp-font); color: var(--cmp-muted); text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .cmp-ask-row b { font-weight: 700; color: var(--cmp-blue); }
  .cmp-ask-row:hover { border-style: solid; border-color: #BCD0F0; background: var(--cmp-tint-2); color: var(--cmp-ink); }
  .cmp-ask-i { width: 16px; height: 16px; color: var(--cmp-blue); flex-shrink: 0; }
  .cmp-ask-t { flex: 1; min-width: 0; }
  .cmp-ask-go { width: 14px; height: 14px; color: #8290A2; transition: transform 0.2s var(--cmp-ease), color 0.15s ease; }
  .cmp-ask-row:hover .cmp-ask-go { transform: translateX(2px); color: var(--cmp-blue); }
  #cmp-nav-q {
    flex: 1; border: none; background: transparent; outline: none; padding: 11px 0;
    font: 13.5px var(--cmp-font); color: var(--cmp-ink);
  }
  .cmp-group-label {
    font-size: 11px; font-weight: 700; color: #66727F; letter-spacing: 0.7px; text-transform: uppercase;
    margin: 14px 2px 6px;
  }
  .cmp-group-label:first-child { margin-top: 2px; }
  .cmp-link {
    display: flex; align-items: center; gap: 12px; padding: 10px 10px; border-radius: 12px;
    color: var(--cmp-ink) !important; text-decoration: none !important; font-size: 13.5px; font-weight: 600;
    transition: background 0.15s ease;
    animation: cmpPillIn 0.3s var(--cmp-ease) backwards;
  }
  .cmp-link:hover { background: var(--cmp-tint-2); }
  .cmp-link-i {
    width: 32px; height: 32px; padding: 7px; border-radius: 10px; flex-shrink: 0;
    background: var(--cmp-tint); color: var(--cmp-blue);
    transition: transform 0.2s ease, background 0.15s, color 0.15s;
  }
  .cmp-link:hover .cmp-link-i { background: var(--cmp-blue); color: #fff; transform: scale(1.08); }
  .cmp-link-t { flex: 1; min-width: 0; }
  .cmp-link-sub { display: block; font-size: 11.5px; font-weight: 500; color: var(--cmp-muted); margin-top: 1px; }
  .cmp-link-go { width: 16px; height: 16px; color: #8290A2; transition: transform 0.2s var(--cmp-ease), color 0.15s; }
  .cmp-link:hover .cmp-link-go { transform: translateX(3px); color: var(--cmp-blue); }
  .cmp-link.here .cmp-link-sub { color: var(--cmp-blue); }
  .cmp-empty { font-size: 13px; color: var(--cmp-muted); text-align: center; padding: 30px 10px; }

  /* ---- profile + for you views ---- */
  .cmp-card {
    width: auto; max-width: 100%; min-width: 0; height: auto; margin: 0;
    border: 1px solid var(--cmp-line); border-radius: 16px; padding: 16px; background: #fff;
    animation: cmpRise 0.36s var(--cmp-ease) backwards;
  }
  .cmp-card + .cmp-card { margin-top: 12px; }
  .cmp-card:nth-child(2) { animation-delay: 0.05s; }
  .cmp-card:nth-child(3) { animation-delay: 0.10s; }
  .cmp-card:nth-child(4) { animation-delay: 0.15s; }
  .cmp-card-title { font-size: 12px; font-weight: 700; color: #66727F; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 10px; }
  .cmp-id { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .cmp-id > div:last-child { min-width: 0; overflow-wrap: anywhere; }
  .cmp-ring { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
  .cmp-ring svg { width: 64px; height: 64px; transform: rotate(-90deg); }
  .cmp-ring circle { fill: none; stroke-width: 5; }
  .cmp-ring .cmp-ring-bg { stroke: var(--cmp-tint); }
  .cmp-ring .cmp-ring-fg { stroke: var(--cmp-blue); stroke-linecap: round; transition: stroke-dashoffset 0.9s var(--cmp-ease); }
  .cmp-ring-in {
    position: absolute; inset: 9px; border-radius: 50%;
    background: var(--cmp-navy); color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700;
  }
  .cmp-id-name { font-size: 17px; font-weight: 700; color: var(--cmp-navy); }
  .cmp-id-meta { font-size: 12.5px; color: var(--cmp-muted); margin-top: 3px; line-height: 1.45; }
  .cmp-id-pct { font-size: 12px; font-weight: 700; color: var(--cmp-blue); margin-top: 6px; }
  .cmp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .cmp-chip {
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 12px; font-weight: 600; color: var(--cmp-navy); background: var(--cmp-tint-2);
    border: 1px solid var(--cmp-line); border-radius: 999px; padding: 4px 10px;
  }
  .cmp-muted { font-size: 12.5px; color: var(--cmp-muted); }
  .cmp-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .cmp-ghost {
    display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--cmp-line); background: #fff;
    border-radius: 12px; padding: 10px 16px; font: 700 13px var(--cmp-font); color: var(--cmp-navy) !important;
    text-decoration: none !important; cursor: pointer; transition: background 0.15s, border-color 0.15s;
  }
  .cmp-ghost:hover { background: var(--cmp-tint-2); border-color: #B9CCF2; }

  .cmp-plan {
    display: flex; gap: 14px; align-items: flex-start; padding: 16px;
    border-radius: 16px; border: 1px solid var(--cmp-line); background: var(--cmp-tint-2);
    border-left: 3px solid var(--cmp-blue);
    animation: cmpRise 0.36s var(--cmp-ease);
  }
  .cmp-plan-i {
    width: 36px; height: 36px; padding: 8px; border-radius: 11px; flex-shrink: 0;
    background: #fff; color: var(--cmp-blue); border: 1px solid var(--cmp-line);
  }
  .cmp-plan-t { font-size: 15px; font-weight: 700; color: var(--cmp-navy); line-height: 1.35; }
  .cmp-plan-s { font-size: 12.5px; color: var(--cmp-muted); margin: 3px 0 12px; line-height: 1.5; }
  .cmp-plan .cmp-cta { padding: 9px 16px; font-size: 12.5px; box-shadow: none; }
  .cmp-rec {
    display: flex; gap: 12px; align-items: flex-start; padding: 14px; margin-top: 10px;
    border: 1px solid var(--cmp-line); border-radius: 14px; text-decoration: none !important; color: var(--cmp-ink) !important;
    transition: border-color 0.15s, box-shadow 0.2s, transform 0.2s var(--cmp-ease);
    animation: cmpRise 0.36s var(--cmp-ease) backwards;
  }
  .cmp-rec:nth-of-type(2) { animation-delay: 0.06s; }
  .cmp-rec:nth-of-type(3) { animation-delay: 0.12s; }
  .cmp-rec:nth-of-type(4) { animation-delay: 0.18s; }
  .cmp-rec:hover { border-color: #B9CCF2; box-shadow: 0 10px 22px rgba(43,62,80,0.08); transform: translateY(-2px); }
  .cmp-rec-t { font-size: 13.5px; font-weight: 700; color: var(--cmp-navy); }
  .cmp-rec-why { font-size: 12.5px; color: var(--cmp-muted); margin-top: 3px; line-height: 1.45; }
  .cmp-rec .cmp-link-i { margin-top: 1px; }

  /* ---- page changes: a soft crossfade where the browser supports it, with Compass held
     in place (both pages carry these names, so the panel doesn't blink) ---- */
  @view-transition { navigation: auto; }
  #cmp-chat { view-transition-name: cmp-panel; }
  #cmp-launcher { view-transition-name: cmp-launcher; }
  #cmp-notepad { view-transition-name: cmp-notepad; }
  ::view-transition-group(cmp-panel), ::view-transition-group(cmp-launcher), ::view-transition-group(cmp-notepad) { animation-duration: 0s; }
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.22s; }
  @media (prefers-reduced-motion: reduce) { @view-transition { navigation: none; } }

  /* ================= home page banner (only where #fs-banner-slot exists) ================= */
  #cmp-banner {
    position: relative; overflow: hidden; display: flex; align-items: center; gap: 20px;
    margin: 12px 0; padding: 20px 56px 20px 22px; border-radius: 20px; font-family: var(--cmp-font);
    color: #fff; isolation: isolate;
    background:
      radial-gradient(120% 140% at 100% 0%, rgba(42,103,216,0.38) 0%, rgba(42,103,216,0) 55%),
      linear-gradient(135deg, #2B3E50 0%, #314A63 60%, #2E4660 100%);
    box-shadow: 0 14px 34px -14px rgba(23,37,58,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
    animation: cmpRise 0.45s var(--cmp-ease);
  }
  /* one soft light sweep when it appears */
  #cmp-banner::after {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.10) 50%, transparent 65%);
    transform: translateX(-100%); animation: cmpBnSweep 1.6s 0.5s var(--cmp-ease) both;
  }
  @keyframes cmpBnSweep { to { transform: translateX(100%); } }
  #cmp-banner.hidden { display: none; }
  .cmp-banner-left { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
  .cmp-banner-icon {
    width: 52px; height: 52px; border-radius: 15px; padding: 11px; flex-shrink: 0; color: #fff;
    background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
  }
  .cmp-banner-icon .cmp-needle { animation: cmpNeedleIdle 6s ease-in-out infinite; }
  .cmp-banner-copy { min-width: 0; }
  .cmp-banner-title { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; color: #fff; line-height: 1.3; }
  .cmp-banner-text { font-size: 13.5px; color: rgba(255,255,255,0.78); line-height: 1.5; margin-top: 2px; }
  .cmp-bn-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  #cmp-banner .cmp-bn-chip {
    font: 600 12px var(--cmp-font); color: #fff; cursor: pointer; padding: 6px 11px; border-radius: 999px;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.20);
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  #cmp-banner .cmp-bn-chip:hover { background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.34); }
  .cmp-banner-right { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; }
  .cmp-banner-cta {
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; cursor: pointer;
    font-size: 13.5px; font-weight: 700; color: var(--cmp-navy); background: #fff;
    padding: 10px 16px; border-radius: 12px; box-shadow: 0 6px 16px -6px rgba(0,0,0,0.35);
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }
  .cmp-banner-cta .cmp-i { width: 15px; height: 15px; transition: transform 0.2s var(--cmp-ease); }
  .cmp-banner-cta:hover { background: #EEF3FB; }
  .cmp-banner-cta:hover .cmp-i { transform: translateX(3px); }
  #cmp-banner .cmp-bn-tour {
    font: 600 12px var(--cmp-font); color: rgba(255,255,255,0.82); background: none; border: 0; cursor: pointer; padding: 2px 4px;
  }
  #cmp-banner .cmp-bn-tour:hover { color: #fff; text-decoration: underline; }
  .cmp-banner-x {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; padding: 6px; border: none;
    border-radius: 8px; cursor: pointer; background: transparent; color: rgba(255,255,255,0.6);
  }
  .cmp-banner-x:hover { background: rgba(255,255,255,0.12); color: #fff; }
  @media (max-width: 760px) {
    #cmp-banner { flex-direction: column; align-items: stretch; padding: 18px 46px 18px 18px; gap: 14px; }
    .cmp-banner-right { flex-direction: row; justify-content: flex-start; }
  }
  @media (max-width: 560px) {
    .cmp-banner-icon { width: 44px; height: 44px; padding: 9px; }
    .cmp-banner-title { font-size: 15.5px; }
    .cmp-banner-text { font-size: 13px; }
  }

  /* ================= phones: full-screen window, tap the bubble for actions ================= */
  @media (max-width: 480px) {
    #cmp-launcher { bottom: 20px; right: 20px; }
    #cmp-chat {
      top: 0; right: 0; bottom: 0; left: 0; width: 100%; height: 100%; height: 100dvh; max-height: none;
      border: none; border-radius: 0; box-shadow: none; z-index: 2147483647;
      transform: translateY(24px);
    }
    #cmp-launcher.chat-open { display: none; }
    .cmp-msg { font-size: 14.5px; }
    #cmp-input, #cmp-nav-q { font-size: 16px; } /* 16px stops iOS from zooming into inputs */
    .cmp-usr { max-width: 85%; }
    .cmp-tab span { font-size: 11.5px; }
  }


  /* ---- streamed replies + quick actions under each reply ---- */
  .cmp-out { min-height: 1px; }
  .cmp-acts { display: flex; align-items: center; gap: 2px; margin: 4px 0 0 -6px; height: 26px;
    opacity: 0; transition: opacity 0.18s ease; }
  .cmp-row-ai:hover .cmp-acts, .cmp-acts:focus-within, .cmp-acts.cmp-acts-busy { opacity: 1; }
  @media (hover: none) { .cmp-row-ai.cmp-latest .cmp-acts { opacity: 0.85; } }
  #cmp-widget-root .cmp-act {
    width: 26px; height: 26px; padding: 5px; border: 0; border-radius: 7px; background: transparent;
    color: #8290A2; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
  }
  #cmp-widget-root .cmp-act:hover { background: var(--cmp-tint-2); color: var(--cmp-navy); }
  #cmp-widget-root .cmp-act:focus-visible { outline: 2px solid #BCD0F0; outline-offset: 1px; }
  .cmp-act svg { width: 15px !important; height: 15px !important; }
  .cmp-act.cmp-act-ok { color: var(--cmp-blue) !important; }
  .cmp-act.cmp-act-ok svg path { stroke-dasharray: 22; animation: cmpDraw 0.35s ease both; }
  @keyframes cmpDraw { from { stroke-dashoffset: 22; } to { stroke-dashoffset: 0; } }
  .cmp-act-note { font-size: 11.5px; color: #66727F; margin-left: 4px; animation: cmpSwap 0.25s ease; }
  .cmp-act-note button { font: 600 11.5px var(--cmp-font); color: var(--cmp-blue); background: none; border: 0; padding: 0 0 0 4px; cursor: pointer; }
  .cmp-pick { margin-top: 6px; padding: 9px 10px 8px; border: 1px solid var(--cmp-line); border-radius: 11px; background: var(--cmp-tint-2);
    animation: cmpSwap 0.22s ease; }
  .cmp-pick-t { font-size: 11.5px; font-weight: 650; color: var(--cmp-navy); margin-bottom: 4px; }
  #cmp-widget-root .cmp-pick label { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; line-height: 1.4; color: var(--cmp-ink); padding: 4px 0; cursor: pointer; }
  #cmp-widget-root .cmp-pick input { margin: 2px 0 0; accent-color: var(--cmp-blue); flex-shrink: 0; }
  .cmp-pick-a { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
  #cmp-widget-root .cmp-pick-a button { font: 600 12px var(--cmp-font); border-radius: 8px; padding: 5px 11px; cursor: pointer;
    border: 1px solid var(--cmp-line); background: #fff; color: var(--cmp-muted); }
  #cmp-widget-root .cmp-pick-a button.go { background: var(--cmp-blue); border-color: var(--cmp-blue); color: #fff; }
  .cmp-recal-tag { display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; font-size: 11.5px; color: #66727F; }
  .cmp-recal-tag svg { width: 13px !important; height: 13px !important; color: #8290A2; }
  #cmp-widget-root .cmp-recal-tag button { font: 600 11.5px var(--cmp-font); color: var(--cmp-blue); background: none; border: 0; padding: 0; margin: 0 0 0 2px; cursor: pointer; }
  .cmp-recal-busy > .cmp-out { opacity: 0.38; transition: opacity 0.25s ease; }

  /* thumbs up: fills in and pops once */
  #cmp-widget-root .cmp-act.cmp-act-up.on { color: var(--cmp-blue); }
  .cmp-act-up.on svg path { fill: currentColor; fill-opacity: 0.16; }
  .cmp-act-up.cmp-pop svg { animation: cmpThumb 0.42s var(--cmp-spring); }
  @keyframes cmpThumb { 0% { transform: scale(1); } 40% { transform: scale(1.28) rotate(-10deg); } 100% { transform: scale(1); } }
  .cmp-row-ai.cmp-row-err .cmp-out { color: #66727F; }
  #cmp-widget-root .cmp-retry {
    display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 6px 12px 6px 10px;
    border: 1px solid var(--cmp-line); border-radius: 999px; background: #fff; cursor: pointer;
    font: 600 12px var(--cmp-font); color: var(--cmp-navy); transition: border-color 0.15s, color 0.15s;
  }
  #cmp-widget-root .cmp-retry:hover { border-color: #BCD0F0; color: var(--cmp-blue); }
  .cmp-retry svg { width: 13px !important; height: 13px !important; }

  /* keyboard focus: a clear ring on anything without its own focus style */
  #cmp-widget-root button:focus-visible, #cmp-widget-root a:focus-visible, #cmp-widget-root [tabindex]:focus-visible {
    outline: 2px solid #7FA6E8; outline-offset: 2px;
  }

  /* ---- reset confirmation ---- */
  .cmp-reset-confirm {
    position: absolute; top: 58px; right: 12px; z-index: 6; width: 262px;
    background: #fff; border: 1px solid var(--cmp-line); border-radius: 14px; padding: 13px 14px 11px;
    box-shadow: 0 16px 40px -10px rgba(23,37,58,0.3); animation: cmpTourIn 0.22s var(--cmp-ease) both;
  }
  .cmp-reset-confirm::before {
    content: ""; position: absolute; top: -6px; right: 52px; width: 10px; height: 10px; background: #fff;
    border: 1px solid var(--cmp-line); border-right: 0; border-bottom: 0; transform: rotate(45deg);
  }
  .cmp-rc-t { font-size: 14px; font-weight: 700; color: var(--cmp-navy); }
  .cmp-rc-x { font-size: 12.5px; line-height: 1.5; color: #4A586A; margin-top: 4px; }
  .cmp-rc-a { display: flex; justify-content: flex-end; gap: 6px; margin-top: 11px; }
  #cmp-widget-root .cmp-rc-a button { font: 600 12px var(--cmp-font); border-radius: 8px; padding: 5px 12px; cursor: pointer; }
  #cmp-widget-root .cmp-rc-no { border: 1px solid var(--cmp-line); background: #fff; color: var(--cmp-muted); }
  #cmp-widget-root .cmp-rc-yes { border: 1px solid #C2413A; background: #C2413A; color: #fff; }
  #cmp-widget-root .cmp-rc-yes:hover { background: #A9352F; border-color: #A9352F; }
  #cmp-body.cmp-resetting > * { opacity: 0; transform: translateY(-4px); transition: opacity 0.2s ease, transform 0.2s ease; }

  /* ---- tour ---- */
  .cmp-tour-ring {
    position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 12px;
    box-shadow: 0 0 0 2px rgba(42,103,216,0.55), 0 0 0 6px rgba(42,103,216,0.12);
    transition: left 0.25s var(--cmp-ease), top 0.25s var(--cmp-ease), width 0.25s var(--cmp-ease), height 0.25s var(--cmp-ease);
  }
  .cmp-tour-ring.cmp-tour-ring-click { animation: cmpRingPulse 1.5s ease-in-out infinite; }
  @keyframes cmpRingPulse { 0%, 100% { box-shadow: 0 0 0 2px rgba(42,103,216,0.6), 0 0 0 5px rgba(42,103,216,0.14); } 50% { box-shadow: 0 0 0 2px rgba(42,103,216,0.6), 0 0 0 10px rgba(42,103,216,0.04); } }
  .cmp-tour {
    position: fixed; z-index: 2147483647; width: 268px; max-width: calc(100vw - 16px);
    background: #fff; border: 1px solid var(--cmp-line); border-radius: 14px; padding: 13px 14px 11px;
    box-shadow: 0 16px 40px -10px rgba(23,37,58,0.3), 0 2px 6px rgba(23,37,58,0.06);
    font-family: var(--cmp-font); color: var(--cmp-ink);
  }
  .cmp-tour.cmp-tour-in { animation: cmpTourIn 0.26s var(--cmp-ease) both; }
  @keyframes cmpTourIn { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: none; } }
  .cmp-tour::before {
    content: ""; position: absolute; left: var(--ax, 50%); width: 10px; height: 10px; margin-left: -5px;
    background: #fff; border: 1px solid var(--cmp-line); transform: rotate(45deg);
  }
  .cmp-tour[data-side="below"]::before { top: -6px; border-right: 0; border-bottom: 0; }
  .cmp-tour[data-side="above"]::before { bottom: -6px; border-left: 0; border-top: 0; }
  .cmp-tour[data-side="side"]::before { display: none; }
  .cmp-tour-step { font-size: 10.5px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: #66727F; }
  .cmp-tour-title { font-size: 14px; font-weight: 700; color: var(--cmp-navy); margin: 3px 24px 4px 0; }
  .cmp-tour-text { font-size: 12.5px; line-height: 1.5; color: #4A586A; }
  .cmp-tour-text b { color: var(--cmp-navy); font-weight: 650; }
  .cmp-tour-a { display: flex; align-items: center; gap: 6px; margin-top: 11px; }
  .cmp-tour-sp { flex: 1; }
  #cmp-widget-root .cmp-tour-skip, .cmp-tour-wait { white-space: nowrap; }
  /* links inside suggestion cards match reply links */
  #cmp-widget-root .cmp-sug a, #cmp-widget-root .cmp-sug a:visited { color: #4C6C93; font-weight: 650; text-decoration: none; }
  #cmp-widget-root .cmp-sug a:hover { color: #2F5583; }
  #cmp-widget-root .cmp-tour button { font: 600 12px var(--cmp-font); cursor: pointer; border-radius: 8px; }
  #cmp-widget-root .cmp-tour-skip { border: 0; background: none; color: #66727F; padding: 5px 2px; }
  #cmp-widget-root .cmp-tour-skip:hover { color: var(--cmp-navy); }
  #cmp-widget-root .cmp-tour-back { border: 1px solid var(--cmp-line); background: #fff; color: var(--cmp-muted); padding: 5px 10px; }
  #cmp-widget-root .cmp-tour-next { border: 1px solid var(--cmp-blue); background: var(--cmp-blue); color: #fff; padding: 5px 13px; }
  #cmp-widget-root .cmp-tour-x { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; padding: 5px; border: 0; background: none; color: #8290A2; }
  #cmp-widget-root .cmp-tour-x:hover { color: var(--cmp-navy); background: var(--cmp-tint-2); }
  .cmp-tour-wait { font-size: 11.5px; color: var(--cmp-blue); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
  .cmp-tour-wait::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--cmp-blue); animation: cmpWait 1.2s ease-in-out infinite; }
  @keyframes cmpWait { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }

  /* "Since last time": first pill after a fresh visit when there's history to draw on */
  #cmp-widget-root .cmp-pill.cmp-pill-since {
    background: linear-gradient(180deg, #F4F7FD, #EAF0FA); border-color: #C9D7EE; color: #234A86;
    display: inline-flex; align-items: center; gap: 6px; padding-left: 10px;
  }
  .cmp-pill-since svg { width: 13px !important; height: 13px !important; }
  #cmp-widget-root .cmp-pill.cmp-pill-since:hover { border-color: #A9C1E8; color: var(--cmp-blue); }

  /* ---- waypoints: pins + recalibrate ---- */
  #cmp-widget-root .cmp-wp-pin {
    width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 6px; background: transparent; color: #8290A2;
    cursor: pointer; flex-shrink: 0; opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s;
  }
  #cmp-widget-root .cmp-wp-item:hover .cmp-wp-pin, #cmp-widget-root .cmp-wp-pin:focus-visible, #cmp-widget-root .cmp-wp-item.pinned .cmp-wp-pin { opacity: 1; }
  @media (hover: none) { #cmp-widget-root .cmp-wp-pin { opacity: 1; } }
  #cmp-widget-root .cmp-wp-pin:hover { background: #fff; color: var(--cmp-navy); }
  #cmp-widget-root .cmp-wp-item.pinned .cmp-wp-pin { color: var(--cmp-blue); }
  .cmp-wp-item.pinned .cmp-wp-pin path:first-child { fill: currentColor; fill-opacity: 0.18; }
  .cmp-wp-pin svg { width: 14px !important; height: 14px !important; }
  .cmp-wp-sec { font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #66727F; padding: 8px 10px 2px; }
  .cmp-wp-pinned .cmp-wp-rail::before { display: none; }
  .cmp-wp-pinned { margin-bottom: 4px; }
  .cmp-wp-pinned .cmp-wp-item .cmp-wp-dot { border-color: var(--cmp-blue); }
  .cmp-wp-recal-i svg { width: 12px !important; height: 12px !important; vertical-align: -2px; margin-right: 3px; }

  /* ---- Ctrl+K hint ---- */
  .cmp-kbd { font: 600 10.5px var(--cmp-font); color: #66727F; border: 1px solid var(--cmp-line); border-bottom-width: 2px;
    border-radius: 5px; padding: 1px 5px; background: #fff; white-space: nowrap; flex-shrink: 0; }

  /* ---- Find on this page (Ctrl+F) ---- */
  #cmp-find {
    position: fixed; top: 16px; right: 16px; z-index: 2147483646; width: 360px; max-width: calc(100vw - 24px);
    background: #fff; border: 1px solid var(--cmp-line); border-radius: 16px; overflow: hidden;
    box-shadow: 0 18px 50px -12px rgba(23,37,58,0.32), 0 2px 6px rgba(23,37,58,0.06);
    font-family: var(--cmp-font); color: var(--cmp-ink); animation: cmpFindIn 0.24s var(--cmp-ease);
  }
  #cmp-find[hidden] { display: none; }
  @keyframes cmpFindIn { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: none; } }
  #cmp-find::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent); }
  .cmp-find-bar { display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 12px; }
  .cmp-find-i { width: 17px; height: 17px; color: #8290A2; flex-shrink: 0; margin-right: 4px; }
  #cmp-widget-root #cmp-find-q {
    flex: 1; min-width: 0; border: 0; outline: none; background: transparent; padding: 6px 0;
    font: 14px/1.4 var(--cmp-font); color: var(--cmp-ink);
  }
  #cmp-find-q::placeholder { color: #98A4B5; }
  .cmp-find-n { font-size: 11.5px; color: #66727F; white-space: nowrap; padding: 0 4px; font-variant-numeric: tabular-nums; }
  #cmp-widget-root .cmp-find-btn { width: 28px; height: 28px; padding: 5px; border: 0; border-radius: 8px; background: transparent; color: #6E7B8C; cursor: pointer; flex-shrink: 0; }
  #cmp-widget-root .cmp-find-btn:hover { background: var(--cmp-tint-2); color: var(--cmp-navy); }
  #cmp-widget-root .cmp-find-btn:disabled { opacity: 0.35; cursor: default; background: transparent; }
  .cmp-find-more { border-top: 1px solid #EDF1F6; max-height: 340px; overflow-y: auto; }
  .cmp-find-more:empty { display: none; }
  #cmp-find.cmp-find-compact .cmp-find-more, #cmp-find.cmp-find-compact .cmp-find-foot { display: none; }
  .cmp-find-sec { font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #66727F; padding: 10px 14px 3px; }
  .cmp-find-note { font-size: 11.5px; color: #66727F; padding: 8px 14px 0; }
  #cmp-widget-root .cmp-find-hit {
    display: block; width: 100%; text-align: left; border: 0; background: transparent; cursor: pointer;
    padding: 7px 14px; font: 12.5px/1.45 var(--cmp-font); color: #4A586A; text-decoration: none;
  }
  #cmp-widget-root .cmp-find-hit:hover, #cmp-widget-root .cmp-find-hit.cur { background: var(--cmp-tint-2); }
  .cmp-find-hit b { color: var(--cmp-navy); font-weight: 650; background: #E4ECF8; border-radius: 3px; padding: 0 1px; }
  .cmp-find-hit small { display: block; font-size: 10.5px; color: #66727F; margin-bottom: 1px; }
  #cmp-widget-root a.cmp-find-hit { display: flex; align-items: center; gap: 9px; color: var(--cmp-navy); font-weight: 600; }
  a.cmp-find-hit .cmp-link-i { width: 26px; height: 26px; }
  a.cmp-find-hit small { font-weight: 400; margin: 0; }
  .cmp-find-ask { display: flex !important; align-items: center; gap: 8px; color: var(--cmp-blue) !important; font-weight: 600 !important; border-top: 1px dashed #DCE4F0 !important; margin-top: 4px; padding-top: 9px !important; padding-bottom: 9px !important; }
  .cmp-find-ask svg { width: 15px !important; height: 15px !important; }
  .cmp-find-foot { font-size: 11px; color: #66727F; padding: 7px 14px 9px; border-top: 1px solid #EDF1F6; background: var(--cmp-tint-2); }
  ::highlight(cmp-find) { background-color: rgba(42, 103, 216, 0.16); }
  ::highlight(cmp-find-cur) { background-color: #2A67D8; color: #fff; }
  @media (max-width: 480px) { #cmp-find { top: 8px; right: 8px; left: 8px; width: auto; } }

  /* accessibility: honor users who ask the OS to reduce motion */
  @media (prefers-reduced-motion: reduce) {
    #cmp-widget-root *, #cmp-banner * { animation: none !important; transition-duration: 0.01ms !important; transition-delay: 0s !important; }
    #cmp-banner { animation: none !important; }
    #cmp-widget-root .cmp-orbit i { transform: translateX(7px) !important; }
    #cmp-banner::after { animation: none; display: none; }
    #cmp-widget-root .cmp-x .cmp-i, #cmp-widget-root .cmp-reset .cmp-i, #cmp-widget-root #cmp-np-x .cmp-i { transition: none !important; }
  }
`;

  // satellites fan out in an arc above-left of the bubble (offsets from its center)
  var SATS = [
    { view: 'navigate', label: 'Navigate', icon: I.navigate, x: -104, y: 0 },    // 180 deg
    { view: 'chat',     label: 'Chat',     icon: I.chat,     x: -90,  y: -52 },  // 150 deg
    { view: 'profile',  label: 'Profile',  icon: I.profile,  x: -52,  y: -90 },  // 120 deg
    { view: 'foryou',   label: 'For you',  icon: I.spark,    x: 0,    y: -104 }  //  90 deg
  ];
  var satHTML = '';
  for (var i = 0; i < SATS.length; i++) {
    var s = SATS[i];
    satHTML += '<button class="cmp-sat" type="button" data-view="' + s.view + '" aria-label="' + s.label + '" ' +
      'style="--i:' + i + ';--x:' + s.x + 'px;--y:' + s.y + 'px">' + s.icon + '<span class="cmp-tip">' + s.label + '</span></button>';
  }
  var tabHTML = '';
  for (var j = 0; j < SATS.length; j++) {
    tabHTML += '<button class="cmp-tab' + (j === 1 ? ' active' : '') + '" type="button" role="tab" data-view="' + SATS[j].view + '">' +
      '<span class="cmp-tab-i">' + SATS[j].icon + '</span><span>' + SATS[j].label + '</span></button>';
  }

  var html =
    '<div id="cmp-launcher">' +
      '<div class="cmp-dial">' + satHTML + '</div>' +
      '<button id="cmp-bubble" type="button" aria-label="Open Compass">' +
        '<span class="cmp-bubble-icon cmp-bubble-compass">' + I.compass + '</span>' +
        '<span class="cmp-bubble-icon cmp-bubble-close">' + I.close + '</span>' +
      '</button>' +
    '</div>' +
    '<div id="cmp-chat" role="dialog" aria-label="Compass advisor">' +
      '<div class="cmp-hdr">' +
        '<div class="cmp-hdr-left">' +
          '<div class="cmp-hdr-icon">' + I.compass + '</div>' +
          '<div><div class="cmp-hdr-name">Compass<span class="cmp-hdr-beta">BETA</span></div>' +
          '<div class="cmp-hdr-sub">Your FutureSelf career advisor</div></div>' +
        '</div>' +
        '<div class="cmp-hdr-right">' +
          '<button class="cmp-icon-btn cmp-np-btn" id="cmp-np-btn" type="button" title="Notepad" aria-label="Open notepad">' + I.notepad + '<span class="cmp-np-dot" id="cmp-np-dot" hidden></span></button>' +
          '<button class="cmp-icon-btn cmp-reset" type="button" onclick="cmpReset()" title="Reset conversation" aria-label="Reset conversation">' + I.reset + '</button>' +
          '<button class="cmp-icon-btn cmp-x" type="button" onclick="cmpToggle()" title="Close" aria-label="Close">' + I.close + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="cmp-tabs" role="tablist">' + tabHTML + '<span class="cmp-tab-ink" style="--t:1"></span></div>' +
      '<div class="cmp-views">' +
        '<section class="cmp-view" data-view="navigate">' +
          '<label class="cmp-search"><svg viewBox="0 0 24 24" class="cmp-i"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' +
          '<input id="cmp-nav-q" type="text" placeholder="Search FutureSelf pages" autocomplete="off"><span class="cmp-kbd" id="cmp-nav-kbd" hidden></span></label>' +
          '<button class="cmp-ask-row" id="cmp-nav-ask" type="button">' +
            '<span class="cmp-ask-i">' + I.chat + '</span><span class="cmp-ask-t">Not sure where to go? <b>Ask Compass</b></span>' +
            '<span class="cmp-ask-go">' + I.arrow + '</span></button>' +
          '<div id="cmp-nav-list" class="cmp-scroll"></div>' +
        '</section>' +
        '<section class="cmp-view active" data-view="chat">' +
          '<button class="cmp-wp-btn" id="cmp-wp-btn" type="button" aria-expanded="false" hidden>' +
            '<span class="cmp-wp-btn-i">' + I.flag + '</span><span class="cmp-wp-label"><span>Waypoints</span></span><span class="cmp-wp-count" id="cmp-wp-count"></span></button>' +
          '<div class="cmp-wp-panel" id="cmp-wp-panel" hidden>' +
            '<div class="cmp-wp-head"><div class="cmp-wp-title">Waypoints</div>' +
            '<div class="cmp-wp-sub">Jump back to any question, or pick the conversation up from there.</div></div>' +
            '<div id="cmp-wp-list"></div>' +
          '</div>' +
          '<div id="cmp-body"></div>' +
          '<div id="cmp-qr"></div>' +
          '<div class="cmp-bar">' +
            '<textarea id="cmp-input" rows="1" placeholder="Reply..."></textarea>' +
            '<button class="cmp-send" type="button" onclick="cmpSend()" aria-label="Send">' + I.send + '</button>' +
          '</div>' +
        '</section>' +
        '<section class="cmp-view" data-view="profile"><div id="cmp-profile" class="cmp-scroll"></div></section>' +
        '<section class="cmp-view" data-view="foryou"><div id="cmp-foryou" class="cmp-scroll"></div></section>' +
      '</div>' +
      '<div class="cmp-pwr">Powered by FutureSelf</div>' +
    '</div>' +
    '<div id="cmp-notepad" role="dialog" aria-label="Notepad" hidden>' +
      '<div class="cmp-np-hdr" id="cmp-np-hdr">' +
        '<span class="cmp-np-grip">' + I.grip + '</span>' +
        '<span class="cmp-np-title">Notepad</span>' +
        '<button class="cmp-np-x cmp-np-set" id="cmp-np-set" type="button" aria-label="Notepad settings" aria-expanded="false">' + I.gear + '</button>' +
        '<button class="cmp-np-x" id="cmp-np-x" type="button" aria-label="Close notepad">' + I.close + '</button>' +
      '</div>' +
      '<div class="cmp-np-settings" id="cmp-np-settings" hidden>' +
        '<div class="cmp-np-settings-t">Settings</div>' +
        '<label class="cmp-np-opt"><input type="checkbox" id="cmp-np-celebrate"><span><b>Task wins</b><small>A quick cheer when you finish a Compass task.</small></span></label>' +
        '<label class="cmp-np-opt"><input type="checkbox" id="cmp-np-spell"><span><b>Spelling help</b><small>Spellcheck and autocorrect while you type.</small></span></label>' +
        '<div class="cmp-np-opt-h">Orient</div>' +
        '<div class="cmp-np-seg" id="cmp-np-mode" role="radiogroup" aria-label="How Orient tidies notes">' +
          '<button type="button" role="radio" data-mode="group">Group</button>' +
          '<button type="button" role="radio" data-mode="rewrite">Rewrite</button>' +
          '<button type="button" role="radio" data-mode="both">Both</button>' +
        '</div>' +
        '<div class="cmp-np-seg-help" id="cmp-np-mode-help"></div>' +
        '<button class="cmp-np-opt-btn" id="cmp-np-clear-done" type="button">Clear completed tasks</button>' +
        '<div class="cmp-np-settings-f">Notes and tasks are saved on this device.</div>' +
      '</div>' +
      '<div class="cmp-np-tabs" role="tablist">' +
        '<button class="cmp-np-tab" type="button" data-np="notes">Notes</button>' +
        '<button class="cmp-np-tab" type="button" data-np="todo">To-do <span class="cmp-np-count" id="cmp-np-count"></span></button>' +
        '<span class="cmp-np-ink"></span>' +
      '</div>' +
      '<section class="cmp-np-view" data-np="notes">' +
        '<textarea id="cmp-np-notes" placeholder="Reminders, names, ideas, anything worth keeping..."></textarea>' +

      '</section>' +
      '<section class="cmp-np-view" data-np="todo">' +
        '<form class="cmp-np-add" id="cmp-np-add">' +
          '<input id="cmp-np-input" type="text" placeholder="Add a task" autocomplete="off" maxlength="140">' +
          '<button type="submit" aria-label="Add task">' + I.plus + '</button>' +
        '</form>' +
        '<div class="cmp-np-list" id="cmp-np-list"></div>' +
      '</section>' +
        '<div class="cmp-np-foot"><span id="cmp-np-saved">Saved on this device</span>' +
          '<button class="cmp-np-undo" id="cmp-np-undo" type="button" hidden>Undo</button>' +
          '<button class="cmp-np-orient" id="cmp-np-orient" type="button" title="Tidy and group this tab">' + I.orient + '<span>Orient</span></button></div>' +
        '<div class="cmp-np-confirm" id="cmp-np-confirm" hidden>' +
          '<div class="cmp-np-confirm-t">Orient your notes?</div>' +
          '<div class="cmp-np-confirm-s" id="cmp-np-confirm-s"></div>' +
          '<div class="cmp-np-confirm-a"><button type="button" class="cmp-np-c-no">Cancel</button><button type="button" class="cmp-np-c-yes">Orient</button></div>' +
        '</div>' +
    '</div>' +
    '<div id="cmp-find" role="search" aria-label="Find on this page" hidden>' +
      '<div class="cmp-find-bar">' +
        '<span class="cmp-find-i">' + I.find + '</span>' +
        '<input id="cmp-find-q" type="text" placeholder="Find on this page" autocomplete="off" spellcheck="false" aria-label="Find on this page">' +
        '<span class="cmp-find-n" id="cmp-find-n" aria-live="polite"></span>' +
        '<button class="cmp-find-btn" id="cmp-find-prev" type="button" aria-label="Previous match" disabled>' + I.up + '</button>' +
        '<button class="cmp-find-btn" id="cmp-find-next" type="button" aria-label="Next match" disabled>' + I.down + '</button>' +
        '<button class="cmp-find-btn" id="cmp-find-x" type="button" aria-label="Close find">' + I.close + '</button>' +
      '</div>' +
      '<div class="cmp-find-more" id="cmp-find-more"></div>' +
      '<div class="cmp-find-foot" id="cmp-find-foot"></div>' +
    '</div>';

  window.__FS_ICONS__ = I; // widget.js reuses the same icon set

  var styleEl = document.createElement('style');
  styleEl.id = 'cmp-widget-style';
  styleEl.appendChild(document.createTextNode(css));
  document.head.appendChild(styleEl);

  var container = document.createElement('div');
  container.id = 'cmp-widget-root';
  container.innerHTML = html;
  document.body.appendChild(container);

  mountBanner();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBanner);

  // ---- retire the old purple "AI Advisor" widget (v0) wherever Compass runs ----
  // Old page blocks still carry it. It used the same global button names Compass once
  // did, so the two fought over clicks. Compass now uses its own names, and removes the
  // old bubble, chat and banner (its banner spot becomes the Compass banner).
  var LEGACY = '#fs-bubble, #fs-chat, #fs-banner';
  function retireLegacy() {
    var olds = document.querySelectorAll(LEGACY);
    if (!olds.length) return;
    var oldBanner = document.getElementById('fs-banner');
    if (oldBanner && oldBanner.parentNode && !document.getElementById('fs-banner-slot')) {
      var slot = document.createElement('div'); slot.id = 'fs-banner-slot';
      oldBanner.parentNode.insertBefore(slot, oldBanner);
    }
    for (var i = 0; i < olds.length; i++) if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
    mountBanner();
    if (window.console && console.info) console.info('[Compass] replaced the old AI Advisor widget on this page');
  }
  retireLegacy();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', retireLegacy);

  // ---- keep Compass alive when the site swaps pages without a full reload ----
  // Some sites replace <body> on navigation, or briefly show a cached copy of the
  // previous page. Either way our live elements get dropped and a lifeless copy
  // (which looks right but ignores clicks) can appear. Put the live ones back.
  window.__cmpRoot = container;
  var lastPath = location.pathname, fixing = false;
  function keepAlive(reason) {
    if (fixing) return;
    fixing = true;
    try {
      if (!document.getElementById('cmp-widget-style')) document.head.appendChild(styleEl);
      var copies = document.querySelectorAll('[id="cmp-widget-root"]'), removed = 0;
      for (var k = 0; k < copies.length; k++) if (copies[k] !== container && copies[k].parentNode) { copies[k].parentNode.removeChild(copies[k]); removed++; }
      if (removed && window.console && console.info) console.info('[Compass] removed ' + removed + ' inactive copy after a page change');
      if (document.body && container.parentNode !== document.body) {
        document.body.appendChild(container);
        if (window.console && console.info) console.info('[Compass] page changed without a reload (' + reason + '); reattached');
      }
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        mountBanner();
        try { window.dispatchEvent(new CustomEvent('cmp:navigated', { detail: { path: lastPath } })); } catch (e) {}
      }
    } finally { fixing = false; }
  }
  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      // a copy of Compass dropped into the page (e.g. from a cached snapshot): remove it right away
      for (var a = 0; a < muts.length; a++) {
        var added = muts[a].addedNodes;
        for (var b = 0; b < added.length; b++) {
          var n = added[b];
          if (n.nodeType !== 1 || n === container) continue;
          if (n.id === 'fs-bubble' || n.id === 'fs-chat' || n.id === 'fs-banner' || (n.querySelector && n.querySelector(LEGACY))) retireLegacy();
          if (n.id === 'cmp-widget-root' || (n.querySelector && n.querySelector('#cmp-widget-root'))) { keepAlive('copy removed'); a = muts.length; break; }
        }
      }
      if (!container.isConnected || container.parentNode !== document.body) keepAlive('page swap');
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  // page-swapping libraries: keep our live elements out of their cached copies
  ['turbolinks:before-cache', 'turbo:before-cache'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (container.parentNode) container.parentNode.removeChild(container); });
  });
  ['turbolinks:load', 'turbo:load', 'turbo:render', 'popstate', 'pageshow'].forEach(function (ev) {
    (ev === 'popstate' || ev === 'pageshow' ? window : document).addEventListener(ev, function () { setTimeout(function () { keepAlive(ev); }, 0); });
  });
  // history.pushState navigations (single-page apps) don't fire any event: watch for them
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    if (typeof orig !== 'function' || orig.__cmp) return;
    var wrapped = function () { var r = orig.apply(this, arguments); setTimeout(function () { keepAlive(fn); }, 0); return r; };
    wrapped.__cmp = true; history[fn] = wrapped;
  });

  var sc = document.createElement('script');
  sc.src = 'https://ai-advisor-futureself.vercel.app/widget.js?v=' + Date.now();
  document.head.appendChild(sc);
})();
