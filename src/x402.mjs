import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './data.mjs';

// Networks the public x402.org facilitator listed as test networks when read on 2026-09-30
// (GET https://x402.org/facilitator/supported). Anything else is treated as real money.
export const KNOWN_TEST_NETWORKS = [
  'eip155:84532',
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe',
  'aptos:2',
  'stellar:testnet',
  'hedera:testnet'
];

function decodeB64Json(v) {
  return JSON.parse(Buffer.from(v, 'base64').toString('utf8'));
}

// One GET. Reads what an x402 endpoint asks for and says whether it looks like a test network.
export async function probe(url, fetchFn = fetch) {
  const res = await fetchFn(url, { headers: { 'user-agent': 'agent-commerce-map/0.1 (+https://github.com/reidifydesign/agent-commerce-map)' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const out = { url, status: res.status, findings: [], accepts: [] };
  if (res.status !== 402) {
    out.findings.push({ level: 'warn', msg: `expected HTTP 402, got ${res.status}. This URL is not asking for an x402 payment (or is already unlocked).` });
    return out;
  }
  let body;
  const header = res.headers.get('payment-required');
  if (header) {
    try {
      body = decodeB64Json(header);
      out.transport = 'v2 header (PAYMENT-REQUIRED)';
    } catch {
      out.findings.push({ level: 'fail', msg: 'PAYMENT-REQUIRED header is not base64 JSON' });
      return out;
    }
  } else {
    try {
      body = JSON.parse(await res.text());
      out.transport = 'JSON body (x402 v1 style)';
      out.findings.push({ level: 'info', msg: 'no PAYMENT-REQUIRED header, read the JSON body instead. That is the older v1 shape.' });
    } catch {
      out.findings.push({ level: 'fail', msg: 'got 402 but neither a PAYMENT-REQUIRED header nor a JSON body' });
      return out;
    }
  }
  out.x402Version = body.x402Version;
  out.resource = body.resource || null;
  for (const a of body.accepts || []) {
    const test = KNOWN_TEST_NETWORKS.includes(a.network);
    out.accepts.push({
      scheme: a.scheme,
      network: a.network,
      amount: a.amount ?? a.maxAmountRequired,
      asset: a.asset,
      payTo: a.payTo,
      maxTimeoutSeconds: a.maxTimeoutSeconds,
      testNetwork: test
    });
    if (!test) out.findings.push({ level: 'warn', msg: `network ${a.network} is not on the known test network list. Treat it as real money until you confirm otherwise.` });
  }
  if (!out.accepts.length) out.findings.push({ level: 'fail', msg: 'the 402 response lists no accepted payment methods' });
  return out;
}

export function renderProbe(p) {
  const lines = [`x402 probe  ${p.url}`, `  status      ${p.status}`];
  if (p.transport) lines.push(`  transport   ${p.transport}`);
  if (p.x402Version !== undefined) lines.push(`  x402        version ${p.x402Version}`);
  for (const a of p.accepts) {
    lines.push(`  accepts     ${a.scheme} on ${a.network}  ${a.testNetwork ? 'TEST NETWORK' : 'NOT A KNOWN TEST NETWORK'}`);
    lines.push(`              amount ${a.amount} (atomic units), asset ${a.asset}`);
    lines.push(`              payTo ${a.payTo}, timeout ${a.maxTimeoutSeconds}s`);
  }
  for (const f of p.findings) lines.push(`  ${f.level === 'warn' ? 'WARN' : f.level === 'fail' ? 'FAIL' : 'note'}  ${f.msg}`);
  if (!p.findings.some((f) => f.level === 'fail' || f.level === 'warn') && p.accepts.length) lines.push('  OK    a 402 with a readable price, on a known test network');
  return lines.join('\n');
}

export function scaffoldDemo(dest) {
  const src = path.join(ROOT, 'demo', 'x402-netlify');
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new Error(`${dest} already exists and is not empty`);
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}
