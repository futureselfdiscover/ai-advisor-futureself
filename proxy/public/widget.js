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

  var urlMap = {
    'Business News': 'https://futureselfdiscover.com/news',
    'Careers & Internships': 'https://futureselfdiscover.com/page/careersinternships',
    'Internship Database': 'https://futureselfdiscover.com/page/internship-database',
    'Find a Job': 'https://futureselfdiscover.com/page/find-a-job-30edfa1d-c8cf-4c88-b66a-804ccfacea21',
    'Career Center': 'https://futureselfdiscover.com/page/explore-career-center',
    'Networking': 'https://futureselfdiscover.com/page/network-leadership',
    'Coffee Chats': 'https://futureselfdiscover.com/page/coffee-chats-and-cold-calls',
    'LinkedIn': 'https://futureselfdiscover.com/page/leveraging-linkedin-dfb39de3-e1dd-4c61-ae1d-86e2c08e7e2d',
    'Skills': 'https://futureselfdiscover.com/page/skills-business-basics-11508ae5-15d3-41dd-a447-113db421c698',
    'AI Skills': 'https://futureselfdiscover.com/page/get-smart-on-ai',
    'Certifications': 'https://futureselfdiscover.com/page/explore-certifications',
    'Applications & Interviews': 'https://futureselfdiscover.com/page/apps&interviews',
    'Application Essentials': 'https://futureselfdiscover.com/page/application-necessities',
    'Explore Companies': 'https://futureselfdiscover.com/page/explore-companies',
    'Explore Cities': 'https://futureselfdiscover.com/page/exploring-cities',
    'Clubs': 'https://futureselfdiscover.com/page/clubsandorganizations',
    'International Students': 'https://futureselfdiscover.com/page/international-students',
    'Student Athletes': 'https://futureselfdiscover.com/page/student-athletes',
    'Explore Yourself': 'https://futureselfdiscover.com/page/explore-yourself',
    'Build Your Plan': 'https://futureselfdiscover.com/page/build-your-plan-',
    'Wellbeing': 'https://futureselfdiscover.com/page/life%20&%20wellbeing',
    'Health & Wellness': 'https://futureselfdiscover.com/page/healthandwellness',
    'Work-Life Balance': 'https://futureselfdiscover.com/page/profbalance',
    'Academic Help': 'https://futureselfdiscover.com/page/academic-assistance',
    'Time Management': 'https://futureselfdiscover.com/page/time-management',
    'Community': 'https://futureselfdiscover.com/topics'
  };

  var path = window.location.pathname;
  var pageDesc = pageMap[path] || 'a FutureSelf page';
  var icon = '<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var history = [];
  var memory = null; // loaded from Supabase via get_memory on open

  function buildMemoryContext() {
    if (!memory) return 'No prior memory for this student yet.';
    var bits = [];
    if (memory.focus) bits.push('Focus: ' + memory.focus);
    if (memory.summary) bits.push('Summary: ' + memory.summary);
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

  function buildURLList() {
    var list = [];
    for (var label in urlMap) list.push(label + ': ' + urlMap[label]);
    return list.join('\n');
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

  function buildSYS() {
    var q = String.fromCharCode(34);
    var suggestExample = '{' + q + 'suggestions' + q + ':[' + q + 'short reply' + q + ',' + q + 'short reply' + q + ',' + q + 'short reply' + q + ']}';
    var memExample = '{' + q + 'memory' + q + ':{' + q + 'knowledge' + q + ':[{' + q + 'detail' + q + ':' + q + '...' + q + ',' + q + 'category' + q + ':' + q + '...' + q + '}],' + q + 'current_term' + q + ':{},' + q + 'direction' + q + ':{},' + q + 'focus' + q + ':' + q + '...' + q + '}}';
    return [
      'You are the FutureSelf AI Advisor, a warm but direct career mentor for college students. You are not a generic chatbot. You behave like a real advisor in a one-on-one session.',
      '',
      'CORE BEHAVIOR:',
      '- Keep every response SHORT: 1-2 sentences plus one focused question. Never write thick paragraphs.',
      '- Ask ONE question at a time. Build understanding of the student gradually.',
      '- Your goal is to understand the student, then guide them toward concrete, actionable next steps.',
      '- When the student shares something useful (an interest, goal, target industry), acknowledge it briefly and suggest they add it to their FutureSelf profile so it stays with them. Profile page: ' + (profile && profile.id ? 'https://futureselfdiscover.com/users/' + profile.id : 'their profile') + '.',
      '- Use what you already know about them (below). Never ask for info you already have.',
      '- NEVER proactively fish for personal details across multiple categories. Let information surface naturally from what the student brings up. Never ask more than one profile-building question per response. You are a career advisor, not an interviewer collecting a checklist.',
      '',
      'CRITICAL FORMAT RULE 1 (suggestions):',
      'You MUST end EVERY single response with a JSON object on its own line, exactly like this:',
      suggestExample,
      'These are 2-3 things the STUDENT might tap to reply, each under 5 words, written in first person from the student. Never skip this line.',
      '',
      'CRITICAL FORMAT RULE 2 (memory):',
      'Immediately after the suggestions JSON, on its own line, include a memory JSON object, exactly like this shape:',
      memExample,
      '- "knowledge": an array of NEW specific things the student just shared this turn (classes, professors, jobs, hobbies, interests, contacts). Only include NEW items, not things already listed under "WHAT YOU ALREADY KNOW" below. Leave as an empty array [] if nothing new came up.',
      '- "current_term": only include this if the student mentioned something about their CURRENT semester (current classes, current commitments) that should replace prior current-term info. Otherwise omit or leave as {}.',
      '- "direction": only include this if the student stated or updated a career aspiration, target role, or target company. This OVERWRITES prior direction, so only include when there is a genuine update. Otherwise omit or leave as {}.',
      '- "focus": a short 1-sentence description of what the student seems focused on right now, updated each turn if it changed.',
      'If nothing memory-worthy happened this turn, still include the memory JSON with empty/omitted fields. Never skip this line.',
      '',
      'LINKS: when pointing to a page use this exact HTML format: anchor tag with href set to the full URL and target set to _top. Never paste raw URLs as text.',
      '',
      'AVAILABLE PAGES:',
      buildURLList(),
      '',
      'CURRENT PAGE THE STUDENT IS ON: ' + pageDesc,
      '',
      'WHAT YOU ALREADY KNOW ABOUT THIS STUDENT (from FutureSelf profile):',
      buildProfileContext(),
      '',
      'WHAT YOU ALREADY REMEMBER ABOUT THIS STUDENT (from past conversations):',
      buildMemoryContext()
    ].join('\n');
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
    var body = document.getElementById('fs-body');
    if (!body) return;
    body.innerHTML = '';
    for (var i = 0; i < history.length; i++) {
      if (history[i].role === 'assistant') { var p = parseReply(history[i].content); addAI(p.reply, false); }
      else if (history[i].role === 'user') { addUser(history[i].content, false); }
    }
    body.scrollTop = body.scrollHeight;
  }

  function hasConsented() { try { return localStorage.getItem('fs_consent') === '1'; } catch(e) { return false; } }
  function setConsent() { try { localStorage.setItem('fs_consent', '1'); } catch(e) {} }

  function clearBody() {
    var body = document.getElementById('fs-body');
    var qr = document.getElementById('fs-qr');
    var bar = document.querySelector('.fs-bar');
    if (body) body.innerHTML = '';
    if (qr) qr.innerHTML = '';
    if (bar) bar.style.display = 'none';
  }

  function showLoading() {
    clearBody();
    var body = document.getElementById('fs-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'fs-center-screen';
    div.innerHTML = '<div class="fs-center-text">Loading your advisor...</div>';
    body.appendChild(div);
  }

  function showGate(r) {
    clearBody();
    var body = document.getElementById('fs-body');
    if (!body) return;
    var checklistHTML = '';
    for (var i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      checklistHTML += '<div class="fs-check-item ' + (it.done ? 'done' : 'todo') + '">' +
        '<span class="fs-check-mark">' + (it.done ? '&#10003;' : '') + '</span>' +
        '<span>' + it.label + '</span></div>';
    }
    var editURL = 'https://futureselfdiscover.com/account';
    if (profile && profile.id) editURL = 'https://futureselfdiscover.com/users/' + profile.id;
    var div = document.createElement('div');
    div.className = 'fs-center-screen';
    div.innerHTML =
      '<div class="fs-center-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></div>' +
      '<div class="fs-center-title">Complete your profile to unlock</div>' +
      '<div class="fs-center-text">Your AI Advisor uses your profile to give real, personalized advice. Finish all of these to get started:</div>' +
      '<div class="fs-checklist">' + checklistHTML + '</div>' +
      '<a href="' + editURL + '" target="_top" class="fs-center-btn">Complete my profile</a>';
    body.appendChild(div);
  }

  function showConsent() {
    clearBody();
    var body = document.getElementById('fs-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'fs-center-screen';
    div.innerHTML =
      '<div class="fs-center-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>' +
      '<div class="fs-center-title">Before we get started</div>' +
      '<div class="fs-center-text">This conversation may be reviewed to improve the advisor. Don\'t share sensitive personal info like passwords or SSNs.</div>' +
      '<button class="fs-center-btn" onclick="fsConsent()">I understand.</button>';
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
      var bar = document.querySelector('.fs-bar');
      if (bar) bar.style.display = '';
      fetchMemory(function(m) {
        memory = m;
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
      });
    });
  }

  window.fsConsent = function() { setConsent(); verifyAndRoute(); };

  window.fsReset = function() {
    if (!confirm('Reset your conversation? This clears your chat history on this device, but your advisor will still remember past context.')) return;
    try { localStorage.removeItem('fs_consent'); } catch(e) {}
    history = [];
    routed = false;
    var textEl = document.getElementById('fs-banner-text');
    var ctaEl = document.getElementById('fs-banner-cta-label');
    if (textEl) textEl.innerText = 'Hi, I\'m your AI Advisor. I help students like you figure out what\'s next. Want to get started?';
    if (ctaEl) ctaEl.innerText = 'Get started';
    verifyAndRoute();
  };

  window.fsToggle = function () {
    var w = document.getElementById('fs-chat');
    if (!w) return;
    if (w.className.indexOf('open') > -1) { w.className = w.className.replace(' open', ''); }
    else { w.className = w.className + ' open'; verifyAndRoute(); }
  };

  window.fsOpenChat = function () {
    var w = document.getElementById('fs-chat');
    if (!w) return;
    if (w.className.indexOf('open') < 0) w.className = w.className + ' open';
    verifyAndRoute();
  };

  window.fsDismiss = function (e) {
    e.stopPropagation();
    var b = document.getElementById('fs-banner');
    if (b) b.className = b.className + ' hidden';
  };

  function startChat() {
    var greeting = userName ? 'Hi ' + userName + '!' : 'Hi!';
    var opening = greeting + " I'm your FutureSelf advisor. To point you in the right direction, tell me where your head's at right now.";
    addAI(opening, true);
    history.push({ role: 'assistant', content: opening, timestamp: new Date().toISOString() });
    setPills(['Exploring options', 'Recruiting now', 'Interview prep', 'Totally unsure']);
  }

  window.fsSend = function () {
    if (!routed) return;
    var input = document.getElementById('fs-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    document.getElementById('fs-qr').innerHTML = '';
    addUser(text, true);
    history.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    callAPI();
  };

  window.fsPill = function (text) {
    if (!routed) return;
    document.getElementById('fs-qr').innerHTML = '';
    addUser(text, true);
    history.push({ role: 'user', content: text, timestamp: new Date().toISOString() });
    callAPI();
  };

  function parseReply(raw) {
    var suggestions = [];
    var memoryUpdate = null;
    var reply = raw;

    var suggestMatch = raw.match(/\{\s*"suggestions"\s*:\s*\[[^\]]*\]\s*\}/);
    if (suggestMatch) {
      try { suggestions = JSON.parse(suggestMatch[0]).suggestions || []; } catch(e) {}
      reply = reply.replace(suggestMatch[0], '').trim();
    }

    var memMatch = raw.match(/\{\s*"memory"\s*:\s*\{[\s\S]*?\}\s*\}(?!.*"memory")/);
    if (memMatch) {
      try { memoryUpdate = JSON.parse(memMatch[0]).memory || null; } catch(e) {}
      reply = reply.replace(memMatch[0], '').trim();
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
            conversationTurn: lastUser ? { user: lastUser.content, assistant: parsed.reply, timestamp: new Date().toISOString() } : undefined
          });
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
      messages: [{ role: 'system', content: buildSYS() }].concat(history)
    }));
  }

  function showTyping() {
    var body = document.getElementById('fs-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'fs-row'; div.id = 'fs-typing';
    div.innerHTML = '<div class="fs-av">' + icon + '</div><div class="fs-msg fs-ai" style="padding:10px 14px;"><span style="display:inline-flex;gap:4px;align-items:center;"><span style="width:6px;height:6px;border-radius:50%;background:#AFA9EC;animation:fsDot 1.2s infinite;display:inline-block;"></span><span style="width:6px;height:6px;border-radius:50%;background:#AFA9EC;animation:fsDot 1.2s 0.2s infinite;display:inline-block;"></span><span style="width:6px;height:6px;border-radius:50%;background:#AFA9EC;animation:fsDot 1.2s 0.4s infinite;display:inline-block;"></span></span></div>';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    if (!document.getElementById('fs-dot-style')) {
      var s = document.createElement('style');
      s.id = 'fs-dot-style';
      s.innerText = '@keyframes fsDot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}';
      document.head.appendChild(s);
    }
  }

  function hideTyping() {
    var t = document.getElementById('fs-typing');
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }

  function setPills(arr) {
    var c = document.getElementById('fs-qr');
    if (!c) return;
    c.innerHTML = '';
    for (var i = 0; i < arr.length; i++) {
      var p = document.createElement('div');
      p.className = 'fs-pill';
      p.innerText = arr[i];
      p.setAttribute('onclick', 'fsPill("' + arr[i].replace(/"/g, '') + '")');
      c.appendChild(p);
    }
  }

  function addAI(text, scroll) {
    var body = document.getElementById('fs-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'fs-row';
    div.innerHTML = '<div class="fs-av">' + icon + '</div><div class="fs-msg fs-ai">' + text + '</div>';
    body.appendChild(div);
    if (scroll) body.scrollTop = body.scrollHeight;
  }

  function addUser(text, scroll) {
    var body = document.getElementById('fs-body');
    if (!body) return;
    var div = document.createElement('div');
    div.className = 'fs-row';
    div.innerHTML = '<div class="fs-msg fs-usr">' + text + '</div>';
    body.appendChild(div);
    if (scroll) body.scrollTop = body.scrollHeight;
  }

  var inp = document.getElementById('fs-input');
  if (inp) inp.onkeydown = function (e) { if (e.key === 'Enter') fsSend(); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fsBoot);
  } else {
    setTimeout(fsBoot, 0);
  }
})();
