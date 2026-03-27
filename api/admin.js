const OVERRIDE_KEY = 'glance:override';

async function redis(...args) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(3000),
  });
  const { result } = await res.json();
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const { secret, action, state, duration } = req.query;

  if (secret !== process.env.ADMIN_SECRET) {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return;
  }

  try {
    if (action === 'set') {
      const VALID_STATES = ['green', 'yellow', 'red'];
      if (!VALID_STATES.includes(state)) {
        res.status(400).json({ ok: false, error: 'invalid state' });
        return;
      }
      const secs = Math.min(Math.max(parseInt(duration) || 120, 10), 600);
      await redis('SET', OVERRIDE_KEY, state, 'EX', String(secs));
      res.status(200).json({ ok: true, action: 'set', state, duration: secs });

    } else if (action === 'clear') {
      await redis('DEL', OVERRIDE_KEY);
      res.status(200).json({ ok: true, action: 'clear' });

    } else if (action === 'status') {
      const value = await redis('GET', OVERRIDE_KEY);
      const ttl = value ? await redis('TTL', OVERRIDE_KEY) : null;
      res.status(200).json({ ok: true, override: value, ttl });

    } else {
      res.status(400).json({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    res.status(200).json({ ok: false, error: 'redis_error', detail: err.message });
  }
}
