import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ---- behavior files (loaded once per cold start, not per request) ----
// edit these plain text files to change advisor personality, advising
// method, or the resource URL map. no code changes needed for content edits.
// try several candidate locations for the behavior dir, since process.cwd()
// on Vercel depends on the configured root directory. record which one wins
// (and any load errors) for troubleshooting.
const BEHAVIOR_DIR_CANDIDATES = [
  path.join(process.cwd(), 'behavior'),
  path.join(process.cwd(), 'proxy', 'behavior'),
  path.join(process.cwd(), 'api', '..', 'behavior'),
  '/var/task/behavior',
  '/var/task/proxy/behavior'
];
const BEHAVIOR_LOAD_LOG = [];
function loadBehaviorFile(name) {
  for (const dir of BEHAVIOR_DIR_CANDIDATES) {
    try {
      const content = fs.readFileSync(path.join(dir, name), 'utf8');
      BEHAVIOR_LOAD_LOG.push({ name: name, dir: dir, ok: true, length: content.length });
      return content;
    } catch(e) { /* try next candidate */ }
  }
  BEHAVIOR_LOAD_LOG.push({ name: name, dir: null, ok: false, length: 0 });
  return '';
}
const ADVISOR_BEHAVIOR = loadBehaviorFile('advisor-behavior.txt');
const ADVISING_FRAMEWORKS = loadBehaviorFile('advising-frameworks.txt');
const FUTURESELF_RESOURCES = loadBehaviorFile('futureself-resources.txt');

// company and community pages: "Name | URL | kind" per line (# = comment).
// only futureselfdiscover.com URLs are accepted.
const DIRECTORY = loadBehaviorFile('company-pages.txt').split(/\r?\n/)
  .map(function (l) { return l.trim(); })
  .filter(function (l) { return l && l.charAt(0) !== '#'; })
  .map(function (l) {
    const p = l.split('|').map(function (x) { return x.trim(); });
    return { name: p[0], url: p[1], kind: (p[2] || 'company').toLowerCase() === 'community' ? 'community' : 'company' };
  })
  .filter(function (e) { return e.name && e.name.length >= 2 && /^https:\/\/(www\.)?futureselfdiscover\.com\//.test(e.url || ''); })
  .slice(0, 400);

// ---- Supabase helpers ----

function hashUserId(userId) {
  return crypto
    .createHmac('sha256', process.env.USER_HASH_SALT || 'dev-salt')
    .update(String(userId))
    .digest('hex');
}

function scrub(text, profileName) {
  if (!text) return text;
  let t = text;
  t = t.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
  t = t.replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]');
  if (profileName) {
    profileName.split(/\s+/).filter(Boolean).forEach(function(part) {
      if (part.length > 2) {
        const re = new RegExp('\\b' + part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        t = t.replace(re, '[name]');
      }
    });
  }
  return t;
}

// ---- cost + abuse limits for chat ----
// Counts come from conversation_logs (every user message is logged), so no
// extra table is needed. A per-instance IP window catches bursts. Any lookup
// failure lets the message through: limits must never break normal use.
const LIMITS = {
  sessionPer10Min: +(process.env.LIMIT_SESSION_10MIN || 30),
  sessionPerDay: +(process.env.LIMIT_SESSION_DAY || 200),
  sitePerDay: +(process.env.LIMIT_SITE_DAY || 3000),
  ipPer10Min: +(process.env.LIMIT_IP_10MIN || 60),
  maxMessages: 60, maxCharsEach: 6000, maxCharsTotal: 80000
};
const ipHits = new Map();
function clientIp(req) {
  const xf = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '';
  return String(xf).split(',')[0].trim() || 'unknown';
}
function ipOver(req) {
  const ip = clientIp(req), now = Date.now(), win = 10 * 60 * 1000;
  const list = (ipHits.get(ip) || []).filter(function (t) { return now - t < win; });
  list.push(now); ipHits.set(ip, list);
  if (ipHits.size > 5000) ipHits.clear();
  return list.length > LIMITS.ipPer10Min;
}
async function countLogs(filter) {
  try {
    const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/conversation_logs?select=id&role=eq.user&' + filter, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY, Prefer: 'count=exact', Range: '0-0' }
    });
    const cr = r.headers.get('content-range') || '';
    const n = parseInt(cr.split('/')[1], 10);
    return isNaN(n) ? 0 : n;
  } catch (e) { return 0; }
}
async function chatLimit(req, sessionId, messages) {
  if (!Array.isArray(messages) || messages.length > LIMITS.maxMessages) return 'too_long';
  let total = 0;
  for (const m of messages) { const c = String((m && m.content) || ''); if (c.length > LIMITS.maxCharsEach) return 'too_long'; total += c.length; }
  if (total > LIMITS.maxCharsTotal) return 'too_long';
  if (ipOver(req)) return 'busy';
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  const since = function (ms) { return encodeURIComponent(new Date(Date.now() - ms).toISOString()); };
  const sid = encodeURIComponent(String(sessionId || 'none'));
  const counts = await Promise.all([
    countLogs('session_id=eq.' + sid + '&created_at=gte.' + since(10 * 60 * 1000)),
    countLogs('session_id=eq.' + sid + '&created_at=gte.' + since(86400000)),
    countLogs('created_at=gte.' + since(86400000))
  ]);
  if (counts[0] >= LIMITS.sessionPer10Min || counts[1] >= LIMITS.sessionPerDay) return 'busy';
  if (counts[2] >= LIMITS.sitePerDay) return 'site';
  return null;
}
const LIMIT_TEXT = {
  busy: "You've sent a lot of messages in a short time. Give it a few minutes and try again.",
  too_long: "This conversation has gotten too long for me to read in one go. Press reset to start a fresh one (your profile stays).",
  site: "Compass is taking a short break because of heavy use today. Please try again later."
};

async function logTurn(sessionId, page, role, content, profileName, logExtra) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return { error: 'missing env' };
  try {
    const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/conversation_logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(Object.assign({
        session_id: sessionId,
        page: page || null,
        role: role,
        content: scrub(content, profileName)
      }, logExtra || {}))
    });
    if (!r.ok) {
      const errText = await r.text();
      if (logExtra && /column/i.test(errText)) {
        return logTurn(sessionId, page, role, content, profileName, null);
      }
      return { error: 'supabase ' + r.status + ': ' + errText };
    }
    return { ok: true };
  } catch(e) { return { error: e.message }; }
}

async function getMemory(userId) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  try {
    const hash = hashUserId(userId);
    const res = await fetch(
      process.env.SUPABASE_URL + '/rest/v1/user_memory?user_hash=eq.' + hash + '&select=*',
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
        }
      }
    );
    const rows = await res.json();
    return (rows && rows[0]) || null;
  } catch(e) { return null; }
}

async function saveMemory(userId, fields, existing) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return { error: 'missing env' };
  try {
    const hash = hashUserId(userId);

    // knowledge and conversation_history are append-only: merge new entries
    // onto whatever's already stored rather than overwriting.
    const prevKnowledge = (existing && existing.knowledge) || [];
    const newKnowledge = fields.knowledge || [];
    const mergedKnowledge = prevKnowledge.concat(newKnowledge);

    const prevHistory = (existing && existing.conversation_history) || [];
    const newHistory = fields.conversationTurn ? [fields.conversationTurn] : [];
    const mergedHistory = prevHistory.concat(newHistory);

    // current_term and direction are OVERWRITTEN wholesale when provided,
    // otherwise keep whatever's already stored.
    const currentTerm = fields.currentTerm || (existing && existing.current_term) || {};
    const direction = fields.direction || (existing && existing.direction) || {};

    const sessionCount = ((existing && existing.session_count) || 0) + (fields.newSession ? 1 : 0);

    const res = await fetch(process.env.SUPABASE_URL + '/rest/v1/user_memory?on_conflict=user_hash', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        user_hash: hash,
        updated_at: new Date().toISOString(),
        last_session: new Date().toISOString(),
        focus: fields.focus || (existing && existing.focus) || null,
        summary: fields.summary || (existing && existing.summary) || null,
        topics: fields.topics || (existing && existing.topics) || [],
        frequent_pages: fields.frequentPages || (existing && existing.frequent_pages) || [],
        session_count: sessionCount,
        knowledge: mergedKnowledge,
        current_term: currentTerm,
        direction: direction,
        conversation_history: mergedHistory
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      return { error: 'supabase ' + res.status + ': ' + errText };
    }
    return { ok: true };
  } catch(e) { return { error: e.message }; }
}

// ---- grounded school data from the Python advisor backend (Railway) ----
// asks the backend (router.py) for real Vanderbilt course, club, salary and
// career data for the student's latest message. returns null on any problem
// (env not set, timeout, error) so the chat keeps working exactly as before.
async function getAdvisorData(messages, userId) {
  const url = process.env.ADVISOR_BACKEND_URL;
  const key = process.env.ADVISOR_BACKEND_KEY;
  if (!url || !key || !Array.isArray(messages) || messages.length === 0) return null;

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || !last.content) return null;

  const history = messages.slice(0, -1)
    .filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant') && m.content; })
    .slice(-6)
    .map(function(m) { return { role: m.role, content: String(m.content).slice(0, 2000) }; });

  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, 30000);
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        message: String(last.content).slice(0, 8000),
        user_hash: userId ? hashUserId(userId) : null,
        history: history
      }),
      signal: controller.signal
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || !d.answer || ['error', 'empty', 'too_long'].indexOf(d.feature) > -1) return null;
    return d;
  } catch(e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function advisorContextBlock(advisor) {
  return [
    'VERIFIED VANDERBILT DATA FOR THE STUDENT\'S LATEST MESSAGE',
    '(from the FutureSelf advisor database; feature: ' + advisor.feature + ', category: ' + advisor.category + ')',
    '---',
    advisor.display_html ? (advisor.brief || 'The requirements list is attached below the reply.') : advisor.answer,
    '---',
    'How to use this data:',
    '- Base your reply on it. Use its course codes, club names, salaries, programs, and resources exactly as written.',
    '- Do not add courses, clubs, numbers, people, or programs that are not in this data or in the student profile above.',
    advisor.display_html
      ? '- The full requirements list is attached automatically right after your reply. Write exactly ONE short sentence (under 20 words) introducing it. Do not list courses or requirements, do not ask a question, and add nothing else before the JSON lines. This overrides the usual one-question rule for this reply.'
      : '- When the data lists degree requirements, keep every requirement group and every course in it. Do not shorten, summarize, or drop any of them.',
    '- Rewrite it in your own voice and keep all your usual format rules, including the suggestions and memory JSON lines.',
    '- If the data says the question is outside what you help with, politely redirect instead of answering it.',
    '- If the data asks the student a clarifying question, ask that question.'
  ].filter(Boolean).join('\n');
}

// puts the advisor backend's complete requirements list (HTML) under the model's
// short reply, keeping the suggestions/memory JSON lines at the end for the widget
function attachRequirements(content, listHtml) {
  // the list replaces the model text: requirements replies are just the clean list,
  // plus the model's suggestions/memory JSON so the widget buttons and memory still work
  const s = String(content);
  const at = s.search(/\{\s*"(suggestions|memory)"/);
  const tail = at === -1 ? '' : s.slice(at).trim();
  return listHtml + (tail ? '\n' + tail : '');
}

// ---- reply clean-up ----
// The model is told to end with {"suggestions":[...]} and {"memory":{...}} on their own lines,
// but sometimes merges them, drops a brace, reorders them, or wraps them in ```json fences.
// The widget then shows raw JSON to the student. This rebuilds every reply into exactly:
//   <text>\n{"suggestions":[...]}\n{"memory":{...}}
// and never lets raw JSON reach the student, even if it can't be parsed.
const MEMORY_KEYS = ['knowledge', 'current_term', 'direction', 'focus', 'summary', 'topics', 'profile_suggestion', 'notepad_suggestion', 'todo_actions'];

function scanObjects(s) {
  // [{start, end}] for each balanced top-level {...}, ignoring braces inside strings
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0) { depth--; if (depth === 0) out.push({ start: start, end: i + 1 }); }
  }
  return out;
}

function tryParse(text) {
  try { return JSON.parse(text); } catch (e) {}
  try { return JSON.parse('{' + text + '}'); } catch (e) {}
  try { return JSON.parse(text + '}'); } catch (e) {}
  return null;
}

function normalizeReplyCore(content) {
  const raw = String(content || '');
  const keyRe = /\{?\s*"(suggestions|memory|knowledge|focus|summary|topics|profile_suggestion|notepad_suggestion|todo_actions|current_term|direction)"\s*:/;
  const m = raw.match(keyRe);
  if (!m) return raw.trim();

  const text = raw.slice(0, m.index).replace(/```(json)?\s*$/i, '').trim();
  const rest = raw.slice(m.index).replace(/```(json)?/gi, '');

  let suggestions = null, memory = null;
  function absorb(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj.suggestions)) suggestions = obj.suggestions;
    if (obj.memory && typeof obj.memory === 'object') memory = Object.assign(memory || {}, obj.memory);
    const loose = {};
    MEMORY_KEYS.forEach(function(k) { if (k in obj) loose[k] = obj[k]; });
    if (Object.keys(loose).length) memory = Object.assign(memory || {}, loose);
  }

  const blocks = scanObjects(rest);
  blocks.forEach(function(b) { absorb(tryParse(rest.slice(b.start, b.end))); });
  let cursor = 0;
  blocks.concat([{ start: rest.length, end: rest.length }]).forEach(function(b) {
    const piece = rest.slice(cursor, b.start).replace(/^[\s,]+|[\s,]+$/g, '');
    if (/^"(suggestions|memory)"\s*:/.test(piece + rest.slice(b.start, b.end))) {
      absorb(tryParse(piece + rest.slice(b.start, b.end)));
    }
    cursor = b.end;
  });

  const lines = [text];
  if (suggestions) lines.push(JSON.stringify({ suggestions: suggestions.slice(0, 3) }));
  if (memory) lines.push(JSON.stringify({ memory: memory }));
  return lines.filter(Boolean).join('\n');
}

function splitReply(out) {
  const lines = String(out || '').split('\n');
  const isJsonLine = function(l) { return /^\s*\{\s*"(suggestions|memory)"/.test(l); };
  const firstJson = lines.findIndex(isJsonLine);
  const textLines = firstJson === -1 ? lines : lines.slice(0, firstJson);
  const result = { text: textLines.join('\n'), suggestions: null, memory: null };
  if (firstJson === -1) return result;
  lines.slice(firstJson).filter(isJsonLine).forEach(function(l) {
    try {
      const o = JSON.parse(l);
      if (Array.isArray(o.suggestions)) result.suggestions = o.suggestions;
      if (o.memory && typeof o.memory === 'object') result.memory = o.memory;
    } catch (e) {}
  });
  return result;
}

function normalizeReply(content) {
  const parts = splitReply(normalizeReplyCore(content));
  let text = parts.text;
  const cut = text.search(/\s*\{\s*"[A-Za-z_]+"\s*:/);
  if (cut > -1) text = text.slice(0, cut);
  text = text.replace(/[\s,{}]+$/, '').trim();
  const lines = [text];
  if (parts.suggestions) lines.push(JSON.stringify({ suggestions: parts.suggestions }));
  if (parts.memory) lines.push(JSON.stringify({ memory: parts.memory }));
  return lines.filter(Boolean).join('\n');
}

// earlier assistant turns sent back by the widget can contain the same broken JSON;
// clean them so the model doesn't copy the broken pattern
function cleanHistory(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map(function(m) {
    return (m && m.role === 'assistant' && typeof m.content === 'string')
      ? Object.assign({}, m, { content: normalizeReply(m.content) }) : m;
  });
}

// saved chats from before the clean-up can still hold broken JSON; clean them when the
// widget reloads a student's history so old messages display cleanly too
function cleanStoredHistory(memory) {
  if (!memory || !Array.isArray(memory.conversation_history)) return memory;
  const history = memory.conversation_history.map(function(t) {
    if (!t || typeof t !== 'object') return t;
    if (typeof t.assistant === 'string') return Object.assign({}, t, { assistant: normalizeReply(t.assistant) });
    if (t.role === 'assistant' && typeof t.content === 'string') return Object.assign({}, t, { content: normalizeReply(t.content) });
    return t;
  });
  return Object.assign({}, memory, { conversation_history: history });
}

// ---- system prompt assembly ----
// builds the full system prompt server-side from the three behavior files
// plus per-request context (profile, memory, page). editing personality,
// advising method, or the resource list never requires a widget deploy.
function buildSystemPrompt(ctx) {
  const q = '"';
  const suggestExample = '{' + q + 'suggestions' + q + ':[' + q + 'short reply' + q + ',' + q + 'short reply' + q + ',' + q + 'short reply' + q + ']}';
  const memExample = '{' + q + 'memory' + q + ':{' + q + 'knowledge' + q + ':[{' + q + 'detail' + q + ':' + q + '...' + q + ',' + q + 'category' + q + ':' + q + '...' + q + '}],' + q + 'current_term' + q + ':{},' + q + 'direction' + q + ':{},' + q + 'focus' + q + ':' + q + '...' + q + ',' + q + 'summary' + q + ':' + q + '...' + q + ',' + q + 'topics' + q + ':[' + q + '...' + q + ']}}';
  const profileUrl = (ctx.profile && ctx.profile.id) ? 'https://futureselfdiscover.com/users/' + ctx.profile.id : 'their profile';

  return [
    ADVISOR_BEHAVIOR.replace('add it to their FutureSelf profile so it stays with them.', 'add it to their FutureSelf profile so it stays with them. Profile page: ' + profileUrl + '.'),
    '',
    ADVISING_FRAMEWORKS,
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
    '- "focus": the sharpest single-sentence read of this student: the best interpolation of who they are (summary) and where they are headed (direction). One well-said line. Update it whenever your understanding improves.',
    '- "summary": a SURFACE-LEVEL 1-2 sentence portrait of the student. No course numbers, professor names, or program specifics; those belong in knowledge. Think: "Jerald is a current senior planning to recruit and serve as a TA for engineering classes." Rewrite fully each turn as your picture improves.',
    '- "topics": a short array of recurring theme tags for this student, e.g. ["recruiting", "undergraduate engineering", "studying for PE exam"]. 2-5 words each, lowercase. Return the FULL updated list each turn (existing themes plus any new ones), not just new additions. Merge and dedupe; drop themes that no longer apply.',
    '- "profile_suggestion": OPTIONAL and RARE. Shape: {' + q + 'field' + q + ':' + q + 'skills' + q + ',' + q + 'value' + q + ':' + q + 'Python' + q + ',' + q + 'label' + q + ':' + q + 'Python' + q + ',' + q + 'ask' + q + ':' + q + '...' + q + '}. Allowed field values ONLY: skills, industries_of_interest, hobbies_interests, clubs_and_organizations, languages, awards_honors, currently_exploring, target_cities_regions, career_priorities, bio.',
    '  WHEN: only once the student has shown SUSTAINED interest in the same thing: it has come up across several of their messages, or they keep asking follow-up questions about it. A single passing mention is NOT enough; in that case explore it instead (what draws them to it, related projects, companies, roles, or FutureSelf pages) and do not suggest anything yet.',
    '  The visible reply must stay about the substance of what they asked. Never make the profile question the point of the reply, and never write the profile question in the reply text itself: it goes ONLY in "ask".',
    '  "ask": one short, natural question in your own voice that ties to what they are exploring right now and says briefly why it helps (others can see the interest, and it sharpens future advice). Vary the wording every time; never reuse a phrasing from earlier in the conversation and never start with "Want me to add". Do not use quotation marks inside it.',
    '  At most ONE per response, never more than one every few exchanges, never re-suggest something already declined, never suggest what is already on their profile. Omit the key entirely when nothing fits.',
    '  EXCEPTION, the student asks you directly (e.g. "add AI to my profile", "put robotics club on my profile"): do it in THIS reply. Include profile_suggestion with ' + q + 'explicit' + q + ':true, pick the field that fits best (skills for abilities and tools, industries_of_interest for fields they want to work in, hobbies_interests for personal interests, clubs_and_organizations for groups), and write the value as they would want it shown (e.g. ' + q + 'Artificial Intelligence' + q + '). The visible reply is one short sentence saying it is ready to add below; do not ask exploratory questions first. Only ask which field they mean if it is truly unclear.',
    '- "notepad_suggestion": OPTIONAL and EVEN RARER. Shape: {' + q + 'kind' + q + ':' + q + 'task' + q + ',' + q + 'text' + q + ':' + q + '...' + q + ',' + q + 'ask' + q + ':' + q + '...' + q + '}. kind is "task" (a concrete next step) or "note" (something worth remembering).',
    '  WHEN: only when the student commits to a specific, doable next step (e.g. reaching out to a named person, an application deadline), or explicitly asks you to remind them or note something. Never suggest generic busywork. A full list overwhelms students, so if they already have several open tasks (see NOTEPAD below), hold back unless they ask. At most one per conversation unless the student asks for more.',
    '  "text": the task or note itself, under 12 words, starting with a verb for tasks. "ask": one short, varied, low-pressure question offering to save it, in your own voice. Omit the key entirely otherwise.',
    '- "todo_actions": OPTIONAL. Use ONLY when the student asks you to review, plan, update, or clean up their to-do list, or tells you they finished or changed something on it. Shape: {' + q + 'ask' + q + ':' + q + '...' + q + ',' + q + 'items' + q + ':[...]}. Each item is one of:',
    '  {"op":"steps","id":"<task id>","steps":["...","..."]} to break a task into 2-5 short, concrete steps (verbs first, under 10 words each);',
    '  {"op":"complete","id":"<task id>"} when they said it is done; {"op":"rename","id":"<task id>","text":"..."} to make a vague task concrete;',
    '  {"op":"add","text":"..."} only for a next step they agreed to. Use only task ids from the TO-DO LIST below. Never delete tasks.',
    '  Your visible reply should still walk them through it in plain words (e.g. why that order, what to do first); "ask" is one short question offering to save the changes. The student confirms before anything changes.',
    'If nothing memory-worthy happened this turn, still include the memory JSON with empty/omitted fields. Never skip this line.',
    '',
    FUTURESELF_RESOURCES,
    'COMPANIES AND COMMUNITIES: when you name a specific company, employer, club, or organization that is NOT in the COMPANY AND COMMUNITY PAGES list, wrap the FIRST mention of it in double square brackets, like [[Zoox]]. Do not wrap later mentions, FutureSelf pages, or generic terms.',
    DIRECTORY.length ? '\nCOMPANY AND COMMUNITY PAGES ON FUTURESELF\nWhenever you mention one of these companies or communities, link its name to its page (same link format as above). Never invent a page for anything not on this list.\n' +
      DIRECTORY.map(function (e) { return e.name + ' (' + e.kind + '): ' + e.url; }).join('\n') : '',
    '',
    'CURRENT PAGE THE STUDENT IS ON: ' + (ctx.pageDesc || 'a FutureSelf page'),
    '',
    'WHAT YOU ALREADY KNOW ABOUT THIS STUDENT (from FutureSelf profile):',
    ctx.profileContext || 'No profile data available.',
    '',
    'WHAT YOU ALREADY REMEMBER ABOUT THIS STUDENT (from past conversations):',
    ctx.memoryContext || 'No prior memory for this student yet.',
    '',
    'TO-DO LIST (the student\'s own list in the widget; you never see their private notes):',
    (typeof ctx.notepadContext === 'string' && ctx.notepadContext) ? ctx.notepadContext.slice(0, 2500) : 'Empty.'
  ].join('\n');
}

// ---- Hivebrite Partner API (Service App) helpers ----
// token: client_credentials + audience=partner at auth.us.hivebrite.com,
// client credentials URL-encoded into HTTP Basic (Ory Hydra, RFC 6749 2.3.1).
const PARTNER_AUTH = 'https://auth.us.hivebrite.com/oauth2/token';
const PARTNER_API = 'https://api.us.hivebrite.com';
async function partnerToken() {
  const id = (process.env.ADMIN_API_CLIENT_ID || '').trim();
  const sec = (process.env.ADMIN_API_CLIENT_SECRET || '').trim();
  if (!id || !sec) return { error: 'ADMIN_API_CLIENT_ID / ADMIN_API_CLIENT_SECRET not set' };
  const enc = function (v) { return encodeURIComponent(v).replace(/%20/g, '+'); };
  const r = await fetch(PARTNER_AUTH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(enc(id) + ':' + enc(sec)).toString('base64')
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', audience: 'partner' }).toString()
  });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
  return j.access_token ? { token: j.access_token } : { error: j.error || ('token ' + r.status), status: r.status };
}
async function partnerCall(token, path, opts) {
  const o = opts || {};
  const r = await fetch(PARTNER_API + path, {
    method: o.method || 'GET',
    headers: Object.assign({ Authorization: 'Bearer ' + token, accept: 'application/json', 'Accept-Encoding': 'gzip, br' },
      o.body ? { 'Content-Type': 'application/json' } : {}),
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t.slice(0, 300) }; }
  return { status: r.status, ok: r.ok, body: j, requestId: r.headers.get('x-request-id') };
}

// staging field -> Hivebrite custom attribute (names from customizable_attributes)
// text: appended to what is already there; select: must match an existing option
const PARTNER_ATTR_MAP = {
  hobbies_interests:       { name: '_a3f78cc3_Hobbies_Interests', kind: 'text' },
  clubs_and_organizations: { name: '_0392026c_Clubs_and_Organizations_', kind: 'text' },
  awards_honors:           { name: '_150eb392_Awards', kind: 'text' },
  target_cities_regions:   { name: '_a3d0b3e5_Which_cities_or_regions_are_you_most_interested_in_living_or_working_in_after_college_', kind: 'text' },
  bio:                     { name: '_afbad3b6_My_Story', kind: 'text' },
  currently_exploring:     { name: '_defe795c_Which_of_the_following_are_you_currently_exploring_', kind: 'select' },
  career_priorities:       { name: '_7e8364eb_What_s_most_important_to_you_in_your_future_career_', kind: 'select' }
  // skills, industries_of_interest, languages: pending (native fields / DoubleSelect)
};

function appendText(existing, add) {
  const cur = String(existing || '').trim();
  const parts = cur ? cur.split(/\s*[;,\n]\s*/) : [];
  const lower = parts.map(function (p) { return p.toLowerCase(); });
  add.forEach(function (v) { v = String(v).trim(); if (v && lower.indexOf(v.toLowerCase()) === -1) { parts.push(v); lower.push(v.toLowerCase()); } });
  return parts.join(', ');
}

// ---- push a member's confirmed profile adds to Hivebrite (Partner API) ----
// opts.dryRun: build the update without writing.
// opts.auto: called right after a student confirmed in chat. Only list-style
//   text fields push automatically (each value appended, never replacing what
//   the member wrote), capped per day. Everything else stays staged for review.
// Until Hivebrite Connected Apps exist, the widget's userId can't be verified,
// so auto-push is append-only, short values only, rate-limited and logged.
// Set PROFILE_AUTO_PUSH=off in Vercel to stop it without a deploy.
const AUTO_PUSH_FIELDS = ['hobbies_interests', 'clubs_and_organizations', 'awards_honors', 'target_cities_regions'];
const AUTO_PUSH_PER_DAY = 6;
function cleanProfileValue(v) {
  return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
async function pushProfileUpdates(userId, opts) {
  const o = opts || {};
  const sb = { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY };
  const hash = hashUserId(userId);
  const stRes = await fetch(process.env.SUPABASE_URL + '/rest/v1/fsd_profile?user_hash=eq.' + hash + '&select=*', { headers: sb });
  const staged = (stRes.ok ? await stRes.json() : [])[0];
  if (!staged) return { step: 'push', error: 'no staging row for this user' };
  const pushLog = staged.push_log || [];
  let pending = pushLog.filter(function (e) { return !e.pushed; });
  if (o.auto) {
    const dayAgo = Date.now() - 86400000;
    const recent = pushLog.filter(function (e) { return e.pushed && e.auto && new Date(e.pushed_at).getTime() > dayAgo; }).length;
    if (recent >= AUTO_PUSH_PER_DAY) return { step: 'push', held: 'daily limit' };
    pending = pending.filter(function (e) { return AUTO_PUSH_FIELDS.indexOf(e.field) > -1; }).slice(0, AUTO_PUSH_PER_DAY - recent);
  }
  if (!pending.length) return { step: 'push', ok: true, note: 'nothing pending' };

  const tok = await partnerToken();
  if (!tok.token) return { step: 'token', error: tok.error, status: tok.status || null };
  const cur = await partnerCall(tok.token, '/admin/v3.1/users/' + encodeURIComponent(userId));
  if (!cur.ok) return { step: 'read_user', status: cur.status, error: cur.body.error || cur.body, request_id: cur.requestId };
  const user = cur.body.user || cur.body;
  const currentAttrs = {};
  (Array.isArray(user.custom_attributes) ? user.custom_attributes : []).forEach(function (c) { if (c && c.name) currentAttrs[c.name] = c.value; });

  const byAttr = {}, unmapped = [];
  pending.forEach(function (e) {
    const m = PARTNER_ATTR_MAP[e.field];
    if (!m) { unmapped.push(e.field); return; }
    (byAttr[m.name] = byAttr[m.name] || { kind: m.kind, values: [] }).values.push(e.value);
  });
  const custom_attributes = [], preview = [];
  Object.keys(byAttr).forEach(function (name) {
    const a = byAttr[name];
    const next = a.kind === 'text' ? appendText(currentAttrs[name], a.values) : a.values[a.values.length - 1];
    custom_attributes.push({ name: name, value: next });
    preview.push({ attribute: name, kind: a.kind, current: currentAttrs[name] == null ? null : currentAttrs[name], proposed: next });
  });
  if (!custom_attributes.length) return { step: 'push', note: 'pending items have no mapped attribute yet', unmapped_fields: unmapped };
  const payload = { user: { custom_attributes: custom_attributes } };

  if (o.dryRun) {
    return {
      step: 'push_dry_run', note: 'nothing was written. pass dryRun:false to write.',
      pending_count: pending.length, unmapped_fields: unmapped,
      current_attribute_shape: Array.isArray(user.custom_attributes) && user.custom_attributes[0] ? Object.keys(user.custom_attributes[0]) : null,
      would_PUT: PARTNER_API + '/admin/v3.1/users/' + userId, preview: preview, payload: payload
    };
  }

  const put = await partnerCall(tok.token, '/admin/v3.1/users/' + encodeURIComponent(userId), { method: 'PUT', body: payload });
  if (!put.ok) return { step: 'push_failed', status: put.status, response: put.body, request_id: put.requestId, payload: payload };
  const nowIso = new Date().toISOString();
  const sent = new Set(pending);
  const updatedLog = pushLog.map(function (e) {
    return (sent.has(e) && PARTNER_ATTR_MAP[e.field]) ? Object.assign({}, e, { pushed: true, pushed_at: nowIso, auto: !!o.auto }) : e;
  });
  await fetch(process.env.SUPABASE_URL + '/rest/v1/fsd_profile?user_hash=eq.' + hash, {
    method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, sb),
    body: JSON.stringify({ push_log: updatedLog, updated_at: nowIso })
  });
  return { step: 'pushed', status: put.status, written: preview, unmapped_fields: unmapped, request_id: put.requestId };
}

// ---- admin check for debug endpoints ----
// debug output includes the full system prompt, so only callers with the
// ADMIN_KEY (body.adminKey or x-admin-key header) may use it.
function isAdminRequest(req) {
  const key = (req.body && req.body.adminKey) || req.headers['x-admin-key'];
  return !!process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
}

// ---- main handler ----

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, messages, userId, sessionId, page, profileName, context } = req.body;

  try {

    // ---- chat: proxy to OpenAI + log anonymously ----
    // thumbs up on a reply. Stored as a tagged assistant row so it sits next to
    // the conversation it rates (the table only allows user/assistant roles).
    if (type === 'feedback') {
      const text = String(req.body.reply || '').slice(0, 1200);
      if (!sessionId || !text) return res.status(400).json({ error: 'sessionId and reply required' });
      if (ipOver(req)) return res.status(200).json({ ok: false, limited: true });
      const r = await logTurn(sessionId, page, 'assistant', text, profileName, { feature: 'feedback', category: 'thumbs_up' });
      return res.status(200).json({ ok: !(r && r.error) });
    }

    if (type === 'chat') {
      const limited = await chatLimit(req, sessionId, messages);
      if (limited) {
        return res.status(200).json({ _limited: limited, choices: [{ message: { content: LIMIT_TEXT[limited] } }] });
      }
      // messages arrives WITHOUT a system message; the proxy builds and
      // prepends it from the behavior files + context sent by the widget.
      // backward compatible: if messages already has a system message
      // (older widget), use it as-is instead of building a new one.
      let fullMessages = cleanHistory(messages);
      const hasSystem = messages && messages.length > 0 && messages[0].role === 'system';
      if (!hasSystem && context) {
        fullMessages = [{ role: 'system', content: buildSystemPrompt(context) }].concat(cleanHistory(messages) || []);
      }

      // add verified school data from the advisor backend, if available
      const advisor = await getAdvisorData(messages, userId);
      if (advisor) {
        const block = advisorContextBlock(advisor);
        if (fullMessages && fullMessages.length && fullMessages[0].role === 'system') {
          fullMessages = [{ role: 'system', content: fullMessages[0].content + '\n\n' + block }].concat(fullMessages.slice(1));
        } else {
          fullMessages = [{ role: 'system', content: block }].concat(fullMessages || []);
        }
      }

      // admin tool: return the exact system prompt without calling OpenAI or
      // logging, to inspect what the model actually receives.
      if (req.body.debugReturnPrompt) {
        if (!isAdminRequest(req)) return res.status(403).json({ error: 'forbidden' });
        return res.status(200).json({
          _debug_system_prompt: (fullMessages && fullMessages[0] && fullMessages[0].role === 'system') ? fullMessages[0].content : buildSystemPrompt(context || {}),
          _advisor: advisor ? { feature: advisor.feature, category: advisor.category, question: advisor.question } : null,
          _built_from_context: !hasSystem && !!context
        });
      }

      // log the last user message and the assistant response anonymously.
      // the result rides along as _log so silent failures (grants, schema)
      // are visible in the Network tab during debugging.
      async function logChat(assistantContent) {
        let logResult = { skipped: 'no sessionId' };
        if (!sessionId || !messages || !messages.length) return logResult;
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        if (lastUser) logResult = await logTurn(sessionId, page, 'user', lastUser.content, profileName);
        if (assistantContent) {
          const r2 = await logTurn(sessionId, page, 'assistant', assistantContent, profileName,
            advisor ? { feature: advisor.feature || null, category: advisor.category || null } : null);
          if (r2 && r2.error) logResult = r2;
        }
        return logResult;
      }

      // ---- streamed reply: newline-delimited JSON ----
      //   {"d":"text"}            a piece of the reply as the model writes it
      //   {"done":true,"content"} the cleaned, final reply (same shape as the JSON path)
      // The widget shows the pieces as they land and swaps in the final content at the end.
      if (req.body.stream === true) {
        const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
          },
          body: JSON.stringify({ model: 'gpt-4o', messages: fullMessages, stream: true })
        });
        if (!upstream.ok || !upstream.body) {
          return res.status(200).json({
            choices: [{ message: { content: "I'm having trouble connecting right now. Try again in a moment." } }],
            _upstream_status: upstream.status
          });
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        const send = function(o) { res.write(JSON.stringify(o) + '\n'); };

        // a requirements list replaces the model's text, so don't stream text that gets swapped out
        const showPieces = !(advisor && advisor.display_html);
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let full = '', buf = '';
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buf += decoder.decode(chunk.value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) > -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line.indexOf('data:') !== 0) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
              if (d) { full += d; if (showPieces) send({ d: d }); }
            } catch (e) {}
          }
        }
        let content = normalizeReply(full || "I'm having trouble connecting right now. Try again in a moment.");
        if (advisor && advisor.display_html) content = attachRequirements(content, advisor.display_html);
        const logResult = await logChat(content);
        send({ done: true, content: content, _log: logResult,
               _advisor: advisor ? { feature: advisor.feature, category: advisor.category } : null });
        return res.end();
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
        },
        body: JSON.stringify({ model: 'gpt-4o', messages: fullMessages })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message &&
          typeof data.choices[0].message.content === 'string') {
        data.choices[0].message.content = normalizeReply(data.choices[0].message.content);
      }
      if (advisor && advisor.display_html && data.choices && data.choices[0] && data.choices[0].message &&
          typeof data.choices[0].message.content === 'string') {
        data.choices[0].message.content = attachRequirements(data.choices[0].message.content, advisor.display_html);
      }

      data._log = await logChat(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
      data._advisor = advisor ? { feature: advisor.feature, category: advisor.category } : null;

      return res.status(200).json(data);
    }

    // ---- organize_notes: "Orient" in the notepad. Only runs when the student
    // confirms. Groups and/or rewrites their notes; a check afterwards puts back
    // anything the model dropped, so nothing is ever lost.
    if (type === 'organize_notes') {
      const notes = String(req.body.notes || '').slice(0, 8000);
      const mode = ['group', 'rewrite', 'both'].indexOf(req.body.mode) > -1 ? req.body.mode : 'group';
      if (!notes.trim()) return res.status(200).json({ error: 'empty' });
      const how = {
        group: 'Group related lines under short headings. Keep every line\'s wording EXACTLY as written (you may only move lines and drop leading bullet symbols). Do not rephrase, merge, or shorten anything.',
        rewrite: 'Keep the original order. Rewrite each line to be clear and concise, fixing spelling and grammar, but keep every fact, name, number, date, link, and email. Do not merge separate items or drop any.',
        both: 'Group related items under short headings, and rewrite each item to be clear and concise, fixing spelling and grammar. Keep every fact, name, number, date, link, and email. Do not drop any item.'
      }[mode];
      const sys = [
        'You organize a college student\'s personal notes. ' + how,
        'Output plain text only: headings on their own line ending with a colon, items as lines starting with "- ". No markdown symbols like # or **, no commentary before or after.',
        'Never add information that is not in the notes. Never remove information. If something does not fit a group, put it under "Other:".'
      ].join('\n');
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
          body: JSON.stringify({ model: 'gpt-4o', temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content: notes }] })
        });
        const j = await r.json();
        let out = String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').replace(/```[a-z]*\n?/gi, '').trim();
        if (!out) return res.status(200).json({ error: 'no output' });

        // safety net: nothing may go missing
        const norm = function (t) { return String(t).toLowerCase().replace(/^[\s\-*\u2022\d.)]+/, '').replace(/\s+/g, ' ').trim(); };
        const outNorm = out.toLowerCase().replace(/\s+/g, ' ');
        const missing = [];
        if (mode === 'group') {
          notes.split(/\r?\n/).forEach(function (l) { const n = norm(l); if (n && outNorm.indexOf(n) === -1) missing.push(l.replace(/^[\s\-*\u2022]+/, '').trim()); });
        } else {
          // names, numbers, links, emails, and dates must all survive a rewrite
          const keyRe = /(https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.]+|\b\d[\d/:.,-]*\b|\b[A-Z][a-zA-Z]{2,}\b)/g;
          notes.split(/\r?\n/).forEach(function (l) {
            const toks = (l.match(keyRe) || []).filter(function (t) { return !/^(The|This|That|And|But|For|With|Ask|Email|Call|Meet|Look|Check|Send|Get|Find|Apply|Update|Research|Talk|Follow|Remember|Need|Make|Read|Write)$/.test(t); });
            if (toks.some(function (t) { return outNorm.indexOf(t.toLowerCase()) === -1; })) missing.push(l.replace(/^[\s\-*\u2022]+/, '').trim());
          });
        }
        if (missing.length) out += '\n\nKept from your original notes:\n' + missing.map(function (m) { return '- ' + m; }).join('\n');
        return res.status(200).json({ ok: true, notes: out, mode: mode, restored: missing.length });
      } catch (e) { return res.status(200).json({ error: e.message }); }
    }

    // ---- organize_todos: Orient for the to-do list. Every task comes back
    // exactly once (by id); in group mode the wording is never changed.
    if (type === 'organize_todos') {
      const tasks = (Array.isArray(req.body.tasks) ? req.body.tasks : []).slice(0, 60)
        .filter(function (t) { return t && typeof t.id === 'string' && typeof t.text === 'string'; })
        .map(function (t) { return { id: t.id.slice(0, 40), text: t.text.slice(0, 200) }; });
      const mode = ['group', 'rewrite', 'both'].indexOf(req.body.mode) > -1 ? req.body.mode : 'group';
      if (!tasks.length) return res.status(200).json({ error: 'empty' });
      const how = {
        group: 'Sort the tasks into 2-5 short groups (1-3 word labels) and order them sensibly within each group (deadlines and prerequisites first). Do NOT change any task text.',
        rewrite: 'Keep the order. Rewrite each task to be short, concrete, and start with a verb, keeping every name, date, number, and link. Use the group "" for all.',
        both: 'Sort into 2-5 short groups (1-3 word labels), order sensibly, and rewrite each task to be short and concrete starting with a verb, keeping every name, date, number, and link.'
      }[mode];
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
          body: JSON.stringify({ model: 'gpt-4o', temperature: 0.2, response_format: { type: 'json_object' }, messages: [
            { role: 'system', content: 'You organize a college student\'s to-do list. ' + how + ' Return JSON: {"tasks":[{"id":"...","text":"...","group":"..."}]} containing EVERY input task exactly once, by its id. Never invent or drop tasks.' },
            { role: 'user', content: JSON.stringify(tasks) }
          ] })
        });
        const j = await r.json();
        let out = []; try { out = JSON.parse(j.choices[0].message.content).tasks || []; } catch (e) {}
        const byId = {}; tasks.forEach(function (t) { byId[t.id] = t; });
        const seen = {}, result = [];
        out.forEach(function (t) {
          if (!t || !byId[t.id] || seen[t.id]) return;
          seen[t.id] = true;
          const orig = byId[t.id].text;
          let text = mode === 'group' ? orig : String(t.text || '').trim().slice(0, 200) || orig;
          if (mode !== 'group') {   // names, numbers, links, emails must survive a rewrite
            const keyRe = /(https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.]+|\b\d[\d/:.,-]*\b|\b[A-Z][a-zA-Z]{2,}\b)/g;
            const toks = (orig.match(keyRe) || []).filter(function (k) { return !/^(The|This|That|And|But|For|With|Ask|Email|Call|Meet|Look|Check|Send|Get|Find|Apply|Update|Research|Talk|Follow|Remember|Need|Make|Read|Write|Schedule|Finish|Review|Prepare|Draft|Submit|Book|Practice)$/.test(k); });
            if (toks.some(function (k) { return text.toLowerCase().indexOf(k.toLowerCase()) === -1; })) text = orig;
          }
          result.push({ id: t.id, text: text, group: mode === 'rewrite' ? '' : String(t.group || '').trim().slice(0, 30) });
        });
        let restored = 0;
        tasks.forEach(function (t) { if (!seen[t.id]) { result.push({ id: t.id, text: t.text, group: mode === 'rewrite' ? '' : 'Other' }); restored++; } });
        return res.status(200).json({ ok: true, tasks: result, mode: mode, restored: restored });
      } catch (e) { return res.status(200).json({ error: e.message }); }
    }

    // ---- directory: public list of company/community pages for auto-linking ----
    if (type === 'directory') {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ entries: DIRECTORY });
    }

    // ---- memory: get per-user memory (identified, server-side only) ----
    if (type === 'get_memory') {
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const memory = await getMemory(userId);
      return res.status(200).json({ memory: cleanStoredHistory(memory) });
    }

    // ---- memory: save per-user memory ----
    if (type === 'save_memory') {
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const existing = await getMemory(userId);
      const result = await saveMemory(userId, req.body, existing);
      return res.status(200).json(result);
    }

    // ---- memory: delete per-user memory (student-initiated full reset) ----
    if (type === 'delete_memory') {
      if (!userId) return res.status(400).json({ error: 'userId required' });
      try {
        const hash = hashUserId(userId);
        const del = await fetch(process.env.SUPABASE_URL + '/rest/v1/user_memory?user_hash=eq.' + hash, {
          method: 'DELETE',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY
          }
        });
        if (!del.ok) {
          const errText = await del.text();
          return res.status(200).json({ error: 'supabase ' + del.status + ': ' + errText });
        }
        return res.status(200).json({ ok: true });
      } catch(e) { return res.status(200).json({ error: e.message }); }
    }

    // ---- profile: consent-confirmed write to fsd_profile staging ----
    if (type === 'save_profile') {
      const field = req.body.field;
      const value = cleanProfileValue(req.body.value);
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (!/^\d{1,12}$/.test(String(userId))) return res.status(400).json({ error: 'invalid userId' });
      if (!value || value.length > (field === 'bio' ? 600 : 80)) return res.status(400).json({ error: 'invalid value' });
      const ARRAY_FIELDS = ['skills','industries_of_interest','hobbies_interests','clubs_and_organizations','languages','awards_honors','target_cities_regions'];
      const TEXT_FIELDS = ['currently_exploring','career_priorities','bio'];
      if (!field || value === undefined || (ARRAY_FIELDS.indexOf(field) === -1 && TEXT_FIELDS.indexOf(field) === -1)) {
        return res.status(400).json({ error: 'invalid field' });
      }
      try {
        const hash = hashUserId(userId);

        // fetch existing staging row, if any
        const getRes = await fetch(
          process.env.SUPABASE_URL + '/rest/v1/fsd_profile?user_hash=eq.' + hash + '&select=*',
          { headers: {
              'apikey': process.env.SUPABASE_SERVICE_KEY,
              'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } }
        );
        const rows = getRes.ok ? await getRes.json() : [];
        const existing = rows[0] || {};

        const body = {
          user_hash: hash,
          updated_at: new Date().toISOString()
        };
        if (ARRAY_FIELDS.indexOf(field) > -1) {
          const arr = existing[field] || [];
          if (arr.indexOf(value) === -1) arr.push(value); // append, dedupe
          body[field] = arr;
        } else {
          body[field] = value; // text fields overwrite
        }
        const log = existing.push_log || [];
        log.push({ field: field, value: value, confirmed_at: new Date().toISOString(), pushed: false });
        body.push_log = log;

        const up = await fetch(process.env.SUPABASE_URL + '/rest/v1/fsd_profile?on_conflict=user_hash', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(body)
        });
        if (!up.ok) {
          const errText = await up.text();
          return res.status(200).json({ error: 'supabase ' + up.status + ': ' + errText });
        }
        // the student confirmed it, so it goes on their profile now (see pushProfileUpdates)
        let pushed = false, push = null;
        if (process.env.ADMIN_API_CLIENT_ID && process.env.PROFILE_AUTO_PUSH !== 'off' && AUTO_PUSH_FIELDS.indexOf(field) > -1) {
          try {
            push = await pushProfileUpdates(userId, { auto: true });
            pushed = push.step === 'pushed';
          } catch (e) { push = { error: e.message }; }
        }
        return res.status(200).json({ ok: true, pushed: pushed, push_step: push ? (push.step || null) : 'staged', held: push && push.held ? push.held : undefined });
      } catch(e) { return res.status(200).json({ error: e.message }); }
    }

    // ---- push_profile on the Partner API (admin-only, dry run by default) ----
    // reads the staging row, reads the member's current profile, builds the
    // update. Nothing is written unless dryRun:false is passed explicitly.
    // admin-only, read-only: how Hivebrite stores built-in fields (skills, industries,
    // languages) on this user, so profile adds for those fields can be wired up
    if (type === 'profile_shape' && process.env.ADMIN_API_CLIENT_ID) {
      if (!isAdminRequest(req)) return res.status(403).json({ error: 'forbidden' });
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const tok = await partnerToken();
      if (!tok.token) return res.status(200).json({ step: 'token', error: tok.error });
      const cur = await partnerCall(tok.token, '/admin/v3.1/users/' + encodeURIComponent(userId));
      if (!cur.ok) return res.status(200).json({ step: 'read_user', status: cur.status, error: cur.body });
      const u = cur.body.user || cur.body;
      const pick = {};
      Object.keys(u).forEach(function (k) { if (/skill|industr|language|interest|expertise|tag/i.test(k)) pick[k] = u[k]; });
      return res.status(200).json({ top_level_keys: Object.keys(u), related_fields: pick });
    }

    if (type === 'push_profile' && process.env.ADMIN_API_CLIENT_ID) {
      if (!isAdminRequest(req)) return res.status(403).json({ error: 'forbidden' });
      if (!userId) return res.status(400).json({ error: 'userId required' });
      return res.status(200).json(await pushProfileUpdates(userId, { dryRun: req.body.dryRun !== false }));
    }

    // ---- Hivebrite Partner API (Service App) -------------------------------
    // =====================================================================
    // LOG DIGEST SYSTEM (Design A: human-in-the-loop)
    // ---------------------------------------------------------------------
    // generate_digest : (cron, weekly) reads conversation_logs, summarizes
    //   via the model, writes a pending suggestion row to log_digests.
    // list_digests    : (admin) returns digests for the review page.
    // apply_digest    : (admin) takes the human-EDITED behavior text and
    //   commits it to the repo via the GitHub API, marks the digest applied.
    //
    // security: list_digests and apply_digest require the ADMIN_KEY. the
    // public widget never sends it, so the open proxy URL cannot trigger a
    // commit or read digests. generate_digest requires either the ADMIN_KEY
    // or the Vercel cron secret, so it cannot be triggered anonymously.
    // =====================================================================

    // ---- generate_digest: summarize recent logs into a pending suggestion ----
    if (type === 'generate_digest') {
      // auth: allow if admin key matches, OR if the Vercel cron secret header
      // is present (Vercel sets Authorization: Bearer <CRON_SECRET> on cron
      // invocations when CRON_SECRET is configured).
      const adminKey = req.body.adminKey || req.headers['x-admin-key'];
      const cronAuth = req.headers['authorization'];
      const isAdmin = process.env.ADMIN_KEY && adminKey === process.env.ADMIN_KEY;
      const isCron = process.env.CRON_SECRET && cronAuth === ('Bearer ' + process.env.CRON_SECRET);
      if (!isAdmin && !isCron) {
        return res.status(403).json({ error: 'forbidden: admin key or cron secret required' });
      }
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        return res.status(200).json({ error: 'missing supabase env' });
      }

      // window: default last 7 days, overridable for manual runs
      const days = req.body.days || 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // pull recent logs (user turns are the signal for "what students ask")
      const logsRes = await fetch(
        process.env.SUPABASE_URL + '/rest/v1/conversation_logs' +
          '?created_at=gte.' + since +
          '&select=role,content,page,created_at' +
          '&order=created_at.desc&limit=1000',
        { headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } }
      );
      const logs = logsRes.ok ? await logsRes.json() : [];
      const userTurns = logs.filter(function(l) { return l.role === 'user'; });

      // if there's essentially no data, write a low-signal digest and stop.
      // this is expected at current traffic; the machine still runs.
      if (userTurns.length < 3) {
        const emptyRow = {
          created_at: new Date().toISOString(),
          window_days: days,
          user_turn_count: userTurns.length,
          status: 'pending',
          summary: 'Not enough activity this period (' + userTurns.length +
            ' student messages) to surface reliable patterns.',
          suggestion: 'No changes recommended. Let more traffic accumulate.',
          proposed_edit: null,
          target_file: null
        };
        await fetch(process.env.SUPABASE_URL + '/rest/v1/log_digests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(emptyRow)
        });
        return res.status(200).json({ step: 'generate_digest', ok: true, low_data: true, user_turns: userTurns.length });
      }

      // build a compact, PII-free corpus for the model. logs are already
      // scrubbed at write time, but truncate hard and cap count as defense.
      const corpus = userTurns.slice(0, 300).map(function(l) {
        return '- ' + String(l.content || '').slice(0, 200);
      }).join('\n');

      const digestSystem =
        'You analyze anonymized student questions sent to a college career advising assistant. ' +
        'Identify the 3-5 most common themes or needs, and note any timely pattern (e.g. a spike in a topic). ' +
        'Then, IF AND ONLY IF the data clearly supports it, propose ONE concrete adjustment to the advisor. ' +
        'Be conservative: if the data is thin or mixed, say no change is warranted. ' +
        'Never invent patterns that are not in the data. ' +
        'Respond ONLY with JSON, no prose, no markdown, exactly this shape: ' +
        '{"summary":"2-3 sentences on what students asked about","suggestion":"a recommendation TO THE HUMAN reviewer, phrased as a question they can accept or reject","proposed_edit":"optional: a short snippet of advisor-behavior guidance to consider adding, or null"}';

      const digestRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: digestSystem },
            { role: 'user', content: 'Student questions from the last ' + days + ' days:\n\n' + corpus }
          ]
        })
      });
      const digestData = await digestRes.json();
      let parsed = { summary: '', suggestion: '', proposed_edit: null };
      try {
        const raw = digestData.choices[0].message.content.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(raw);
      } catch(e) {
        parsed = { summary: 'Model returned unparseable output; review manually.', suggestion: 'None', proposed_edit: null };
      }

      const row = {
        created_at: new Date().toISOString(),
        window_days: days,
        user_turn_count: userTurns.length,
        status: 'pending',
        summary: parsed.summary || '',
        suggestion: parsed.suggestion || '',
        proposed_edit: parsed.proposed_edit || null,
        target_file: 'proxy/behavior/advisor-behavior.txt'
      };
      const ins = await fetch(process.env.SUPABASE_URL + '/rest/v1/log_digests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(row)
      });
      if (!ins.ok) {
        const t = await ins.text();
        return res.status(200).json({ step: 'generate_digest', error: 'supabase ' + ins.status + ': ' + t });
      }

      // notify: only email when there's a real suggestion worth a human's time,
      // and only if email is configured. failures here never break the digest.
      let emailResult = { skipped: 'not configured' };
      const hasSuggestion = parsed.suggestion && parsed.suggestion.trim() &&
        parsed.suggestion.trim().toLowerCase() !== 'none';
      if (hasSuggestion && process.env.RESEND_API_KEY && process.env.DIGEST_NOTIFY_EMAILS) {
        const recipients = process.env.DIGEST_NOTIFY_EMAILS.split(',')
          .map(function(s){ return s.trim(); }).filter(Boolean);
        const reviewUrl = process.env.DIGEST_REVIEW_URL || 'https://ai-advisor-futureself.vercel.app/digest-review.html';
        const fromAddr = process.env.DIGEST_FROM_EMAIL || 'FutureSelf Advisor <onboarding@resend.dev>';
        // plain-text body; keep it short. no student data, just the summary.
        const textBody =
          'A new advisor digest is ready for review.\n\n' +
          'Summary: ' + (parsed.summary || '') + '\n\n' +
          'Suggestion: ' + parsed.suggestion + '\n\n' +
          'Review, edit, or dismiss it here:\n' + reviewUrl + '\n\n' +
          '(' + userTurns.length + ' student messages over the last ' + days + ' days.)';
        try {
          const mailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + process.env.RESEND_API_KEY
            },
            body: JSON.stringify({
              from: fromAddr,
              to: recipients,
              subject: 'Advisor digest ready for review',
              text: textBody
            })
          });
          emailResult = mailRes.ok ? { ok: true, to: recipients.length }
            : { error: 'resend ' + mailRes.status + ': ' + (await mailRes.text()).slice(0, 200) };
        } catch(e) { emailResult = { error: e.message }; }
      } else if (!hasSuggestion) {
        emailResult = { skipped: 'no actionable suggestion' };
      }

      return res.status(200).json({ step: 'generate_digest', ok: true, user_turns: userTurns.length, email: emailResult });
    }

    // ---- list_digests: admin-only, feeds the review page ----
    if (type === 'list_digests') {
      const adminKey = req.body.adminKey || req.headers['x-admin-key'];
      if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const statusFilter = req.body.status ? '&status=eq.' + encodeURIComponent(req.body.status) : '';
      const listRes = await fetch(
        process.env.SUPABASE_URL + '/rest/v1/log_digests?select=*' + statusFilter +
          '&order=created_at.desc&limit=50',
        { headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } }
      );
      const digests = listRes.ok ? await listRes.json() : [];
      return res.status(200).json({ digests: digests });
    }

    // ---- get_file: admin-only, read current file contents from the repo ----
    // used by the review page to pre-fill the edit box with the FULL current
    // file, so an approve never accidentally replaces the file with a snippet.
    if (type === 'get_file') {
      const adminKey = req.body.adminKey || req.headers['x-admin-key'];
      if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!process.env.GITHUB_TOKEN) {
        return res.status(200).json({ error: 'GITHUB_TOKEN not configured' });
      }
      const targetFile = req.body.targetFile || 'proxy/behavior/advisor-behavior.txt';
      const repo = process.env.GITHUB_REPO || 'futureselfdiscover/ai-advisor-futureself';
      const branch = process.env.GITHUB_BRANCH || 'main';
      const ghHeaders = {
        'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'futureself-advisor-digest',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      const r = await fetch(
        'https://api.github.com/repos/' + repo + '/contents/' + targetFile + '?ref=' + branch,
        { headers: ghHeaders }
      );
      if (r.status !== 200) {
        const t = await r.text();
        return res.status(200).json({ error: 'github ' + r.status + ': ' + t.slice(0, 200) });
      }
      const meta = await r.json();
      const content = Buffer.from(meta.content || '', 'base64').toString('utf8');
      return res.status(200).json({ content: content, sha: meta.sha, targetFile: targetFile });
    }

    // ---- apply_digest: admin-only, commits human-edited text to the repo ----
    // this is the ONLY endpoint that writes to GitHub. it never uses the
    // model's raw suggestion; it commits exactly the text the human approved.
    if (type === 'apply_digest') {
      const adminKey = req.body.adminKey || req.headers['x-admin-key'];
      if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!process.env.GITHUB_TOKEN) {
        return res.status(200).json({ error: 'GITHUB_TOKEN not configured' });
      }

      const digestId = req.body.digestId;
      const newContent = req.body.newContent;      // full new file contents, human-approved
      const targetFile = req.body.targetFile || 'proxy/behavior/advisor-behavior.txt';
      const repo = process.env.GITHUB_REPO || 'futureselfdiscover/ai-advisor-futureself';
      const branch = process.env.GITHUB_BRANCH || 'main';
      if (!newContent || typeof newContent !== 'string') {
        return res.status(400).json({ error: 'newContent (full file text) required' });
      }

      const ghHeaders = {
        'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'futureself-advisor-digest',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      const contentsUrl = 'https://api.github.com/repos/' + repo + '/contents/' + targetFile;

      // 1. get the current file SHA (required to update an existing file)
      const getFile = await fetch(contentsUrl + '?ref=' + branch, { headers: ghHeaders });
      if (getFile.status !== 200) {
        const t = await getFile.text();
        return res.status(200).json({ step: 'github_get', status: getFile.status, error: t.slice(0, 300) });
      }
      const fileMeta = await getFile.json();

      // 2. PUT the new contents (base64) with that SHA
      const putBody = {
        message: 'chore(advisor): apply reviewed digest suggestion' +
          (digestId ? ' (#' + digestId + ')' : ''),
        content: Buffer.from(newContent, 'utf8').toString('base64'),
        sha: fileMeta.sha,
        branch: branch
      };
      const putFile = await fetch(contentsUrl, {
        method: 'PUT', headers: ghHeaders, body: JSON.stringify(putBody)
      });
      const putResult = await putFile.json();
      if (putFile.status < 200 || putFile.status >= 300) {
        return res.status(200).json({ step: 'github_put', status: putFile.status, error: putResult });
      }

      // 3. mark the digest applied (best-effort)
      if (digestId && process.env.SUPABASE_URL) {
        await fetch(process.env.SUPABASE_URL + '/rest/v1/log_digests?id=eq.' + digestId, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ status: 'applied', applied_at: new Date().toISOString() })
        });
      }

      return res.status(200).json({
        step: 'apply_digest', ok: true,
        commit: putResult.commit && putResult.commit.html_url
      });
    }

    // ---- dismiss_digest: admin-only, mark a suggestion rejected ----
    if (type === 'dismiss_digest') {
      const adminKey = req.body.adminKey || req.headers['x-admin-key'];
      if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!req.body.digestId) return res.status(400).json({ error: 'digestId required' });
      await fetch(process.env.SUPABASE_URL + '/rest/v1/log_digests?id=eq.' + req.body.digestId, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ status: 'dismissed', dismissed_at: new Date().toISOString() })
      });
      return res.status(200).json({ step: 'dismiss_digest', ok: true });
    }

    return res.status(400).json({ error: 'Invalid request type' });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
