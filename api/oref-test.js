// Edge runtime — runs at the nearest Vercel edge node to the requester
// Goal: test if Oref is reachable from a non-AWS edge IP
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
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
      }
    );
    const text = await res.text();
    const blocked = text.includes('Access Denied') || text.includes('<HTML>');
    return new Response(JSON.stringify({
      ok: !blocked,
      status: res.status,
      blocked,
      preview: text.slice(0, 300),
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers });
  }
}
