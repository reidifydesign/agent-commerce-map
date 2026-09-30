import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, readConfig, decodeHeader, encodeHeader, buildRequired, TESTNETS } from '../demo/x402-netlify/netlify/edge-functions/x402-paywall.mjs';
import { probe, renderProbe, KNOWN_TEST_NETWORKS } from '../src/x402.mjs';

const PAY_TO = '0x' + 'ab'.repeat(20); // a made-up public address, not a key
const env = (extra = {}) => ({ get: (k) => ({ PAY_TO, ...extra })[k] });
const URL_ = 'https://demo.example/premium/guide.md';
const req = (headers = {}, method = 'GET') => new Request(URL_, { method, headers });
const page = () => new Response('# secret guide', { status: 200, headers: { 'content-type': 'text/markdown' } });

function signature(cfg) {
  const accepted = buildRequired(cfg, URL_).accepts[0];
  return encodeHeader({ x402Version: 2, resource: { url: URL_ }, accepted, payload: { signature: '0xtest', authorization: { from: PAY_TO, to: PAY_TO, value: accepted.amount } } });
}

// A stand-in facilitator. Records calls in order.
function facilitator({ valid = true, settle = true, down = false } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push(url.split('/').pop());
    if (down) return new Response('no', { status: 503 });
    const body = JSON.parse(init.body);
    assert.equal(body.x402Version, 2);
    assert.ok(body.paymentPayload && body.paymentRequirements);
    if (url.endsWith('/verify')) return Response.json(valid ? { isValid: true, payer: PAY_TO } : { isValid: false, invalidReason: 'insufficient_funds' });
    return Response.json(settle ? { success: true, transaction: '0x1', network: 'eip155:84532', payer: PAY_TO } : { success: false, errorReason: 'nonce_used', transaction: '', network: 'eip155:84532' });
  };
  return { fn, calls };
}

test('the demo only knows test networks, and they are on the probe list', () => {
  for (const n of Object.keys(TESTNETS)) assert.ok(KNOWN_TEST_NETWORKS.includes(n), n);
});

test('config refuses a mainnet, a missing or malformed PAY_TO, and a bad amount', () => {
  assert.match(readConfig(env({ X402_NETWORK: 'eip155:8453' })).error, /refusing to run on eip155:8453/);
  assert.match(readConfig({ get: () => undefined }).error, /PAY_TO/);
  assert.match(readConfig(env({ PAY_TO: '0x123' })).error, /PAY_TO/);
  assert.match(readConfig(env({ X402_AMOUNT: '0.5' })).error, /X402_AMOUNT/);
  const ok = readConfig(env());
  assert.equal(ok.network, 'eip155:84532');
  assert.equal(ok.amount, '1000');
  assert.equal(ok.facilitator, 'https://x402.org/facilitator');
});

test('mainnet configuration makes the function answer 500 and never call a facilitator', async () => {
  const f = facilitator();
  const res = await handle(req({ 'PAYMENT-SIGNATURE': 'x' }), { env: env({ X402_NETWORK: 'eip155:1' }), fetchFn: f.fn, next: page });
  assert.equal(res.status, 500);
  assert.deepEqual(f.calls, []);
});

test('no payment header: 402 with a spec-shaped PAYMENT-REQUIRED header', async () => {
  const f = facilitator();
  const res = await handle(req(), { env: env(), fetchFn: f.fn, next: page });
  assert.equal(res.status, 402);
  const body = decodeHeader(res.headers.get('PAYMENT-REQUIRED'));
  assert.equal(body.x402Version, 2);
  assert.equal(body.resource.url, URL_);
  const a = body.accepts[0];
  assert.deepEqual([a.scheme, a.network, a.amount, a.payTo, a.maxTimeoutSeconds], ['exact', 'eip155:84532', '1000', PAY_TO, 60]);
  assert.equal(a.asset, '0x036CbD53842c5426634e7929541eC2318f3dCF7e');
  assert.deepEqual(f.calls, []);
});

test('HEAD is answered with the price and never settles', async () => {
  const f = facilitator();
  const res = await handle(req({ 'PAYMENT-SIGNATURE': signature(readConfig(env())) }, 'HEAD'), { env: env(), fetchFn: f.fn, next: page });
  assert.equal(res.status, 402);
  assert.deepEqual(f.calls, []);
});

test('other methods get 405', async () => {
  const res = await handle(req({}, 'POST'), { env: env(), fetchFn: facilitator().fn, next: page });
  assert.equal(res.status, 405);
});

test('a header that is not base64 JSON gets 400', async () => {
  const res = await handle(req({ 'PAYMENT-SIGNATURE': '%%%' }), { env: env(), fetchFn: facilitator().fn, next: page });
  assert.equal(res.status, 400);
});

test('a payment for different terms is refused before the facilitator is called', async () => {
  const cfg = readConfig(env());
  const cheap = encodeHeader({ x402Version: 2, accepted: { ...buildRequired(cfg, URL_).accepts[0], amount: '1' }, payload: {} });
  const f = facilitator();
  const res = await handle(req({ 'PAYMENT-SIGNATURE': cheap }), { env: env(), fetchFn: f.fn, next: page });
  assert.equal(res.status, 402);
  assert.deepEqual(f.calls, []);
});

test('paid request: verify, then serve, then settle, then PAYMENT-RESPONSE on the file', async () => {
  const f = facilitator();
  const res = await handle(req({ 'PAYMENT-SIGNATURE': signature(readConfig(env())) }), { env: env(), fetchFn: f.fn, next: page });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '# secret guide');
  assert.deepEqual(f.calls, ['verify', 'settle']);
  const pr = decodeHeader(res.headers.get('PAYMENT-RESPONSE'));
  assert.equal(pr.success, true);
  assert.equal(pr.network, 'eip155:84532');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('an invalid payment gets 402 and the file is never fetched', async () => {
  let fetched = false;
  const res = await handle(req({ 'PAYMENT-SIGNATURE': signature(readConfig(env())) }), { env: env(), fetchFn: facilitator({ valid: false }).fn, next: async () => { fetched = true; return page(); } });
  assert.equal(res.status, 402);
  assert.match(decodeHeader(res.headers.get('PAYMENT-REQUIRED')).error, /insufficient_funds/);
  assert.equal(fetched, false);
});

test('a missing file is returned as is and is never settled', async () => {
  const f = facilitator();
  const res = await handle(req({ 'PAYMENT-SIGNATURE': signature(readConfig(env())) }), { env: env(), fetchFn: f.fn, next: async () => new Response('nope', { status: 404 }) });
  assert.equal(res.status, 404);
  assert.deepEqual(f.calls, ['verify']);
});

test('a failed settlement returns 402 with the failure in PAYMENT-RESPONSE and no content', async () => {
  const res = await handle(req({ 'PAYMENT-SIGNATURE': signature(readConfig(env())) }), { env: env(), fetchFn: facilitator({ settle: false }).fn, next: page });
  assert.equal(res.status, 402);
  assert.equal(decodeHeader(res.headers.get('PAYMENT-RESPONSE')).success, false);
  assert.ok(!(await res.text()).includes('secret'));
});

test('an unreachable facilitator is a 502, not a free page', async () => {
  const res = await handle(req({ 'PAYMENT-SIGNATURE': signature(readConfig(env())) }), { env: env(), fetchFn: facilitator({ down: true }).fn, next: page });
  assert.equal(res.status, 502);
});

test('header encoding round-trips non-ASCII text', () => {
  const o = { description: 'café' };
  assert.deepEqual(decodeHeader(encodeHeader(o)), o);
});

// ----- probe -----
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

test('probe reads a v2 402 and flags a test network as fine', async () => {
  const cfg = readConfig(env());
  const fetchFn = async () => new Response('{}', { status: 402, headers: { 'PAYMENT-REQUIRED': b64(buildRequired(cfg, URL_)) } });
  const p = await probe(URL_, fetchFn);
  assert.equal(p.status, 402);
  assert.equal(p.x402Version, 2);
  assert.equal(p.accepts[0].testNetwork, true);
  assert.deepEqual(p.findings, []);
  assert.match(renderProbe(p), /OK {4}a 402 with a readable price, on a known test network/);
});

test('probe warns on a network that is not a known test network', async () => {
  const body = { x402Version: 2, resource: { url: URL_ }, accepts: [{ scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: '0xabc', payTo: PAY_TO, maxTimeoutSeconds: 60 }] };
  const p = await probe(URL_, async () => new Response('{}', { status: 402, headers: { 'PAYMENT-REQUIRED': b64(body) } }));
  assert.equal(p.accepts[0].testNetwork, false);
  assert.ok(p.findings.some((f) => f.level === 'warn' && /real money/.test(f.msg)));
});

test('probe reports a page that is not a 402, a v1 body, and garbage', async () => {
  assert.match((await probe(URL_, async () => new Response('hi', { status: 200 }))).findings[0].msg, /expected HTTP 402/);
  const v1 = await probe(URL_, async () => new Response(JSON.stringify({ x402Version: 1, accepts: [{ scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '10000', payTo: PAY_TO }] }), { status: 402 }));
  assert.equal(v1.transport, 'JSON body (x402 v1 style)');
  assert.equal(v1.accepts[0].amount, '10000');
  const junk = await probe(URL_, async () => new Response('not json', { status: 402 }));
  assert.ok(junk.findings.some((f) => f.level === 'fail'));
  const badHeader = await probe(URL_, async () => new Response('', { status: 402, headers: { 'PAYMENT-REQUIRED': '@@@' } }));
  assert.ok(badHeader.findings.some((f) => f.level === 'fail'));
});
