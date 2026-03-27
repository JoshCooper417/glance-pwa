exports.handler = async function handler(event, context) {
  const headers = {
    'Cache-Control': 'no-store, no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
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
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'parse_error', raw: text.slice(0, 1000) }) };
    }

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, data: allCities, cat: highestThreat }),
    };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: isTimeout ? 'timeout' : 'network_error' }) };
  }
};
