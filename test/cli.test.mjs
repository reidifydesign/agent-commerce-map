import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.mjs';
import { buildCrosswalkDoc, buildWhichDoc } from '../scripts/build-docs.mjs';
import { ROOT } from '../src/data.mjs';

const fixture = (n) => path.join(ROOT, 'test', 'fixtures', n);

async function cli(args, io = {}) {
  const out = [];
  const err = [];
  const code = await main(args, { out: (s) => out.push(s), err: (s) => err.push(s), ...io });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('no arguments prints help', async () => {
  const r = await cli([]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage: agent-commerce-map/);
});

test('version matches package.json', async () => {
  const r = await cli(['--version']);
  assert.equal(r.out, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
});

test('verdict lists five routes, and --full carries dated sources', async () => {
  const short = await cli(['verdict']);
  for (const w of ['DO NOW', 'WAIT', 'IGNORE CHECKOUT', 'UCP', 'ACP', 'AP2', 'x402']) assert.match(short.out, new RegExp(w));
  const full = await cli(['verdict', '--full']);
  assert.match(full.out, /read 2026-09-30/);
  assert.match(full.out, /2026-04-17/);
  assert.match(full.out, /\[\[CONFIRM/);
  const json = JSON.parse((await cli(['verdict', '--json'])).out);
  assert.equal(json.items.length, 5);
  for (const i of json.items) for (const e of i.evidence) assert.match(e.url, /^https:\/\//);
});

test('every verdict claim has a publisher, a url, a published note and a read date', async () => {
  const v = JSON.parse((await cli(['verdict', '--json'])).out);
  for (const i of v.items) {
    assert.ok(i.evidence.length >= 2, i.id);
    for (const e of i.evidence) for (const k of ['claim', 'publisher', 'url', 'published', 'read']) assert.ok(e[k], `${i.id} ${k}`);
  }
});

test('crosswalk prints a group, and rejects an unknown one', async () => {
  const r = await cli(['crosswalk', '--group', 'price']);
  assert.match(r.out, /Variant\.price\.amount/);
  assert.doesNotMatch(r.out, /Variant\.barcodes/);
  const bad = await cli(['crosswalk', '--group', 'nope']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /unknown group/);
  const md = await cli(['crosswalk', '--md']);
  assert.match(md.out, /\| Concept \| ACP \| UCP \| schema\.org \|/);
});

test('sources names the pinned commits', async () => {
  const r = await cli(['sources']);
  assert.match(r.out, /7fdd78df677a94dce04c770644b0fbbb1401272b/);
  assert.match(r.out, /cd78fb38e819de77d9b527d110476eccb876f1bd/);
  assert.match(r.out, /V30\.1/);
});

test('check on a real product page fixture reports both protocols ready', async () => {
  const r = await cli(['check', fixture('scrapeme-bulbasaur.json')]);
  assert.equal(r.code, 0);
  assert.match(r.out, /ACP feed {5}OK {4}READY/);
  assert.match(r.out, /UCP catalog {2}OK {4}READY/);
});

test('check --strict fails when something is not ready, and says what', async () => {
  const file = path.join(os.tmpdir(), `acm-bare-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ '@type': 'Product', name: 'Bare' }));
  const r = await cli(['check', file, '--strict']);
  assert.equal(r.code, 1);
  assert.match(r.out, /NOT READY/);
  assert.match(r.out, /no variant id/);
  fs.rmSync(file);
});

test('check reads a URL through the injected fetcher and JSON-LD in HTML', async () => {
  const html = `<html><script type="application/ld+json">${fs.readFileSync(fixture('scrapeme-bulbasaur.json'), 'utf8')}</script></html>`;
  const r = await cli(['check', 'https://shop.example/p'], { httpText: async (u) => { assert.equal(u, 'https://shop.example/p'); return html; } });
  assert.equal(r.code, 0);
  assert.match(r.out, /https:\/\/shop\.example\/p/);
});

test('check reads stdin, and --json is machine readable', async () => {
  const r = await cli(['check', '-', '--json'], { readStdin: async () => fs.readFileSync(fixture('variant-group.json'), 'utf8') });
  const j = JSON.parse(r.out);
  assert.equal(j[0].variants, 3);
  assert.equal(j[0].acp.ready, true);
  assert.ok(j[0].withoutAHome.some((c) => c.row === 'brand'));
});

test('check exits 2 when there is no product, or the file is missing', async () => {
  const none = await cli(['check', '-'], { readStdin: async () => '<html>nothing</html>' });
  assert.equal(none.code, 2);
  const missing = await cli(['check', path.join(os.tmpdir(), 'acm-does-not-exist.json')]);
  assert.equal(missing.code, 2);
});

test('convert writes valid ACP and UCP JSON', async () => {
  const acp = await cli(['convert', fixture('variant-group.json'), '--to', 'acp']);
  assert.equal(acp.code, 0);
  const a = JSON.parse(acp.out);
  assert.equal(a.products[0].variants.length, 3);
  const ucp = await cli(['convert', fixture('variant-group.json'), '--to', 'ucp']);
  assert.equal(JSON.parse(ucp.out).price_range.min.amount, 8950);
  const jsonl = await cli(['convert', fixture('scrapeme-bulbasaur.json'), '--to', 'acp', '--jsonl']);
  assert.equal(jsonl.out.split('\n').length, 1);
  assert.equal(JSON.parse(jsonl.out).id, 'https://scrapeme.live/shop/Bulbasaur/#product');
  const noTarget = await cli(['convert', fixture('variant-group.json')]);
  assert.equal(noTarget.code, 2);
});

test('convert exits 1 and explains when the result would not be accepted', async () => {
  const r = await cli(['convert', '-', '--to', 'ucp'], { readStdin: async () => JSON.stringify({ '@type': 'Product', name: 'Bare' }) });
  assert.equal(r.code, 1);
  assert.match(r.err, /UCP schema: /);
});

test('x402-demo copies the demo and refuses a non-empty folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-demo-'));
  const target = path.join(dir, 'site');
  const r = await cli(['x402-demo', target]);
  assert.equal(r.code, 0);
  assert.ok(fs.existsSync(path.join(target, 'netlify', 'edge-functions', 'x402-paywall.mjs')));
  assert.ok(fs.existsSync(path.join(target, 'public', 'premium', 'guide.md')));
  const again = await cli(['x402-demo', target]);
  assert.equal(again.code, 2);
  fs.rmSync(dir, { recursive: true });
});

test('x402-probe exits 1 for a page that is not a 402', async () => {
  const r = await cli(['x402-probe', 'https://shop.example/'], { fetch: async () => new Response('hi', { status: 200 }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /expected HTTP 402/);
});

test('unknown command exits 2', async () => {
  assert.equal((await cli(['frobnicate'])).code, 2);
});

test('the generated docs are up to date with the data files', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs', 'CROSSWALK.md'), 'utf8'), buildCrosswalkDoc());
  assert.equal(fs.readFileSync(path.join(ROOT, 'docs', 'WHICH-PROTOCOL.md'), 'utf8'), buildWhichDoc());
});

test('no em dashes or curly quotes in anything that ships', () => {
  const bad = new RegExp('[' + [0x2014, 0x2013, 0x2018, 0x2019, 0x201c, 0x201d].map((c) => String.fromCharCode(c)).join('') + ']');
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|json|mjs|toml|html|yml)$/.test(e.name) && !p.includes(path.join('data', 'snapshots'))) files.push(p);
    }
  };
  walk(ROOT);
  for (const f of files) assert.ok(!bad.test(fs.readFileSync(f, 'utf8')), `${path.relative(ROOT, f)} has an em dash, en dash or curly quote`);
});
