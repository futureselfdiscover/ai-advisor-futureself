// Vercel cron target. Vercel invokes this on the schedule in vercel.json with
// a GET and an Authorization: Bearer <CRON_SECRET> header (when CRON_SECRET is
// set in project env). We verify that, then invoke the digest generation by
// calling our own proxy so all the logic stays in one place.
export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET ? ('Bearer ' + process.env.CRON_SECRET) : null;
  if (expected && req.headers['authorization'] !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // Resolve our own origin so this works on any deployment URL.
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const proxyUrl = proto + '://' + host + '/api/proxy';

  try {
    const r = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // forward the cron secret so generate_digest authorizes the call
        'Authorization': expected || ''
      },
      body: JSON.stringify({ type: 'generate_digest', days: 7 })
    });
    const data = await r.json();
    return res.status(200).json({ cron: 'digest', result: data });
  } catch (e) {
    return res.status(500).json({ cron: 'digest', error: e.message });
  }
}
