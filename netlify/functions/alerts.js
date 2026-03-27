const TOWN = 'גבעות עדן';

const TZEVAADOM_RED    = new Set([0, 5, 6]);
const TZEVAADOM_YELLOW = new Set([2]);
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
  const records = JSON.parse(text);
  const town = records.filter(r => r.data === TOWN).sort((a, b) => b.rid - a.rid);
  if (town.length === 0) return false;
  const latest14 = town.find(r => r.category === 14);
  const latest13 = town.find(r => r.category === 13);
  return !!(latest14 && (!latest13 || latest14.rid > latest13.rid));
}

exports.handler = async function handler(event, context) {
  const headers = {
    'Cache-Control': 'no-store, no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const [tzResult, orefResult] = await Promise.allSettled([
    fetchTzevaadom(),
    checkOrefYellow(),
  ]);

  let match = null;
  if (tzResult.status === 'fulfilled') match = checkTzevaadom(tzResult.value);
  if ((!match || match.state !== 'red') && orefResult.status === 'fulfilled' && orefResult.value) {
    match = { state: 'yellow', cat: 14 };
  }

  const body = match
    ? JSON.stringify({ ok: true, data: [TOWN], cat: match.cat })
    : JSON.stringify({ ok: true });

  return { statusCode: 200, headers, body };
};
