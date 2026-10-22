const { createAppServer } = require('../server');

// Reuse the same request router as the local Node server, but expose it in
// Vercel's `(req, res)` Serverless Function shape. No listener is started here.
const requestServer = createAppServer();

module.exports = function vercelHandler(req, res) {
  return requestServer.emit('request', req, res);
};

