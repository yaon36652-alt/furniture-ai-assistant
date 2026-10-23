const furnitureData = require('./furniture-data');

module.exports = function furnitureDatabaseHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Serve the bundled catalog directly. This avoids depending on Vercel's
  // filesystem packaging rules for public/furniture_db.json.
  if (req.method === 'HEAD') return res.end();
  return res.end(JSON.stringify(furnitureData));
};

