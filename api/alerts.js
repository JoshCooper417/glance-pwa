const OVERRIDE_KEY = 'glance:override';

const OVERRIDE_DATA = {
  green:  { ok: true },
  yellow: { ok: true, data: ['גבעות עדן'], cat: 2 }, // threat 2 = terrorist infiltration
  red:    { ok: true, data: ['גבעות עדן'], cat: 0 }, // threat 0 = rockets
};

async function getOverride() {
  try {
    const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', OVERRIDE_KEY]),
      signal: AbortSignal.timeout(1500),
    });
    const { result } = await res.json();
    return result || null; // 'green'|'yellow'|'red'|null
  } catch (_) {
    return null; // Redis unavailable — fall through to live data
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Check for admin override first (only when ENABLE_OVERRIDE=true)
  if (process.env.ENABLE_OVERRIDE === 'true') {
    const override = await getOverride();
    if (override && OVERRIDE_DATA[override]) {
      res.status(200).json({ ...OVERRIDE_DATA[override], _override: override });
      return;
    }
  }

  try {
    const upstream = await fetch(
      'https://api.tzevaadom.co.il/notifications?',
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Origin': 'https://www.tzevaadom.co.il',
          'User-Agent': 'Mozilla/5.0 (compatible; GlancePWA/1.0)',
          'Accept': 'application/json',
        },
      }
    );

    const text = await upstream.text();

    let alerts;
    try {
      alerts = JSON.parse(text);
    } catch (_) {
      res.status(200).json({ ok: false, error: 'parse_error', raw: text.slice(0, 1000) });
      return;
    }

    // No active alerts — empty array
    if (!Array.isArray(alerts) || alerts.length === 0) {
      res.status(200).json({ ok: true });
      return;
    }

    // Normalize to { ok, data: [...all cities], cat: <highest-priority threat> }
    // tzevaadom threat priority order (index 0 = highest priority):
    const THREAT_PRIORITY = [2, 7, 6, 1, 5, 4, 3, 0, 8, 9];
    const allCities = [...new Set(alerts.flatMap(a => a.cities || []))];
    const highestThreat = alerts.reduce((best, a) => {
      const t = Number(a.threat);
      const tIdx = THREAT_PRIORITY.indexOf(t);
      const bestIdx = THREAT_PRIORITY.indexOf(best);
      const tPri = tIdx === -1 ? Infinity : tIdx;
      const bestPri = bestIdx === -1 ? Infinity : bestIdx;
      return tPri < bestPri ? t : best;
    }, null);

    res.status(200).json({
      ok: true,
      data: allCities,
      cat: highestThreat,
    });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(200).json({ ok: false, error: isTimeout ? 'timeout' : 'network_error' });
  }
}
