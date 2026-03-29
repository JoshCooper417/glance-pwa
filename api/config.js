export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    showDebug: process.env.SHOW_DEBUG === 'true',
  });
}
