// Runs proxy.js on your laptop in debug mode (no OpenAI call, no logging)
// and prints the verified data block the advisor backend added.
// Usage, from the proxy/ folder:
//   ADMIN_KEY=local-test ADVISOR_BACKEND_URL=... ADVISOR_BACKEND_KEY=... node scripts/test-proxy-local.mjs "your question"
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const src = path.resolve('api/proxy.js');
const tmp = path.join(os.tmpdir(), 'proxy_test_' + Date.now() + '.mjs');
fs.copyFileSync(src, tmp);
const { default: handler } = await import(pathToFileURL(tmp).href);

function run(body) {
  return new Promise(function(resolve) {
    const res = {
      headers: {}, code: 200,
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(d) { resolve({ code: this.code, data: d }); },
      end() { resolve({ code: this.code, data: null }); }
    };
    handler({ method: 'POST', headers: {}, body: body }, res);
  });
}

const messages = [
  { role: 'user', content: 'where should I live if I want to be a financial analyst' },
  { role: 'assistant', content: 'Top paying cities for financial analysts are San Francisco, New York, and Seattle.' },
  { role: 'user', content: process.argv[2] || 'what about software developers?' }
];

const out = await run({
  type: 'chat',
  messages: messages,
  userId: 'local-test-user',
  context: { pageDesc: 'local test' },
  debugReturnPrompt: true,
  adminKey: process.env.ADMIN_KEY
});

const adv = out.data && out.data._advisor;
console.log('backend used:', adv ? JSON.stringify(adv) : 'NO (check ADVISOR_BACKEND_URL / ADVISOR_BACKEND_KEY)');
const prompt = (out.data && out.data._debug_system_prompt) || '';
const i = prompt.indexOf('VERIFIED VANDERBILT DATA');
console.log('');
console.log(i > -1 ? prompt.slice(i) : 'No verified data block in the prompt.');
fs.unlinkSync(tmp);
