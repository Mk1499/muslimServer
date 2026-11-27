// Vercel catch-all entry point.
// `npm run build` compiles the Nest app to dist/, then Vercel exposes this
// file for every /api/... request. The Express app keeps the original req.url.
const handler = require('../dist/vercel-handler.js').default;

module.exports = handler;
