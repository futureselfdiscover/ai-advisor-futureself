import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ---- behavior files (loaded once per cold start, not per request) ----
// edit these plain text files to change advisor personality, advising
// method, or the resource URL map. no code changes needed for content edits.
// try several candidate locations for the behavior dir, since process.cwd()
// on Vercel depends on the configured root directory. record which one wins
// (and any load errors) so the debug_behavior_files endpoint can report it.
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

async function logTurn(sessionId, page, role, content, profileName) {
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
      body: JSON.stringify({
        session_id: sessionId,
        page: page || null,
        role: role,
        content: scrub(content, profileName)
      })
    });
    if (!r.ok) {
      const errText = await r.text();
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
    '- "profile_suggestion": OPTIONAL. Include ONLY when the student just shared something concrete that belongs on their FutureSelf profile. Shape: {' + q + 'field' + q + ':' + q + 'skills' + q + ',' + q + 'value' + q + ':' + q + 'Python' + q + ',' + q + 'label' + q + ':' + q + 'Python as a skill' + q + '}. Allowed field values ONLY: skills, industries_of_interest, hobbies_interests, clubs_and_organizations, languages, awards_honors, currently_exploring, target_cities_regions, career_priorities, bio. At most ONE suggestion per response, and never re-suggest something already declined this session. Omit the key entirely when nothing fits.',
    'If nothing memory-worthy happened this turn, still include the memory JSON with empty/omitted fields. Never skip this line.',
    '',
    FUTURESELF_RESOURCES,
    '',
    'CURRENT PAGE THE STUDENT IS ON: ' + (ctx.pageDesc || 'a FutureSelf page'),
    '',
    'WHAT YOU ALREADY KNOW ABOUT THIS STUDENT (from FutureSelf profile):',
    ctx.profileContext || 'No profile data available.',
    '',
    'WHAT YOU ALREADY REMEMBER ABOUT THIS STUDENT (from past conversations):',
    ctx.memoryContext || 'No prior memory for this student yet.'
  ].join('\n');
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

    // ---- TEMPORARY DEBUG: report which behavior files loaded and from where.
    // remove once the behavior-dir path is confirmed correct in production.
    if (type === 'debug_behavior_files') {
      return res.status(200).json({
        cwd: process.cwd(),
        candidates_tried: BEHAVIOR_DIR_CANDIDATES,
        load_log: BEHAVIOR_LOAD_LOG,
        lengths: {
          advisor_behavior: ADVISOR_BEHAVIOR.length,
          advising_frameworks: ADVISING_FRAMEWORKS.length,
          futureself_resources: FUTURESELF_RESOURCES.length
        },
        // first 300 chars of each so we can eyeball that the NEW content
        // (strict link rules, grouped resources) is actually present
        previews: {
          advisor_behavior: ADVISOR_BEHAVIOR.slice(0, 300),
          futureself_resources: FUTURESELF_RESOURCES.slice(0, 300)
        }
      });
    }

    // ---- chat: proxy to OpenAI + log anonymously ----
    if (type === 'chat') {
      // messages arrives WITHOUT a system message; the proxy builds and
      // prepends it from the behavior files + context sent by the widget.
      // backward compatible: if messages already has a system message
      // (older widget), use it as-is instead of building a new one.
      let fullMessages = messages;
      const hasSystem = messages && messages.length > 0 && messages[0].role === 'system';
      if (!hasSystem && context) {
        fullMessages = [{ role: 'system', content: buildSystemPrompt(context) }].concat(messages || []);
      }

      // TEMPORARY DEBUG: return the exact system prompt without calling
      // OpenAI or logging, so we can inspect what the model actually receives.
      if (req.body.debugReturnPrompt) {
        return res.status(200).json({
          _debug_system_prompt: hasSystem ? messages[0].content : buildSystemPrompt(context || {}),
          _built_from_context: !hasSystem && !!context
        });
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

      // log the last user message and the assistant response anonymously.
      // results are attached to the response as _log so silent failures
      // (grants, schema) are visible in the Network tab during debugging.
      let logResult = { skipped: 'no sessionId' };
      if (sessionId && messages && messages.length > 0) {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        if (lastUser) {
          logResult = await logTurn(sessionId, page, 'user', lastUser.content, profileName);
        }
        const assistantContent = data.choices &&
          data.choices[0] &&
          data.choices[0].message &&

          data.choices[0].message.content;
        if (assistantContent) {
          const r2 = await logTurn(sessionId, page, 'assistant', assistantContent, profileName);
          if (r2 && r2.error) logResult = r2;
        }
      }
      data._log = logResult;

      return res.status(200).json(data);
    }

    // ---- user_context: get Hivebrite profile via OAuth ----
    if (type === 'user_context') {
      const tokenRes = await fetch('https://futureselfdiscover.hivebrite.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: process.env.HIVEBRITE_CLIENT_ID,
          client_secret: process.env.HIVEBRITE_CLIENT_SECRET
        })
      });
      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;
      if (!token) return res.status(401).json({ error: 'Hivebrite auth failed' });

      const userRes = await fetch(
        'https://futureselfdiscover.hivebrite.com/api/v1/admin/users/' + userId,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      const userData = await userRes.json();

      const groupsRes = await fetch(
        'https://futureselfdiscover.hivebrite.com/api/v1/admin/users/' + userId + '/groups',
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
      const groupsData = await groupsRes.json();

      return res.status(200).json({ user: userData, groups: groupsData });
    }

    // ---- memory: get per-user memory (identified, server-side only) ----
    if (type === 'get_memory') {
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const memory = await getMemory(userId);
      return res.status(200).json({ memory });
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
      const { field, value } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId required' });
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
        return res.status(200).json({ ok: true });
      } catch(e) { return res.status(200).json({ error: e.message }); }
    }

    // ---- Hivebrite admin API helpers (confirmed against official docs) ----
    // base url is /api on the community subdomain, routes are
    // /admin/v1|v2|v3/... . there is no v3.1 and no api.eu.hivebrite.com.
    // auth is Doorkeeper OAuth2 bearer tokens.
    //
    // token grants supported by POST /api/oauth/token:
    //   grant_type=refresh_token  (refresh_token + client_id + client_secret)
    //   grant_type=password       (admin_email + password + client_id + client_secret)
    // client_credentials is NOT supported.
    //
    // credentials required (Vercel env vars), either:
    //   HIVEBRITE_REFRESH_TOKEN                          (preferred)
    //   HIVEBRITE_ADMIN_EMAIL + HIVEBRITE_ADMIN_PASSWORD (fallback)
    // BOTH require a real BACK OFFICE ADMIN account, which is separate from
    // a community member login. a member email will fail here.

    if (type === 'debug_hivebrite_get_user' || type === 'push_profile') {
      const HB_BASE = process.env.HIVEBRITE_BASE_URL ||
        'https://futureselfdiscover.hivebrite.com/api';

      const hasRefresh = !!process.env.HIVEBRITE_REFRESH_TOKEN;
      const hasPassword = !!(process.env.HIVEBRITE_ADMIN_EMAIL && process.env.HIVEBRITE_ADMIN_PASSWORD);
      if (!hasRefresh && !hasPassword) {
        return res.status(200).json({
          step: 'preflight',
          error: 'No admin credentials configured. Set HIVEBRITE_REFRESH_TOKEN (preferred) or HIVEBRITE_ADMIN_EMAIL + HIVEBRITE_ADMIN_PASSWORD in Vercel. Both require a back office ADMIN account, not a community member login.'
        });
      }

      // ---- token exchange ----
      const tokenUrl = process.env.HIVEBRITE_ADMIN_TOKEN_URL || 'https://futureselfdiscover.com/api/oauth/token';
      // allow forcing the auth style for diagnostics: req.body.clientAuth
      //   'body'  -> client_id/secret in the form body (default)
      //   'basic' -> client_id/secret as HTTP Basic auth header
      const clientAuthStyle = req.body.clientAuth || 'body';

      const baseParams = hasRefresh
        ? { grant_type: 'refresh_token', refresh_token: process.env.HIVEBRITE_REFRESH_TOKEN }
        : { grant_type: 'password',
            scope: 'admin',
            admin_email: process.env.HIVEBRITE_ADMIN_EMAIL,
            password: process.env.HIVEBRITE_ADMIN_PASSWORD };

      const grantParams = Object.assign({}, baseParams);
      const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (clientAuthStyle === 'basic') {
        const basic = Buffer.from(
          process.env.HIVEBRITE_CLIENT_ID + ':' + process.env.HIVEBRITE_CLIENT_SECRET
        ).toString('base64');
        tokenHeaders['Authorization'] = 'Basic ' + basic;
      } else {
        grantParams.client_id = process.env.HIVEBRITE_CLIENT_ID;
        grantParams.client_secret = process.env.HIVEBRITE_CLIENT_SECRET;
      }

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: tokenHeaders,
        body: new URLSearchParams(grantParams).toString()
      });
      const tokenText = await tokenRes.text();
      let tokenData;
      try { tokenData = JSON.parse(tokenText); }
      catch(e) {
        return res.status(200).json({
          step: 'token_exchange', error: 'non-JSON response',
          status: tokenRes.status, raw: tokenText.slice(0, 500), tokenUrl: tokenUrl
        });
      }
      if (!tokenData.access_token) {
        // diagnostics to pin down invalid_grant without exposing secrets.
        // shows the last 4 chars of the client_id actually being sent and
        // the length of the refresh token, so you can verify they match the
        // app you generated the token from.
        var cid = process.env.HIVEBRITE_CLIENT_ID || '';
        var rt = process.env.HIVEBRITE_REFRESH_TOKEN || '';
        return res.status(200).json({
          step: 'token_exchange', error: tokenData,
          status: tokenRes.status, tokenUrl: tokenUrl,
          diagnostics: {
            grant_type_used: grantParams.grant_type,
            client_id_last4: cid ? cid.slice(-4) : '(unset)',
            client_id_length: cid.length,
            refresh_token_last4: rt ? rt.slice(-4) : '(unset)',
            refresh_token_length: rt.length,
            client_secret_set: !!process.env.HIVEBRITE_CLIENT_SECRET,
            admin_email_set: !!process.env.HIVEBRITE_ADMIN_EMAIL,
            admin_email_length: (process.env.HIVEBRITE_ADMIN_EMAIL || '').length,
            admin_password_set: !!process.env.HIVEBRITE_ADMIN_PASSWORD,
            admin_password_length: (process.env.HIVEBRITE_ADMIN_PASSWORD || '').length,
            scope_sent: grantParams.scope || '(none)',
          }
        });
      }

      const token = tokenData.access_token;
      const hb = function(pathname, options) {
        const opts = options || {};
        return fetch(HB_BASE + pathname, {
          method: opts.method || 'GET',
          headers: Object.assign({
            'Authorization': 'Bearer ' + token,
            'accept': 'application/json'
          }, opts.body ? { 'Content-Type': 'application/json' } : {}),
          body: opts.body ? JSON.stringify(opts.body) : undefined
        });
      };
      const readJson = async function(r) {
        const t = await r.text();
        try { return JSON.parse(t); } catch(e) { return { raw: t.slice(0, 500) }; }
      };

      // ================= DEBUG / DISCOVERY =================
      // remove this branch once the attribute names are recorded.
      if (type === 'debug_hivebrite_get_user') {
        const out = {
          step: 'authenticated',
          grant_used: hasRefresh ? 'refresh_token' : 'password',
          token_type: tokenData.token_type || null,
          expires_in: tokenData.expires_in || null,
          // true means the server rotated the refresh token, so the env var
          // value is now stale and production must persist the new one.
          refresh_token_rotated: hasRefresh && !!tokenData.refresh_token &&
            tokenData.refresh_token !== process.env.HIVEBRITE_REFRESH_TOKEN
        };

        // smoke test: cheapest possible authenticated call
        const meRes = await hb('/admin/v1/me');
        out.me_status = meRes.status;
        out.me = await readJson(meRes);

        // the canonical list of valid custom attribute names for writes
        const attrRes = await hb('/admin/v1/settings/customizable_attributes');
        out.attrs_status = attrRes.status;
        out.customizable_attributes = await readJson(attrRes);

        // controlled vocabulary for the industries field
        const indRes = await hb('/admin/v1/settings/industries');
        out.industries_status = indRes.status;
        const industries = await readJson(indRes);
        out.industries_sample = Array.isArray(industries) ? industries.slice(0, 10) : industries;

        // a real user profile, to see which fields are actually populated
        const userRes = await hb('/admin/v1/users/' + (userId || '18275972'));
        out.user_status = userRes.status;
        out.user = await readJson(userRes);

        return res.status(200).json(out);
      }

      // ================= PRODUCTION PUSH =================
      // pushes unpushed fsd_profile staging entries to the real Hivebrite
      // profile via PUT /admin/v1/users/{id}, then marks them pushed.
      //
      // safety: dryRun defaults to TRUE. it will NOT write to a real student
      // profile unless the caller explicitly passes dryRun: false.
      if (type === 'push_profile') {
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const dryRun = req.body.dryRun !== false;

        // ATTRIBUTE_MAP: fsd_profile column -> Hivebrite target.
        // kind 'native' writes a top level field on the user object.
        // kind 'custom' writes into custom_attributes by name.
        // these names are PLACEHOLDERS until the debug run above returns
        // the real customizable_attributes list. verify before dryRun:false.
        const ATTRIBUTE_MAP = {
          skills:                  { kind: 'custom', name: 'skills' },
          industries_of_interest:  { kind: 'custom', name: 'industries_of_interest' },
          hobbies_interests:       { kind: 'custom', name: 'hobbies_interests' },
          clubs_and_organizations: { kind: 'custom', name: 'clubs_and_organizations' },
          languages:               { kind: 'custom', name: 'languages' },
          awards_honors:           { kind: 'custom', name: 'awards_honors' },
          target_cities_regions:   { kind: 'custom', name: 'target_cities_regions' },
          currently_exploring:     { kind: 'custom', name: 'currently_exploring' },
          career_priorities:       { kind: 'custom', name: 'career_priorities' },
          bio:                     { kind: 'native', name: 'description' }
        };

        const hash = hashUserId(userId);
        const stageRes = await fetch(
          process.env.SUPABASE_URL + '/rest/v1/fsd_profile?user_hash=eq.' + hash + '&select=*',
          { headers: {
              'apikey': process.env.SUPABASE_SERVICE_KEY,
              'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } }
        );
        const stageRows = stageRes.ok ? await stageRes.json() : [];
        const staged = stageRows[0];
        if (!staged) return res.status(200).json({ step: 'push', error: 'no staging row for this user' });

        const pushLog = staged.push_log || [];
        const pending = pushLog.filter(function(e) { return !e.pushed; });
        if (pending.length === 0) {
          return res.status(200).json({ step: 'push', ok: true, note: 'nothing pending' });
        }

        // build the payload from pending entries only
        const nativeFields = {};
        const customByName = {};
        const unmapped = [];
        pending.forEach(function(entry) {
          const target = ATTRIBUTE_MAP[entry.field];
          if (!target) { unmapped.push(entry.field); return; }
          if (target.kind === 'native') {
            nativeFields[target.name] = entry.value;
          } else {
            if (!customByName[target.name]) customByName[target.name] = [];
            if (customByName[target.name].indexOf(entry.value) === -1) {
              customByName[target.name].push(entry.value);
            }
          }
        });

        const custom_attributes = Object.keys(customByName).map(function(name) {
          const vals = customByName[name];
          return { name: name, value: vals.length === 1 ? vals[0] : vals };
        });
        const payload = Object.assign({}, nativeFields);
        if (custom_attributes.length > 0) payload.custom_attributes = custom_attributes;

        if (dryRun) {
          return res.status(200).json({
            step: 'push_dry_run',
            note: 'nothing was written. pass dryRun:false to write for real.',
            pending_count: pending.length,
            unmapped_fields: unmapped,
            would_PUT: HB_BASE + '/admin/v1/users/' + userId,
            payload: payload
          });
        }

        const putRes = await hb('/admin/v1/users/' + userId, { method: 'PUT', body: payload });
        const putBody = await readJson(putRes);
        if (putRes.status < 200 || putRes.status >= 300) {
          return res.status(200).json({
            step: 'push_failed', status: putRes.status,
            response: putBody, payload: payload
          });
        }

        // mark pushed only after a confirmed success
        const nowIso = new Date().toISOString();
        const pushedFields = {};
        Object.keys(ATTRIBUTE_MAP).forEach(function(f) {
          if (pending.some(function(e) { return e.field === f; })) pushedFields[f] = true;
        });
        const updatedLog = pushLog.map(function(entry) {
          if (!entry.pushed && pushedFields[entry.field]) {
            return Object.assign({}, entry, { pushed: true, pushed_at: nowIso });
          }
          return entry;
        });

        await fetch(process.env.SUPABASE_URL + '/rest/v1/fsd_profile?user_hash=eq.' + hash, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ push_log: updatedLog, updated_at: nowIso })
        });

        return res.status(200).json({
          step: 'push', ok: true, status: putRes.status,
          pushed_count: pending.length - unmapped.length,
          unmapped_fields: unmapped
        });
      }
    }

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
