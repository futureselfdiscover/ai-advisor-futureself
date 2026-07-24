import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ---- behavior files (loaded once per cold start, not per request) ----
// edit these plain text files to change advisor personality, advising
// method, or the resource URL map. no code changes needed for content edits.
const BEHAVIOR_DIR = path.join(process.cwd(), 'behavior');
function loadBehaviorFile(name) {
  try { return fs.readFileSync(path.join(BEHAVIOR_DIR, name), 'utf8'); }
  catch(e) { return ''; }
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, messages, userId, sessionId, page, profileName, context } = req.body;

  try {

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

    // ---- TEMPORARY DEBUG: test Hivebrite admin API read access ----
    // remove once custom_attributes shape is confirmed and the real
    // fsd_profile -> Hivebrite push is built.
    //
    // per Hivebrite's official admin API docs, the admin token endpoint is
    // POST <subdomain>/api/oauth/token supporting two grants:
    //   grant_type=refresh_token  (refresh_token + client_id + client_secret)
    //   grant_type=password       (admin_email + password + client_id + client_secret)
    // client_credentials is NOT supported, which is why every prior attempt
    // returned invalid_client.
    //
    // PREFERRED: the back office (Settings > External integrations) has a
    // "Generate refresh token" button on the OAuth2 application. that avoids
    // storing any admin password. set this Vercel env var:
    //   HIVEBRITE_REFRESH_TOKEN
    // fallback (only if refresh token unavailable):
    //   HIVEBRITE_ADMIN_EMAIL + HIVEBRITE_ADMIN_PASSWORD
    //
    // NOTE on rotation: some OAuth servers issue a NEW refresh token on each
    // exchange, invalidating the old one. the response includes
    // refresh_token_rotated so we can detect this. if true, a static env var
    // will break on the next call and the production push handler must store
    // the latest refresh token in Supabase instead.
    //
    // this handler tests, in order:
    //   1. token exchange (password grant)
    //   2. GET user on api.eu.hivebrite.com/admin/v3.1 (new API gateway)
    //   3. if that 401/403s: GET user on the community subdomain v2 path
    //      as a fallback, so one test run tells us which host the token
    //      is valid for
    //   4. GET the network's customizable attributes list, which is the
    //      canonical source of the custom_attributes names we need for
    //      the eventual profile write
    if (type === 'debug_hivebrite_get_user') {
      const hasRefresh = !!process.env.HIVEBRITE_REFRESH_TOKEN;
      const hasPassword = !!(process.env.HIVEBRITE_ADMIN_EMAIL && process.env.HIVEBRITE_ADMIN_PASSWORD);
      if (!hasRefresh && !hasPassword) {
        return res.status(200).json({
          step: 'preflight',
          error: 'Set HIVEBRITE_REFRESH_TOKEN (preferred, from the back office Generate refresh token button) or HIVEBRITE_ADMIN_EMAIL + HIVEBRITE_ADMIN_PASSWORD in Vercel'
        });
      }

      const tokenUrl = process.env.HIVEBRITE_ADMIN_TOKEN_URL ||
        'https://futureselfdiscover.hivebrite.com/api/oauth/token';

      const grantParams = hasRefresh
        ? {
            grant_type: 'refresh_token',
            refresh_token: process.env.HIVEBRITE_REFRESH_TOKEN,
            client_id: process.env.HIVEBRITE_CLIENT_ID,
            client_secret: process.env.HIVEBRITE_CLIENT_SECRET
          }
        : {
            grant_type: 'password',
            admin_email: process.env.HIVEBRITE_ADMIN_EMAIL,
            password: process.env.HIVEBRITE_ADMIN_PASSWORD,
            client_id: process.env.HIVEBRITE_CLIENT_ID,
            client_secret: process.env.HIVEBRITE_CLIENT_SECRET
          };

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(grantParams).toString()
      });

      const tokenText = await tokenRes.text();
      let tokenData;
      try { tokenData = JSON.parse(tokenText); }
      catch(e) {
        return res.status(200).json({
          step: 'token_exchange',
          error: 'non-JSON response',
          status: tokenRes.status,
          raw: tokenText.slice(0, 500),
          tokenUrl: tokenUrl
        });
      }

      if (!tokenData.access_token) {
        return res.status(200).json({
          step: 'token_exchange',
          error: tokenData,
          status: tokenRes.status,
          tokenUrl: tokenUrl
        });
      }

      const token = tokenData.access_token;
      const uid = userId || '18275972';
      const out = {
        step: 'authenticated',
        grant_used: hasRefresh ? 'refresh_token' : 'password',
        token_type: tokenData.token_type || null,
        expires_in: tokenData.expires_in || null,
        has_refresh_token: !!tokenData.refresh_token,
        // true means the server issued a DIFFERENT refresh token than the one
        // sent, i.e. rotation is on and the env var value is now stale. never
        // echoes the tokens themselves.
        refresh_token_rotated: hasRefresh && !!tokenData.refresh_token &&
          tokenData.refresh_token !== process.env.HIVEBRITE_REFRESH_TOKEN
      };

      // attempt 1: new v3.1 gateway
      const v3Res = await fetch(
        'https://api.eu.hivebrite.com/admin/v3.1/users/' + uid,
        { headers: { 'Authorization': 'Bearer ' + token, 'accept': 'application/json' } }
      );
      const v3Text = await v3Res.text();
      out.v3_status = v3Res.status;
      try { out.v3_user = JSON.parse(v3Text); }
      catch(e) { out.v3_user = { raw: v3Text.slice(0, 500) }; }

      // attempt 2 (fallback): community subdomain v2 admin path
      if (v3Res.status === 401 || v3Res.status === 403) {
        const v2Res = await fetch(
          'https://futureselfdiscover.hivebrite.com/api/admin/v2/users/' + uid,
          { headers: { 'Authorization': 'Bearer ' + token, 'accept': 'application/json' } }
        );
        const v2Text = await v2Res.text();
        out.v2_status = v2Res.status;
        try { out.v2_user = JSON.parse(v2Text); }
        catch(e) { out.v2_user = { raw: v2Text.slice(0, 500) }; }
      }

      // attempt 3: the network's customizable attributes list, the
      // canonical source of valid custom_attributes names for writes
      const attrRes = await fetch(
        'https://futureselfdiscover.hivebrite.com/api/admin/v2/settings/customizable_attributes',
        { headers: { 'Authorization': 'Bearer ' + token, 'accept': 'application/json' } }
      );
      const attrText = await attrRes.text();
      out.attrs_status = attrRes.status;
      try { out.customizable_attributes = JSON.parse(attrText); }
      catch(e) { out.customizable_attributes = { raw: attrText.slice(0, 500) }; }

      return res.status(200).json(out);
    }

    return res.status(400).json({ error: 'Invalid request type' });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
