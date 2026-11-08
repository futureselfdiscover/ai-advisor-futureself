// widget-overlay.js
// The single source of truth for how Compass LOOKS, on every page (home included).
// Injects the widget CSS + markup, optionally the home-page banner, then loads
// widget.js (shared BEHAVIOR).
//   - Look changes: edit this file.   - Behavior changes: edit widget.js.
//   - The home page Hivebrite block only holds a tiny loader + #fs-banner-slot.
(function () {
  // ---- icons: one consistent 24px stroke set --------------------------------
  var I = {
    compass: '<svg viewBox="0 0 24 24" class="fs-i"><circle cx="12" cy="12" r="9.25"/><g class="fs-needle"><path d="M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z" class="fs-needle-fill"/></g><circle cx="12" cy="12" r="0.9" class="fs-dot"/></svg>',
    navigate: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M4 11.2 19.5 4.5 12.8 20l-1.9-6.9Z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M20 14.5a2 2 0 0 1-2 2H8.5L4.5 20V6a2 2 0 0 1 2-2H18a2 2 0 0 1 2 2Z"/><path d="M8.5 9h7M8.5 12h4.5"/></svg>',
    profile: '<svg viewBox="0 0 24 24" class="fs-i"><circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 19.5c.9-3.6 3.8-5.6 7.25-5.6s6.35 2 7.25 5.6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M10.5 3.5 12 8.6l5.1 1.5L12 11.6 10.5 16.7 9 11.6 3.9 10.1 9 8.6Z"/><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    reset: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/></svg>',
    send: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    flag: '<svg viewBox="0 0 24 24" class="fs-i"><path d="M5.5 20.5V4"/><path d="M5.5 4.5h11.5l-2.3 4.25 2.3 4.25H5.5"/></svg>'
  };

  var BANNER_HTML =
    '<div id="fs-banner">' +
      '<div class="fs-banner-left">' +
        '<div class="fs-banner-icon">' + I.compass + '</div>' +
        '<div class="fs-banner-text" id="fs-banner-text">Hi, I\'m Compass, your FutureSelf advisor. I help students like you figure out what\'s next. Want to get started?</div>' +
      '</div>' +
      '<span class="fs-banner-cta" onclick="fsOpenChat()"><span id="fs-banner-cta-label">Get started</span>' + I.arrow + '</span>' +
      '<button class="fs-banner-x" onclick="fsDismiss(event)" aria-label="Dismiss">' + I.close + '</button>' +
    '</div>';

  // fills the home-page slot if this page has one; safe to call repeatedly
  function mountBanner() {
    var slot = document.getElementById('fs-banner-slot');
    if (slot && !document.getElementById('fs-banner')) slot.innerHTML = BANNER_HTML;
  }

  // widget already on the page (overlay loaded twice): just make sure the banner is there
  if (document.getElementById('fs-bubble')) { mountBanner(); return; }

  var css = `
  #fs-widget-root, #fs-banner {
    --fs-navy: #2B3E50;      /* FutureSelf nav slate */
    --fs-navy-2: #34495E;
    --fs-blue: #2A67D8;      /* link-blue accent */
    --fs-blue-dk: #2155B5;
    --fs-tint: #EEF3FB;
    --fs-tint-2: #F6F8FC;
    --fs-line: #DDE4EE;
    --fs-ink: #1F2A37;
    --fs-muted: #5D6B7C;
    --fs-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --fs-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --fs-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  #fs-widget-root *, #fs-banner * { box-sizing: border-box; }
  .fs-i {
    width: 100%; height: 100%; fill: none; stroke: currentColor;
    stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    display: block; pointer-events: none;
  }
  .fs-i .fs-needle-fill { fill: currentColor; fill-opacity: 0.18; }
  .fs-i .fs-dot { fill: currentColor; stroke: none; }
  .fs-i .fs-needle { transform-origin: 12px 12px; transition: transform 0.7s var(--fs-spring); }

  /* ================= launcher: compass bubble + fan-out actions ================= */
  #fs-launcher {
    position: fixed; bottom: 28px; right: 28px;
    width: 58px; height: 58px; z-index: 2147483647;
    font-family: var(--fs-font);
  }
  #fs-bubble {
    position: relative; width: 58px; height: 58px; border-radius: 50%;
    border: none; padding: 0; cursor: pointer; color: #fff;
    background: radial-gradient(120% 120% at 30% 15%, #3E5670 0%, var(--fs-navy) 55%);
    box-shadow: 0 10px 28px rgba(43,62,80,0.32), inset 0 1px 0 rgba(255,255,255,0.14);
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.25s var(--fs-spring), box-shadow 0.25s ease;
  }
  #fs-bubble::before {
    content: ""; position: absolute; inset: -3px; border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0 72%, rgba(170,196,228,0.55) 88%, transparent 100%);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
    animation: fsOrbit 8s linear infinite; pointer-events: none;
  }
  @keyframes fsOrbit { to { transform: rotate(360deg); } }
  #fs-bubble:hover { transform: scale(1.06); box-shadow: 0 14px 34px rgba(43,62,80,0.38); }
  #fs-bubble:active { transform: scale(0.94); }
  #fs-bubble:focus-visible, .fs-sat:focus-visible, .fs-tab:focus-visible { outline: 3px solid rgba(42,103,216,0.45); outline-offset: 3px; }
  .fs-bubble-icon {
    position: absolute; width: 28px; height: 28px;
    transition: transform 0.35s var(--fs-spring), opacity 0.2s ease;
  }
  .fs-bubble-close { width: 22px; height: 22px; opacity: 0; transform: rotate(-90deg) scale(0.5); }
  #fs-launcher.dial .fs-bubble-compass .fs-needle,
  #fs-bubble:hover .fs-needle { transform: rotate(360deg); }
  #fs-launcher.chat-open .fs-bubble-compass { opacity: 0; transform: rotate(90deg) scale(0.5); }
  #fs-launcher.chat-open .fs-bubble-close { opacity: 1; transform: rotate(0) scale(1); }
  #fs-launcher.chat-open #fs-bubble::before { animation: none; opacity: 0; }

  .fs-dial { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
  .fs-sat {
    position: absolute; left: 0; top: 0; width: 46px; height: 46px; padding: 12px;
    border-radius: 50%; border: 1px solid var(--fs-line); cursor: pointer;
    background: rgba(255,255,255,0.96); color: var(--fs-navy);
    box-shadow: 0 8px 22px rgba(43,62,80,0.16);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    opacity: 0; pointer-events: none;
    transform: translate(-50%, -50%) translate(0, 0) scale(0.35);
    transition: transform 0.42s var(--fs-spring), opacity 0.2s ease,
                background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
    transition-delay: calc((3 - var(--i)) * 25ms);
  }
  #fs-launcher.dial .fs-sat {
    opacity: 1; pointer-events: auto;
    transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(1);
    transition-delay: calc(var(--i) * 45ms);
  }
  #fs-launcher.dial .fs-sat:hover, #fs-launcher.dial .fs-sat:focus-visible {
    background: var(--fs-blue); color: #fff; border-color: var(--fs-blue);
    box-shadow: 0 0 0 6px rgba(42,103,216,0.14), 0 0 22px 2px rgba(42,103,216,0.45), 0 12px 26px rgba(42,103,216,0.30);
    transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(1.22);
    transition-delay: 0s; z-index: 2;
  }
  /* the others step back so the hovered one reads clearly */
  #fs-launcher.dial .fs-dial:hover .fs-sat:not(:hover) {
    opacity: 0.55;
    transform: translate(-50%, -50%) translate(var(--x), var(--y)) scale(0.9);
    transition-delay: 0s;
  }
  .fs-sat .fs-i { transition: transform 0.35s var(--fs-spring); }
  #fs-launcher.dial .fs-sat:hover .fs-i { transform: scale(1.06) rotate(-6deg); }
  .fs-tip {
    position: absolute; left: 50%; bottom: calc(100% + 8px);
    transform: translate(-50%, 6px) scale(0.9); white-space: nowrap;
    background: var(--fs-blue); color: #fff; font-size: 12px; font-weight: 700;
    padding: 5px 11px; border-radius: 999px; letter-spacing: 0.2px;
    box-shadow: 0 6px 16px rgba(42,103,216,0.35);
    opacity: 0; pointer-events: none;
    transition: opacity 0.16s ease, transform 0.22s var(--fs-spring);
  }
  .fs-tip::after {
    content: ""; position: absolute; left: 50%; top: 100%; margin-left: -5px;
    border: 5px solid transparent; border-top-color: var(--fs-blue);
  }
  .fs-sat:hover .fs-tip, .fs-sat:focus-visible .fs-tip { opacity: 1; transform: translate(-50%, 0) scale(1); }

  /* ================= chat window ================= */
  #fs-chat {
    position: fixed; bottom: 100px; right: 28px;
    width: 400px; height: 680px; max-height: calc(100vh - 124px);
    border-radius: 20px; background: #fff; border: 1px solid var(--fs-line);
    z-index: 2147483646; font-family: var(--fs-font); color: var(--fs-ink);
    box-shadow: 0 24px 60px rgba(43,62,80,0.18), 0 4px 14px rgba(43,62,80,0.06);
    display: flex; flex-direction: column; overflow: hidden;
    opacity: 0; visibility: hidden; pointer-events: none;
    transform: translateY(14px) scale(0.97); transform-origin: bottom right;
    transition: opacity 0.22s ease, transform 0.32s var(--fs-ease), visibility 0s linear 0.32s;
  }
  #fs-chat.open {
    opacity: 1; visibility: visible; pointer-events: auto; transform: none;
    transition: opacity 0.22s ease, transform 0.36s var(--fs-ease), visibility 0s;
  }

  .fs-hdr {
    position: relative; overflow: hidden; flex-shrink: 0;
    background: linear-gradient(160deg, #2F4356 0%, var(--fs-navy) 55%, #2A3C4D 100%);
    padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
  }
  .fs-hdr::after {
    content: ""; position: absolute; right: -60px; top: -80px; width: 220px; height: 220px;
    background: radial-gradient(closest-side, rgba(150,180,215,0.16), transparent);
    animation: fsGlow 16s ease-in-out infinite alternate; pointer-events: none;
  }
  @keyframes fsGlow { from { transform: translate(0, 0); } to { transform: translate(-70px, 30px); } }
  .fs-hdr-left { display: flex; align-items: center; gap: 11px; position: relative; z-index: 1; }
  .fs-hdr-icon {
    width: 36px; height: 36px; border-radius: 11px; padding: 7px; color: #fff;
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18);
  }
  .fs-hdr-icon .fs-needle { animation: fsNeedleIdle 6s ease-in-out infinite; }
  @keyframes fsNeedleIdle { 0%, 100% { transform: rotate(0deg); } 45% { transform: rotate(18deg); } 60% { transform: rotate(-8deg); } }
  .fs-hdr-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.1px; }
  .fs-hdr-beta {
    font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 0.6px;
    border: 1px solid rgba(255,255,255,0.3); border-radius: 5px;
    padding: 1px 5px; margin-left: 6px; vertical-align: 2px;
  }
  .fs-hdr-sub { font-size: 11.5px; color: rgba(255,255,255,0.62); margin-top: 1px; }
  .fs-hdr-right { display: flex; align-items: center; gap: 4px; position: relative; z-index: 1; }
  .fs-icon-btn {
    width: 32px; height: 32px; padding: 7px; border: none; border-radius: 9px; cursor: pointer;
    background: transparent; color: rgba(255,255,255,0.72);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .fs-icon-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
  .fs-reset .fs-i { transition: transform 0.45s var(--fs-ease); }
  .fs-reset:hover .fs-i { transform: rotate(-200deg); }
  .fs-x .fs-i { transition: transform 0.25s var(--fs-ease); }
  .fs-x:hover .fs-i { transform: rotate(90deg); }

  /* tabs */
  .fs-tabs {
    position: relative; display: grid; grid-template-columns: repeat(4, 1fr);
    padding: 0 8px; border-bottom: 1px solid var(--fs-line); flex-shrink: 0; background: #fff;
  }
  .fs-tab {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: none; border: none; cursor: pointer; padding: 11px 4px 10px;
    font: 600 12.5px var(--fs-font); color: var(--fs-muted);
    transition: color 0.15s ease;
  }
  .fs-tab .fs-tab-i { width: 16px; height: 16px; transition: transform 0.25s var(--fs-spring); }
  .fs-tab:hover { color: var(--fs-ink); }
  .fs-tab:hover .fs-tab-i { transform: translateY(-1px) scale(1.08); }
  .fs-tab.active { color: var(--fs-blue); }
  .fs-tab-ink {
    position: absolute; bottom: -1px; left: 8px; height: 2.5px; border-radius: 2px;
    width: calc((100% - 16px) / 4); background: var(--fs-blue);
    transform: translateX(calc(var(--t, 0) * 100%));
    transition: transform 0.35s var(--fs-ease);
  }

  .fs-views { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
  .fs-view { display: none; flex: 1; min-height: 0; flex-direction: column; }
  .fs-view.active { display: flex; animation: fsViewIn 0.32s var(--fs-ease); }
  @keyframes fsViewIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .fs-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; }
  .fs-scroll::-webkit-scrollbar, #fs-body::-webkit-scrollbar { width: 6px; }
  .fs-scroll::-webkit-scrollbar-thumb, #fs-body::-webkit-scrollbar-thumb { background: #D5DDEA; border-radius: 3px; }

  /* ---- chat view ---- */
  #fs-body {
    flex: 1; min-height: 0; padding: 18px 16px 10px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px; position: relative;
  }
  .fs-row { display: flex; gap: 10px; align-items: flex-end; animation: fsRise 0.32s var(--fs-ease); }
  .fs-row-ai { align-items: flex-start; }
  @keyframes fsRise {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: none; }
  }
  .fs-av {
    width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; padding: 5px; margin-top: 1px;
    background: var(--fs-navy); color: #fff;
    animation: fsPop 0.36s var(--fs-spring);
  }
  .fs-av svg { width: 100% !important; height: 100% !important; }
  .fs-row-ai .fs-av { transition: opacity 0.3s ease, transform 0.3s var(--fs-ease); }
  .fs-row-ai:not(.fs-latest) .fs-av { opacity: 0; transform: scale(0.6); animation: none; }
  @keyframes fsPop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
  .fs-msg { font-size: 13.5px; line-height: 1.62; word-break: break-word; }
  .fs-ai { flex: 1; min-width: 0; color: var(--fs-ink); padding-top: 2px; }
  .fs-ai p { margin: 0 0 8px; }
  .fs-ai p:last-child { margin-bottom: 0; }
  .fs-ai .fs-h { font-weight: 700; color: var(--fs-navy); margin-top: 4px; }
  .fs-ai ul, .fs-ai ol { margin: 2px 0 8px; padding-left: 20px; }
  .fs-ai ul:last-child, .fs-ai ol:last-child { margin-bottom: 0; }
  .fs-ai li { margin: 3px 0; padding-left: 2px; }
  .fs-ai li::marker { color: var(--fs-blue); font-weight: 600; }
  .fs-ai strong { font-weight: 650; color: var(--fs-navy); }
  .fs-ai code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; background: var(--fs-tint); border-radius: 5px; padding: 1px 5px;
  }
  .fs-ai a {
    color: var(--fs-blue); font-weight: 600; text-decoration: none;
    background-image: linear-gradient(currentColor, currentColor);
    background-size: 0% 1.5px; background-repeat: no-repeat; background-position: 0 100%;
    transition: background-size 0.25s ease;
  }
  .fs-ai a:hover { background-size: 100% 1.5px; }
  .fs-usr {
    background: var(--fs-tint); color: var(--fs-navy);
    border-radius: 16px; border-bottom-right-radius: 5px;
    padding: 9px 14px; max-width: 80%; margin-left: auto; white-space: pre-wrap;
  }

  .fs-think { display: flex; flex-direction: column; gap: 7px; padding-top: 6px; }
  /* a quiet route: hairline track, three stops, a line that draws itself between them */
  .fs-route { position: relative; width: 84px; height: 7px; }
  .fs-route::before {
    content: ""; position: absolute; left: 3px; right: 3px; top: 3px; height: 1px; background: #E1E7EF;
  }
  .fs-route-fill {
    position: absolute; left: 3px; top: 3px; height: 1px; width: 0; background: var(--fs-blue);
    animation: fsRouteFill 3s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
  @keyframes fsRouteFill {
    0% { width: 0; opacity: 1; }
    70%, 86% { width: calc(100% - 6px); opacity: 1; }
    100% { width: calc(100% - 6px); opacity: 0; }
  }
  .fs-wp {
    position: absolute; top: 1px; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%;
    background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE;
    animation: fsStop 3s ease infinite;
  }
  .fs-wp:nth-of-type(1) { left: 3px; }
  .fs-wp:nth-of-type(2) { left: 50%; animation-name: fsStop2; }
  .fs-wp:nth-of-type(3) { left: calc(100% - 3px); animation-name: fsStop3; }
  @keyframes fsStop  { 0%, 92% { background: var(--fs-blue); box-shadow: inset 0 0 0 1.25px var(--fs-blue); } 100% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } }
  @keyframes fsStop2 { 0%, 33% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } 37%, 92% { background: var(--fs-blue); box-shadow: inset 0 0 0 1.25px var(--fs-blue); } 100% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } }
  @keyframes fsStop3 { 0%, 68% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } 72%, 92% { background: var(--fs-blue); box-shadow: inset 0 0 0 1.25px var(--fs-blue); } 100% { background: #fff; box-shadow: inset 0 0 0 1.25px #C8D2DE; } }
  .fs-think-label {
    font-size: 12px; font-weight: 500; display: inline-block; letter-spacing: 0.1px;
    background: linear-gradient(90deg, #8693A5 30%, #3A4E62 50%, #8693A5 70%);
    background-size: 220% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    animation: fsShimmer 2.8s linear infinite;
  }
  @keyframes fsShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  .fs-think-swap { animation: fsSwap 0.34s ease; }
  @keyframes fsSwap { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  #fs-typing .fs-av .fs-needle { animation: fsSpin 1.4s var(--fs-ease) infinite; }
  @keyframes fsSpin { to { transform: rotate(360deg); } }

  #fs-qr { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 16px 10px; flex-shrink: 0; }
  .fs-pill {
    font: 600 12px var(--fs-font); border: 1px solid var(--fs-line); border-radius: 999px;
    padding: 6px 13px; color: var(--fs-navy); background: #fff;
    cursor: pointer; white-space: nowrap;
    transition: background 0.15s, transform 0.15s, border-color 0.15s, color 0.15s;
    animation: fsPillIn 0.3s var(--fs-ease) backwards;
  }
  .fs-pill:nth-child(1) { animation-delay: 0.04s; }
  .fs-pill:nth-child(2) { animation-delay: 0.10s; }
  .fs-pill:nth-child(3) { animation-delay: 0.16s; }
  .fs-pill:nth-child(4) { animation-delay: 0.22s; }
  @keyframes fsPillIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .fs-pill:hover { background: var(--fs-tint); border-color: #B9CCF2; color: var(--fs-blue); transform: translateY(-1px); }
  .fs-pill:active { transform: scale(0.96); }

  .fs-bar { padding: 10px 14px 12px; display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0; }
  #fs-input {
    flex: 1; border: 1px solid var(--fs-line); border-radius: 14px; background: var(--fs-tint-2);
    padding: 11px 14px; font: 13.5px/1.5 var(--fs-font); color: var(--fs-ink); outline: none;
    resize: none; overflow-y: auto; min-height: 44px; max-height: 190px;
    white-space: pre-wrap; word-break: break-word;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  #fs-input::placeholder { color: #8A96AD; }
  #fs-input:focus { border-color: var(--fs-blue); background: #fff; box-shadow: 0 0 0 4px rgba(42,103,216,0.10); }
  .fs-send {
    width: 40px; height: 40px; border-radius: 12px; border: none; cursor: pointer; padding: 10px;
    background: var(--fs-blue); color: #fff; flex-shrink: 0; margin-bottom: 2px;
    box-shadow: 0 6px 14px rgba(42,103,216,0.28);
    transition: transform 0.15s var(--fs-spring), background 0.15s;
  }
  .fs-send:hover { background: var(--fs-blue-dk); transform: translateY(-1px); }
  .fs-send:hover .fs-i { transform: translateY(-2px); }
  .fs-send .fs-i { transition: transform 0.2s var(--fs-ease); }
  .fs-send:active { transform: scale(0.92); }
  .fs-pwr { text-align: center; font-size: 10.5px; color: #98A3B8; padding: 0 0 8px; flex-shrink: 0; }


  /* ---- Waypoints: every question is a stop you can jump back to or resume from ---- */
  .fs-view[data-view="chat"] { position: relative; }
  .fs-wp-btn {
    position: absolute; top: 10px; right: 12px; z-index: 3;
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    padding: 5px 10px 5px 8px; border-radius: 999px; border: 1px solid var(--fs-line);
    background: rgba(255,255,255,0.92); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    font: 600 11.5px var(--fs-font); color: var(--fs-muted);
    box-shadow: 0 4px 12px rgba(43,62,80,0.08);
    transition: color 0.15s, border-color 0.15s, box-shadow 0.2s, transform 0.2s var(--fs-spring);
    animation: fsPillIn 0.3s var(--fs-ease);
  }
  .fs-wp-btn[hidden] { display: none; }
  /* reserve room for the chip, and fade messages softly as they scroll under it */
  .fs-has-wp #fs-body { padding-top: 50px; }
  .fs-has-wp::before {
    content: ""; position: absolute; left: 0; right: 0; top: 0; height: 46px; z-index: 2; pointer-events: none;
    background: linear-gradient(#fff 55%, rgba(255,255,255,0));
  }
  .fs-wp-btn:hover, .fs-wp-btn[aria-expanded="true"] { color: var(--fs-blue); border-color: #BCD0F0; transform: translateY(-1px); }
  .fs-wp-btn-i { width: 14px; height: 14px; }
  .fs-wp-btn:hover .fs-wp-btn-i { animation: fsFlag 0.6s ease; }
  @keyframes fsFlag { 30% { transform: rotate(-10deg); } 60% { transform: rotate(6deg); } }
  .fs-wp-count {
    min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px;
    background: var(--fs-tint); color: var(--fs-blue); font-size: 10.5px; font-weight: 700;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .fs-wp-panel {
    position: absolute; top: 44px; left: 12px; right: 12px; z-index: 4; max-height: 72%;
    display: flex; flex-direction: column; overflow: hidden;
    background: #fff; border: 1px solid var(--fs-line); border-radius: 16px;
    box-shadow: 0 18px 44px rgba(43,62,80,0.18);
    transform-origin: top right; animation: fsPanelIn 0.28s var(--fs-ease);
  }
  .fs-wp-panel[hidden] { display: none; }
  @keyframes fsPanelIn { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
  .fs-wp-head { padding: 14px 16px 10px; border-bottom: 1px solid var(--fs-line); }
  .fs-wp-title { font-size: 13.5px; font-weight: 700; color: var(--fs-navy); }
  .fs-wp-sub { font-size: 11.5px; color: var(--fs-muted); margin-top: 2px; }
  #fs-wp-list { overflow-y: auto; padding: 8px 8px 10px; }
  .fs-wp-item {
    position: relative; display: flex; gap: 12px; padding: 9px 8px 9px 6px; border-radius: 12px;
    transition: background 0.15s; animation: fsPillIn 0.3s var(--fs-ease) backwards;
  }
  .fs-wp-item:hover { background: var(--fs-tint-2); }
  .fs-wp-rail { position: relative; width: 14px; flex-shrink: 0; display: flex; justify-content: center; }
  .fs-wp-rail::before {
    content: ""; position: absolute; top: -9px; bottom: -9px; width: 2px; background: var(--fs-line);
  }
  .fs-wp-item:first-child .fs-wp-rail::before { top: 12px; }
  .fs-wp-item:last-child .fs-wp-rail::before { bottom: calc(100% - 12px); }
  .fs-wp-dot {
    position: relative; margin-top: 4px; width: 10px; height: 10px; border-radius: 50%;
    background: #fff; border: 2px solid #AEBBCC; transition: border-color 0.15s, transform 0.2s var(--fs-spring), background 0.15s;
  }
  .fs-wp-item:hover .fs-wp-dot { border-color: var(--fs-blue); transform: scale(1.2); }
  .fs-wp-item.current .fs-wp-dot { background: var(--fs-blue); border-color: var(--fs-blue); box-shadow: 0 0 0 4px rgba(42,103,216,0.15); }
  .fs-wp-main { flex: 1; min-width: 0; }
  .fs-wp-q {
    font-size: 13px; font-weight: 600; color: var(--fs-ink); line-height: 1.4;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .fs-wp-meta { font-size: 11px; color: #8A96AD; margin-top: 2px; }
  .fs-wp-acts { display: flex; gap: 6px; margin-top: 7px; }
  .fs-wp-act {
    font: 600 11.5px var(--fs-font); border-radius: 8px; padding: 4px 9px; cursor: pointer;
    border: 1px solid var(--fs-line); background: #fff; color: var(--fs-navy);
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .fs-wp-act:hover { border-color: #BCD0F0; color: var(--fs-blue); }
  .fs-wp-act.primary { background: var(--fs-blue); border-color: var(--fs-blue); color: #fff; }
  .fs-wp-act.primary:hover { background: var(--fs-blue-dk); color: #fff; }
  .fs-flash .fs-usr { animation: fsFlash 1.6s ease; }
  .fs-flash + .fs-row-ai .fs-ai { animation: fsFlashText 1.6s ease; }
  @keyframes fsFlash {
    0%, 100% { box-shadow: 0 0 0 0 rgba(42,103,216,0); }
    20%, 60% { box-shadow: 0 0 0 3px rgba(42,103,216,0.35); }
  }
  @keyframes fsFlashText { 0%, 100% { background: transparent; } 20%, 60% { background: rgba(42,103,216,0.06); } }
  .fs-flash + .fs-row-ai .fs-ai { border-radius: 8px; }
  .fs-branch {
    display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--fs-muted);
    animation: fsRise 0.3s var(--fs-ease);
  }
  .fs-branch::before, .fs-branch::after { content: ""; flex: 1; height: 1px; background: var(--fs-line); }
  .fs-branch-i { width: 13px; height: 13px; color: var(--fs-blue); }
  .fs-branch button {
    border: none; background: none; padding: 0; cursor: pointer; font: 700 11.5px var(--fs-font); color: var(--fs-blue);
  }
  .fs-branch button:hover { text-decoration: underline; }

  /* gate / consent screens */
  .fs-center-screen {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 24px 22px; text-align: center; gap: 14px; animation: fsRise 0.35s var(--fs-ease);
  }
  .fs-center-icon {
    width: 54px; height: 54px; border-radius: 16px; background: var(--fs-tint);
    display: flex; align-items: center; justify-content: center;
  }
  .fs-center-icon svg { width: 26px; height: 26px; fill: none; stroke: var(--fs-blue); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .fs-center-title { font-size: 16px; font-weight: 700; color: var(--fs-navy); }
  .fs-center-text { font-size: 13px; color: var(--fs-muted); line-height: 1.55; max-width: 300px; }
  .fs-checklist { width: 100%; max-width: 290px; display: flex; flex-direction: column; gap: 8px; margin: 4px 0; }
  .fs-check-item {
    display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 9px 12px;
    border-radius: 10px; background: var(--fs-tint-2); border: 1px solid var(--fs-line); text-align: left;
    animation: fsPillIn 0.32s var(--fs-ease) backwards;
  }
  .fs-check-item:nth-child(2) { animation-delay: 0.06s; }
  .fs-check-item:nth-child(3) { animation-delay: 0.12s; }
  .fs-check-item:nth-child(4) { animation-delay: 0.18s; }
  .fs-check-item:nth-child(5) { animation-delay: 0.24s; }
  .fs-check-item.done { color: #1E7A46; }
  .fs-check-item.todo { color: var(--fs-muted); }
  .fs-check-mark {
    width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
  }
  .fs-check-item.done .fs-check-mark { background: #D3F2DF; color: #1E7A46; }
  .fs-check-item.todo .fs-check-mark { background: #fff; border: 1.5px solid #C9D3E3; }
  .fs-center-btn, .fs-cta {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    background: var(--fs-blue); color: #fff !important; border: none; border-radius: 12px;
    padding: 11px 22px; font: 700 13px var(--fs-font); cursor: pointer; text-decoration: none;
    box-shadow: 0 8px 18px rgba(42,103,216,0.26);
    transition: background 0.15s, transform 0.18s var(--fs-spring), box-shadow 0.15s;
  }
  .fs-center-btn:hover, .fs-cta:hover { background: var(--fs-blue-dk); transform: translateY(-2px); box-shadow: 0 12px 24px rgba(42,103,216,0.3); }
  .fs-center-btn:active, .fs-cta:active { transform: scale(0.97); }
  .fs-cta .fs-i { width: 16px; height: 16px; }

  /* ---- navigate view ---- */
  .fs-search {
    display: flex; align-items: center; gap: 8px; margin: 14px 16px 2px; padding: 0 12px;
    border: 1px solid var(--fs-line); border-radius: 12px; background: var(--fs-tint-2);
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  }
  .fs-search:focus-within { border-color: var(--fs-blue); background: #fff; box-shadow: 0 0 0 4px rgba(42,103,216,0.10); }
  .fs-search .fs-i { width: 16px; height: 16px; color: #8A96AD; flex-shrink: 0; }
  #fs-nav-q {
    flex: 1; border: none; background: transparent; outline: none; padding: 11px 0;
    font: 13.5px var(--fs-font); color: var(--fs-ink);
  }
  .fs-group-label {
    font-size: 11px; font-weight: 700; color: #8A96AD; letter-spacing: 0.7px; text-transform: uppercase;
    margin: 14px 2px 6px;
  }
  .fs-group-label:first-child { margin-top: 2px; }
  .fs-link {
    display: flex; align-items: center; gap: 12px; padding: 10px 10px; border-radius: 12px;
    color: var(--fs-ink) !important; text-decoration: none !important; font-size: 13.5px; font-weight: 600;
    transition: background 0.15s ease;
    animation: fsPillIn 0.3s var(--fs-ease) backwards;
  }
  .fs-link:hover { background: var(--fs-tint-2); }
  .fs-link-i {
    width: 32px; height: 32px; padding: 7px; border-radius: 10px; flex-shrink: 0;
    background: var(--fs-tint); color: var(--fs-blue);
    transition: transform 0.25s var(--fs-spring), background 0.15s, color 0.15s;
  }
  .fs-link:hover .fs-link-i { background: var(--fs-blue); color: #fff; transform: rotate(-8deg) scale(1.05); }
  .fs-link-t { flex: 1; min-width: 0; }
  .fs-link-sub { display: block; font-size: 11.5px; font-weight: 500; color: var(--fs-muted); margin-top: 1px; }
  .fs-link-go { width: 16px; height: 16px; color: #A8B3C7; transition: transform 0.2s var(--fs-ease), color 0.15s; }
  .fs-link:hover .fs-link-go { transform: translateX(3px); color: var(--fs-blue); }
  .fs-link.here .fs-link-sub { color: var(--fs-blue); }
  .fs-empty { font-size: 13px; color: var(--fs-muted); text-align: center; padding: 30px 10px; }

  /* ---- profile + for you views ---- */
  .fs-card {
    border: 1px solid var(--fs-line); border-radius: 16px; padding: 16px; background: #fff;
    animation: fsRise 0.36s var(--fs-ease) backwards;
  }
  .fs-card + .fs-card { margin-top: 12px; }
  .fs-card:nth-child(2) { animation-delay: 0.05s; }
  .fs-card:nth-child(3) { animation-delay: 0.10s; }
  .fs-card:nth-child(4) { animation-delay: 0.15s; }
  .fs-card-title { font-size: 12px; font-weight: 700; color: #8A96AD; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 10px; }
  .fs-id { display: flex; align-items: center; gap: 14px; }
  .fs-ring { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
  .fs-ring svg { width: 64px; height: 64px; transform: rotate(-90deg); }
  .fs-ring circle { fill: none; stroke-width: 5; }
  .fs-ring .fs-ring-bg { stroke: var(--fs-tint); }
  .fs-ring .fs-ring-fg { stroke: var(--fs-blue); stroke-linecap: round; transition: stroke-dashoffset 0.9s var(--fs-ease); }
  .fs-ring-in {
    position: absolute; inset: 9px; border-radius: 50%;
    background: var(--fs-navy); color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700;
  }
  .fs-id-name { font-size: 17px; font-weight: 700; color: var(--fs-navy); }
  .fs-id-meta { font-size: 12.5px; color: var(--fs-muted); margin-top: 3px; line-height: 1.45; }
  .fs-id-pct { font-size: 12px; font-weight: 700; color: var(--fs-blue); margin-top: 6px; }
  .fs-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .fs-chip {
    font-size: 12px; font-weight: 600; color: var(--fs-navy); background: var(--fs-tint-2);
    border: 1px solid var(--fs-line); border-radius: 999px; padding: 4px 10px;
  }
  .fs-muted { font-size: 12.5px; color: var(--fs-muted); }
  .fs-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .fs-ghost {
    display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--fs-line); background: #fff;
    border-radius: 12px; padding: 10px 16px; font: 700 13px var(--fs-font); color: var(--fs-navy) !important;
    text-decoration: none !important; cursor: pointer; transition: background 0.15s, border-color 0.15s;
  }
  .fs-ghost:hover { background: var(--fs-tint-2); border-color: #B9CCF2; }

  .fs-hero {
    border-radius: 16px; padding: 18px; color: #fff; position: relative; overflow: hidden;
    background: linear-gradient(160deg, #31475B 0%, var(--fs-navy) 60%);
    animation: fsRise 0.36s var(--fs-ease);
  }
  .fs-hero::after {
    content: ""; position: absolute; right: -40px; bottom: -60px; width: 180px; height: 180px;
    background: radial-gradient(closest-side, rgba(150,180,215,0.18), transparent); pointer-events: none;
  }
  .fs-hero-t { font-size: 16px; font-weight: 700; position: relative; }
  .fs-hero-s { font-size: 12.5px; color: rgba(255,255,255,0.72); margin: 4px 0 14px; line-height: 1.5; position: relative; }
  .fs-hero .fs-cta { position: relative; background: #fff; color: var(--fs-navy) !important; box-shadow: none; }
  .fs-hero .fs-cta:hover { background: var(--fs-tint); }
  .fs-rec {
    display: flex; gap: 12px; align-items: flex-start; padding: 14px; margin-top: 10px;
    border: 1px solid var(--fs-line); border-radius: 14px; text-decoration: none !important; color: var(--fs-ink) !important;
    transition: border-color 0.15s, box-shadow 0.2s, transform 0.2s var(--fs-ease);
    animation: fsRise 0.36s var(--fs-ease) backwards;
  }
  .fs-rec:nth-of-type(2) { animation-delay: 0.06s; }
  .fs-rec:nth-of-type(3) { animation-delay: 0.12s; }
  .fs-rec:nth-of-type(4) { animation-delay: 0.18s; }
  .fs-rec:hover { border-color: #B9CCF2; box-shadow: 0 10px 22px rgba(43,62,80,0.08); transform: translateY(-2px); }
  .fs-rec-t { font-size: 13.5px; font-weight: 700; color: var(--fs-navy); }
  .fs-rec-why { font-size: 12.5px; color: var(--fs-muted); margin-top: 3px; line-height: 1.45; }
  .fs-rec .fs-link-i { margin-top: 1px; }

  /* ================= home page banner (only where #fs-banner-slot exists) ================= */
  #fs-banner {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    background: #FFFFFF; border: 1px solid var(--fs-line);
    border-radius: 18px; padding: 14px 18px; margin: 12px 0; font-family: var(--fs-font);
    box-shadow: 0 6px 18px rgba(43,62,80,0.05);
    animation: fsRise 0.45s var(--fs-ease);
  }
  #fs-banner.hidden { display: none; }
  .fs-banner-left { display: flex; align-items: center; gap: 14px; flex: 1; }
  .fs-banner-icon {
    width: 40px; height: 40px; border-radius: 12px; padding: 8px; flex-shrink: 0; color: #fff;
    background: var(--fs-navy);
  }
  .fs-banner-icon .fs-needle { animation: fsNeedleIdle 6s ease-in-out infinite; }
  .fs-banner-text { font-size: 14px; color: var(--fs-ink); line-height: 1.5; }
  .fs-banner-cta {
    display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; cursor: pointer;
    font-size: 13px; font-weight: 700; color: #fff; background: var(--fs-blue);
    padding: 9px 14px; border-radius: 11px; transition: background 0.15s;
  }
  .fs-banner-cta .fs-i { width: 15px; height: 15px; transition: transform 0.2s var(--fs-ease); }
  .fs-banner-cta:hover { background: var(--fs-blue-dk); }
  .fs-banner-cta:hover .fs-i { transform: translateX(3px); }
  .fs-banner-x {
    width: 28px; height: 28px; padding: 6px; border: none; border-radius: 8px; cursor: pointer;
    background: transparent; color: #98A3B8; flex-shrink: 0;
  }
  .fs-banner-x:hover { background: var(--fs-tint); color: var(--fs-navy); }
  @media (max-width: 560px) {
    #fs-banner { flex-wrap: wrap; position: relative; padding: 14px 16px; }
    .fs-banner-left { flex: 1 1 100%; padding-right: 26px; }
    .fs-banner-text { font-size: 13px; }
    .fs-banner-cta { margin-left: 54px; }
    .fs-banner-x { position: absolute; top: 8px; right: 8px; }
  }

  /* ================= phones: full-screen window, tap the bubble for actions ================= */
  @media (max-width: 480px) {
    #fs-launcher { bottom: 20px; right: 20px; }
    #fs-chat {
      top: 0; right: 0; bottom: 0; left: 0; width: 100%; height: 100%; height: 100dvh; max-height: none;
      border: none; border-radius: 0; box-shadow: none; z-index: 2147483647;
      transform: translateY(24px);
    }
    #fs-launcher.chat-open { display: none; }
    .fs-msg { font-size: 14.5px; }
    #fs-input, #fs-nav-q { font-size: 16px; } /* 16px stops iOS from zooming into inputs */
    .fs-usr { max-width: 85%; }
    .fs-tab span { font-size: 11.5px; }
  }

  /* accessibility: honor users who ask the OS to reduce motion */
  @media (prefers-reduced-motion: reduce) {
    #fs-widget-root *, #fs-banner * { animation: none !important; transition-duration: 0.01ms !important; transition-delay: 0s !important; }
    #fs-banner { animation: none !important; }
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
    satHTML += '<button class="fs-sat" type="button" data-view="' + s.view + '" aria-label="' + s.label + '" ' +
      'style="--i:' + i + ';--x:' + s.x + 'px;--y:' + s.y + 'px">' + s.icon + '<span class="fs-tip">' + s.label + '</span></button>';
  }
  var tabHTML = '';
  for (var j = 0; j < SATS.length; j++) {
    tabHTML += '<button class="fs-tab' + (j === 1 ? ' active' : '') + '" type="button" role="tab" data-view="' + SATS[j].view + '">' +
      '<span class="fs-tab-i">' + SATS[j].icon + '</span><span>' + SATS[j].label + '</span></button>';
  }

  var html =
    '<div id="fs-launcher">' +
      '<div class="fs-dial">' + satHTML + '</div>' +
      '<button id="fs-bubble" type="button" aria-label="Open Compass">' +
        '<span class="fs-bubble-icon fs-bubble-compass">' + I.compass + '</span>' +
        '<span class="fs-bubble-icon fs-bubble-close">' + I.close + '</span>' +
      '</button>' +
    '</div>' +
    '<div id="fs-chat" role="dialog" aria-label="Compass advisor">' +
      '<div class="fs-hdr">' +
        '<div class="fs-hdr-left">' +
          '<div class="fs-hdr-icon">' + I.compass + '</div>' +
          '<div><div class="fs-hdr-name">Compass<span class="fs-hdr-beta">BETA</span></div>' +
          '<div class="fs-hdr-sub">Your FutureSelf career advisor</div></div>' +
        '</div>' +
        '<div class="fs-hdr-right">' +
          '<button class="fs-icon-btn fs-reset" type="button" onclick="fsReset()" title="Reset conversation" aria-label="Reset conversation">' + I.reset + '</button>' +
          '<button class="fs-icon-btn fs-x" type="button" onclick="fsToggle()" title="Close" aria-label="Close">' + I.close + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="fs-tabs" role="tablist">' + tabHTML + '<span class="fs-tab-ink" style="--t:1"></span></div>' +
      '<div class="fs-views">' +
        '<section class="fs-view" data-view="navigate">' +
          '<label class="fs-search"><svg viewBox="0 0 24 24" class="fs-i"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' +
          '<input id="fs-nav-q" type="text" placeholder="Search FutureSelf pages" autocomplete="off"></label>' +
          '<div id="fs-nav-list" class="fs-scroll"></div>' +
        '</section>' +
        '<section class="fs-view active" data-view="chat">' +
          '<button class="fs-wp-btn" id="fs-wp-btn" type="button" aria-expanded="false" hidden>' +
            '<span class="fs-wp-btn-i">' + I.flag + '</span><span>Waypoints</span><span class="fs-wp-count" id="fs-wp-count"></span></button>' +
          '<div class="fs-wp-panel" id="fs-wp-panel" hidden>' +
            '<div class="fs-wp-head"><div class="fs-wp-title">Waypoints</div>' +
            '<div class="fs-wp-sub">Jump back to any question, or pick the conversation up from there.</div></div>' +
            '<div id="fs-wp-list"></div>' +
          '</div>' +
          '<div id="fs-body"></div>' +
          '<div id="fs-qr"></div>' +
          '<div class="fs-bar">' +
            '<textarea id="fs-input" rows="1" placeholder="Reply..."></textarea>' +
            '<button class="fs-send" type="button" onclick="fsSend()" aria-label="Send">' + I.send + '</button>' +
          '</div>' +
        '</section>' +
        '<section class="fs-view" data-view="profile"><div id="fs-profile" class="fs-scroll"></div></section>' +
        '<section class="fs-view" data-view="foryou"><div id="fs-foryou" class="fs-scroll"></div></section>' +
      '</div>' +
      '<div class="fs-pwr">Powered by FutureSelf</div>' +
    '</div>';

  window.__FS_ICONS__ = I; // widget.js reuses the same icon set

  var styleEl = document.createElement('style');
  styleEl.id = 'fs-widget-style';
  styleEl.appendChild(document.createTextNode(css));
  document.head.appendChild(styleEl);

  var container = document.createElement('div');
  container.id = 'fs-widget-root';
  container.innerHTML = html;
  document.body.appendChild(container);

  mountBanner();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBanner);

  var sc = document.createElement('script');
  sc.src = 'https://ai-advisor-futureself.vercel.app/widget.js?v=' + Date.now();
  document.head.appendChild(sc);
})();
