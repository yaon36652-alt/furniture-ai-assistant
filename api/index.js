const furnitureData = require('./furniture-data');
const { configureFurnitureCatalog, createRequestHandler } = require('../server');

// Vercel bundles imported JavaScript modules reliably. Use the inline catalog
// for every Serverless Function instead of relying on filesystem assets.
configureFurnitureCatalog(furnitureData);

// Vercel invokes every file in /api as a `(req, res)` Serverless Function.
// Keep one shared router so local Node and Vercel use identical API behavior.
const requestHandler = createRequestHandler();

module.exports = function handler(req, res) {
  return requestHandler(req, res);
};

