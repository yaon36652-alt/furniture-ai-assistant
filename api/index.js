const { createRequestHandler } = require('../server');

// Vercel invokes every file in /api as a `(req, res)` Serverless Function.
// Keep one shared router so local Node and Vercel use identical API behavior.
const requestHandler = createRequestHandler();

module.exports = function handler(req, res) {
  return requestHandler(req, res);
};

