import crypto from 'crypto';

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
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(process.env.SUPABASE_URL + '/rest/v1/conversation_logs', {
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
  } catch(e) {}
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

// ---- main handler ----

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, messages, userId, sessionId, page, profileName } = req.body;

  try {

    // ---- chat: proxy to OpenAI + log anonymously ----
    if (type === 'chat') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
        },
        body: JSON.stringify({ model: 'gpt-4o', messages })
      });
      const data = await response.json();

      // log the last user message and the assistant response anonymously
      if (sessionId && messages && messages.length > 0) {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        if (lastUser) {
          await logTurn(sessionId, page, 'user', lastUser.content, profileName);
        }
        const assistantContent = data.choices &&
          data.choices[0] &&
          data.choices[0].message &&
          data.choices[0].message.content;
        if (assistantContent) {
          await logTurn(sessionId, page, 'assistant', assistantContent, profileName);
        }
      }

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

    return res.status(400).json({ error: 'Invalid request type' });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
