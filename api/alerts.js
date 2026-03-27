const TOWN = 'גבעות עדן';
const OVERRIDE_KEY = 'glance:override';

const OVERRIDE_DATA = {
  green:  { ok: true },
  yellow: { ok: true, data: [TOWN], cat: 14 },
  red:    { ok: true, data: [TOWN], cat: 0  },
};

// ── Redis ─────────────────────────────────────────────────────────────────────

async function redis(...args) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(1500),
  });
  const { result } = await res.json();
  return result;
}

async function getOverride() {
  try { return await redis('GET', OVERRIDE_KEY); } catch (_) { return null; }
}

// ── Tzevaadom (RED + infiltration YELLOW) ─────────────────────────────────────

// threat 0=rockets, 5=UAV, 6=non-conventional missile → RED
// threat 2=terrorist infiltration → YELLOW
const TZEVAADOM_RED    = new Set([0, 5, 6]);
const TZEVAADOM_YELLOW = new Set([2]);
const THREAT_PRIORITY  = [2, 7, 6, 1, 5, 4, 3, 0, 8, 9]; // index 0 = highest priority

async function fetchTzevaadom() {
  const res = await fetch('https://api.tzevaadom.co.il/notifications?', {
    signal: AbortSignal.timeout(4000),
    headers: {
      'Origin': 'https://www.tzevaadom.co.il',
      'User-Agent': 'Mozilla/5.0 (compatible; GlancePWA/1.0)',
      'Accept': 'application/json',
    },
  });
  return JSON.parse(await res.text());
}

// Returns { state: 'red'|'yellow', cat } or null
function checkTzevaadom(alerts) {
  if (!Array.isArray(alerts)) return null;
  let best = null;
  for (const alert of alerts) {
    if (!Array.isArray(alert.cities) || !alert.cities.includes(TOWN)) continue;
    const t = Number(alert.threat);
    if (TZEVAADOM_RED.has(t)) {
      const isHigher = !best || best.state !== 'red' ||
        THREAT_PRIORITY.indexOf(t) < THREAT_PRIORITY.indexOf(best.cat);
      if (isHigher) best = { state: 'red', cat: t };
    } else if (TZEVAADOM_YELLOW.has(t) && (!best || best.state !== 'red')) {
      best = { state: 'yellow', cat: t };
    }
  }
  return best;
}

// ── Oref history (YELLOW — cat 14 preliminary warning) ───────────────────────

async function checkOrefYellow() {
  const res = await fetch(
    'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1',
    {
      signal: AbortSignal.timeout(3000),
      headers: {
        'Referer': 'https://www.oref.org.il/',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (compatible; GlancePWA/1.0)',
      },
    }
  );
  const text = (await res.text()).replace(/^\uFEFF/, '');

  // If Akamai blocks, response is HTML — JSON.parse will throw, caught by caller
  const records = JSON.parse(text);

  // Filter to our town, sort by rid descending (higher rid = more recent)
  const town = records
    .filter(r => r.data === TOWN)
    .sort((a, b) => b.rid - a.rid);

  if (town.length === 0) return { yellow: false };

  const latest14 = town.find(r => r.category === 14); // preliminary warning
  const latest13 = town.find(r => r.category === 13); // event ended

  // Yellow if: a cat 14 exists and is more recent than the latest cat 13
  const yellow = !!(latest14 && (!latest13 || latest14.rid > latest13.rid));
  return { yellow, latestRecord: town[0] };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // Admin override
  if (process.env.ENABLE_OVERRIDE === 'true') {
    const override = await getOverride();
    if (override && OVERRIDE_DATA[override]) {
      res.status(200).json({ ...OVERRIDE_DATA[override], _override: override });
      return;
    }
  }

  // Fetch both sources in parallel
  const [tzResult, orefResult] = await Promise.allSettled([
    fetchTzevaadom(),
    checkOrefYellow(),
  ]);

  // Determine state — RED wins over YELLOW, tzevaadom wins for RED
  let match = null;
  let sources = {};

  if (tzResult.status === 'fulfilled') {
    sources.tzevaadom = 'ok';
    match = checkTzevaadom(tzResult.value);
  } else {
    sources.tzevaadom = 'error:' + (tzResult.reason?.message || 'unknown');
  }

  if (orefResult.status === 'fulfilled') {
    sources.oref = 'ok';
    if ((!match || match.state !== 'red') && orefResult.value.yellow) {
      match = { state: 'yellow', cat: 14 };
    }
  } else {
    sources.oref = 'error:' + (orefResult.reason?.message || 'unknown');
  }

  if (match) {
    res.status(200).json({ ok: true, data: [TOWN], cat: match.cat, _sources: sources });
  } else {
    res.status(200).json({ ok: true, _sources: sources });
  }
}
