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
  try {
    var __snap = JSON.parse(sessionStorage.getItem('cmp_ui_v1') || 'null');
    if (__snap && Date.now() - __snap.at < 1800000) { var __r = document.getElementById('cmp-widget-root'); if (__r) __r.classList.add('cmp-instant'); }
  } catch (e) {}

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
  var ICONS = window.__FS_ICONS__ || {};
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
    // 0. [[Name]] marks a company/community Compass mentioned; style the first mention only
    var ents = [], seenEnt = {};
    t = t.replace(/\[\[([^\[\]\n]{2,60})\]\]/g, function (m, name) {
      name = name.trim(); var k = name.toLowerCase();
      if (seenEnt[k]) return name;
      seenEnt[k] = 1; ents.push(name);
      return '\u0002' + (ents.length - 1) + '\u0002';
    });
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
    }).replace(/\u0002(\d+)\u0002/g, function (m, n) {
      return '<span class="cmp-entity" title="No FutureSelf page yet">' + esc(ents[+n]) + '</span>';
    });
  }

  // ---- gentle suggestions (profile + notepad) --------------------------------
  // Compass writes its own wording ("ask"); the widget only paces them so
  // they never crowd the conversation.
  var sugState = { profileAsks: 0, lastProfileTurn: -99, noteAsks: 0, accepted: [] };
  var pendingNoteSuggestion = null;

  function userTurns() {
    var n = 0; for (var i = 0; i < history.length; i++) if (history[i].role === 'user') n++; return n;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function cleanAsk(t) {
    t = String(t || '').replace(/[\r\n]+/g, ' ').trim();
    return t.length > 220 ? t.slice(0, 217) + '...' : t;
  }
  function profileAskFallback(label) {
    var x = '<strong>' + esc(label) + '</strong>';
    return pick([
      x + ' keeps coming up. Should it go on your profile so others can see it?',
      'Sounds like ' + x + ' is a real thread for you. Add it to your profile? It sharpens what I suggest next.',
      'Worth putting ' + x + ' on your profile? It helps people find you, and helps me tailor advice.'
    ]);
  }
  function noteAskFallback(kind, text) {
    var x = '<strong>' + esc(text) + '</strong>';
    return kind === 'note'
      ? pick(['Should I jot ' + x + ' in your notes?', 'Keep ' + x + ' in your notes for later?'])
      : pick(['Should I put ' + x + ' on your to-do list?', 'Want to keep ' + x + ' in your tasks so it doesn\'t slip?', 'Add ' + x + ' to your tasks?']);
  }

  var SUG_ICON = {
    profile: '<svg viewBox="0 0 24 24" class="cmp-i"><circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 19.5c.9-3.6 3.8-5.6 7.25-5.6s6.35 2 7.25 5.6"/></svg>',
    task: '<svg viewBox="0 0 24 24" class="cmp-i"><rect x="4.5" y="4.5" width="15" height="15" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
    note: '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M6.5 3.5h8l3 3v14h-11Z"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/></svg>'
  };

  function sugCard(id, kind, html, yesLabel, onYes, onNo) {
    var body = document.getElementById('cmp-body'); if (!body) return;
    var old = document.getElementById(id); if (old && old.parentNode) old.parentNode.removeChild(old);
    var div = document.createElement('div');
    div.className = 'cmp-sug'; div.id = id;
    div.innerHTML = '<span class="cmp-sug-i">' + SUG_ICON[kind] + '</span>' +
      '<div class="cmp-sug-main"><div class="cmp-sug-q">' + html + '</div>' +
      '<div class="cmp-sug-acts"><button type="button" class="cmp-sug-yes">' + esc(yesLabel) + '</button>' +
      '<button type="button" class="cmp-sug-no">Not now</button></div></div>';
    div.querySelector('.cmp-sug-yes').onclick = function () { onYes(div); };
    div.querySelector('.cmp-sug-no').onclick = function () { if (onNo) onNo(); fadeOut(div); };
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }
  function fadeOut(el) { el.classList.add('cmp-sug-out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260); }
  function resolveCard(el, html) {
    el.classList.add('cmp-sug-done');
    var m = el.querySelector('.cmp-sug-main');
    if (m) m.innerHTML = '<div class="cmp-sug-ok">' + html + '</div>';
  }

  function maybeProfileSuggestion(sug) {
    var allowed = ['skills','industries_of_interest','hobbies_interests','clubs_and_organizations','languages','awards_honors','currently_exploring','target_cities_regions','career_priorities','bio'];
    if (!sug || !sug.field || !sug.value || allowed.indexOf(sug.field) === -1) return false;
    var v = String(sug.value);
    if (declinedSuggestions.indexOf(v) > -1 || sugState.accepted.indexOf(v) > -1) return false;
    var turns = userTurns();
    // patience: never in the first exchange, at least 3 turns apart, 2 per session
    if (turns < 2 || turns - sugState.lastProfileTurn < 3 || sugState.profileAsks >= 2) return false;
    sugState.profileAsks++; sugState.lastProfileTurn = turns;
    pendingProfileSuggestion = sug;
    var label = sug.label || v;
    var ask = sug.ask ? esc(cleanAsk(sug.ask)) : profileAskFallback(label);
    sugCard('cmp-sug-profile', 'profile', ask, 'Add to profile', function (el) {
      saveProfile(sug, el);
    }, function () { declinedSuggestions.push(v); pendingProfileSuggestion = null; });
    return true;
  }

  function saveProfile(sug, el) {
    pendingProfileSuggestion = null;
    if (!hbUserId) { resolveCard(el, 'Sign in to save this to your profile.'); return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', PROXY_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var r = {}; try { r = JSON.parse(xhr.responseText) || {}; } catch (e) {}
        if (r.ok === true) {
          sugState.accepted.push(String(sug.value));
          var line = r.pushed
            ? pick(['Added to your profile.', 'Done, it\'s on your profile now.', 'Your profile has it now.'])
            : pick(['Saved. It\'ll show on your profile soon.', 'Got it, it\'s queued for your profile.', 'Done. Your profile will pick that up shortly.']);
          var link = r.pushed ? ' <a href="' + esc(editURL()) + '" target="_top">View profile</a>' : '';
          resolveCard(el, '<span class="cmp-sug-tick">' + SUG_ICON.task + '</span>' + line + link);
        } else resolveCard(el, 'That didn\'t save. I\'ll offer again another time.');
      };
      xhr.send(JSON.stringify({ type: 'save_profile', userId: hbUserId, field: sug.field, value: sug.value }));
    } catch (e) {}
  }

  function lastAssistantTs() {
    for (var i = history.length - 1; i >= 0; i--) if (history[i].role === 'assistant') return history[i].timestamp || null;
    return null;
  }

  // Compass proposed changes to the to-do list; the student picks what to keep
  function maybeTodoActions(ta) {
    if (!ta || !window.cmpNotepad) return false;
    var items = Array.isArray(ta) ? ta : (Array.isArray(ta.items) ? ta.items : []);
    var valid = [];
    items.slice(0, 12).forEach(function (it) {
      if (!it || !it.op) return;
      if (it.op === 'add' && it.text) valid.push(it);
      else if (['complete', 'rename', 'steps'].indexOf(it.op) > -1 && it.id) {
        var t = window.cmpNotepad.find(it.id);
        if (!t || t.done) return;
        if (it.op === 'rename' && !it.text) return;
        if (it.op === 'steps' && !(Array.isArray(it.steps) && it.steps.length)) return;
        it._title = t.text; valid.push(it);
      }
    });
    if (!valid.length) return false;
    var srcTs = lastAssistantTs();
    var label = { add: 'New', complete: 'Done', rename: 'Clarify', steps: 'Steps' };
    var html = esc(cleanAsk(ta.ask || (valid.length === 1 ? 'Save this change to your to-do list?' : 'Save these changes to your to-do list?'))) + '<ul class="cmp-sug-list">';
    valid.forEach(function (it, i) {
      var main = it.op === 'add' ? esc(String(it.text).replace(/\[\[|\]\]/g, '')) : esc(it._title);
      var sub = it.op === 'rename' ? 'becomes: ' + esc(it.text)
        : it.op === 'steps' ? it.steps.slice(0, 6).map(function (x, k) { return (k + 1) + '. ' + esc(String(x).replace(/\[\[|\]\]/g, '')); }).join('<br>') : '';
      html += '<li><input type="checkbox" checked data-i="' + i + '" aria-label="Include this change"><span><span class="cmp-sug-op">' + label[it.op] + '</span>' + main +
        (sub ? '<span class="cmp-sug-sub">' + sub + '</span>' : '') + '</span></li>';
    });
    html += '</ul>';
    sugCard('cmp-sug-todo', 'task', html, valid.length === 1 ? 'Save change' : 'Save changes', function (el) {
      var picked = [];
      [].forEach.call(el.querySelectorAll('.cmp-sug-list input'), function (cb) { if (cb.checked) picked.push(valid[+cb.getAttribute('data-i')]); });
      if (!picked.length) { fadeOut(el); return; }
      var changed = window.cmpNotepad.apply(picked, srcTs);
      resolveCard(el, '<span class="cmp-sug-tick">' + SUG_ICON.task + '</span>Updated ' + changed.length + ' item' + (changed.length === 1 ? '' : 's') + '. <button type="button" class="cmp-sug-open">Open to-do list</button>');
      var b = el.querySelector('.cmp-sug-open');
      if (b) b.onclick = function () { window.cmpNotepad.open('todo', changed[0]); };
    });
    return true;
  }

  // a Compass-saved task can jump back to the conversation it came from
  window.cmpCanJumpTo = function (ts) {
    for (var i = 0; i < history.length; i++) if (history[i].timestamp === ts) return true;
    return false;
  };
  window.cmpJumpToTs = function (ts) {
    var idx = -1;
    for (var i = 0; i < history.length; i++) if (history[i].timestamp === ts) { idx = i; break; }
    if (idx < 0) return;
    var u = idx; while (u >= 0 && history[u].role !== 'user') u--;
    if (window.fsOpenView) window.fsOpenView('chat');
    setTimeout(function () { if (u >= 0) jumpTo(u); }, 120);
  };

  function maybeNoteSuggestion(ns) {
    if (!ns || !ns.text || !window.cmpNotepad) return false;
    var kind = ns.kind === 'note' ? 'note' : 'task';
    var text = String(ns.text).replace(/\[\[|\]\]/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
    if (!text) return false;
    var lastUser = ''; for (var i = history.length - 1; i >= 0; i--) if (history[i].role === 'user') { lastUser = String(history[i].content || ''); break; }
    var asked = /\b(remind|reminder|to-?do|task|note|remember|jot|save (this|that|it)|keep track|list)\b/i.test(lastUser);
    var open = window.cmpNotepad.openCount();
    // a helper, not a nag: one unprompted offer per session, none if the list is already full
    if (!asked && (sugState.noteAsks >= 1 || open >= 5)) return false;
    if (window.cmpNotepad.has(text)) return false;
    sugState.noteAsks++;
    var ask = ns.ask ? esc(cleanAsk(ns.ask)) : noteAskFallback(kind, text);
    if (ns.ask) ask += '<span class="cmp-sug-item">' + esc(text) + '</span>';
    sugCard('cmp-sug-note', kind, ask, kind === 'note' ? 'Add to notes' : 'Add to tasks', function (el) {
      var id = window.cmpNotepad.add(kind, text, 'compass', { srcTs: lastAssistantTs() });
      resolveCard(el, '<span class="cmp-sug-tick">' + SUG_ICON.task + '</span>' +
        (kind === 'note' ? 'Added to your notes.' : 'Added to your tasks.') +
        ' <button type="button" class="cmp-sug-open">Open notepad</button>');
      var b = el.querySelector('.cmp-sug-open');
      if (b) b.onclick = function () { window.cmpNotepad.open(kind === 'note' ? 'notes' : 'todo', id); };
    });
    return true;
  }

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
      memoryContext: buildMemoryContext(),
      notepadContext: (window.cmpNotepad && window.cmpNotepad.summary) ? window.cmpNotepad.summary() : ''
    };
  }

  // fetch memory (including conversation_history) from Supabase via the proxy
  function fetchMemory(done) {
    var called = false;
    function cb(v) { if (called) return; called = true; done(v); }   // error + readyState 4 both fire on failure
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
      if (history[i].role === 'assistant') {
        var p = parseReply(history[i].content);
        addAI(p.reply, false, { ts: history[i].timestamp, ai: i, actions: i > 0 && history[i - 1].role === 'user', recal: history[i].recalAt || null });
      }
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
        applyRecals();
        if (history.length > 0) { renderHistory(); sinceLastTimePills(); }
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
    if (!routed || busy) return;
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
    if (!routed || busy) return;
    if (text === SINCE_LABEL) text = SINCE_PROMPT;
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
          profile_suggestion: pb.profile_suggestion || null,
          notepad_suggestion: pb.notepad_suggestion || null,
          todo_actions: pb.todo_actions || null
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

    var taRes = extractBlob(reply, /\{\s*"todo_actions"/);
    var salvagedTodo = null;
    if (taRes) {
      if (taRes.obj && taRes.obj.todo_actions) salvagedTodo = taRes.obj.todo_actions;
      reply = taRes.cleaned;
    }
    var npRes = extractBlob(reply, /\{\s*"notepad_suggestion"/);
    var salvagedNote = null;
    if (npRes) {
      if (npRes.obj && npRes.obj.notepad_suggestion) salvagedNote = npRes.obj.notepad_suggestion;
      reply = npRes.cleaned;
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

    if (salvagedTodo) {
      memoryUpdate = memoryUpdate || {};
      if (!memoryUpdate.todo_actions) memoryUpdate.todo_actions = salvagedTodo;
    }
    if (salvagedNote) {
      memoryUpdate = memoryUpdate || {};
      if (!memoryUpdate.notepad_suggestion) memoryUpdate.notepad_suggestion = salvagedNote;
    }
    return { reply: reply, suggestions: suggestions, memoryUpdate: memoryUpdate };
  }

  // ---- talking to Compass: streamed replies ----
  // The proxy sends newline-delimited JSON: {"d":"..."} pieces while the model
  // writes, then {"done":true,"content":"..."} with the cleaned reply. Older
  // proxies (or errors) answer with plain JSON, which is handled the same way.
  var busy = false;

  function wire(msgs) {
    return msgs.map(function (m) { return { role: m.role, content: m.content, timestamp: m.timestamp }; });
  }

  function requestChat(msgs, onPiece, onDone) {
    var xhr = new XMLHttpRequest(), seen = 0, got = '', final = null, ended = false;
    xhr.open('POST', PROXY_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    function drain() {
      var txt = xhr.responseText || '', nl;
      while ((nl = txt.indexOf('\n', seen)) > -1) {
        var line = txt.slice(seen, nl); seen = nl + 1;
        if (!line) continue;
        var o = null; try { o = JSON.parse(line); } catch (e) {}
        if (!o) continue;
        if (typeof o.d === 'string') { got += o.d; onPiece(got); }
        else if (o.done && typeof o.content === 'string') final = o.content;
      }
    }
    xhr.onprogress = drain;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4 || ended) return;
      ended = true;
      try { drain(); } catch (e) {}
      var raw = final;
      if (raw == null) {
        try {
          var data = JSON.parse(xhr.responseText);
          raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          if (!raw && data && (data.choices || data.error)) raw = "I'm having trouble connecting right now. Try again in a moment.";
        } catch (e) {}
      }
      if (raw == null && got) raw = got;
      onDone(raw || null);
    };
    xhr.send(JSON.stringify({
      type: 'chat', stream: true,
      sessionId: sessionId, page: path,
      profileName: (profile && profile.name) || null,
      context: buildContext(),
      messages: wire(msgs)
    }));
  }

  // what's safe to show of a reply that is still arriving: nothing from the
  // JSON tail, and no half-written link, entity or bold run
  function streamVisible(t) {
    var m = t.search(/\{\s*"|```/);
    if (m > -1) t = t.slice(0, m);
    return t.replace(/\{\s*$/, '');
  }
  function safePartial(t) {
    var lt = t.lastIndexOf('<'); if (lt > t.lastIndexOf('>')) t = t.slice(0, lt);
    var low = t.toLowerCase(), oa = low.lastIndexOf('<a ');
    if (oa > -1 && low.indexOf('</a>', oa) === -1) t = t.slice(0, oa);
    var en = t.lastIndexOf('[['); if (en > -1 && t.indexOf(']]', en) === -1) t = t.slice(0, en);
    var br = t.lastIndexOf('[');
    if (br > -1) { var tail = t.slice(br); if (/^\[[^\]]*$/.test(tail) || /^\[[^\]]*\]\([^)]*$/.test(tail)) t = t.slice(0, br); }
    if ((t.match(/\*\*/g) || []).length % 2) t = t.slice(0, t.lastIndexOf('**'));
    return t;
  }
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // reveals text into `host` a few words at a time; speeds up when it falls behind
  function revealer(host, onTick) {
    var src = '', finalText = null, cur = '', timer = null, onEnd = null;
    function target() { return finalText != null ? finalText : streamVisible(src); }
    function paint() { host.innerHTML = renderMarkdown(finalText != null && cur === finalText ? cur : safePartial(cur)); onTick && onTick(cur); }
    function tick() {
      var t = target();
      if (t.indexOf(cur) !== 0) { var k = 0; while (k < cur.length && k < t.length && cur[k] === t[k]) k++; cur = t.slice(0, k); }
      if (cur.length < t.length) {
        if (reduceMotion || document.hidden || (finalText != null && /<(ul|ol|table|div|h\d)\b/i.test(finalText))) cur = t;
        else {
          var back = t.length - cur.length;
          var next = cur.length + Math.max(4, Math.ceil(back * (finalText != null ? 0.11 : 0.05)));
          var ws = t.slice(next).search(/\s/);
          cur = t.slice(0, ws === -1 ? t.length : next + ws);
        }
        paint();
      } else if (finalText != null) {
        clearInterval(timer); timer = null;
        var f = onEnd; onEnd = null; if (f) f();
      }
    }
    function run() { if (!timer) timer = setInterval(tick, 34); }
    return {
      feed: function (s) { src = s; run(); },
      end: function (text, cb) { finalText = String(text || ''); onEnd = cb; run(); },
      shown: function () { return cur.length > 0; }
    };
  }

  function nearBottom(body) { return body.scrollHeight - body.scrollTop - body.clientHeight < 80; }

  function callAPI() {
    busy = true;
    var t = showTyping();
    var body = $('cmp-body');
    var rv = revealer(t.out, function () {
      t.writing();
      if (body && t.stick()) body.scrollTop = body.scrollHeight;
    });
    requestChat(history, function (soFar) { rv.feed(soFar); }, function (raw) {
      if (!raw) {
        t.remove(); busy = false;
        addAI("Something went wrong on my end. Please try again.", true);
        return;
      }
      var parsed = parseReply(raw);
      // save right away so the turn survives a page change mid-reveal
      var turnTs = new Date().toISOString();   // one timestamp for chat + memory, so jump-backs survive reloads
      history.push({ role: 'assistant', content: raw, timestamp: turnTs });
      var aiIndex = history.length - 1;
      var lastUser = history.length > 1 ? history[history.length - 2] : null;
      var mu = parsed.memoryUpdate || {};
      pushMemory({
        knowledge: mu.knowledge || [],
        currentTerm: (mu.current_term && Object.keys(mu.current_term).length) ? mu.current_term : undefined,
        direction: (mu.direction && Object.keys(mu.direction).length) ? mu.direction : undefined,
        focus: mu.focus || undefined,
        summary: mu.summary || undefined,
        topics: (mu.topics && mu.topics.length) ? mu.topics : undefined,
        conversationTurn: lastUser ? { user: lastUser.content, assistant: parsed.reply, timestamp: turnTs } : undefined
      });
      rv.end(parsed.reply, function () {
        t.finish(parsed.reply, { ts: turnTs, ai: aiIndex, actions: true });
        busy = false;
        if (parsed.suggestions.length > 0) setPills(parsed.suggestions);
        // at most one gentle offer per reply; Compass writes the wording,
        // the widget paces it (see maybeProfileSuggestion / maybeNoteSuggestion)
        if (!maybeTodoActions(mu.todo_actions) && !maybeNoteSuggestion(mu.notepad_suggestion)) maybeProfileSuggestion(mu.profile_suggestion);
      });
    });
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
  var LOADER = '<span class="cmp-orbit" aria-hidden="true">' +
    '<span style="--a:90deg;--d:0s"><i></i></span><span style="--a:210deg;--d:-.35s"><i></i></span><span style="--a:330deg;--d:-.7s"><i></i></span></span>';

  // the progress row: dots + a label that steps through the work. It stays
  // under the text while the reply streams in and leaves once it's complete.
  function progress(label) {
    var el = document.createElement('div');
    el.className = 'cmp-think';
    el.setAttribute('role', 'status');
    el.innerHTML = LOADER + '<span class="cmp-think-label">' + esc(label) + '</span>';
    var idx = 0, labels = thinkLabels(), lab = el.querySelector('.cmp-think-label');
    function set(i) {
      idx = i; lab.textContent = labels[i];
      lab.classList.remove('cmp-think-swap'); void lab.offsetWidth; lab.classList.add('cmp-think-swap');
    }
    var timer = setInterval(function () { if (idx < labels.length - 1) set(idx + 1); else { clearInterval(timer); timer = null; } }, 2400);
    return {
      el: el,
      writing: function () { if (!el.classList.contains('cmp-think-tail')) { el.classList.add('cmp-think-tail'); if (idx < 2) set(2); } },
      stop: function (cb) {
        if (timer) { clearInterval(timer); timer = null; }
        el.classList.add('cmp-think-out');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (cb) cb(); }, 260);
      }
    };
  }

  function showTyping() {
    var body = $('cmp-body');
    var div = document.createElement('div');
    div.className = 'cmp-row cmp-row-ai';
    div.id = 'cmp-typing';
    div.innerHTML = '<div class="cmp-av">' + icon + '</div><div class="cmp-msg cmp-ai"><div class="cmp-out"></div></div>';
    var msg = div.querySelector('.cmp-ai'), out = div.querySelector('.cmp-out');
    var pr = progress(thinkLabels()[0]);
    msg.appendChild(pr.el);
    var stick = true;
    if (body) {
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
      var onScroll = function () { stick = nearBottom(body); };
      body.addEventListener('scroll', onScroll);
    }
    return {
      out: out,
      writing: pr.writing,
      stick: function () { return stick; },
      remove: function () { pr.stop(); if (div.parentNode) div.parentNode.removeChild(div); if (body) body.removeEventListener('scroll', onScroll); },
      finish: function (text, opts) {
        if (body) body.removeEventListener('scroll', onScroll);
        div.removeAttribute('id');
        out.innerHTML = renderMarkdown(text);
        linkDirectory(out);
        pr.stop(function () { decorateAI(div, opts); if (body && stick) body.scrollTop = body.scrollHeight; });
      }
    };
  }

  function hideTyping() {
    var t = $('cmp-typing');
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }

  // first pill on a fresh visit when there's enough history to catch up on
  var SINCE_LABEL = 'Since last time';
  var SINCE_PROMPT = 'Since last time: where did we leave off, and what should I focus on next?';
  var SINCE_ICON = '<svg viewBox="0 0 24 24" class="cmp-i"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/><path d="M12 8v4.5l3 2"/></svg>';

  function sinceLastTimePills() {
    var asked = 0;
    for (var i = 0; i < history.length; i++) if (history[i].role === 'user') asked++;
    if (asked < 3) return;
    var last = null;
    for (var j = history.length - 1; j >= 0; j--) if (history[j].role === 'assistant') { last = history[j]; break; }
    var more = last ? parseReply(last.content).suggestions.slice(0, 2) : [];
    setPills([SINCE_LABEL].concat(more.filter(function (x) { return x !== SINCE_LABEL; })));
  }

  function setPills(arr) {
    var c = document.getElementById('cmp-qr');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < arr.length; i++) {
      var p = document.createElement('div');
      p.className = 'cmp-pill';
      if (arr[i] === SINCE_LABEL) { p.className += ' cmp-pill-since'; p.innerHTML = SINCE_ICON + '<span>' + SINCE_LABEL + '</span>'; }
      else p.innerText = arr[i];
      p.onclick = (function (t) { return function () { fsPill(t); }; })(arr[i]);
      c.appendChild(p);
    }
  }

  // ---- company / community directory: exact name mentions become links ----
  var DIRECTORY = null;
  (function loadDirectory() {
    try { var c = JSON.parse(sessionStorage.getItem('cmp_dir_v1') || 'null'); if (c && Date.now() - c.at < 1800000) { DIRECTORY = c.entries; return; } } catch (e) {}
    try {
      var x = new XMLHttpRequest();
      x.open('POST', PROXY_URL, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.onreadystatechange = function () {
        if (x.readyState !== 4) return;
        try { DIRECTORY = (JSON.parse(x.responseText).entries || []); sessionStorage.setItem('cmp_dir_v1', JSON.stringify({ at: Date.now(), entries: DIRECTORY })); } catch (e) { DIRECTORY = DIRECTORY || []; }
      };
      x.send(JSON.stringify({ type: 'directory' }));
    } catch (e) {}
  })();

  function linkDirectory(root) {
    if (!root) return;
    var ents = (DIRECTORY || []).filter(function (e) { return e && e.name && /^https:\/\/(www\.)?futureselfdiscover\.com\//.test(e.url); })
      .sort(function (a, b) { return b.name.length - a.name.length; });
    var byName = {}; ents.forEach(function (e) { byName[e.name.toLowerCase()] = e; });
    var done = {};
    function mkLink(e, text) {
      var a = document.createElement('a');
      a.href = e.url; a.target = '_top'; a.rel = 'noopener'; a.className = 'cmp-dir-link';
      a.title = 'View ' + (e.kind === 'community' ? 'community' : 'company') + ' page';
      a.textContent = text; return a;
    }
    // names Compass marked: link if a page exists, otherwise they stay as quiet gray mentions
    [].forEach.call(root.querySelectorAll('.cmp-entity'), function (sp) {
      var e = byName[sp.textContent.trim().toLowerCase()];
      done[sp.textContent.trim().toLowerCase()] = true;
      if (e) { sp.parentNode.replaceChild(mkLink(e, sp.textContent), sp); done[e.url] = true; }
    });
    // plain mentions of names that have a page: first occurrence only
    ents.forEach(function (e) {
      if (done[e.url] || done[e.name.toLowerCase()]) return;
      var rx = new RegExp('(^|[^A-Za-z0-9])(' + e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z0-9])');
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false), n;
      while ((n = walker.nextNode())) {
        if (n.parentNode.closest && n.parentNode.closest('a, .cmp-entity')) continue;
        var m = rx.exec(n.nodeValue); if (!m) continue;
        var after = n.splitText(m.index + m[1].length); after.nodeValue = after.nodeValue.slice(m[2].length);
        after.parentNode.insertBefore(mkLink(e, m[2]), after);
        done[e.url] = true; break;
      }
    });
  }

  // opts: ts (reply timestamp), ai (index in history), actions (show quick actions), recal (recalibrated)
  function addAI(text, scroll, opts) {
    var body = document.getElementById('cmp-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'cmp-row cmp-row-ai';
    div.innerHTML = '<div class="cmp-av">' + icon + '</div><div class="cmp-msg cmp-ai"><div class="cmp-out">' + renderMarkdown(text) + '</div></div>';
    linkDirectory(div.querySelector('.cmp-out'));
    decorateAI(div, opts);
    body.appendChild(div);
    if (scroll) body.scrollTop = body.scrollHeight;
    return div;
  }

  function decorateAI(div, opts) {
    opts = opts || {};
    if (opts.ts) div.setAttribute('data-ts', opts.ts);
    if (opts.ai != null) div.setAttribute('data-ai', opts.ai);
    var msg = div.querySelector('.cmp-ai'); if (!msg) return;
    var old = msg.querySelector('.cmp-recal-tag'); if (old) old.parentNode.removeChild(old);
    if (opts.recal) {
      var tag = document.createElement('div');
      tag.className = 'cmp-recal-tag';
      tag.innerHTML = (ICONS.recal || '') + '<span>Recalibrated ' + esc(timeAgo(opts.recal)) + '</span><button type="button" data-unrecal="1">Undo</button>';
      msg.appendChild(tag);
    }
    if (opts.actions && !msg.querySelector('.cmp-acts')) {
      var acts = document.createElement('div');
      acts.className = 'cmp-acts';
      acts.setAttribute('role', 'toolbar');
      acts.setAttribute('aria-label', 'Reply actions');
      acts.innerHTML =
        '<button class="cmp-act" type="button" data-act="note" title="Save to notes" aria-label="Save to notes">' + (ICONS.notepad || '') + '</button>' +
        '<button class="cmp-act" type="button" data-act="task" title="Make a task" aria-label="Make a task">' + (ICONS.task || '') + '</button>' +
        '<button class="cmp-act" type="button" data-act="copy" title="Copy" aria-label="Copy">' + (ICONS.copy || '') + '</button>';
      msg.appendChild(acts);
    }
  }

  function timeAgo(ts) {
    var d = new Date(ts); if (isNaN(d)) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    return timeLabel(ts);
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
    if (v === 'chat' && !routed) verifyAndRoute();
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
    return t.replace(/\[\[|\]\]/g, '').replace(/<[^>]*>/g, '').replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
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

  // ---- pins + recalibrations live on this device, keyed by the question's timestamp ----
  function userKey(name) { return name + '_' + String(hbUserId || (window.__HB_USER__ && window.__HB_USER__.id) || 'anon'); }
  function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function stopKey(s) { return s.ts || ('q:' + s.q.slice(0, 80)); }
  function pins() { return readJSON(userKey('cmp_pins_v1'), {}); }
  function togglePin(k) { var p = pins(); if (p[k]) delete p[k]; else p[k] = Date.now(); writeJSON(userKey('cmp_pins_v1'), p); }

  // put saved recalibrations back over the stored answers after a reload
  function applyRecals() {
    var r = readJSON(userKey('cmp_recal_v1'), {});
    for (var i = 0; i < history.length - 1; i++) {
      var u = history[i], a = history[i + 1];
      if (u.role !== 'user' || a.role !== 'assistant' || !u.timestamp || !r[u.timestamp] || a.recalAt) continue;
      a.orig = a.content; a.content = r[u.timestamp].content; a.recalAt = r[u.timestamp].at;
    }
  }

  function wpItem(s, k, list, pinned) {
    var last = k === list.length - 1, key = stopKey(s), isPinned = !!pinned[key];
    var preview = plain(s.a);
    if (preview.length > 70) preview = preview.slice(0, 68) + '...';
    var ans = history[s.i + 1];
    var meta = [timeLabel(s.ts), ans && ans.recalAt ? 'Recalibrated' : '', preview].filter(Boolean).join(' \u00b7 ');
    return '<div class="cmp-wp-item' + (last ? ' current' : '') + (isPinned ? ' pinned' : '') + '" style="animation-delay:' + (k * 30) + 'ms">' +
      '<div class="cmp-wp-rail"><span class="cmp-wp-dot"></span></div>' +
      '<div class="cmp-wp-main"><div class="cmp-wp-q-row"><div class="cmp-wp-q">' + esc(s.q) + '</div>' +
      '<button class="cmp-wp-pin" type="button" data-pin="' + esc(key) + '" aria-pressed="' + isPinned + '" aria-label="' + (isPinned ? 'Unpin' : 'Pin') + ' this waypoint" title="' + (isPinned ? 'Unpin' : 'Pin') + '">' + (ICONS.pin || '') + '</button>' +
      '<button class="cmp-wp-more" type="button" data-more="1" aria-label="Show details"><svg viewBox="0 0 24 24" class="cmp-i"><path d="m6 9 6 6 6-6"/></svg></button></div>' +
      (meta ? '<div class="cmp-wp-meta">' + esc(meta) + '</div>' : '') +
      wpDetail(s, k, list) +
      '<div class="cmp-wp-acts"><button class="cmp-wp-act" type="button" data-jump="' + s.i + '">Jump to</button>' +
      (last || !s.a ? '' : '<button class="cmp-wp-act" type="button" data-recal="' + s.i + '" title="Answer this again with what Compass knows now">Recalibrate</button>') +
      (last ? '' : '<button class="cmp-wp-act primary" type="button" data-resume="' + s.i + '" title="Continue the conversation from this point">Resume</button>') +
      '</div></div></div>';
  }

  function renderWaypoints() {
    var host = $('cmp-wp-list'); if (!host) return;
    var list = stops(), pinned = pins(), h = '', top = '';
    for (var k = 0; k < list.length; k++) {
      h += wpItem(list[k], k, list, pinned);
      if (pinned[stopKey(list[k])]) top += wpItem(list[k], k, list, pinned);
    }
    host.innerHTML = top
      ? '<div class="cmp-wp-sec">Pinned</div><div class="cmp-wp-pinned">' + top + '</div><div class="cmp-wp-sec">All</div>' + h
      : h;
    host.scrollTop = top ? 0 : host.scrollHeight;
  }

  // Recalibrate: answer an earlier question again, now that Compass knows more.
  // The new answer replaces the old one in place, with Undo to switch back.
  function recalibrate(i) {
    var q = history[i], ans = history[i + 1];
    if (busy || !q || !ans || q.role !== 'user' || ans.role !== 'assistant') return;
    toggleWaypoints(false);
    var body = $('cmp-body');
    var row = body && body.querySelector('.cmp-row-ai[data-ai="' + (i + 1) + '"]');
    if (!row) return;
    busy = true;
    var top = row.offsetTop - 40;
    try { body.scrollTo({ top: top, behavior: 'smooth' }); } catch (e) { body.scrollTop = top; }
    var msg = row.querySelector('.cmp-ai'), out = row.querySelector('.cmp-out');
    msg.classList.add('cmp-recal-busy');
    [].forEach.call(msg.querySelectorAll('.cmp-acts,.cmp-recal-tag,.cmp-pick'), function (n) { n.parentNode.removeChild(n); });
    var pr = progress('Recalibrating with what I know now');
    msg.appendChild(pr.el);
    var fresh = null;
    var started = false;
    var rv = revealer(out, function () {
      if (!started) { started = true; msg.classList.remove('cmp-recal-busy'); pr.writing(); }
    });
    var ask = 'Recalibrate my earlier question: "' + String(q.content).slice(0, 400) + '". Answer it again for where I am now, using everything you have learned about me since then (the rest of this chat, my profile, my to-do list). ' +
      'Open with one short sentence on what changed since your first answer, and keep it about as long as before.';
    requestChat(history.concat([{ role: 'user', content: ask, timestamp: new Date().toISOString() }]), function (soFar) { rv.feed(soFar); }, function (raw) {
      if (!raw) {
        busy = false; msg.classList.remove('cmp-recal-busy');
        pr.stop(); out.innerHTML = renderMarkdown(parseReply(ans.content).reply); linkDirectory(out);
        decorateAI(row, { actions: true, recal: ans.recalAt || null });
        return;
      }
      fresh = parseReply(raw);
      var at = new Date().toISOString();
      if (ans.orig == null) ans.orig = ans.content;
      ans.content = raw; ans.recalAt = at;
      var r = readJSON(userKey('cmp_recal_v1'), {});
      if (q.timestamp) { r[q.timestamp] = { content: raw, at: at }; writeJSON(userKey('cmp_recal_v1'), r); }
      rv.end(fresh.reply, function () {
        busy = false;
        msg.classList.remove('cmp-recal-busy');
        out.innerHTML = renderMarkdown(fresh.reply); linkDirectory(out);
        pr.stop(function () { decorateAI(row, { actions: true, recal: at }); });
      });
    });
  }

  function undoRecal(row) {
    var i = +row.getAttribute('data-ai'), ans = history[i], q = history[i - 1];
    if (!ans || ans.orig == null) return;
    ans.content = ans.orig; delete ans.orig; delete ans.recalAt;
    var r = readJSON(userKey('cmp_recal_v1'), {});
    if (q && q.timestamp && r[q.timestamp]) { delete r[q.timestamp]; writeJSON(userKey('cmp_recal_v1'), r); }
    var out = row.querySelector('.cmp-out');
    out.innerHTML = renderMarkdown(parseReply(ans.content).reply); linkDirectory(out);
    decorateAI(row, { actions: true });
  }

  // tucked-away details for one waypoint: when, what it was about, what followed
  function wpDetail(s, k, list) {
    var rows = [];
    if (s.ts) {
      var d = new Date(s.ts);
      if (!isNaN(d)) { try { rows.push(['When', d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })]); } catch (e) {} }
    }
    var topics = (memory && Array.isArray(memory.topics)) ? memory.topics : [], hits = [];
    var q = (s.q + ' ' + plain(s.a)).toLowerCase();
    topics.forEach(function (t) {
      var words = String(t).toLowerCase().split(/\s+/).filter(function (w) { return w.length > 3; });
      if (words.some(function (w) { return q.indexOf(w) > -1; }) && hits.length < 2) hits.push(t);
    });
    if (hits.length) rows.push(['Topic', hits.map(function (t) { return '<span class="cmp-wp-tag">' + esc(t) + '</span>'; }).join('')]);
    var after = list.length - 1 - k;
    rows.push(['After', after === 0 ? 'Latest question' : after + ' more question' + (after === 1 ? '' : 's')]);
    var ctx = plain(s.a);
    if (ctx) rows.push(['Answer', esc(ctx.length > 150 ? ctx.slice(0, 148) + '...' : ctx)]);
    var h = '<div class="cmp-wp-detail"><div><dl class="cmp-wp-dl">';
    rows.forEach(function (r) { h += '<dt>' + r[0] + '</dt><dd>' + (r[0] === 'Topic' || r[0] === 'Answer' ? r[1] : esc(r[1])) + '</dd>'; });
    return h + '</dl></div></div>';
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
    if (busy) return;
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
      var more = e.target.closest ? e.target.closest('[data-more]') : null;
      if (more) {
        var item = more.closest('.cmp-wp-item');
        if (item) { item.classList.toggle('open'); more.setAttribute('aria-label', item.classList.contains('open') ? 'Hide details' : 'Show details'); }
        return;
      }
      var pin = e.target.closest ? e.target.closest('[data-pin]') : null;
      if (pin) { e.stopPropagation(); togglePin(pin.getAttribute('data-pin')); var st = list.scrollTop; renderWaypoints(); list.scrollTop = st; return; }
      var t = e.target.closest ? e.target.closest('[data-jump],[data-resume],[data-recal]') : null;
      if (!t) return;
      if (t.hasAttribute('data-jump')) jumpTo(+t.getAttribute('data-jump'));
      else if (t.hasAttribute('data-recal')) recalibrate(+t.getAttribute('data-recal'));
      else resumeFrom(+t.getAttribute('data-resume'));
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) toggleWaypoints(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggleWaypoints(false); });
  })();

  // ===========================================================================
  // Quick actions under each reply: save to notes, make a task, copy.
  // A text selection inside the reply wins over the whole reply.
  // ===========================================================================
  (function replyActions() {
    var body = $('cmp-body'); if (!body) return;
    function selectionIn(el) {
      try {
        var sel = window.getSelection(); if (!sel || sel.isCollapsed) return '';
        var r = sel.getRangeAt(0);
        return el.contains(r.commonAncestorContainer) ? String(sel).replace(/\s+/g, ' ').trim() : '';
      } catch (e) { return ''; }
    }
    function textOf(out) {
      var c = out.cloneNode(true);
      [].forEach.call(c.querySelectorAll('li'), function (li) { li.insertBefore(document.createTextNode('- '), li.firstChild); });
      return (c.innerText || c.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    }
    function flash(btn, note, undo) {
      var acts = btn.parentNode;
      btn.classList.add('cmp-act-ok');
      var keep = btn.innerHTML; btn.innerHTML = ICONS.check || '';
      acts.classList.add('cmp-acts-busy');
      var old = acts.querySelector('.cmp-act-note'); if (old) old.parentNode.removeChild(old);
      var n = document.createElement('span'); n.className = 'cmp-act-note'; n.textContent = note;
      if (undo) { var u = document.createElement('button'); u.type = 'button'; u.textContent = 'Open'; u.onclick = undo; n.appendChild(u); }
      acts.appendChild(n);
      setTimeout(function () {
        btn.classList.remove('cmp-act-ok'); btn.innerHTML = keep; acts.classList.remove('cmp-acts-busy');
        if (n.parentNode) n.parentNode.removeChild(n);
      }, 2600);
    }
    function picker(msg, items, ts, btn) {
      var old = msg.querySelector('.cmp-pick'); if (old) { old.parentNode.removeChild(old); return; }
      var box = document.createElement('div'); box.className = 'cmp-pick';
      var h = '<div class="cmp-pick-t">Add to your to-do list</div>';
      items.forEach(function (t, k) { h += '<label><input type="checkbox" data-k="' + k + '"' + (k < 3 ? ' checked' : '') + '><span>' + esc(t) + '</span></label>'; });
      box.innerHTML = h + '<div class="cmp-pick-a"><button type="button" data-x="1">Cancel</button><button type="button" class="go">Add</button></div>';
      msg.insertBefore(box, msg.querySelector('.cmp-acts'));
      function count() { var n = box.querySelectorAll('input:checked').length; box.querySelector('.go').textContent = n ? 'Add ' + n : 'Add'; box.querySelector('.go').disabled = !n; }
      box.addEventListener('change', count); count();
      try { box.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); } catch (x) {}
      box.querySelector('[data-x]').onclick = function () { box.parentNode.removeChild(box); };
      box.querySelector('.go').onclick = function () {
        var picked = [].map.call(box.querySelectorAll('input:checked'), function (c) { return items[+c.getAttribute('data-k')]; });
        var ids = window.cmpNotepad.apply(picked.map(function (t) { return { op: 'add', text: t }; }), ts);
        box.parentNode.removeChild(box);
        flash(btn, picked.length === 1 ? 'Added to to-do' : 'Added ' + picked.length + ' tasks', function () { window.cmpNotepad.open('todo', ids[0]); });
      };
    }
    body.addEventListener('click', function (e) {
      var un = e.target.closest ? e.target.closest('[data-unrecal]') : null;
      if (un) { var rr = un.closest('.cmp-row-ai'); if (rr) undoRecal(rr); return; }
      var btn = e.target.closest ? e.target.closest('.cmp-act') : null; if (!btn) return;
      var row = btn.closest('.cmp-row-ai'), msg = row.querySelector('.cmp-ai'), out = row.querySelector('.cmp-out');
      var ts = row.getAttribute('data-ts') || null, picked = selectionIn(out), kind = btn.getAttribute('data-act');
      if (kind === 'copy') {
        var txt = picked || textOf(out);
        var done = function () { flash(btn, 'Copied'); };
        try { navigator.clipboard.writeText(txt).then(done, function () { legacyCopy(txt); done(); }); } catch (x) { legacyCopy(txt); done(); }
        return;
      }
      if (!window.cmpNotepad) return;
      if (kind === 'note') {
        var when = ''; try { when = new Date(ts || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch (x) {}
        var note = picked || textOf(out);
        if (note.length > 1200) note = note.slice(0, 1200).replace(/\s+\S*$/, '') + '...';
        window.cmpNotepad.add('note', 'From Compass' + (when ? ', ' + when : '') + ':\n' + note, 'compass', { srcTs: ts });
        flash(btn, 'Saved to notes', function () { window.cmpNotepad.open('notes'); });
        return;
      }
      if (kind === 'task') {
        if (picked) {
          var id = window.cmpNotepad.apply([{ op: 'add', text: picked.slice(0, 140) }], ts)[0];
          flash(btn, 'Added to to-do', function () { window.cmpNotepad.open('todo', id); });
          return;
        }
        var lis = [].map.call(out.querySelectorAll('li'), function (li) { return (li.innerText || li.textContent || '').replace(/\s+/g, ' ').trim(); })
          .filter(function (t) { return t && !window.cmpNotepad.has(t); }).slice(0, 6)
          .map(function (t) { return t.length > 140 ? t.slice(0, 137) + '...' : t; });
        if (lis.length) { picker(msg, lis, ts, btn); return; }
        // no list to pick from: open the to-do list with a draft the student can edit
        var first = ((textOf(out).match(/^[^.!?\n]+[.!?]?/) || [''])[0]).trim();
        window.cmpNotepad.open('todo');
        var ni = $('cmp-np-input');
        if (ni) { ni.value = first.slice(0, 140); ni.focus(); try { ni.select(); } catch (x) {} }
      }
    });
    function legacyCopy(t) {
      var ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) {} document.body.removeChild(ta);
    }
  })();

  // ===========================================================================
  // Notepad: the student's own notes + to-do list. Floats, drags by its top
  // bar, stays open when the chat closes, and follows them across pages.
  // Stored in this browser only (localStorage, per signed-in member).
  // Compass sees open task titles only, never note text.
  // ===========================================================================
  (function notepad() {
    var np = $('cmp-notepad'); if (!np) return;
    var hdr = $('cmp-np-hdr'), notesEl = $('cmp-np-notes'), list = $('cmp-np-list'),
        form = $('cmp-np-add'), input = $('cmp-np-input'), countEl = $('cmp-np-count'),
        savedEl = $('cmp-np-saved'), dot = $('cmp-np-dot'), btn = $('cmp-np-btn');
    var ICONS2 = window.__FS_ICONS__ || {};
    var CHECK = ICONS2.check || '', XI = ICONS2.close || '', SPARK = ICONS2.spark || '';
    var CHEV = '<svg viewBox="0 0 24 24" class="cmp-i"><path d="m6 9 6 6 6-6"/></svg>';
    var showDone = false, cacheKey = null, data = null;

    function key() {
      var id = hbUserId || (window.__HB_USER__ && window.__HB_USER__.id) || 'anon';
      return 'cmp_np_v1_' + id;
    }
    function load() {
      var k = key();
      if (data && cacheKey === k) return data;
      var d = null;
      try { d = JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) {}
      data = d && typeof d === 'object' ? d : {};
      data.notes = typeof data.notes === 'string' ? data.notes : '';
      data.todos = Array.isArray(data.todos) ? data.todos : [];
      data.tab = data.tab === 'notes' ? 'notes' : 'todo';
      cacheKey = k;
      return data;
    }
    function save() { try { localStorage.setItem(key(), JSON.stringify(load())); } catch (e) {} }
    function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function openTodos() { return load().todos.filter(function (t) { return !t.done; }); }

    // ---- position: draggable by the header, clamped to the viewport ----
    function clampPos(x, y) {
      var w = np.offsetWidth || 320, h = np.offsetHeight || 520;
      return { x: Math.max(8, Math.min(x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(y, window.innerHeight - h - 8)) };
    }
    function place() {
      var d = load(), p = d.pos;
      if (!p) {
        var chat = $('cmp-chat'), r = chat && chat.classList.contains('open') ? chat.getBoundingClientRect() : null;
        var w = np.offsetWidth || 320;
        if (window.innerWidth <= 480) p = { x: 12, y: 64 };
        else if (r && r.left - w - 16 > 8) p = { x: r.left - w - 16, y: r.top + 40 };
        else p = { x: window.innerWidth - w - 28, y: Math.max(8, window.innerHeight - (np.offsetHeight || 520) - 110) };
      }
      p = clampPos(p.x, p.y);
      np.style.left = p.x + 'px'; np.style.top = p.y + 'px';
    }
    (function drag() {
      var sx, sy, ox, oy, on = false;
      hdr.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('button')) return;
        on = true; sx = e.clientX; sy = e.clientY;
        var r = np.getBoundingClientRect(); ox = r.left; oy = r.top;
        np.classList.add('cmp-np-dragging');
        try { hdr.setPointerCapture(e.pointerId); } catch (x) {}
        e.preventDefault();
      });
      hdr.addEventListener('pointermove', function (e) {
        if (!on) return;
        var p = clampPos(ox + e.clientX - sx, oy + e.clientY - sy);
        np.style.left = p.x + 'px'; np.style.top = p.y + 'px';
      });
      function end() {
        if (!on) return; on = false; np.classList.remove('cmp-np-dragging');
        var r = np.getBoundingClientRect(); load().pos = { x: Math.round(r.left), y: Math.round(r.top) }; save();
      }
      hdr.addEventListener('pointerup', end); hdr.addEventListener('pointercancel', end);
      window.addEventListener('resize', function () { if (!np.hidden) { var r = np.getBoundingClientRect(); var p = clampPos(r.left, r.top); np.style.left = p.x + 'px'; np.style.top = p.y + 'px'; } });
    })();

    // ---- tabs ----
    function showTab(t) {
      var d = load(); d.tab = t === 'notes' ? 'notes' : 'todo'; save();
      var tabs = np.querySelectorAll('.cmp-np-tab'), views = np.querySelectorAll('.cmp-np-view');
      for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-np') === d.tab);
      for (var j = 0; j < views.length; j++) views[j].classList.toggle('active', views[j].getAttribute('data-np') === d.tab);
      var ink = np.querySelector('.cmp-np-ink'); if (ink) ink.style.setProperty('--t', d.tab === 'todo' ? 1 : 0);
      if (window.__cmpNpUpdateUndo) window.__cmpNpUpdateUndo();
      var cf = $('cmp-np-confirm'); if (cf) cf.hidden = true;
    }
    var tabBtns = np.querySelectorAll('.cmp-np-tab');
    for (var ti = 0; ti < tabBtns.length; ti++) tabBtns[ti].addEventListener('click', function () { showTab(this.getAttribute('data-np')); });

    // ---- notes: autosave ----
    var saveTimer = null;
    notesEl.addEventListener('input', function () {
      if (typeof load().notesPrev === 'string') { load().notesPrev = null; save(); if (window.__cmpNpUpdateUndo) window.__cmpNpUpdateUndo(); }
      savedEl.parentNode.classList.add('saving'); savedEl.textContent = 'Saving...';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        load().notes = notesEl.value; save();
        savedEl.parentNode.classList.remove('saving'); savedEl.textContent = 'Saved on this device';
      }, 400);
    });

    // ---- to-dos ----
    function renderTodos(flashId) {
      var d = load(), open = [], done = [];
      d.todos.forEach(function (t) { (t.done ? done : open).push(t); });
      countEl.textContent = open.length ? String(open.length) : '';
      var h = '';
      if (!open.length && !done.length) h = '<div class="cmp-np-empty">Nothing here yet.<br>Add a task above, or Compass can save one when you plan a next step.</div>';
      var grouped = open.some(function (t) { return t.group; }), lastGroup = null;
      open.forEach(function (t) {
        var g = grouped ? (t.group || 'Other') : null;
        if (grouped && g !== lastGroup) { h += '<div class="cmp-np-group">' + esc(g) + '</div>'; lastGroup = g; }
        h += row(t);
      });
      if (open.length) h += '<button class="cmp-np-review" type="button">' + (ICONS2.chat || '') + 'Review my list with Compass</button>';
      if (done.length) {
        h += '<button class="cmp-np-done-h" type="button" aria-expanded="' + showDone + '">' + CHEV + 'Done (' + done.length + ')</button>';
        if (showDone) done.slice().reverse().forEach(function (t) { h += row(t); });
      }
      list.innerHTML = h;
      if (flashId) {
        var el = list.querySelector('[data-id="' + flashId + '"]');
        if (el) { el.classList.add('cmp-flash-np'); try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
      }
    }
    function row(t) {
      var steps = Array.isArray(t.steps) ? t.steps : [], sd = steps.filter(function (x) { return x.done; }).length;
      var tag = '';
      if (t.from === 'compass' || t.srcTs) {   // Compass made it, or added its steps
        tag = t.srcTs && window.cmpCanJumpTo && window.cmpCanJumpTo(t.srcTs)
          ? '<button type="button" class="cmp-todo-from" data-src="' + esc(t.srcTs) + '" title="Jump to the conversation this came from">' + SPARK + 'Compass</button>'
          : '<span class="cmp-todo-from" title="Saved from a Compass chat">' + SPARK + 'Compass</span>';
      }
      var sh = '';
      if (steps.length && !t.done) {
        sh = '<div class="cmp-steps">';
        steps.forEach(function (st, i) {
          sh += '<div class="cmp-step' + (st.done ? ' done' : '') + '" data-step="' + i + '"><button type="button" class="cmp-step-chk" aria-label="Toggle step">' + CHECK + '</button><span>' + esc(st.text) + '</span></div>';
        });
        sh += '</div>';
      }
      return '<div class="cmp-todo' + (t.done ? ' done' : '') + '" data-id="' + esc(t.id) + '">' +
        '<button class="cmp-chk" type="button" aria-label="' + (t.done ? 'Mark not done' : 'Mark done') + '">' + CHECK + '</button>' +
        '<div class="cmp-todo-body"><span class="cmp-todo-t">' + esc(t.text) + tag +
          (steps.length && !t.done ? '<span class="cmp-step-prog">' + sd + '/' + steps.length + '</span>' : '') + '</span>' + sh + '</div>' +
        '<button class="cmp-todo-del" type="button" aria-label="Delete task">' + XI + '</button></div>';
    }
    function find(id) { var d = load(); for (var i = 0; i < d.todos.length; i++) if (d.todos[i].id === id) return d.todos[i]; return null; }

    list.addEventListener('click', function (e) {
      var tgt = e.target.closest ? e.target : null; if (!tgt) return;
      if (tgt.closest('.cmp-np-done-h')) { showDone = !showDone; renderTodos(); return; }
      if (tgt.closest('.cmp-np-review')) { if (window.fsAsk) window.fsAsk('Can you review my to-do list and walk me through the steps for each?'); return; }
      var src = tgt.closest('[data-src]');
      if (src) { if (window.cmpJumpToTs) window.cmpJumpToTs(src.getAttribute('data-src')); return; }
      var rowEl = tgt.closest('.cmp-todo'); if (!rowEl) return;
      var t = find(rowEl.getAttribute('data-id')); if (!t) return;
      var stepEl = tgt.closest('.cmp-step');
      if (stepEl && Array.isArray(t.steps)) {
        var st = t.steps[+stepEl.getAttribute('data-step')]; if (!st) return;
        st.done = !st.done; save(); touchTodos(); renderTodos(); return;
      }
      touchTodos();
      if (tgt.closest('.cmp-todo-del')) {
        rowEl.classList.add('leaving');
        load().todos = load().todos.filter(function (x) { return x.id !== t.id; }); save();
        setTimeout(function () { renderTodos(); }, 380);
        return;
      }
      if (tgt.closest('.cmp-chk')) {
        if (t.done) { t.done = false; t.doneAt = null; save(); renderTodos(t.id); return; }
        // the satisfying part: pop, check draws in, strike sweeps across, a small burst, then it tucks away
        t.done = true; t.doneAt = new Date().toISOString(); save();
        rowEl.classList.add('done', 'popping');
        var burst = document.createElement('span'); burst.className = 'cmp-burst';
        for (var k = 0; k < 8; k++) { var dotEl = document.createElement('i'); dotEl.style.setProperty('--a', (k * 45) + 'deg'); burst.appendChild(dotEl); }
        rowEl.appendChild(burst);
        countEl.textContent = openTodos().length ? String(openTodos().length) : '';
        setTimeout(function () { rowEl.classList.add('leaving'); }, 850);
        setTimeout(function () { renderTodos(); }, 1250);
        if (t.from === 'compass' && load().celebrate !== false) setTimeout(function () { celebrate(t.text); }, 420);
      }
    });

    // ---- a small, earned moment when a Compass-suggested task gets done ----
    var toastTimer = null;
    function celebrate(text) {
      var old = np.querySelector('.cmp-np-toast'); if (old) old.parentNode.removeChild(old);
      var lines = ['Nice follow-through.', 'One step closer.', 'That one counts.', 'Done and dusted.', 'Momentum looks good on you.'];
      var el = document.createElement('div');
      el.className = 'cmp-np-toast'; el.setAttribute('role', 'status');
      el.innerHTML = '<span class="cmp-np-toast-i">' + CHECK + '<i></i><i></i><i></i></span>' +
        '<div class="cmp-np-toast-m"><div class="cmp-np-toast-t">' + esc(lines[Math.floor(Math.random() * lines.length)]) + '</div>' +
        '<div class="cmp-np-toast-s">' + esc(text.length > 46 ? text.slice(0, 44) + '...' : text) + '</div>' +
        '<label class="cmp-np-toast-c"><input type="checkbox"> Don\'t show this again</label></div>' +
        '<button type="button" class="cmp-np-toast-x">Dismiss</button>';
      np.appendChild(el);
      var cb = el.querySelector('input');
      function hide() { clearTimeout(toastTimer); el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260); }
      cb.addEventListener('change', function () { load().celebrate = !cb.checked; save(); syncSettings(); clearTimeout(toastTimer); if (cb.checked) toastTimer = setTimeout(hide, 900); });
      el.querySelector('.cmp-np-toast-x').addEventListener('click', hide);
      el.addEventListener('mouseenter', function () { clearTimeout(toastTimer); });
      el.addEventListener('mouseleave', function () { if (!cb.checked) toastTimer = setTimeout(hide, 2500); });
      toastTimer = setTimeout(hide, 6000);
    }

    // ---- notepad settings ----
    var setBtn = $('cmp-np-set'), setPanel = $('cmp-np-settings'), celebrateCb = $('cmp-np-celebrate'),
        spellCb = $('cmp-np-spell'), modeSeg = $('cmp-np-mode'), modeHelp = $('cmp-np-mode-help');
    var MODE_HELP = {
      group: 'Sorts your notes under headings. Your wording stays exactly as written.',
      rewrite: 'Keeps the order, cleans up wording and spelling. Every fact stays.',
      both: 'Groups your notes and cleans up the wording. Every fact stays.'
    };
    function orientMode() { var m = load().orientMode; return MODE_HELP[m] ? m : 'group'; }
    function applySpell() {
      var on = load().spell !== false;
      [notesEl, input].forEach(function (el) {
        if (!el) return;
        el.setAttribute('spellcheck', on ? 'true' : 'false');
        el.setAttribute('autocorrect', on ? 'on' : 'off');
        el.setAttribute('autocapitalize', on ? 'sentences' : 'off');
      });
    }
    function syncSettings() {
      if (celebrateCb) celebrateCb.checked = load().celebrate !== false;
      if (spellCb) spellCb.checked = load().spell !== false;
      if (modeSeg) { var m = orientMode(); [].forEach.call(modeSeg.querySelectorAll('button'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-mode') === m)); }); }
      if (modeHelp) modeHelp.textContent = MODE_HELP[orientMode()];
    }
    if (spellCb) spellCb.addEventListener('change', function () { load().spell = spellCb.checked; save(); applySpell(); });
    if (modeSeg) modeSeg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-mode]') : null; if (!b) return;
      load().orientMode = b.getAttribute('data-mode'); save(); syncSettings();
    });
    applySpell();

    // ---- Orient: tidy the current tab, only after the student confirms ----
    var orientBtn = $('cmp-np-orient'), confirmEl = $('cmp-np-confirm'), confirmS = $('cmp-np-confirm-s'), undoBtn = $('cmp-np-undo');
    var CONFIRM_TEXT = {
      notes: {
        group: 'Compass will sort your notes under headings. Your words stay exactly as written, and nothing is removed.',
        rewrite: 'Compass will clean up the wording and spelling, keeping every fact, name, and link. Nothing is removed.',
        both: 'Compass will group your notes and clean up the wording, keeping every fact, name, and link. Nothing is removed.'
      },
      todo: {
        group: 'Compass will sort your open tasks into groups and put them in a sensible order. Task wording stays the same.',
        rewrite: 'Compass will make each open task short and concrete, keeping every name and date. Nothing is removed.',
        both: 'Compass will group and order your open tasks and make each one short and concrete. Nothing is removed.'
      }
    };
    function status(msg, ms) { savedEl.textContent = msg; if (ms) setTimeout(function () { savedEl.textContent = 'Saved on this device'; }, ms); }
    function hideConfirm() { if (confirmEl) confirmEl.hidden = true; }
    function curTab() { return load().tab === 'notes' ? 'notes' : 'todo'; }
    function updateUndo() {
      if (!undoBtn) return;
      var d = load();
      undoBtn.hidden = !(curTab() === 'notes' ? typeof d.notesPrev === 'string' : Array.isArray(d.todosPrev));
    }
    function touchTodos() { var d = load(); if (d.todosPrev) { d.todosPrev = null; save(); updateUndo(); } }
    window.__cmpNpUpdateUndo = updateUndo;

    if (orientBtn && confirmEl) {
      orientBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var tab = curTab();
        if (tab === 'notes' && !notesEl.value.trim()) { status('Write a few notes first', 1800); return; }
        if (tab === 'todo' && openTodos().length < 2) { status('Add a couple of tasks first', 1800); return; }
        confirmEl.querySelector('.cmp-np-confirm-t').textContent = tab === 'notes' ? 'Orient your notes?' : 'Orient your to-do list?';
        confirmS.textContent = CONFIRM_TEXT[tab][orientMode()] + ' You can undo it.';
        confirmEl.hidden = !confirmEl.hidden;
      });
      confirmEl.querySelector('.cmp-np-c-no').addEventListener('click', hideConfirm);
      np.addEventListener('click', function (e) { if (!confirmEl.hidden && !confirmEl.contains(e.target) && !orientBtn.contains(e.target)) hideConfirm(); });
      confirmEl.querySelector('.cmp-np-c-yes').addEventListener('click', function () {
        hideConfirm();
        var tab = curTab(), mode = orientMode();
        var beforeNotes = notesEl.value;
        var beforeTodos = JSON.stringify(load().todos);
        orientBtn.disabled = true; orientBtn.classList.add('working'); orientBtn.querySelector('span').textContent = 'Orienting';
        function finish(msg) {
          orientBtn.disabled = false; orientBtn.classList.remove('working'); orientBtn.querySelector('span').textContent = 'Orient';
          if (msg) status(msg, 2600);
        }
        var fail = 'Couldn\'t orient right now. Nothing changed.';
        var body = tab === 'notes'
          ? { type: 'organize_notes', notes: beforeNotes, mode: mode }
          : { type: 'organize_todos', mode: mode, tasks: openTodos().map(function (t) { return { id: t.id, text: t.text }; }) };
        try {
          var x = new XMLHttpRequest();
          x.open('POST', PROXY_URL, true);
          x.setRequestHeader('Content-Type', 'application/json');
          x.onreadystatechange = function () {
            if (x.readyState !== 4) return;
            var r = null; try { r = JSON.parse(x.responseText); } catch (e) {}
            var d = load();
            if (tab === 'notes') {
              if (!r || !r.ok || !r.notes) { finish(fail); return; }
              if (notesEl.value !== beforeNotes) { finish('You kept typing, so I left your notes as they are.'); return; }
              d.notesPrev = beforeNotes; d.notes = r.notes; save();
              notesEl.value = r.notes; notesEl.scrollTop = 0;
              notesEl.classList.remove('cmp-np-fresh'); void notesEl.offsetWidth; notesEl.classList.add('cmp-np-fresh');
            } else {
              if (!r || !r.ok || !Array.isArray(r.tasks)) { finish(fail); return; }
              if (JSON.stringify(d.todos) !== beforeTodos) { finish('Your list changed meanwhile, so I left it as it is.'); return; }
              var byId = {}; d.todos.forEach(function (t) { byId[t.id] = t; });
              var ordered = [];
              r.tasks.forEach(function (rt) {
                var t = byId[rt.id]; if (!t || t.done || ordered.indexOf(t) > -1) return;
                if (mode !== 'group' && rt.text) t.text = String(rt.text).slice(0, 140);
                if (mode !== 'rewrite') t.group = rt.group || '';
                ordered.push(t);
              });
              d.todos.forEach(function (t) { if (!t.done && ordered.indexOf(t) === -1) ordered.push(t); });   // never lose one
              var prev = JSON.parse(beforeTodos);
              d.todos = ordered.concat(d.todos.filter(function (t) { return t.done; }));
              save(); d.todosPrev = prev; save();
              renderTodos();
            }
            updateUndo();
            finish(r.restored ? 'Oriented. Kept ' + r.restored + ' item' + (r.restored === 1 ? '' : 's') + ' safe.' : 'Oriented.');
          };
          x.onerror = function () { finish(fail); };
          x.send(JSON.stringify(body));
        } catch (e) { finish(fail); }
      });
    }
    if (undoBtn) undoBtn.addEventListener('click', function () {
      var d = load();
      if (curTab() === 'notes' && typeof d.notesPrev === 'string') {
        d.notes = d.notesPrev; d.notesPrev = null; save(); notesEl.value = d.notes;
        status('Restored your previous notes', 2200);
      } else if (curTab() === 'todo' && Array.isArray(d.todosPrev)) {
        d.todos = d.todosPrev; d.todosPrev = null; save(); renderTodos();
        status('Restored your previous list', 2200);
      }
      updateUndo();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.replace(/\s+/g, ' ').trim(); if (!v) return;
      addItem('task', v, 'me'); input.value = ''; input.focus();
    });

    function addItem(kind, text, from, meta) {
      var d = load();
      if (kind === 'note') {
        d.notes = (d.notes ? d.notes.replace(/\s+$/, '') + '\n' : '') + '\u2022 ' + text; save();
        if (!np.hidden) notesEl.value = d.notes;
        return null;
      }
      var t = { id: uid(), text: text, done: false, from: from || 'me', created: new Date().toISOString() };
      if (meta && meta.srcTs) t.srcTs = meta.srcTs;
      d.todos.push(t); save(); touchTodos();
      if (!np.hidden) renderTodos(t.id); else countEl.textContent = String(openTodos().length);
      if (from === 'compass' && np.hidden && dot) dot.hidden = false;
      return t.id;
    }

    // ---- open / close ----
    function open(tab, flashId) {
      var d = load();
      notesEl.value = d.notes;
      np.hidden = false; d.open = true; save();
      if (dot) dot.hidden = true;
      showTab(tab || d.tab);
      renderTodos(flashId);
      place();
    }
    function close() { np.hidden = true; load().open = false; save(); }
    $('cmp-np-x').addEventListener('click', close);
    if (btn) btn.addEventListener('click', function () { if (np.hidden) open(); else close(); });

    // apply changes Compass proposed and the student confirmed
    function applyActions(items, srcTs) {
      var d = load(), changed = [];
      (items || []).forEach(function (it) {
        if (!it || !it.op) return;
        var t = it.id ? find(String(it.id)) : null;
        if (it.op === 'add' && it.text) {
          var nt = { id: uid(), text: String(it.text).replace(/\[\[|\]\]/g, '').slice(0, 140), done: false, from: 'compass', created: new Date().toISOString() };
          if (srcTs) nt.srcTs = srcTs;
          d.todos.push(nt); changed.push(nt.id);
        } else if (t && it.op === 'complete') { t.done = true; t.doneAt = new Date().toISOString(); changed.push(t.id); }
        else if (t && it.op === 'rename' && it.text) { t.text = String(it.text).slice(0, 140); changed.push(t.id); }
        else if (t && it.op === 'steps' && Array.isArray(it.steps)) {
          t.steps = it.steps.slice(0, 6).map(function (x) { return { text: String(x).replace(/\[\[|\]\]/g, '').slice(0, 90), done: false }; });
          if (!t.srcTs && srcTs) t.srcTs = srcTs;
          changed.push(t.id);
        }
      });
      save(); touchTodos();
      if (!np.hidden) renderTodos(changed[0]); else { countEl.textContent = openTodos().length ? String(openTodos().length) : ''; if (changed.length && dot) dot.hidden = false; }
      return changed;
    }

    window.cmpNotepad = {
      open: open, close: close,
      add: addItem,
      apply: applyActions,
      find: function (id) { var t = find(String(id)); return t ? { id: t.id, text: t.text, done: !!t.done } : null; },
      openCount: function () { return openTodos().length; },
      has: function (text) { var l = String(text).toLowerCase(); return load().todos.some(function (t) { return !t.done && t.text.toLowerCase() === l; }); },
      // what Compass may see: open task titles and a count. Never note text.
      summary: function () {
        var o = openTodos(), now = Date.now();
        var lines = o.slice(0, 15).map(function (t) {
          var age = t.created ? Math.max(0, Math.round((now - new Date(t.created).getTime()) / 86400000)) : null;
          var bits = [t.from === 'compass' ? 'saved from a Compass chat' : 'added by the student'];
          if (age !== null) bits.push(age === 0 ? 'added today' : 'added ' + age + ' day' + (age === 1 ? '' : 's') + ' ago');
          if (t.group) bits.push('group: ' + t.group);
          if (Array.isArray(t.steps) && t.steps.length) bits.push('steps: ' + t.steps.map(function (x) { return (x.done ? '[done] ' : '') + x.text; }).join(' | '));
          return '- [' + t.id + '] ' + t.text + ' (' + bits.join('; ') + ')';
        });
        var recent = load().todos.filter(function (t) { return t.done; }).sort(function (a, b) { return String(b.doneAt).localeCompare(String(a.doneAt)); }).slice(0, 3);
        var out = o.length ? o.length + ' open task' + (o.length === 1 ? '' : 's') + ':\n' + lines.join('\n') : 'No open tasks.';
        if (recent.length) out += '\nRecently completed: ' + recent.map(function (t) { return t.text; }).join('; ') + '.';
        return out;
      }
    };
    countEl.textContent = openTodos().length ? String(openTodos().length) : '';
    if (load().open) open();   // it follows the student across pages
  })();

  // ===========================================================================
  // Keyboard: Ctrl/Cmd+K opens Navigate; Ctrl/Cmd+F opens Find on this page.
  // Pressing Ctrl/Cmd+F again inside Find hands over to the browser's own find.
  // ===========================================================================
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  (function shortcuts() {
    var hint = $('cmp-nav-kbd');
    if (hint && canHover) { hint.textContent = isMac ? '\u2318K' : 'Ctrl K'; hint.hidden = false; }
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      var k = String(e.key || '').toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        if (isOpen() && currentView === 'navigate' && document.activeElement === $('cmp-nav-q')) { setOpen(false); return; }
        openTo('navigate');
        var q = $('cmp-nav-q'); if (q) setTimeout(function () { q.focus(); q.select(); }, 40);
      } else if (k === 'f') {
        var f = $('cmp-find');
        if (f && !f.hidden && document.activeElement === $('cmp-find-q')) { closeFind(); return; }  // browser find takes over
        e.preventDefault();
        openFind();
      }
    }, true);
  })();

  // ---- Find on this page ----
  // Highlights use the CSS Custom Highlight API, so the page's own HTML is never touched.
  var findState = { hits: [], cur: -1, q: '' };
  var HL = (window.CSS && CSS.highlights && window.Highlight) ? CSS.highlights : null;
  function skipEl(el) {
    return !el || el.closest('#cmp-widget-root, #cmp-banner, script, style, noscript, template, textarea, select, [aria-hidden="true"]');
  }
  function textNodes() {
    var out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var el = n.parentElement;
        if (skipEl(el)) return NodeFilter.FILTER_REJECT;
        if (!el.getClientRects().length) return NodeFilter.FILTER_REJECT;
        var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.opacity === '0') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }), n;
    while ((n = w.nextNode())) out.push(n);
    return out;
  }
  function findRanges(nodes, needle) {
    var res = [], low = needle.toLowerCase();
    for (var i = 0; i < nodes.length && res.length < 500; i++) {
      var v = nodes[i].nodeValue.toLowerCase(), at = 0;
      while ((at = v.indexOf(low, at)) > -1 && res.length < 500) {
        var r = document.createRange(); r.setStart(nodes[i], at); r.setEnd(nodes[i], at + low.length);
        res.push(r); at += low.length;
      }
    }
    return res;
  }
  function headingFor(node) {
    var el = node.parentElement, seen = 0;
    while (el && el !== document.body && seen < 12) {
      var p = el.previousElementSibling;
      while (p) {
        if (/^H[1-4]$/.test(p.tagName)) return p.textContent.trim().slice(0, 60);
        var h = p.querySelector && p.querySelector('h1,h2,h3,h4');
        if (h && !skipEl(h)) { var all = p.querySelectorAll('h1,h2,h3,h4'); return all[all.length - 1].textContent.trim().slice(0, 60); }
        p = p.previousElementSibling;
      }
      el = el.parentElement; seen++;
    }
    return '';
  }
  function snippet(r) {
    var v = r.startContainer.nodeValue, a = r.startOffset, b = r.endOffset;
    var s0 = Math.max(0, a - 42), e0 = Math.min(v.length, b + 60);
    var pre = (s0 > 0 ? '...' : '') + v.slice(s0, a), post = v.slice(b, e0) + (e0 < v.length ? '...' : '');
    return esc(pre.replace(/\s+/g, ' ')) + '<b>' + esc(v.slice(a, b)) + '</b>' + esc(post.replace(/\s+/g, ' '));
  }
  function paintHits() {
    if (!HL) return;
    HL.delete('cmp-find'); HL.delete('cmp-find-cur');
    if (!findState.hits.length) return;
    HL.set('cmp-find', new Highlight(...findState.hits));
    if (findState.cur > -1) HL.set('cmp-find-cur', new Highlight(findState.hits[findState.cur]));
  }
  function goHit(i) {
    var n = findState.hits.length; if (!n) return;
    findState.cur = (i + n) % n;
    var r = findState.hits[findState.cur], el = r.startContainer.parentElement;
    paintHits();
    if (!HL) { try { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) {} }
    try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { el.scrollIntoView(); }
    // keep the match clear of the find panel when they line up
    // keep the match clear of the find panel: scroll past it, or fold the panel to just the bar
    var fp = $('cmp-find');
    fp.classList.remove('cmp-find-compact');
    function under() {
      var b = fp.getBoundingClientRect(), m = r.getBoundingClientRect();
      return m.right > b.left - 8 && m.left < b.right + 8 && m.bottom > b.top - 8 && m.top < b.bottom + 8;
    }
    if (under()) window.scrollBy(0, r.getBoundingClientRect().top - (fp.getBoundingClientRect().bottom + 32));
    if (under()) fp.classList.add('cmp-find-compact');
    $('cmp-find-n').textContent = (findState.cur + 1) + ' of ' + n + (n >= 500 ? '+' : '');
    [].forEach.call(document.querySelectorAll('#cmp-find-more [data-hit]'), function (b) { b.classList.toggle('cur', +b.getAttribute('data-hit') === findState.cur); });
  }
  // every word of the query (by its first 5 letters, so "company" finds "Companies") must appear
  function wordsMatch(q, hay) {
    hay = hay.toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w.length > 5 ? w.slice(0, 5) : w) > -1; });
  }
  function elsewhere(q) {
    var out = [];
    NAV.forEach(function (g) { g.items.forEach(function (it) {
      if (it[1] !== path && wordsMatch(q, it[0] + ' ' + it[2] + ' ' + g.g)) out.push({ t: it[0], s: it[2], h: it[1], i: PAGE_ICONS[it[1]] || G[g.i] });
    }); });
    (DIRECTORY || []).forEach(function (d) {
      if (d && d.name && wordsMatch(q, d.name) && /^https:\/\/(www\.)?futureselfdiscover\.com\//.test(d.url))
        out.push({ t: d.name, s: d.kind === 'community' ? 'Community page' : 'Company page', h: d.url, i: G.careers });
    });
    return out.slice(0, 4);
  }
  var findTimer = null;
  function runFind() {
    var q = $('cmp-find-q').value.replace(/\s+/g, ' ').trim(), more = $('cmp-find-more');
    findState.q = q; findState.hits = []; findState.cur = -1;
    var count = $('cmp-find-n'), prev = $('cmp-find-prev'), next = $('cmp-find-next');
    if (!q) { paintHits(); count.textContent = ''; more.innerHTML = ''; prev.disabled = next.disabled = true; return; }
    var nodes = textNodes(), hits = findRanges(nodes, q), loose = '';
    // nothing exact: fall back to the longest word in the query that does appear
    if (!hits.length && q.indexOf(' ') > -1) {
      var words = q.split(' ').filter(function (w) { return w.length > 2; }).sort(function (a, b) { return b.length - a.length; });
      for (var k = 0; k < words.length && !hits.length; k++) { hits = findRanges(nodes, words[k]); if (hits.length) loose = words[k]; }
    }
    findState.hits = hits;
    prev.disabled = next.disabled = !hits.length;
    count.textContent = hits.length ? '' : 'No matches';
    var h = '';
    if (loose) h += '<div class="cmp-find-note">No exact match. Showing "' + esc(loose) + '".</div>';
    if (hits.length) {
      h += '<div class="cmp-find-sec">On this page</div>';
      var lastHead = null;
      hits.slice(0, 6).forEach(function (r, i) {
        var head = headingFor(r.startContainer);
        h += '<button class="cmp-find-hit" type="button" data-hit="' + i + '">' + (head && head !== lastHead ? '<small>' + esc(head) + '</small>' : '') + snippet(r) + '</button>';
        lastHead = head;
      });
    }
    var other = elsewhere(q);
    if (other.length) {
      h += '<div class="cmp-find-sec">Elsewhere on FutureSelf</div>';
      other.forEach(function (o) {
        h += '<a class="cmp-find-hit" href="' + esc(o.h) + '" target="_top"><span class="cmp-link-i">' + o.i + '</span><span>' + esc(o.t) + '<small>' + esc(o.s) + '</small></span></a>';
      });
    }
    h += '<button class="cmp-find-hit cmp-find-ask" type="button" data-ask="1">' + (ICONS.chat || '') + '<span>Ask Compass about "' + esc(q.length > 40 ? q.slice(0, 38) + '...' : q) + '"</span></button>';
    more.innerHTML = h;
    if (hits.length) goHit(0); else paintHits();
  }
  function openFind() {
    var f = $('cmp-find'), q = $('cmp-find-q'); if (!f || !q) return;
    var sel = ''; try { sel = String(window.getSelection() || '').replace(/\s+/g, ' ').trim(); } catch (e) {}
    f.hidden = false;
    $('cmp-find-foot').textContent = 'Press ' + (isMac ? '\u2318F' : 'Ctrl+F') + ' again for your browser\'s find';
    if (sel && sel.length < 80) q.value = sel;
    q.focus(); q.select();
    if (q.value) runFind();
  }
  function closeFind() {
    var f = $('cmp-find'); if (!f || f.hidden) return;
    f.hidden = true;
    if (HL) { HL.delete('cmp-find'); HL.delete('cmp-find-cur'); }
  }
  window.fsFind = openFind;
  (function wireFind() {
    var q = $('cmp-find-q'); if (!q) return;
    q.addEventListener('input', function () { clearTimeout(findTimer); findTimer = setTimeout(runFind, 140); });
    $('cmp-find').addEventListener('pointerenter', function () { this.classList.remove('cmp-find-compact'); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(findTimer); if (findState.q !== q.value.replace(/\s+/g, ' ').trim()) runFind(); else goHit(findState.cur + (e.shiftKey ? -1 : 1)); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
    });
    $('cmp-find-next').addEventListener('click', function () { goHit(findState.cur + 1); });
    $('cmp-find-prev').addEventListener('click', function () { goHit(findState.cur - 1); });
    $('cmp-find-x').addEventListener('click', closeFind);
    $('cmp-find-more').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-hit],[data-ask]') : null; if (!b) return;
      if (b.hasAttribute('data-ask')) { var t = findState.q; closeFind(); askCompass('I\'m trying to find ' + t + ' on FutureSelf. Where should I look?'); return; }
      goHit(+b.getAttribute('data-hit'));
    });
  })();

  // ===========================================================================
  // Seamless page changes. Hivebrite reloads the whole page on navigation, so
  // the overlay snapshots itself (open/closed, tab, scroll, draft, recent chat)
  // into this tab's sessionStorage right before leaving, and the next page
  // restores it instantly with animations off. Only the page behind changes.
  // ===========================================================================
  (function seamless() {
    var KEY = 'cmp_ui_v1';
    function uidNow() { return String(hbUserId || (window.__HB_USER__ && window.__HB_USER__.id) || 'anon'); }
    function snapshot() {
      try {
        var body = $('cmp-body'), inp = $('cmp-input'), nq = $('cmp-nav-q');
        var pills = [].map.call(document.querySelectorAll('#cmp-qr .cmp-pill'), function (p) { return p.innerText; });
        sessionStorage.setItem(KEY, JSON.stringify({
          at: Date.now(), uid: uidNow(), open: isOpen(), view: currentView,
          scroll: body ? body.scrollTop : 0,
          atBottom: body ? (body.scrollHeight - body.scrollTop - body.clientHeight < 40) : true,
          draft: inp ? inp.value : '', navQ: nq ? nq.value : '',
          routed: routed, history: routed ? history.slice(-MAX_HISTORY) : null, pills: pills
        }));
      } catch (e) {}
    }
    window.addEventListener('pagehide', snapshot);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') snapshot(); });

    var root = $('cmp-widget-root');
    function animationsBack() {
      requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(function () { if (root) root.classList.remove('cmp-instant'); }, 60); }); });
    }
    var snap = null;
    try { snap = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!snap || Date.now() - snap.at > 1800000 || snap.uid !== uidNow()) { animationsBack(); return; }

    if (snap.routed && Array.isArray(snap.history) && snap.history.length) {
      history = snap.history; routed = true;
      var bar = document.querySelector('.cmp-bar'); if (bar) bar.style.display = '';
      renderHistory();
      if (snap.pills && snap.pills.length) setPills(snap.pills);
      // refresh profile + memory quietly; the visible chat stays exactly as it was
      fetchProfile(function (p) {
        if (p) { profile = p; if (p.name) userName = p.firstname || p.name.split(' ')[0]; }
        fetchMemory(function (m) {
          if (m) {
            memory = m;
            var fp = m.frequent_pages || []; fp.push(path); if (fp.length > 50) fp = fp.slice(-50);
            pushMemory({ frequentPages: fp });
          }
        });
      });
    }
    if (snap.open) { setOpen(true); showView(snap.view || 'chat'); if ((snap.view || 'chat') === 'chat' && !routed) verifyAndRoute(); }
    var body = $('cmp-body'), inp = $('cmp-input'), nq = $('cmp-nav-q');
    if (inp && snap.draft) { inp.value = snap.draft; autoGrow(inp); }
    if (nq && snap.navQ) { nq.value = snap.navQ; if (snap.view === 'navigate') renderNav(snap.navQ); }
    if (body) body.scrollTop = snap.atBottom ? body.scrollHeight : (snap.scroll || 0);
    animationsBack();
  })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fsBoot);
  } else {
    setTimeout(fsBoot, 0);
  }
})();
