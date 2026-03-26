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
      'https://www.oref.org.il/WarningMessages/alert/alerts.json',
      {
        signal: AbortSignal.timeout(3000),
        headers: {
          'Referer': 'https://www.oref.org.il/',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'he-IL,he;q=0.9',
          'User-Agent': 'Mozilla/5.0 (compatible; GlancePWA/1.0)',
        },
      }
    );

    const text = await upstream.text();

    if (!text || !text.trim() || text.trim() === '\r\n') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'parse_error', raw: text.slice(0, 1000) }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...data }) };
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: isTimeout ? 'timeout' : 'network_error' }) };
  }
};
