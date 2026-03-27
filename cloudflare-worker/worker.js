// Cloudflare Worker — full alert API proxy
// Phone calls this directly → routes to nearest CF PoP (Tel Aviv) → Oref allows Israeli IPs
//
// Env vars (set via wrangler secret put):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//   ENABLE_OVERRIDE   "true" to enable Redis-based admin override
//   USE_TZEVAADOM     "true" to additionally check tzevaadom (off by default)

const TOWN = 'גבעות עדן';
const OVERRIDE_KEY = 'glance:override';

// Oref live categories → state mapping
// 1=rockets/missiles, 3=hostile aircraft, 5=tsunami, 6=terrorist infiltration → RED
// 14=preliminary warning → YELLOW
const OREF_RED    = new Set([1, 3, 5, 6]);
const OREF_YELLOW = new Set([14]);

// ── Tzevaadom (kept but disabled by default — USE_TZEVAADOM=true to enable) ──

const TZEVAADOM_RED    = new Set([0, 5, 6]); // threat 0=rockets, 5=UAV, 6=non-conv missile
const TZEVAADOM_YELLOW = new Set([2]);        // threat 2=terrorist infiltration
const THREAT_PRIORITY  = [2, 7, 6, 1, 5, 4, 3, 0, 8, 9];

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

// ── Oref live alert (RED) ─────────────────────────────────────────────────────

async function checkOrefLive() {
  const res = await fetch(
    'https://www.oref.org.il/WarningMessages/alert/alerts.json',
    {
      signal: AbortSignal.timeout(4000),
      headers: {
        'Referer': 'https://www.oref.org.il/',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
    }
  );
  const text = (await res.text()).replace(/^\uFEFF/, '').trim();
  if (!text || text === '{}') return null;
  if (text.includes('<HTML>') || text.includes('Access Denied')) throw new Error('blocked');

  const data = JSON.parse(text);
  if (!Array.isArray(data.data) || !data.data.includes(TOWN)) return null;

  const cat = Number(data.cat);
  if (OREF_RED.has(cat)) return { state: 'red', cat };
  if (OREF_YELLOW.has(cat)) return { state: 'yellow', cat };
  // Unknown category but our town is listed — treat as red to be safe
  return { state: 'red', cat };
}

// ── Oref history (YELLOW — cat 14 preliminary warning) ───────────────────────

async function checkOrefYellow() {
  const res = await fetch(
    'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1',
    {
      signal: AbortSignal.timeout(4000),
      headers: {
        'Referer': 'https://www.oref.org.il/',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
    }
  );
  const text = (await res.text()).replace(/^\uFEFF/, '');
  if (text.includes('<HTML>') || text.includes('Access Denied')) throw new Error('blocked');

  const records = JSON.parse(text);
  const town = records.filter(r => r.data === TOWN).sort((a, b) => b.rid - a.rid);
  if (town.length === 0) return false;

  const latest14 = town.find(r => r.category === 14);
  const latest13 = town.find(r => r.category === 13);
  return !!(latest14 && (!latest13 || latest14.rid > latest13.rid));
}

// ── Redis ────────────────────────────────────────────────────────────────────

async function redisGet(env, key) {
  if (!env.UPSTASH_REDIS_REST_URL) return null;
  try {
    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', key]),
      signal: AbortSignal.timeout(1500),
    });
    const { result } = await res.json();
    return result;
  } catch (_) { return null; }
}

const OVERRIDE_DATA = {
  green:  { ok: true },
  yellow: { ok: true, data: [TOWN], cat: 14 },
  red:    { ok: true, data: [TOWN], cat: 1  },
};

// ── Handler ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // Admin override
    if (env.ENABLE_OVERRIDE === 'true') {
      const override = await redisGet(env, OVERRIDE_KEY);
      if (override && OVERRIDE_DATA[override]) {
        return new Response(
          JSON.stringify({ ...OVERRIDE_DATA[override], _override: override }),
          { headers }
        );
      }
    }

    const sources = {};
    let match = null;

    // ── Primary: Oref live (RED) + Oref history (YELLOW) ──────────────────────
    const [liveResult, yellowResult] = await Promise.allSettled([
      checkOrefLive(),
      checkOrefYellow(),
    ]);

    if (liveResult.status === 'fulfilled') {
      sources.oref_live = 'ok';
      if (liveResult.value) match = liveResult.value;
    } else {
      sources.oref_live = 'error:' + (liveResult.reason?.message || 'unknown');
    }

    if (yellowResult.status === 'fulfilled') {
      sources.oref_history = 'ok';
      if (!match && yellowResult.value) match = { state: 'yellow', cat: 14 };
    } else {
      sources.oref_history = 'error:' + (yellowResult.reason?.message || 'unknown');
    }

    // ── Optional: tzevaadom (enabled via USE_TZEVAADOM=true) ──────────────────
    if (env.USE_TZEVAADOM === 'true') {
      try {
        const tzAlerts = await fetchTzevaadom();
        const tzMatch = checkTzevaadom(tzAlerts);
        sources.tzevaadom = 'ok';
        // tzevaadom wins if it reports red and we don't already have red
        if (tzMatch && (!match || match.state !== 'red')) {
          match = tzMatch;
        }
      } catch (e) {
        sources.tzevaadom = 'error:' + (e.message || 'unknown');
      }
    }

    const body = match
      ? JSON.stringify({ ok: true, data: [TOWN], cat: match.cat, _sources: sources })
      : JSON.stringify({ ok: true, _sources: sources });

    return new Response(body, { headers });
  },
};
