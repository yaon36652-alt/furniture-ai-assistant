const fs = require('fs');
const path = require('path');

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

  const file = path.join(__dirname, '..', 'public', 'furniture_db.json');
  try {
    const source = fs.readFileSync(file, 'utf8');
    const catalog = JSON.parse(source);
    if (!Array.isArray(catalog)) throw new Error('家具数据库格式无效');
    if (req.method === 'HEAD') return res.end();
    return res.end(JSON.stringify(catalog));
  } catch (error) {
    console.error(`[furniture-db] load failed: ${error.code || error.name}`);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'furniture_db_unavailable', message: '家具数据暂时不可用。' }));
  }
};

