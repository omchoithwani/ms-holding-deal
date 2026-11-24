// Replays real MS Holdings API responses through src/index.js (email) with fetch stubbed,
// in DRY_RUN mode. Run: node test/replay.mjs
import { handle, calls } from './fixtures.mjs';

process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
process.env.DRY_RUN = 'true';
process.env.DATE_FROM = '2026-11-01';
process.env.DATE_TO = '2026-11-22';

globalThis.fetch = async (url, opts = {}) => {
  const { status, json } = handle(opts.method, url, opts.body ? JSON.parse(opts.body) : null, opts.headers?.Authorization);
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
};

process.on('exit', (code) => console.log(`\n[replay] ${calls.length} API calls, exit ${code}`));
await import('../src/index.js');
