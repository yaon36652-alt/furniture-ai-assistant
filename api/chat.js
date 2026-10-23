// Vercel maps this file directly to POST /api/chat.
const furnitureData = require('./furniture-data');
const { configureFurnitureCatalog } = require('../server');
configureFurnitureCatalog(furnitureData);
module.exports = require('./index');
