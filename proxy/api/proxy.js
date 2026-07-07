export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, messages, userId } = req.body;

  try {
    if (type === 'chat') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ model: 'gpt-4o', messages })
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (type === 'user_context') {
      // Step 1: get Hivebrite OAuth token
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

      // Step 2: get user profile
      const userRes = await fetch(`https://futureselfdiscover.hivebrite.com/api/v1/admin/users/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const userData = await userRes.json();

      // Step 3: get user groups
      const groupsRes = await fetch(`https://futureselfdiscover.hivebrite.com/api/v1/admin/users/${userId}/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const groupsData = await groupsRes.json();

      return res.status(200).json({
        user: userData,
        groups: groupsData
      });
    }

    return res.status(400).json({ error: 'Invalid request type' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}