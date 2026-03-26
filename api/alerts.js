export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
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

    // Oref returns empty body or "\r\n" when no alerts
    if (!text || !text.trim() || text.trim() === '\r\n') {
      res.status(200).json({ ok: true });
      return;
    }

    let data;
    try {
      data = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (_) {
      res.status(200).json({ ok: false, error: 'parse_error', raw: text.slice(0, 1000) });
      return;
    }

    res.status(200).json({ ok: true, ...data });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(200).json({ ok: false, error: isTimeout ? 'timeout' : 'network_error' });
  }
}
