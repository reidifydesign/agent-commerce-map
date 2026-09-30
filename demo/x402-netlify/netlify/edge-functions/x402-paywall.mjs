// x402 on a static site, testnet only. A Netlify edge function that puts /premium/* behind a 402.
//
// Flow (x402 spec v2, "authorization" payment flow): verify, serve the file, settle, respond.
//   1. No PAYMENT-SIGNATURE header: answer 402 with a PAYMENT-REQUIRED header.
//   2. With one: ask the facilitator to /verify it, fetch the static file, then /settle, then
//      return the file with a PAYMENT-RESPONSE header.
//
// Safety: this code refuses to run on anything but the networks listed in TESTNETS. There is no
// key in it. PAY_TO is a public address that receives test tokens. Never point it at a mainnet.

export const TESTNETS = {
  'eip155:84532': {
    label: 'Base Sepolia (test network)',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    extra: { name: 'USDC', version: '2' }
  }
};
export const DEFAULT_FACILITATOR = 'https://x402.org/facilitator';
export const DEFAULT_AMOUNT = '1000'; // atomic units. USDC has 6 decimals, so this is 0.001 test USDC.

const JSON_HEADERS = { 'content-type': 'application/json' };

export function encodeHeader(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeHeader(value) {
  const bin = atob(value);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function readConfig(env) {
  const network = env.get('X402_NETWORK') || 'eip155:84532';
  if (!TESTNETS[network]) {
    return { error: `refusing to run on ${network}: this demo only supports ${Object.keys(TESTNETS).join(', ')}` };
  }
  const payTo = env.get('PAY_TO');
  if (!payTo || !/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
    return { error: 'set the PAY_TO environment variable to a public testnet address (0x followed by 40 hex characters)' };
  }
  const amount = env.get('X402_AMOUNT') || DEFAULT_AMOUNT;
  if (!/^[1-9][0-9]{0,14}$/.test(amount)) return { error: 'X402_AMOUNT must be a whole number of atomic units' };
  return { network, payTo, amount, facilitator: (env.get('X402_FACILITATOR') || DEFAULT_FACILITATOR).replace(/\/$/, '') };
}

export function buildRequired(cfg, url, error) {
  const net = TESTNETS[cfg.network];
  return {
    x402Version: 2,
    error,
    resource: { url, description: 'Agent guide (testnet demo)', mimeType: 'text/markdown' },
    accepts: [{ scheme: 'exact', network: cfg.network, amount: cfg.amount, asset: net.asset, payTo: cfg.payTo, maxTimeoutSeconds: 60, extra: net.extra }]
  };
}

const sameTerms = (a, b) => ['scheme', 'network', 'amount', 'asset', 'payTo'].every((k) => String(a && a[k]).toLowerCase() === String(b[k]).toLowerCase());

function paymentRequired(cfg, url, error) {
  return new Response(JSON.stringify({ error, testnet: true }), {
    status: 402,
    headers: { ...JSON_HEADERS, 'PAYMENT-REQUIRED': encodeHeader(buildRequired(cfg, url, error)) }
  });
}

async function post(fetchFn, url, body) {
  const res = await fetchFn(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`facilitator ${res.status}`);
  return res.json();
}

// env: { get(name) }, fetchFn: fetch, next: () => Promise<Response> (the static file)
export async function handle(request, { env, fetchFn, next }) {
  const cfg = readConfig(env);
  if (cfg.error) return new Response(JSON.stringify({ error: cfg.error }), { status: 500, headers: JSON_HEADERS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
  const url = request.url;
  const header = request.headers.get('PAYMENT-SIGNATURE');
  if (!header || request.method === 'HEAD') return paymentRequired(cfg, url, 'PAYMENT-SIGNATURE header is required');

  let payload;
  try {
    payload = decodeHeader(header);
  } catch {
    return new Response(JSON.stringify({ error: 'PAYMENT-SIGNATURE is not base64 JSON' }), { status: 400, headers: JSON_HEADERS });
  }
  const requirements = buildRequired(cfg, url).accepts[0];
  if (payload.x402Version !== 2 || !sameTerms(payload.accepted, requirements)) {
    return paymentRequired(cfg, url, 'payment terms do not match what this resource asks for');
  }
  const body = { x402Version: 2, paymentPayload: payload, paymentRequirements: requirements };

  let verified;
  try {
    verified = await post(fetchFn, `${cfg.facilitator}/verify`, body);
  } catch (e) {
    return new Response(JSON.stringify({ error: `could not reach the facilitator to verify (${e.message})` }), { status: 502, headers: JSON_HEADERS });
  }
  if (!verified.isValid) return paymentRequired(cfg, url, `payment not valid: ${verified.invalidReason || 'unknown reason'}`);

  const page = await next();
  if (!page.ok) return page; // nothing to sell here, so do not settle

  let settled;
  try {
    settled = await post(fetchFn, `${cfg.facilitator}/settle`, body);
  } catch (e) {
    return new Response(JSON.stringify({ error: `could not reach the facilitator to settle (${e.message})` }), { status: 502, headers: JSON_HEADERS });
  }
  if (!settled.success) {
    return new Response(JSON.stringify({ error: `settlement failed: ${settled.errorReason || 'unknown reason'}`, testnet: true }), {
      status: 402,
      headers: { ...JSON_HEADERS, 'PAYMENT-RESPONSE': encodeHeader(settled) }
    });
  }
  const out = new Response(page.body, page);
  out.headers.set('PAYMENT-RESPONSE', encodeHeader(settled));
  out.headers.set('Cache-Control', 'no-store');
  return out;
}

export default async function edge(request, context) {
  const env = { get: (k) => globalThis.Netlify?.env?.get(k) ?? globalThis.process?.env?.[k] };
  return handle(request, { env, fetchFn: fetch, next: () => context.next() });
}

export const config = { path: '/premium/*' };
