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

    const allCities = [...new Set(alerts.flatMap(a => a.cities || []))];
    const highestThreat = alerts.reduce((min, a) => {
      const t = Number(a.threat);
      return t < min ? t : min;
    }, Infinity);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        data: allCities,
        cat: highestThreat === Infinity ? null : highestThreat,
      }),
    };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: isTimeout ? 'timeout' : 'network_error' }) };
  }
};
