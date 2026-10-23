// Vercel maps this file directly to GET /api/health.
const furnitureData = require('./furniture-data');
const { configureFurnitureCatalog } = require('../server');
configureFurnitureCatalog(furnitureData);
module.exports = require('./index');
