// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app the local server uses.
export { default } from '../server/src/app.js';
