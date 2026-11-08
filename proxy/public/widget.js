(function () {
  function fsBoot() {
  var PROXY_URL = 'https://ai-advisor-futureself.vercel.app/api/proxy';
  var PROFILE_URL = 'https://futureselfdiscover.com/session_info.json?type=user';
  var MAX_HISTORY = 20;
  var profile = null;
  var userName = '';
  var routed = false;
  var hbUserId = null; // window.__HB_USER__.id - used as the memory key (server hashes it)
  var isNewSession = true; // flips false after first save_memory call this page-load
  // random per-page-load session ID for ANONYMOUS conversation_logs grouping.
  // not derived from user identity, never shown to the user, not linkable to user_hash.
  var sessionId = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  // grow the textarea with its content up to a max, then scroll.
  // NOTE: never CSS-transition `height` on this element - doing so makes
  // scrollHeight read a mid-animation value and the box stops growing.
  var INPUT_MAX_H = 190;
  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';                    // collapse so scrollHeight is true content height
    var h = el.scrollHeight;
    if (h > INPUT_MAX_H) {
      el.style.height = INPUT_MAX_H + 'px';
      el.style.overflowY = 'auto';
    } else {
      el.style.height = h + 'px';
      el.style.overflowY = 'hidden';             // no scrollbar until it's actually needed
    }
  }

  var pageMap = {
    '/news': 'Business News page.',
    '/page/careersinternships': 'Careers and Internships hub.',
    '/page/network-leadership': 'Networking and Leadership page.',
    '/page/skills-business-basics-11508ae5-15d3-41dd-a447-113db421c698': 'Skills and Business Basics page.',
    '/page/apps&interviews': 'Applications and Interviews page.',
    '/page/life%20&%20wellbeing': 'Life and Wellbeing page.',
    '/page/internship-database': 'Internship Database.',
    '/page/find-a-job-30edfa1d-c8cf-4c88-b66a-804ccfacea21': 'Find a Job page.',
    '/page/explore-career-center': 'Career Center.',
    '/page/exploring-cities': 'Exploring Cities page.',
    '/page/explore-companies': 'Explore Companies page.',
    '/topics': 'Community Topics.',
    '/page/clubsandorganizations': 'Clubs and Organizations page.',
    '/page/coffee-chats-and-cold-calls': 'Coffee Chats and Cold Calls page.',
    '/page/leveraging-linkedin-dfb39de3-e1dd-4c61-ae1d-86e2c08e7e2d': 'Leveraging LinkedIn page.',
    '/page/get-smart-on-ai': 'Get Smart on AI page.',
    '/page/explore-certifications': 'Certifications page.',
    '/page/international-students': 'International Students page.',
    '/page/student-athletes': 'Student Athletes page.',
    '/page/application-necessities': 'Application Necessities page.',
    '/page/explore-yourself': 'Explore Yourself page.',
    '/page/build-your-plan-': 'Build Your Plan page.',
    '/page/healthandwellness': 'Health and Wellness page.',
    '/page/profbalance': 'Professional Balance page.',
    '/page/academic-assistance': 'Academic Assistance page.',
    '/page/time-management': 'Time Management page.',
    '/page/home-x2': 'Home page.'
  };

  var path = window.location.pathname;
  var pageDesc = pageMap[path] || 'a FutureSelf page';
  var icon = (window.__FS_ICONS__ && window.__FS_ICONS__.compass) || '<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var history = [];
  var memory = null; // loaded from Supabase via get_memory on open
  var pendingProfileSuggestion = null; // suggestion awaiting student consent
  var declinedSuggestions = []; // values declined this session, never re-prompted

  // ---- safe rendering ------------------------------------------------------
  // Everything shown in the chat goes through esc() or renderMarkdown().
  // Model text is never inserted as raw HTML: only links we rebuild ourselves
  // (http/https/mailto) and the small markdown subset below can produce tags.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeHref(u) {
    u = String(u || '').trim().replace(/&amp;/g, '&');
    return /^(https?:\/\/|mailto:)/i.test(u) ? u : null;
  }

  function renderMarkdown(raw) {
    var links = [];
    function keep(url, label) {
      var href = safeHref(url);
      var text = String(label || '').replace(/<[^>]*>/g, '').trim() || url;
      if (!href) return text;
      links.push({ href: href, text: text });
      return '\u0001' + (links.length - 1) + '\u0001';
    }

    var t = String(raw == null ? '' : raw);
    // 1. pull out links before escaping: <a href="..">..</a> (what the
    //    behavior file asks for) and markdown [text](url)
    t = t.replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      function (m, url, label) { return keep(url, label); });
    t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
      function (m, label, url) { return keep(url, label); });
    // 2. map simple HTML the model sometimes emits onto markdown, drop the rest
    t = t.replace(/<br\s*\/?>/gi, '\n')
         .replace(/<\/?(b|strong)>/gi, '**')
         .replace(/<\/?(i|em)>/gi, '*')
         .replace(/<\/?[a-z][^>]*>/gi, '');
    // 3. escape everything that is left
    t = esc(t);
    // 4. bare URLs become links too
    t = t.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g,
      function (m, pre, url) { url = url.replace(/&amp;/g, '&'); return pre + keep(url, url); });

    function inline(s) {
      return s
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    }

    // 5. block structure: paragraphs, bullet lists, numbered lists, headings
    var lines = t.split(/\r?\n/);
    var out = [], para = [], list = null;
    function flushPara() {
      if (para.length) { out.push('<p>' + inline(para.join('<br>')) + '</p>'); para = []; }
    }
    function flushList() {
      if (list) { out.push('<' + list.tag + '>' + list.items.join('') + '</' + list.tag + '>'); list = null; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var ul = line.match(/^\s*(?:[-*\u2022])\s+(.*)$/);
      var ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      var h  = line.match(/^\s*#{1,4}\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        var tag = ul ? 'ul' : 'ol';
        if (!list || list.tag !== tag) { flushList(); list = { tag: tag, items: [] }; }
        list.items.push('<li>' + inline(ul ? ul[1] : ol[2]) + '</li>');
      } else if (h) {
        flushPara(); flushList();
        out.push('<p class="cmp-h">' + inline(h[1]) + '</p>');
      } else if (/^\s*$/.test(line)) {
        flushPara(); flushList();
      } else {
        flushList(); para.push(line.trim());
      }
    }
    flushPara(); flushList();

    // 6. put the rebuilt links back
    return out.join('').replace(/\u0001(\d+)\u0001/g, function (m, n) {
      var l = links[+n];
      return '<a href="' + esc(l.href) + '" target="_top" rel="noopener">' + esc(l.text) + '</a>';
    });
  }

  // render a consent prompt for a profile suggestion with Yes/No choices
  function showProfileConsent(sug) {
    pendingProfileSuggestion = sug;
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-row cmp-row-ai';
    div.id = 'cmp-profile-consent';
    div.innerHTML = '<div class="cmp-av">' + icon + '</div>' +
      '<div class="cmp-msg cmp-ai"><p>Want me to add <strong>' + esc(sug.label || sug.value) + '</strong> to your FutureSelf profile?</p>' +
      '<div style="margin-top:8px;display:flex;gap:6px;">' +
      '<span class="cmp-pill" onclick="fsProfileYes()">Yes, add it</span>' +
      '<span class="cmp-pill" onclick="fsProfileNo()">No thanks</span>' +
      '</div></div>';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function removeProfileConsent() {
    var el = document.getElementById('cmp-profile-consent');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  window.fsProfileYes = function () {
    if (!pendingProfileSuggestion || !hbUserId) { removeProfileConsent(); return; }
    var sug = pendingProfileSuggestion;
    pendingProfileSuggestion = null;
    removeProfileConsent();
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', PROXY_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          var ok = false;
          try { ok = JSON.parse(xhr.responseText).ok === true; } catch(e) {}
          addAI(ok ? "Noted, I'll get that added to your profile." : 'Hmm, that did not save. I will try again next time it comes up.', true);
        }
      };
      xhr.send(JSON.stringify({ type: 'save_profile', userId: hbUserId, field: sug.field, value: sug.value }));
    } catch(e) {}
  };

  window.fsProfileNo = function () {
    if (pendingProfileSuggestion) declinedSuggestions.push(pendingProfileSuggestion.value);
    pendingProfileSuggestion = null;
    removeProfileConsent();
  };

  function buildMemoryContext() {
    if (!memory) return 'No prior memory for this student yet.';
    var bits = [];
    if (memory.focus) bits.push('Focus: ' + memory.focus);
    if (memory.summary) bits.push('Summary: ' + memory.summary);
    if (memory.topics && memory.topics.length) bits.push('Topics: ' + memory.topics.join(', '));
    if (memory.direction && Object.keys(memory.direction).length) {
      bits.push('Direction: ' + JSON.stringify(memory.direction));
    }
    if (memory.current_term && Object.keys(memory.current_term).length) {
      bits.push('Current term: ' + JSON.stringify(memory.current_term));
    }
    if (memory.knowledge && memory.knowledge.length) {
      var kb = [];
      for (var i = 0; i < memory.knowledge.length; i++) {
        kb.push(memory.knowledge[i].detail || JSON.stringify(memory.knowledge[i]));
      }
      bits.push('Known details: ' + kb.join(' | '));
    }
    if (memory.session_count) bits.push('Past sessions: ' + memory.session_count);
    return bits.length ? bits.join('\n') : 'No prior memory for this student yet.';
  }

  function fetchProfile(cb) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', PROFILE_URL + '&_=' + Date.now(), true);
      xhr.withCredentials = true;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try { var d = JSON.parse(xhr.responseText); cb(d.user || null); }
            catch(e) { cb(null); }
          } else { cb(null); }
        }
      };
      xhr.onerror = function() { cb(null); };
      xhr.send();
    } catch(e) { cb(null); }
  }

  function readiness(p) {
    if (!p) return { ready: false, items: [] };
    var items = [
      { label: 'Set your school', done: !!(p.sub_networks && p.sub_networks.length > 0) },
      { label: 'Set your location', done: !!(p.locations && p.locations.length > 0) },
      { label: 'Add your skills', done: !!(p.skills && p.skills.length > 0) },
      { label: 'Add industries of interest', done: !!(p.industries && p.industries.length > 0) },
      { label: 'Add your education', done: !!(p.educations && p.educations.length > 0) }
    ];
    var allDone = true;
    for (var i = 0; i < items.length; i++) { if (!items[i].done) { allDone = false; break; } }
    return { ready: allDone, items: items };
  }

  function buildProfileContext() {
    if (!profile) return 'No profile data available.';
    var bits = [];
    if (profile.name) bits.push('Name: ' + profile.name);
    if (profile.sub_networks && profile.sub_networks.length) {
      var schools = [];
      for (var i = 0; i < profile.sub_networks.length; i++) schools.push(profile.sub_networks[i].title);
      bits.push('School: ' + schools.join(', '));
    }
    if (profile.locations && profile.locations.length) bits.push('Location: ' + profile.locations[0].address);
    if (profile.headline) bits.push('Headline: ' + profile.headline);
    if (profile.current_job) bits.push('Current job: ' + profile.current_job);
    if (profile.industry_name) bits.push('Industry: ' + profile.industry_name);
    if (profile.skills && profile.skills.length) {
      var sk = [];
      for (var j = 0; j < profile.skills.length; j++) sk.push(profile.skills[j].name || profile.skills[j].title || profile.skills[j]);
      bits.push('Skills: ' + sk.join(', '));
    }
    if (profile.industries && profile.industries.length) {
      var ind = [];
      for (var k = 0; k < profile.industries.length; k++) ind.push(profile.industries[k].name || profile.industries[k].title || profile.industries[k]);
      bits.push('Industries of interest: ' + ind.join(', '));
    }
    if (profile.educations && profile.educations.length) {
      var edu = [];
      for (var m = 0; m < profile.educations.length; m++) {
        var e = profile.educations[m];
        var parts = [];
        if (e.school_name || e.school) parts.push(e.school_name || e.school);
        if (e.degree) parts.push(e.degree);
        if (e.field_of_study) parts.push(e.field_of_study);
        edu.push(parts.join(', ') || 'an education entry');
      }
      bits.push('Education: ' + edu.join(' | '));
    }
    if (profile.experiences && profile.experiences.length) bits.push('Has ' + profile.experiences.length + ' work experience entries.');
    return bits.join('\n');
  }

  // package raw context for the proxy to build the system prompt from.
  // behavior/method/resource content now lives server-side in
  // proxy/behavior/*.txt, editable without a widget deploy.
  function buildContext() {
    return {
      profile: profile ? { id: profile.id } : null,
      pageDesc: pageDesc,
      profileContext: buildProfileContext(),
      memoryContext: buildMemoryContext()
    };
  }

  // fetch memory (including conversation_history) from Supabase via the proxy
  function fetchMemory(cb) {
    if (!hbUserId) { cb(null); return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', PROXY_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          try {
            var data = JSON.parse(xhr.responseText);
            cb((data && data.memory) || null);
          } catch(e) { cb(null); }
        }
      };
      xhr.onerror = function() { cb(null); };
      xhr.send(JSON.stringify({ type: 'get_memory', userId: hbUserId }));
    } catch(e) { cb(null); }
  }

  // push an update to Supabase via the proxy. Only send fields that changed
  // this turn - the proxy merges knowledge/history and overwrites
  // current_term/direction only when provided.
  function pushMemory(fields) {
    if (!hbUserId) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', PROXY_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      var body = { type: 'save_memory', userId: hbUserId, newSession: isNewSession };
      for (var k in fields) { if (fields[k] !== undefined) body[k] = fields[k]; }
      xhr.send(JSON.stringify(body));
      isNewSession = false;
    } catch(e) {}
  }

  function renderHistory() {
    var body = document.getElementById('cmp-body');
    if (!body) return;
    body.innerHTML = '';
    for (var i = 0; i < history.length; i++) {
      if (history[i].role === 'assistant') { var p = parseReply(history[i].content); addAI(p.reply, false); }
      else if (history[i].role === 'user') { addUser(history[i].content, false, i); }
    }
    body.scrollTop = body.scrollHeight;
  }

  function hasConsented() { try { return localStorage.getItem('fs_consent') === '1'; } catch(e) { return false; } }
  function setConsent() { try { localStorage.setItem('fs_consent', '1'); } catch(e) {} }

  function clearBody() {
    var body = document.getElementById('cmp-body');
    var qr = document.getElementById('cmp-qr');
    var bar = document.querySelector('.cmp-bar');
    if (body) body.innerHTML = '';
    if (qr) qr.innerHTML = '';
    if (bar) bar.style.display = 'none';
  }

  function showLoading() {
    clearBody();
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-center-screen';
    div.innerHTML = '<div class="cmp-center-text">Loading your advisor...</div>';
    body.appendChild(div);
  }

  function showGate(r) {
    clearBody();
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var checklistHTML = '';
    for (var i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      checklistHTML += '<div class="cmp-check-item ' + (it.done ? 'done' : 'todo') + '">' +
        '<span class="cmp-check-mark">' + (it.done ? '&#10003;' : '') + '</span>' +
        '<span>' + esc(it.label) + '</span></div>';
    }
    var editURL = 'https://futureselfdiscover.com/account';
    if (profile && profile.id) editURL = 'https://futureselfdiscover.com/users/' + profile.id;
    var div = document.createElement('div');
    div.className = 'cmp-center-screen';
    div.innerHTML =
      '<div class="cmp-center-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>' +
      '<div class="cmp-center-title">Complete your profile to unlock</div>' +
      '<div class="cmp-center-text">Your AI Advisor uses your profile to give real, personalized advice. Finish all of these to get started:</div>' +
      '<div class="cmp-checklist">' + checklistHTML + '</div>' +
      '<a href="' + editURL + '" target="_top" class="cmp-center-btn">Complete my profile</a>';
    body.appendChild(div);
  }

  function showConsent() {
    clearBody();
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-center-screen';
    div.innerHTML =
      '<div class="cmp-center-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>' +
      '<div class="cmp-center-title">Before we get started</div>' +
      '<div class="cmp-center-text">This conversation may be reviewed to improve the advisor. Don\'t share sensitive personal info like passwords or SSNs.</div>' +
      '<button class="cmp-center-btn" onclick="fsConsent()">I understand.</button>';
    body.appendChild(div);
  }

  function verifyAndRoute() {
    routed = false;
    showLoading();
    hbUserId = (window.__HB_USER__ && window.__HB_USER__.id) || hbUserId;
    fetchProfile(function(p) {
      profile = p;
      if (p && p.name) userName = p.firstname || p.name.split(' ')[0];
      var r = readiness(p);
      if (!r.ready) { showGate(r); return; }
      if (!hasConsented()) { showConsent(); return; }
      clearBody();
      routed = true;
      var bar = document.querySelector('.cmp-bar');
      if (bar) bar.style.display = '';
      fetchMemory(function(m) {
        memory = m;
        // mechanical frequent_pages tracking: append current path on each
        // open, keep the most recent 50 entries (proxy overwrites the field)
        var fp = (m && m.frequent_pages) || [];
        fp.push(path);
        if (fp.length > 50) fp = fp.slice(-50);
        pushMemory({ frequentPages: fp });
        // stored conversation_history uses {user, assistant, timestamp} turn
        // pairs; convert back into the {role, content} message list the
        // widget renders and sends to the model.
        history = [];
        var stored = (m && m.conversation_history) || [];
        for (var i = 0; i < stored.length; i++) {
          var t = stored[i];
          if (t && t.role && t.content) { history.push(t); continue; }
          if (t && t.user) history.push({ role: 'user', content: t.user, timestamp: t.timestamp });
          if (t && t.assistant) history.push({ role: 'assistant', content: t.assistant, timestamp: t.timestamp });
        }
        if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
        if (history.length > 0) renderHistory();
        else startChat();
        if (pendingAsk) { var q = pendingAsk; pendingAsk = null; window.fsPill(q); }
      });
    });
  }

  window.fsConsent = function() { setConsent(); verifyAndRoute(); };

  window.fsReset = function() {
    if (!confirm('Reset your advisor? This permanently deletes your conversation history and everything the advisor remembers about you, and starts fresh.')) return;
    try { localStorage.removeItem('fs_consent'); } catch(e) {}
    history = [];
    memory = null;
    routed = false;
    // wipe server-side memory, then re-run the full gate (profile check + consent)
    if (hbUserId) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', PROXY_URL, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            var textEl = document.getElementById('cmp-banner-text');
            var ctaEl = document.getElementById('cmp-banner-cta-label');
            if (textEl) textEl.innerText = 'Hi, I\'m Compass, your FutureSelf advisor. I help students like you figure out what\'s next. Want to get started?';
            if (ctaEl) ctaEl.innerText = 'Get started';
            verifyAndRoute();
          }
        };
        xhr.send(JSON.stringify({ type: 'delete_memory', userId: hbUserId }));
        return;
      } catch(e) {}
    }
    verifyAndRoute();
  };

  window.fsDismiss = function (e) {
    e.stopPropagation();
    var b = document.getElementById('cmp-banner');
    if (b) b.className = b.className + ' hidden';
  };

  function startChat() {
    var greeting = userName ? 'Hi ' + userName + '!' : 'Hi!';
    var opening = greeting + " I'm Compass, your FutureSelf advisor. To point you in the right direction, tell me where your head's at right now.";
    addAI(opening, true);
    history.push({ role: 'assistant', content: opening, timestamp: new Date().toISOString() });
    setPills(['Exploring options', 'Recruiting now', 'Interview prep', 'Totally unsure']);
  }

  window.fsSend = function () {
    if (!routed) return;
    var input = document.getElementById('cmp-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    autoGrow(input);            // collapse back to one line after sending
    document.getElementById('cmp-qr').innerHTML = '';
    addUser(text, true);
    history.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    callAPI();
  };

  window.fsPill = function (text) {
    if (!routed) return;
    document.getElementById('cmp-qr').innerHTML = '';
    addUser(text, true);
    history.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    callAPI();
  };

  function parseReply(raw) {
    var suggestions = [];
    var memoryUpdate = null;
    var salvagedSuggestion = null;
    var reply = raw;

    // helper: cut a balanced-brace JSON blob starting at a given "key"
    // returns {obj, cleaned} or null if not found / unparseable
    function extractBlob(text, keyRegex) {
      var m = text.search(keyRegex);
      if (m === -1) return null;
      var depth = 0, endIdx = -1;
      for (var ci = m; ci < text.length; ci++) {
        var ch = text[ci];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { endIdx = ci; break; } }
      }
      var blob = endIdx > -1 ? text.slice(m, endIdx + 1) : text.slice(m);
      var obj = null;
      try { obj = JSON.parse(blob); } catch(e) {}
      var cleaned = (text.slice(0, m) + (endIdx > -1 ? text.slice(endIdx + 1) : '')).trim();
      return { obj: obj, cleaned: cleaned, blob: blob };
    }

    // 1. suggestions JSON
    var suggMatch = reply.match(/\{\s*"suggestions"\s*:\s*\[[^\]]*\]\s*\}/);
    if (suggMatch) {
      try { suggestions = JSON.parse(suggMatch[0]).suggestions || []; } catch(e) {}
      reply = reply.replace(suggMatch[0], '').trim();
    }

    // 2. memory JSON (balanced-brace, any shape)
    var memRes = extractBlob(reply, /\{\s*"memory"/);
    if (memRes) {
      var pb = memRes.obj;
      if (pb && pb.memory && !Array.isArray(pb.memory) && typeof pb.memory === 'object') {
        memoryUpdate = pb.memory;
      } else if (pb && typeof pb === 'object') {
        memoryUpdate = {
          knowledge: Array.isArray(pb.memory) ? pb.memory : (pb.knowledge || []),
          current_term: pb.current_term || {},
          direction: pb.direction || {},
          focus: pb.focus || null,
          summary: pb.summary || null,
          topics: pb.topics || null,
          profile_suggestion: pb.profile_suggestion || null
        };
      }
      reply = memRes.cleaned;
    }

    // 3. standalone profile_suggestion JSON (the leak: model emits this
    //    OUTSIDE the memory object, so strip it separately and salvage it)
    var psRes = extractBlob(reply, /\{\s*"profile_suggestion"/);
    if (psRes) {
      if (psRes.obj && psRes.obj.profile_suggestion) {
        salvagedSuggestion = psRes.obj.profile_suggestion;
      }
      reply = psRes.cleaned;
    }

    // 4. final cleanup: remove orphaned leading/trailing commas, stray
    //    empty braces, and dangling whitespace left by the strips above
    reply = reply
      .replace(/^[\s,]+/, '')          // leading commas/space
      .replace(/[\s,]+$/, '')          // trailing commas/space
      .replace(/\{\s*\}/g, '')         // empty braces
      .replace(/,\s*$/, '')            // trailing comma
      .trim();

    // if memory carried a profile_suggestion, prefer it; else use salvaged
    if (memoryUpdate && !memoryUpdate.profile_suggestion && salvagedSuggestion) {
      memoryUpdate.profile_suggestion = salvagedSuggestion;
    } else if (!memoryUpdate && salvagedSuggestion) {
      memoryUpdate = { profile_suggestion: salvagedSuggestion };
    }

    return { reply: reply, suggestions: suggestions, memoryUpdate: memoryUpdate };
  }

  function callAPI() {
    showTyping();
    var xhr = new XMLHttpRequest();
    xhr.open('POST', PROXY_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        hideTyping();
        try {
          var data = JSON.parse(xhr.responseText);
          var raw = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          if (!raw) raw = "I'm having trouble connecting right now. Try again in a moment.";
          var parsed = parseReply(raw);
          addAI(parsed.reply, true);
          history.push({ role: 'assistant', content: raw, timestamp: new Date().toISOString() });
          if (parsed.suggestions.length > 0) setPills(parsed.suggestions);

          var lastUser = history.length > 1 ? history[history.length - 2] : null;
          var mu = parsed.memoryUpdate || {};
          pushMemory({
            knowledge: mu.knowledge || [],
            currentTerm: (mu.current_term && Object.keys(mu.current_term).length) ? mu.current_term : undefined,
            direction: (mu.direction && Object.keys(mu.direction).length) ? mu.direction : undefined,
            focus: mu.focus || undefined,
            summary: mu.summary || undefined,
            topics: (mu.topics && mu.topics.length) ? mu.topics : undefined,
            conversationTurn: lastUser ? { user: lastUser.content, assistant: parsed.reply, timestamp: new Date().toISOString() } : undefined
          });

          // consent-gated profile suggestion: show prompt only for allowed
          // fields and values not already declined this session
          var sug = mu.profile_suggestion;
          var allowedFields = ['skills','industries_of_interest','hobbies_interests','clubs_and_organizations','languages','awards_honors','currently_exploring','target_cities_regions','career_priorities','bio'];
          if (sug && sug.field && sug.value && allowedFields.indexOf(sug.field) > -1 && declinedSuggestions.indexOf(sug.value) === -1) {
            showProfileConsent(sug);
          }
        } catch (e) {
          addAI("Something went wrong on my end. Please try again.", true);
        }
      }
    };
    xhr.onerror = function () { hideTyping(); addAI("Something went wrong on my end. Please try again.", true); };
    xhr.send(JSON.stringify({
      type: 'chat',
      sessionId: sessionId,
      page: path,
      profileName: (profile && profile.name) || null,
      context: buildContext(),
      messages: history
    }));
  }

  // "plotting a route" labels. Each one names a step the proxy really performs
  // for every reply (profile + memory context, verified data lookup, the model
  // call); the timing is approximate, the steps are not made up.
  var THINK_LABELS = ['Reading your profile and past chats', 'Checking verified sources', 'Curating your answer', 'Polishing the details'];
  function thinkLabels() {
    var asked = 0;
    for (var i = 0; i < history.length; i++) if (history[i].role === 'user') asked++;
    var hasPast = asked > 1 || !!(memory && (memory.summary || memory.focus));
    var l = THINK_LABELS.slice();
    if (!hasPast) l[0] = 'Reading your profile';
    return l;
  }
  var thinkTimer = null;

  function showTyping() {
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-row cmp-row-ai';
    div.id = 'cmp-typing';
    div.innerHTML = '<div class="cmp-av">' + icon + '</div>' +
      '<div class="cmp-msg cmp-ai">' +
        '<div class="cmp-think">' +
          '<div class="cmp-route"><span class="cmp-route-fill"></span><span class="cmp-wp"></span><span class="cmp-wp"></span><span class="cmp-wp"></span></div>' +
          '<span class="cmp-think-label" id="cmp-think-label">' + thinkLabels()[0] + '</span>' +
        '</div>' +
      '</div>';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;

    // advance the label every few seconds so a slow reply still feels alive
    var idx = 0;
    thinkTimer = setInterval(function () {
      idx++;
      var labels = thinkLabels();
      if (idx >= labels.length) { clearInterval(thinkTimer); thinkTimer = null; return; }
      var el = document.getElementById('cmp-think-label');
      if (el) {
        el.innerText = labels[idx];
        el.classList.remove('cmp-think-swap');
        void el.offsetWidth;          // force reflow so the class re-triggers
        el.classList.add('cmp-think-swap');
      }
    }, 2400);
  }

  function hideTyping() {
    if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null; }
    var t = document.getElementById('cmp-typing');
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }

  function setPills(arr) {
    var c = document.getElementById('cmp-qr');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < arr.length; i++) {
      var p = document.createElement('div');
      p.className = 'cmp-pill';
      p.innerText = arr[i];
      p.onclick = (function (t) { return function () { fsPill(t); }; })(arr[i]);
      c.appendChild(p);
    }
  }

  function addAI(text, scroll) {
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-row cmp-row-ai';
    div.innerHTML = '<div class="cmp-av">' + icon + '</div><div class="cmp-msg cmp-ai">' + renderMarkdown(text) + '</div>';
    body.appendChild(div);
    if (scroll) body.scrollTop = body.scrollHeight;
  }

  function addUser(text, scroll, idx) {
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-row cmp-row-usr';
    div.setAttribute('data-hi', idx == null ? history.length : idx);
    div.innerHTML = '<div class="cmp-msg cmp-usr">' + esc(text) + '</div>';
    body.appendChild(div);
    if (scroll) body.scrollTop = body.scrollHeight;
  }

  // auto-growing textarea: expands with content up to the CSS max-height,
  // then scrolls. Enter sends; Shift+Enter inserts a newline.
  var inp = document.getElementById('cmp-input');
  if (inp) {
    inp.onkeydown = function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        fsSend();
      }
    };
    inp.oninput = function () { autoGrow(inp); };
    autoGrow(inp);
  }

  // ===========================================================================
  // Launcher, tabs and the Navigate / Profile / For you views
  // ===========================================================================
  var pendingAsk = null;          // question to send once the chat is ready
  var currentView = 'chat';
  var VIEW_INDEX = { navigate: 0, chat: 1, profile: 2, foryou: 3 };
  var ICONS = window.__FS_ICONS__ || {};
  var G = {
    careers: '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="3.5" y="7" width="17" height="12" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/></svg>',
    apply: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/></svg>',
    grow: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M4 19.5h16"/><path d="m5 15 4.5-4.5 3.5 3.5L19.5 7"/><path d="M15 7h4.5v4.5"/></svg>',
    life: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z"/></svg>',
    go: '<svg viewBox="0 0 24 24" class="cmp-i cmp-link-go"><path d="m9 6 6 6-6 6"/></svg>'
  };

  var PAGE_ICONS = {
    '/page/careersinternships': '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/></svg>',
    '/page/internship-database': '<svg viewBox="0 0 24 24" class="cmp-i"><ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/></svg>',
    '/page/entryleveljobs': '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6 15.5c.5-1.4 1.6-2 3-2s2.5.6 3 2M14.5 10h3M14.5 13h3"/></svg>',
    '/page/find-a-job-30edfa1d-c8cf-4c88-b66a-804ccfacea21': '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9.5 3.5h5v2.5h-5zM9 11h6M9 14.5h6M9 18h3.5"/></svg>',
    '/page/explore-companies': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M4 20.5h16M6 20.5V6.5l7-3v17M13 9.5h5v11"/><path d="M9 9h1.5M9 12.5h1.5M9 16h1.5M15.5 13h.5M15.5 16.5h.5"/></svg>',
    '/page/explore-career-center': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M3 9.5 12 5l9 4.5-9 4.5Z"/><path d="M7 11.5v4.5c1.3 1.3 3 2 5 2s3.7-.7 5-2v-4.5M21 9.5v5"/></svg>',
    '/page/apps&interviews': '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M9 15l2 2 4-4"/></svg>',
    '/page/application-necessities': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/></svg>',
    '/page/network-leadership': '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="5.5" r="2.25"/><circle cx="5.5" cy="17.5" r="2.25"/><circle cx="18.5" cy="17.5" r="2.25"/><path d="M11 7.5 6.5 15.5M13 7.5l4.5 8M7.75 17.5h8.5"/></svg>',
    '/page/coffee-chats-and-cold-calls': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M5 9.5h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M12 3.5v2.5"/></svg>',
    '/page/leveraging-linkedin-dfb39de3-e1dd-4c61-ae1d-86e2c08e7e2d': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    '/page/mentorship-program': '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="8.5" cy="7.5" r="3"/><circle cx="17" cy="9.5" r="2.25"/><path d="M3 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 15c.8-.6 1.6-.9 2.5-.9 2 0 3.5 1.4 4 3.9"/></svg>',
    '/page/explore-yourself': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M9 17.5h6M10 20.5h4"/><path d="M12 3.5a6 6 0 0 0-3.5 10.9c.4.3.5.8.5 1.3v1.8h6v-1.8c0-.5.2-1 .5-1.3A6 6 0 0 0 12 3.5Z"/></svg>',
    '/page/build-your-plan-': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
    '/page/skills-business-basics-11508ae5-15d3-41dd-a447-113db421c698': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17a2.1 2.1 0 0 0 3 3l5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5Z"/></svg>',
    '/page/get-smart-on-ai': '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/></svg>',
    '/page/explore-certifications': '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="9" r="5.5"/><path d="M9 13.8 8 20.5l4-2 4 2-1-6.7M12 6.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2Z"/></svg>',
    '/page/exploring-cities': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M12 20.5s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0c0 4.9-6.5 10.5-6.5 10.5Z"/><circle cx="12" cy="10" r="2.25"/></svg>',
    '/news': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M5.5 4.5h11a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2h-13a2 2 0 0 1-2-2v-13a1 1 0 0 1 1-1Z"/><path d="M17.5 9h2v9.5a2 2 0 0 1-2 2M8.5 8.5h6M8.5 12h6M8.5 15.5h4"/></svg>',
    '/page/life%20&%20wellbeing': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M19.5 4.5c-8.5 0-14 4.5-14 11a5 5 0 0 0 5 5c6.5 0 9-7 9-16Z"/><path d="M5 20c2.5-4 6-7 10-9"/></svg>',
    '/page/healthandwellness': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z"/><path d="M7 12h2.5l1.5-2.5 2 4.5 1.5-2H17"/></svg>',
    '/page/profbalance': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M12 4.5v16M7.5 20.5h9M5 7.5h14M12 4.5l-7 3M12 4.5l7 3"/><path d="M5 7.5 2.5 13a2.5 2.5 0 0 0 5 0ZM19 7.5 16.5 13a2.5 2.5 0 0 0 5 0Z"/></svg>',
    '/page/academic-assistance': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M12 6.5c-2-1.5-4.5-2-8-2v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2Z"/><path d="M12 6.5v13"/></svg>',
    '/page/time-management': '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="12.5" r="8"/><path d="M12 8.5v4l2.5 2.5M9.5 2.5h5"/></svg>',
    '/page/clubsandorganizations': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M6 20.5V4"/><path d="M6 4.5l12 4-12 4"/></svg>',
    '/companies': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M3.5 9 12 4l8.5 5M5 9.5v8M9.5 9.5v8M14.5 9.5v8M19 9.5v8M3.5 20.5h17M4 17.5h16"/></svg>',
    '/page/international-students': '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5Z"/></svg>',
    '/page/student-athletes': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M8 4.5h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5.5v1.5A3 3 0 0 0 8 10.4M16 6h2.5v1.5a3 3 0 0 1-2.5 2.9M12 13.5v3M8.5 20.5h7M9.5 20.5l.5-4h4l.5 4"/></svg>',
    '/topics': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M9.5 4.5 8 19.5M16 4.5l-1.5 15M5 9h15M4 15h15"/></svg>',
    '/forum': '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M14.5 13.5H8l-3.5 3v-10a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2Z"/><path d="M16.5 9h1a2 2 0 0 1 2 2v9l-3-2.5h-5a2 2 0 0 1-2-2"/></svg>',
    '/people': '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="9" cy="8.5" r="2.5"/><circle cx="16.5" cy="13.5" r="2"/><path d="M9 11c-2.5 0-4.5 1.5-5 4.5M14.5 18.5c.4-1.7 1.4-2.7 2-2.7s1.6 1 2 2.7M3.5 20.5h17"/></svg>',
    '/feed': '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M7.5 7h5M7.5 17h5"/></svg>'
  };

  // site map for the Navigate tab (keep in sync with pageMap above)
  var NAV = [
    { g: 'Jobs & internships', i: 'careers', items: [
      ['Careers & Internships', '/page/careersinternships', 'Your hub for roles and programs'],
      ['Internship Database', '/page/internship-database', 'Browse open internships'],
      ['Entry-Level Job Database', '/page/entryleveljobs', 'Full-time roles for new grads'],
      ['Explore Job Boards', '/page/find-a-job-30edfa1d-c8cf-4c88-b66a-804ccfacea21', 'Where to search, by field'],
      ['Explore Companies', '/page/explore-companies', 'Research employers you like'],
      ['Career Center', '/page/explore-career-center', 'Advising, events and resources']
    ]},
    { g: 'Applications & networking', i: 'apply', items: [
      ['Applications & Interviews', '/page/apps&interviews', 'From application to offer'],
      ['Application Essentials', '/page/application-necessities', 'Resume, cover letter, portfolio'],
      ['Networking', '/page/network-leadership', 'Build relationships that open doors'],
      ['Coffee Chats', '/page/coffee-chats-and-cold-calls', 'Scripts and outreach tips'],
      ['Leveraging LinkedIn', '/page/leveraging-linkedin-dfb39de3-e1dd-4c61-ae1d-86e2c08e7e2d', 'Make your profile work for you'],
      ['Mentorship Program', '/page/mentorship-program', 'Get matched with a mentor']
    ]},
    { g: 'Skills & direction', i: 'grow', items: [
      ['Explore Yourself', '/page/explore-yourself', 'Values, strengths and interests'],
      ['Build Your Plan', '/page/build-your-plan-', 'Turn goals into next steps'],
      ['Skills', '/page/skills-business-basics-11508ae5-15d3-41dd-a447-113db421c698', 'Workplace fundamentals'],
      ['AI Skills', '/page/get-smart-on-ai', 'AI skills employers want'],
      ['Certifications', '/page/explore-certifications', 'Credentials that stand out'],
      ['Explore Cities', '/page/exploring-cities', 'Where to live and work'],
      ['Business News', '/news', 'Stay current on industries']
    ]},
    { g: 'Life & community', i: 'life', items: [
      ['Wellbeing', '/page/life%20&%20wellbeing', 'Balance, health and growth'],
      ['Health & Wellness', '/page/healthandwellness', 'Take care of yourself'],
      ['Work-Life Balance', '/page/profbalance', 'Sustainable work habits'],
      ['Academic Help', '/page/academic-assistance', 'Support with classes'],
      ['Time Management', '/page/time-management', 'Plan your weeks better'],
      ['Clubs', '/page/clubsandorganizations', 'Campus clubs and student orgs'],
      ['Clubs, Societies & Programs', '/companies', 'National organizations and programs'],
      ['International Students', '/page/international-students', 'Resources for your path'],
      ['Student Athletes', '/page/student-athletes', 'Resources for your path'],
      ['Community', '/topics', 'Join the conversation'],
      ['FutureSelf Forums', '/forum', 'Ask and answer questions'],
      ['Member Map', '/people', 'Find members near you'],
      ['My Feed', '/feed', 'Your latest updates']
    ]}
  ];

  function $(id) { return document.getElementById(id); }
  function chatEl() { return $('cmp-chat'); }
  function launcherEl() { return $('cmp-launcher'); }
  function isOpen() { var w = chatEl(); return !!(w && w.classList.contains('open')); }
  var canHover = !(window.matchMedia && window.matchMedia('(hover: none)').matches);

  function setOpen(open) {
    var w = chatEl(), L = launcherEl(), b = $('cmp-bubble');
    if (w) w.classList.toggle('open', open);
    if (L) { L.classList.toggle('chat-open', open); L.classList.remove('dial'); }
    if (b) b.setAttribute('aria-label', open ? 'Close Compass' : 'Open Compass');
  }

  function showView(v) {
    if (!VIEW_INDEX.hasOwnProperty(v)) v = 'chat';
    currentView = v;
    var w = chatEl(); if (!w) return;
    var tabs = w.querySelectorAll('.cmp-tab'), views = w.querySelectorAll('.cmp-view');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-view') === v;
      tabs[i].classList.toggle('active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (var j = 0; j < views.length; j++) views[j].classList.toggle('active', views[j].getAttribute('data-view') === v);
    var ink = w.querySelector('.cmp-tab-ink');
    if (ink) ink.style.setProperty('--t', VIEW_INDEX[v]);
    if (v === 'navigate') renderNav('');
    if (v === 'profile') withProfile(renderProfile);
    if (v === 'foryou') withProfile(renderForYou);
  }

  // open the window on a view; the chat view (re)runs the profile + consent check
  function openTo(v) {
    var was = isOpen();
    setOpen(true);
    showView(v);
    if (v === 'chat' && (!was || !routed)) verifyAndRoute();
  }

  window.fsOpenView = openTo;
  window.fsOpenChat = function () { openTo('chat'); };
  window.fsToggle = function () { if (isOpen()) setOpen(false); else openTo(currentView); };

  // send a question to Compass from any view (queued until the chat is ready)
  function askCompass(text) {
    if (routed && isOpen() && currentView === 'chat') { window.fsPill(text); return; }
    pendingAsk = text;
    openTo('chat');
    if (routed) { var q = pendingAsk; pendingAsk = null; window.fsPill(q); }
  }
  window.fsAsk = askCompass;

  function prefill(text) {
    openTo('chat');
    var inp2 = $('cmp-input');
    if (inp2) { inp2.value = text; autoGrow(inp2); setTimeout(function () { inp2.focus(); }, 80); }
  }

  // ---- launcher: hover (or tap on touch screens) fans out the four actions ----
  (function wireLauncher() {
    var L = launcherEl(), b = $('cmp-bubble');
    if (!L || !b) return;
    var t = null, lastPointer = 'mouse';
    function dial(on) { if (isOpen()) on = false; L.classList.toggle('dial', on); }
    // hover fans out the actions for a real mouse only; taps fire fake hovers we ignore
    L.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; }, true);
    L.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { clearTimeout(t); dial(true); } });
    L.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { clearTimeout(t); t = setTimeout(function () { dial(false); }, 260); } });
    L.addEventListener('focusin', function (e) {   // keyboard focus only (taps also focus buttons)
      var kb = false; try { kb = e.target.matches(':focus-visible'); } catch (x) {}
      if (kb) { clearTimeout(t); dial(true); }
    });
    L.addEventListener('focusout', function (e) { if (!L.contains(e.relatedTarget)) dial(false); });
    b.addEventListener('click', function () {
      if (isOpen()) { setOpen(false); return; }
      if (lastPointer !== 'mouse' && !L.classList.contains('dial')) { dial(true); return; }  // touch: first tap shows actions
      openTo('chat');
    });
    var sats = L.querySelectorAll('.cmp-sat');
    for (var i = 0; i < sats.length; i++) {
      sats[i].addEventListener('click', function (e) {
        e.stopPropagation();
        openTo(this.getAttribute('data-view'));
      });
    }
    document.addEventListener('click', function (e) { if (!L.contains(e.target)) dial(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (isOpen()) setOpen(false); dial(false); }
    });
    var tabs = chatEl() ? chatEl().querySelectorAll('.cmp-tab') : [];
    for (var k = 0; k < tabs.length; k++) {
      tabs[k].addEventListener('click', function () {
        var v = this.getAttribute('data-view');
        showView(v);
        if (v === 'chat' && !routed) verifyAndRoute();
      });
    }
    var q = $('cmp-nav-q');
    if (q) q.addEventListener('input', function () { renderNav(q.value); });
    var ask = $('cmp-nav-ask');
    if (ask) ask.addEventListener('click', function () {
      var typed = q && q.value.trim();
      prefill(typed ? "I'm looking for help with " + typed : "I'm looking for help with ");
    });
  })();

  // ---- profile data shared by Profile and For you ----
  function withProfile(render) {
    if (profile) { render(profile); return; }
    var host = $(currentView === 'profile' ? 'cmp-profile' : 'cmp-foryou');
    if (host) host.innerHTML = '<div class="cmp-empty">Loading your profile...</div>';
    fetchProfile(function (p) {
      profile = p;
      if (p && p.name && !userName) userName = p.firstname || p.name.split(' ')[0];
      render(p);
    });
  }

  function names(arr) {
    var out = [];
    for (var i = 0; arr && i < arr.length; i++) {
      var x = arr[i];
      var n = typeof x === 'string' ? x : (x && (x.name || x.title));
      if (n) out.push(String(n));
    }
    return out;
  }

  function editURL() {
    return (profile && profile.id) ? 'https://futureselfdiscover.com/users/' + profile.id : 'https://futureselfdiscover.com/account';
  }

  // ---- Navigate ----
  function renderNav(query) {
    var host = $('cmp-nav-list'); if (!host) return;
    var q = String(query || '').toLowerCase().trim();
    var out = '', n = 0;
    for (var gi = 0; gi < NAV.length; gi++) {
      var grp = NAV[gi], rows = '';
      for (var ii = 0; ii < grp.items.length; ii++) {
        var it = grp.items[ii];
        if (q && (it[0] + ' ' + it[2] + ' ' + grp.g).toLowerCase().indexOf(q) === -1) continue;
        var here = it[1] === path;
        rows += '<a class="cmp-link' + (here ? ' here' : '') + '" href="' + esc(it[1]) + '" target="_top" style="animation-delay:' + (n * 18) + 'ms">' +
          '<span class="cmp-link-i">' + (PAGE_ICONS[it[1]] || G[grp.i]) + '</span>' +
          '<span class="cmp-link-t">' + esc(it[0]) + '<span class="cmp-link-sub">' + (here ? 'You are here' : esc(it[2])) + '</span></span>' +
          G.go + '</a>';
        n++;
      }
      if (rows) out += '<div class="cmp-group-label">' + esc(grp.g) + '</div>' + rows;
    }
    if (!out) out = '<div class="cmp-empty">No pages match "' + esc(query) + '".</div>';
    host.innerHTML = out;
  }

  // ---- Profile ----
  function renderProfile(p) {
    var host = $('cmp-profile'); if (!host) return;
    if (!p) {
      host.innerHTML = '<div class="cmp-empty">Sign in to FutureSelf to see your profile here.</div>';
      return;
    }
    var r = readiness(p), done = 0;
    for (var i = 0; i < r.items.length; i++) if (r.items[i].done) done++;
    var pct = r.items.length ? Math.round(done / r.items.length * 100) : 0;
    var C = 2 * Math.PI * 27;
    var schools = names(p.sub_networks);
    var meta = [];
    if (schools.length) meta.push(schools[0]);
    if (p.locations && p.locations.length && p.locations[0].address) meta.push(p.locations[0].address);
    var first = (p.firstname || (p.name || '?')).charAt(0).toUpperCase();

    var h = '<div class="cmp-card"><div class="cmp-id">' +
      '<div class="cmp-ring"><svg viewBox="0 0 64 64"><circle class="cmp-ring-bg" cx="32" cy="32" r="27"/>' +
      '<circle class="cmp-ring-fg" cx="32" cy="32" r="27" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-target="' + (C * (1 - pct / 100)).toFixed(1) + '"/></svg>' +
      '<div class="cmp-ring-in">' + esc(first) + '</div></div>' +
      '<div><div class="cmp-id-name">' + esc(p.name || 'Your profile') + '</div>' +
      (meta.length ? '<div class="cmp-id-meta">' + esc(meta.join(' \u00b7 ')) + '</div>' : '') +
      (p.headline ? '<div class="cmp-id-meta">' + esc(p.headline) + '</div>' : '') +
      '<div class="cmp-id-pct">Profile ' + pct + '% complete</div></div></div></div>';

    if (!r.ready) {
      var list = '';
      for (var k = 0; k < r.items.length; k++) {
        var it = r.items[k];
        list += '<div class="cmp-check-item ' + (it.done ? 'done' : 'todo') + '"><span class="cmp-check-mark">' + (it.done ? '&#10003;' : '') + '</span><span>' + esc(it.label) + '</span></div>';
      }
      h += '<div class="cmp-card"><div class="cmp-card-title">Unlock Compass</div><div class="cmp-checklist" style="max-width:none">' + list + '</div></div>';
    }

    var sk = names(p.skills), ind = names(p.industries);
    if (sk.length || ind.length) {
      h += '<div class="cmp-card">';
      if (ind.length) h += '<div class="cmp-card-title">Industries you\'re exploring</div><div class="cmp-chips">' + chips(ind) + '</div>';
      if (sk.length) h += '<div class="cmp-card-title"' + (ind.length ? ' style="margin-top:14px"' : '') + '>Skills</div><div class="cmp-chips">' + chips(sk) + '</div>';
      h += '</div>';
    }

    if (memory && (memory.focus || memory.summary)) {
      h += '<div class="cmp-card"><div class="cmp-card-title">What Compass remembers</div>' +
        (memory.focus ? '<div class="cmp-rec-t" style="margin-bottom:4px">' + esc(typeof memory.focus === 'string' ? memory.focus : '') + '</div>' : '') +
        (memory.summary ? '<div class="cmp-muted">' + esc(typeof memory.summary === 'string' ? memory.summary : '') + '</div>' : '') +
        '<div class="cmp-muted" style="margin-top:8px;font-size:11.5px">You can clear this anytime with the reset button above.</div></div>';
    }

    h += '<div class="cmp-actions"><a class="cmp-cta" href="' + esc(editURL()) + '" target="_top">Edit profile</a>' +
      '<button class="cmp-ghost" type="button" data-cmp-ask="profile">Get feedback from Compass</button></div>';
    host.innerHTML = h;

    var ring = host.querySelector('.cmp-ring-fg');
    if (ring) setTimeout(function () { ring.style.strokeDashoffset = ring.getAttribute('data-target'); }, 60);
    var ask = host.querySelector('[data-cmp-ask]');
    if (ask) ask.onclick = function () {
      askCompass('Look at my FutureSelf profile and tell me the one change that would strengthen it most for the roles I want.');
    };
  }

  function chips(arr) {
    var out = '';
    for (var i = 0; i < arr.length && i < 12; i++) out += '<span class="cmp-chip">' + esc(arr[i]) + '</span>';
    return out;
  }

  // ---- For you: simple, transparent rules over the profile, plus a Compass-built plan ----
  function pickRecs(p) {
    var recs = [], seen = {};
    function add(title, href, why, icon) {
      if (seen[href] || href === path) return;
      seen[href] = 1; recs.push({ t: title, h: href, w: why, i: icon });
    }
    var r = readiness(p);
    if (p && !r.ready) {
      var d = 0; for (var i = 0; i < r.items.length; i++) if (r.items[i].done) d++;
      add('Finish your profile', editURL(), d + ' of ' + r.items.length + ' steps done. A full profile unlocks Compass and sharper advice.', 'apply');
    }
    var ind = names(p && p.industries), sk = names(p && p.skills);
    var text = (ind.join(' ') + ' ' + sk.join(' ') + ' ' + ((p && p.headline) || '')).toLowerCase();
    var TECH = /tech|software|data|engineer|computer|\bai\b|product|cyber/, BIZ = /financ|bank|consult|business|account|market|sales/, MED = /health|medic|nurs|bio|pharm|clinic/;
    var interests = ind.concat(sk);
    // credit the specific interest that triggered a pick, never a different one
    function because(re, fallback) {
      for (var i2 = 0; i2 < interests.length; i2++) {
        if (re.test(interests[i2].toLowerCase())) return 'Because you\'re exploring ' + interests[i2] + '. ' + fallback;
      }
      return fallback;
    }
    if (TECH.test(text)) {
      add('AI Skills', '/page/get-smart-on-ai', because(TECH, 'AI fluency is showing up in more job descriptions.'), 'grow');
      add('Certifications', '/page/explore-certifications', because(TECH, 'A focused credential can set your resume apart.'), 'grow');
    }
    if (BIZ.test(text)) {
      add('Coffee Chats', '/page/coffee-chats-and-cold-calls', because(BIZ, 'These fields lean heavily on networking.'), 'apply');
      add('Business News', '/news', because(BIZ, 'Staying current helps in interviews.'), 'grow');
    }
    if (MED.test(text)) {
      add('Explore Companies', '/page/explore-companies', because(MED, 'Find employers hiring in your field.'), 'careers');
    }
    add('Internship Database', '/page/internship-database', 'New listings are added regularly.', 'careers');
    add('Entry-Level Job Database', '/page/entryleveljobs', 'Full-time roles for graduating students.', 'careers');
    add('Application Essentials', '/page/application-necessities', 'Get your resume and cover letter ready to send.', 'apply');
    add('Explore Companies', '/page/explore-companies', 'Build a target list before you apply.', 'careers');
    return recs.slice(0, 4);
  }

  function renderForYou(p) {
    var host = $('cmp-foryou'); if (!host) return;
    var hi = userName ? 'Your next moves, ' + esc(userName) : 'Your next moves';
    var h = '<div class="cmp-plan"><span class="cmp-plan-i">' + (ICONS.spark || '') + '</span><div>' +
      '<div class="cmp-plan-t">' + hi + '</div>' +
      '<div class="cmp-plan-s">Compass reads your profile and goals and builds a short plan for this week.</div>' +
      '<button class="cmp-cta" type="button" data-cmp-ask="plan">Build my plan</button></div></div>';
    var recs = pickRecs(p);
    if (recs.length) {
      h += '<div class="cmp-card-title" style="margin:18px 2px 0">Picked from your profile</div>';
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        h += '<a class="cmp-rec" href="' + esc(r.h) + '" target="_top">' +
          '<span class="cmp-link-i">' + (PAGE_ICONS[r.h] || G[r.i]) + '</span>' +
          '<span class="cmp-link-t"><span class="cmp-rec-t">' + esc(r.t) + '</span><span class="cmp-rec-why" style="display:block">' + esc(r.w) + '</span></span>' +
          G.go + '</a>';
      }
    }
    host.innerHTML = h;
    var btn = host.querySelector('[data-cmp-ask]');
    if (btn) btn.onclick = function () {
      askCompass('Based on my profile and goals, what are the three most useful things I should do this week? Point me to the right FutureSelf pages.');
    };
  }

  // ---- the compass mark stays on the newest reply only ----
  function markLatest() {
    var body = $('cmp-body'); if (!body) return;
    var rows = body.querySelectorAll('.cmp-row-ai');
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('cmp-latest', i === rows.length - 1);
    refreshWaypointBtn();
  }
  if ($('cmp-body') && window.MutationObserver) new MutationObserver(markLatest).observe($('cmp-body'), { childList: true });

  // ===========================================================================
  // Waypoints: every question is a stop. Jump back to it, or resume the
  // conversation from there so Compass only sees the context up to that point.
  // ===========================================================================
  var branchBackup = null;

  function stops() {
    var out = [];
    for (var i = 0; i < history.length; i++) {
      if (history[i].role !== 'user') continue;
      var next = history[i + 1];
      out.push({ i: i, q: String(history[i].content || ''), ts: history[i].timestamp,
                 a: next && next.role === 'assistant' ? next.content : '' });
    }
    return out;
  }

  function plain(md) {
    var t = parseReply(String(md || '')).reply;
    return t.replace(/<[^>]*>/g, '').replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
  }

  function timeLabel(ts) {
    if (!ts) return '';
    var d = new Date(ts); if (isNaN(d)) return '';
    var now = new Date();
    try {
      return d.toDateString() === now.toDateString()
        ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function refreshWaypointBtn() {
    var btn = $('cmp-wp-btn'), cnt = $('cmp-wp-count'); if (!btn) return;
    var n = routed ? stops().length : 0;
    btn.hidden = n < 1;
    if (btn.parentNode) btn.parentNode.classList.toggle('cmp-has-wp', n >= 1);
    if (cnt) cnt.textContent = n;
    if (n < 1) toggleWaypoints(false);
  }

  function toggleWaypoints(open) {
    var panel = $('cmp-wp-panel'), btn = $('cmp-wp-btn'); if (!panel || !btn) return;
    if (open === undefined) open = panel.hidden;
    if (open) renderWaypoints();
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function renderWaypoints() {
    var host = $('cmp-wp-list'); if (!host) return;
    var list = stops(), h = '';
    for (var k = 0; k < list.length; k++) {
      var s = list[k], last = k === list.length - 1;
      var preview = plain(s.a);
      if (preview.length > 70) preview = preview.slice(0, 68) + '...';
      var meta = [timeLabel(s.ts), preview].filter(Boolean).join(' \u00b7 ');
      h += '<div class="cmp-wp-item' + (last ? ' current' : '') + '" style="animation-delay:' + (k * 30) + 'ms">' +
        '<div class="cmp-wp-rail"><span class="cmp-wp-dot"></span></div>' +
        '<div class="cmp-wp-main"><div class="cmp-wp-q">' + esc(s.q) + '</div>' +
        (meta ? '<div class="cmp-wp-meta">' + esc(meta) + '</div>' : '') +
        '<div class="cmp-wp-acts"><button class="cmp-wp-act" type="button" data-jump="' + s.i + '">Jump to</button>' +
        (last ? '' : '<button class="cmp-wp-act primary" type="button" data-resume="' + s.i + '">Resume from here</button>') +
        '</div></div></div>';
    }
    host.innerHTML = h;
    host.scrollTop = host.scrollHeight;
  }

  function jumpTo(i) {
    toggleWaypoints(false);
    var body = $('cmp-body'); if (!body) return;
    var row = body.querySelector('.cmp-row-usr[data-hi="' + i + '"]'); if (!row) return;
    var top = row.offsetTop - 14;
    try { body.scrollTo({ top: top, behavior: 'smooth' }); } catch (e) { body.scrollTop = top; }
    row.classList.remove('cmp-flash'); void row.offsetWidth; row.classList.add('cmp-flash');
    setTimeout(function () { row.classList.remove('cmp-flash'); }, 1700);
  }

  function resumeFrom(i) {
    toggleWaypoints(false);
    var end = (history[i + 1] && history[i + 1].role === 'assistant') ? i + 2 : i + 1;
    if (!branchBackup) branchBackup = history.slice();
    history = history.slice(0, end);
    renderHistory();
    var body = $('cmp-body'); if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-branch'; div.id = 'cmp-branch';
    div.innerHTML = '<span class="cmp-branch-i">' + (ICONS.flag || '') + '</span><span>Picked up from this waypoint</span>' +
      '<button type="button">Undo</button>';
    div.querySelector('button').onclick = function () {
      if (!branchBackup) return;
      history = branchBackup; branchBackup = null;
      renderHistory();
    };
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    var qr = $('cmp-qr'); if (qr) qr.innerHTML = '';
    var inp3 = $('cmp-input'); if (inp3 && canHover) inp3.focus();
  }

  // once a new message is sent on the resumed path, that path becomes the conversation
  function commitBranch() {
    if (!branchBackup) return;
    branchBackup = null;
    var d = $('cmp-branch'); if (d) { var b2 = d.querySelector('button'); if (b2) b2.parentNode.removeChild(b2); d.removeAttribute('id'); }
  }
  var _fsSend = window.fsSend, _fsPill = window.fsPill;
  window.fsSend = function () { commitBranch(); return _fsSend.apply(this, arguments); };
  window.fsPill = function () { commitBranch(); return _fsPill.apply(this, arguments); };

  (function wireWaypoints() {
    var btn = $('cmp-wp-btn'), panel = $('cmp-wp-panel'), list = $('cmp-wp-list');
    if (!btn || !panel || !list) return;
    btn.addEventListener('click', function (e) { e.stopPropagation(); toggleWaypoints(); });
    list.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-jump],[data-resume]') : null;
      if (!t) return;
      if (t.hasAttribute('data-jump')) jumpTo(+t.getAttribute('data-jump'));
      else resumeFrom(+t.getAttribute('data-resume'));
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) toggleWaypoints(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleWaypoints(false); });
  })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fsBoot);
  } else {
    setTimeout(fsBoot, 0);
  }
})();
