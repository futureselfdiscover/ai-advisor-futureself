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
    flag: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M5.5 20.5V4"/><path d="M5.5 4.5h11.5l-2.3 4.25 2.3 4.25H5.5"/></svg>'
  };

  var BANNER_HTML =
    '<div id="cmp-banner">' +
      '<div class="cmp-banner-left">' +
        '<div class="cmp-banner-icon">' + I.compass + '</div>' +
        '<div class="cmp-banner-text" id="cmp-banner-text">Hi, I\'m Compass, your FutureSelf advisor. I help students like you figure out what\'s next. Want to get started?</div>' +
      '</div>' +
      '<span class="cmp-banner-cta" onclick="fsOpenChat()"><span id="cmp-banner-cta-label">Get started</span>' + I.arrow + '</span>' +
      '<button class="cmp-banner-x" onclick="fsDismiss(event)" aria-label="Dismiss">' + I.close + '</button>' +
    '</div>';

  // fills the home-page slot if this page has one; safe to call repeatedly
  function mountBanner() {
    var slot = document.getElementById('fs-banner-slot');
    if (slot && !document.getElementById('cmp-banner')) slot.innerHTML = BANNER_HTML;
  }

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
    transition: background 0.15s ease, color 0.15s ease;
  }
  .cmp-icon-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
  .cmp-reset .cmp-i { transition: transform 0.45s var(--cmp-ease); }
  .cmp-reset:hover .cmp-i { transform: rotate(-200deg); }
  .cmp-x .cmp-i { transition: transform 0.25s var(--cmp-ease); }
  .cmp-x:hover .cmp-i { transform: rotate(90deg); }

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
  .cmp-ai a {
    color: var(--cmp-blue); font-weight: 600; text-decoration: none;
    background-image: linear-gradient(currentColor, currentColor);
    background-size: 0% 1.5px; background-repeat: no-repeat; background-position: 0 100%;
    transition: background-size 0.25s ease;
  }
  .cmp-ai a:hover { background-size: 100% 1.5px; }
  .cmp-usr {
    background: var(--cmp-tint); color: var(--cmp-navy);
    border-radius: 16px; border-bottom-right-radius: 5px;
    padding: 9px 14px; max-width: 80%; margin-left: auto; white-space: pre-wrap;
  }

  .cmp-think { display: flex; flex-direction: column; gap: 7px; padding-top: 6px; }
  /* a quiet route: hairline track, three stops, a line that draws itself between them */
  .cmp-route { position: relative; width: 84px; height: 7px; }
  .cmp-route::before {
    content: ""; position: absolute; left: 3px; right: 3px; top: 3px; height: 1px; background: #E1E7EF;
  }
  .cmp-route-fill {
    position: absolute; left: 3px; top: 3px; height: 1px; width: 0; background: var(--cmp-blue);
    animation: cmpRouteFill 3s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
  @keyframes cmpRouteFill {
    0% { width: 0; opacity: 1; }
    70%, 86% { width: calc(100% - 6px); opacity: 1; }
    100% { width: calc(100% - 6px); opacity: 0; }
  }
  .cmp-wp {
    position: absolute; top: 1px; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%;
    background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE;
    animation: cmpStop 3s ease infinite;
  }
  .cmp-wp:nth-of-type(1) { left: 3px; }
  .cmp-wp:nth-of-type(2) { left: 50%; animation-name: cmpStop2; }
  .cmp-wp:nth-of-type(3) { left: calc(100% - 3px); animation-name: cmpStop3; }
  @keyframes cmpStop  { 0%, 92% { background: var(--cmp-blue); box-shadow: inset 0 0 0 1.25px var(--cmp-blue); } 100% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } }
  @keyframes cmpStop2 { 0%, 33% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } 37%, 92% { background: var(--cmp-blue); box-shadow: inset 0 0 0 1.25px var(--cmp-blue); } 100% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } }
  @keyframes cmpStop3 { 0%, 68% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } 72%, 92% { background: var(--cmp-blue); box-shadow: inset 0 0 0 1.25px var(--cmp-blue); } 100% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } }
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
  .cmp-pwr { text-align: center; font-size: 10.5px; color: #98A3B8; padding: 0 0 8px; flex-shrink: 0; }


  /* ---- Waypoints: every question is a stop you can jump back to or resume from ---- */
  .cmp-view[data-view="chat"] { position: relative; }
  .cmp-wp-btn {
    position: absolute; top: 10px; right: 12px; z-index: 3;
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    padding: 5px 10px 5px 8px; border-radius: 999px; border: 1px solid var(--cmp-line);
    background: rgba(255,255,255,0.92); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    font: 600 11.5px var(--cmp-font); color: var(--cmp-muted);
    box-shadow: 0 4px 12px rgba(43,62,80,0.08);
    transition: color 0.15s, border-color 0.15s, box-shadow 0.2s, transform 0.2s var(--cmp-spring);
    animation: cmpPillIn 0.3s var(--cmp-ease);
  }
  .cmp-wp-btn[hidden] { display: none; }
  /* reserve room for the chip, and fade messages softly as they scroll under it */
  .cmp-has-wp #cmp-body { padding-top: 50px; }
  .cmp-has-wp::before {
    content: ""; position: absolute; left: 0; right: 0; top: 0; height: 46px; z-index: 2; pointer-events: none;
    background: linear-gradient(#fff 55%, rgba(255,255,255,0));
  }
  .cmp-wp-btn:hover, .cmp-wp-btn[aria-expanded="true"] { color: var(--cmp-blue); border-color: #BCD0F0; transform: translateY(-1px); }
  .cmp-wp-btn-i { width: 14px; height: 14px; }
  .cmp-wp-btn:hover .cmp-wp-btn-i { animation: cmpFlag 0.6s ease; }
  @keyframes cmpFlag { 30% { transform: rotate(-10deg); } 60% { transform: rotate(6deg); } }
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
  .cmp-wp-meta { font-size: 11px; color: #8A96AD; margin-top: 2px; }
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
  .cmp-search .cmp-i { width: 16px; height: 16px; color: #8A96AD; flex-shrink: 0; }
  #cmp-nav-q {
    flex: 1; border: none; background: transparent; outline: none; padding: 11px 0;
    font: 13.5px var(--cmp-font); color: var(--cmp-ink);
  }
  .cmp-group-label {
    font-size: 11px; font-weight: 700; color: #8A96AD; letter-spacing: 0.7px; text-transform: uppercase;
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
    transition: transform 0.25s var(--cmp-spring), background 0.15s, color 0.15s;
  }
  .cmp-link:hover .cmp-link-i { background: var(--cmp-blue); color: #fff; transform: rotate(-8deg) scale(1.05); }
  .cmp-link-t { flex: 1; min-width: 0; }
  .cmp-link-sub { display: block; font-size: 11.5px; font-weight: 500; color: var(--cmp-muted); margin-top: 1px; }
  .cmp-link-go { width: 16px; height: 16px; color: #A8B3C7; transition: transform 0.2s var(--cmp-ease), color 0.15s; }
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
  .cmp-card-title { font-size: 12px; font-weight: 700; color: #8A96AD; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 10px; }
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

  /* ================= home page banner (only where #fs-banner-slot exists) ================= */
  #cmp-banner {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    background: #FFFFFF; border: 1px solid var(--cmp-line);
    border-radius: 18px; padding: 14px 18px; margin: 12px 0; font-family: var(--cmp-font);
    box-shadow: 0 6px 18px rgba(43,62,80,0.05);
    animation: cmpRise 0.45s var(--cmp-ease);
  }
  #cmp-banner.hidden { display: none; }
  .cmp-banner-left { display: flex; align-items: center; gap: 14px; flex: 1; }
  .cmp-banner-icon {
    width: 40px; height: 40px; border-radius: 12px; padding: 8px; flex-shrink: 0; color: #fff;
    background: var(--cmp-navy);
  }
  .cmp-banner-icon .cmp-needle { animation: cmpNeedleIdle 6s ease-in-out infinite; }
  .cmp-banner-text { font-size: 14px; color: var(--cmp-ink); line-height: 1.5; }
  .cmp-banner-cta {
    display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; cursor: pointer;
    font-size: 13px; font-weight: 700; color: #fff; background: var(--cmp-blue);
    padding: 9px 14px; border-radius: 11px; transition: background 0.15s;
  }
  .cmp-banner-cta .cmp-i { width: 15px; height: 15px; transition: transform 0.2s var(--cmp-ease); }
  .cmp-banner-cta:hover { background: var(--cmp-blue-dk); }
  .cmp-banner-cta:hover .cmp-i { transform: translateX(3px); }
  .cmp-banner-x {
    width: 28px; height: 28px; padding: 6px; border: none; border-radius: 8px; cursor: pointer;
    background: transparent; color: #98A3B8; flex-shrink: 0;
  }
  .cmp-banner-x:hover { background: var(--cmp-tint); color: var(--cmp-navy); }
  @media (max-width: 560px) {
    #cmp-banner { flex-wrap: wrap; position: relative; padding: 14px 16px; }
    .cmp-banner-left { flex: 1 1 100%; padding-right: 26px; }
    .cmp-banner-text { font-size: 13px; }
    .cmp-banner-cta { margin-left: 54px; }
    .cmp-banner-x { position: absolute; top: 8px; right: 8px; }
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

  /* accessibility: honor users who ask the OS to reduce motion */
  @media (prefers-reduced-motion: reduce) {
    #cmp-widget-root *, #cmp-banner * { animation: none !important; transition-duration: 0.01ms !important; transition-delay: 0s !important; }
    #cmp-banner { animation: none !important; }
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
          '<button class="cmp-icon-btn cmp-reset" type="button" onclick="fsReset()" title="Reset conversation" aria-label="Reset conversation">' + I.reset + '</button>' +
          '<button class="cmp-icon-btn cmp-x" type="button" onclick="fsToggle()" title="Close" aria-label="Close">' + I.close + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="cmp-tabs" role="tablist">' + tabHTML + '<span class="cmp-tab-ink" style="--t:1"></span></div>' +
      '<div class="cmp-views">' +
        '<section class="cmp-view" data-view="navigate">' +
          '<label class="cmp-search"><svg viewBox="0 0 24 24" class="cmp-i"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' +
          '<input id="cmp-nav-q" type="text" placeholder="Search FutureSelf pages" autocomplete="off"></label>' +
          '<div id="cmp-nav-list" class="cmp-scroll"></div>' +
        '</section>' +
        '<section class="cmp-view active" data-view="chat">' +
          '<button class="cmp-wp-btn" id="cmp-wp-btn" type="button" aria-expanded="false" hidden>' +
            '<span class="cmp-wp-btn-i">' + I.flag + '</span><span>Waypoints</span><span class="cmp-wp-count" id="cmp-wp-count"></span></button>' +
          '<div class="cmp-wp-panel" id="cmp-wp-panel" hidden>' +
            '<div class="cmp-wp-head"><div class="cmp-wp-title">Waypoints</div>' +
            '<div class="cmp-wp-sub">Jump back to any question, or pick the conversation up from there.</div></div>' +
            '<div id="cmp-wp-list"></div>' +
          '</div>' +
          '<div id="cmp-body"></div>' +
          '<div id="cmp-qr"></div>' +
          '<div class="cmp-bar">' +
            '<textarea id="cmp-input" rows="1" placeholder="Reply..."></textarea>' +
            '<button class="cmp-send" type="button" onclick="fsSend()" aria-label="Send">' + I.send + '</button>' +
          '</div>' +
        '</section>' +
        '<section class="cmp-view" data-view="profile"><div id="cmp-profile" class="cmp-scroll"></div></section>' +
        '<section class="cmp-view" data-view="foryou"><div id="cmp-foryou" class="cmp-scroll"></div></section>' +
      '</div>' +
      '<div class="cmp-pwr">Powered by FutureSelf</div>' +
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

  var sc = document.createElement('script');
  sc.src = 'https://ai-advisor-futureself.vercel.app/widget.js?v=' + Date.now();
  document.head.appendChild(sc);
})();
