// Cloudflare Worker — proxies Oref history to Vercel
// Runs from Cloudflare's CDN IP space (not AWS/Azure, so not blocked by Akamai)

const TOWN = 'גבעות עדן';

export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    try {
      const res = await fetch(
        'https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1',
        {
          headers: {
            'Referer': 'https://www.oref.org.il/',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'he-IL,he;q=0.9',
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      const text = (await res.text()).replace(/^\uFEFF/, '');

      if (text.includes('<HTML>') || text.includes('Access Denied')) {
        return new Response(JSON.stringify({ ok: false, error: 'blocked' }), {
          status: 502,
          headers: corsHeaders,
        });
      }

      const records = JSON.parse(text);
      const town = records
        .filter(r => r.data === TOWN)
        .sort((a, b) => b.rid - a.rid);

      const latest14 = town.find(r => r.category === 14);
      const latest13 = town.find(r => r.category === 13);
      const yellow = !!(latest14 && (!latest13 || latest14.rid > latest13.rid));

      return new Response(JSON.stringify({ ok: true, yellow, latestRecord: town[0] || null }), {
        headers: corsHeaders,
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 502,
        headers: corsHeaders,
      });
    }
  },
};
