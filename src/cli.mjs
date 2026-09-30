import fs from 'node:fs';
import path from 'node:path';
import { loadCrosswalk, loadVerdict, loadSnapshots, ROOT } from './data.mjs';
import { renderTable, renderMarkdown, summarise } from './crosswalk.mjs';
import { renderVerdict, renderVerdictMarkdown, renderCheck } from './render.mjs';
import { extractJsonLd, findProducts } from './jsonld.mjs';
import { buildModel, toAcp, toUcp, coverage, setSnapshots } from './convert.mjs';
import { runDrift, renderDrift } from './drift.mjs';
import { probe, renderProbe, scaffoldDemo } from './x402.mjs';
import { httpText } from './snapshot.mjs';
import { SOURCES, READ_DATE } from './sources.mjs';

const HELP = `agent-commerce-map: a dated crosswalk of ACP, UCP and schema.org Product fields.

Usage: agent-commerce-map <command> [options]

  verdict [--full] [--md|--json]      which protocol a small shop can ignore, with sources and dates
  crosswalk [--group g] [--md|--json] the field table: ACP, UCP and schema.org side by side
  check <file|url|-> [--json] [--strict]
                                      read schema.org Product JSON-LD and say what ACP and UCP
                                      would need, checked against the pinned schemas
  convert <file|url|-> --to acp|ucp [--jsonl]
                                      write ACP feed or UCP catalog products from your JSON-LD
  drift [--json] [--out file]         compare the pinned snapshots with the sources today
  sources                             the exact versions every row was checked against
  x402-demo <dir>                     copy the testnet-only x402 Netlify demo into <dir>
  x402-probe <url>                    one GET: what does this x402 endpoint ask for, is it a test network

Groups: identity, text, media, price, availability, condition, taxonomy, variants, seller, proof, feed, outside
Exit codes: 0 fine, 1 a check failed (with --strict, or drift found a broken path), 2 bad input.`;

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['to', 'group', 'out'].includes(key)) flags[key] = argv[++i];
      else flags[key] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

async function readInput(target, io) {
  if (target === '-') return { text: await io.readStdin(), label: 'stdin' };
  if (/^https?:\/\//i.test(target)) return { text: await io.httpText(target), label: target };
  return { text: fs.readFileSync(target, 'utf8'), label: target };
}

export function analyse(text, snaps, crosswalk) {
  setSnapshots(snaps);
  const { nodes, errors } = extractJsonLd(text);
  const ctx = findProducts(nodes);
  const results = ctx.products.map((p) => {
    const model = buildModel(p, ctx);
    return { model, acp: toAcp(model), ucp: toUcp(model), coverage: coverage(model, crosswalk) };
  });
  return { results, errors };
}

export async function main(argv, ioIn = {}) {
  const io = {
    out: (s) => console.log(s),
    err: (s) => console.error(s),
    httpText,
    readStdin: async () => { let s = ''; for await (const c of process.stdin) s += c; return s; },
    fetch: globalThis.fetch,
    ...ioIn
  };
  const { flags, rest } = parseArgs(argv);
  const cmd = rest[0];
  if (flags.version) { io.out(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version); return 0; }
  if (!cmd || cmd === 'help' || flags.help) { io.out(HELP); return 0; }

  if (cmd === 'verdict') {
    const v = loadVerdict();
    io.out(flags.json ? JSON.stringify(v, null, 2) : flags.md ? renderVerdictMarkdown(v) : renderVerdict(v, { full: !!flags.full }));
    return 0;
  }

  if (cmd === 'crosswalk') {
    const cw = loadCrosswalk();
    if (flags.group && !cw.meta.groups[flags.group]) { io.err(`unknown group "${flags.group}". Groups: ${Object.keys(cw.meta.groups).join(', ')}`); return 2; }
    const view = flags.group ? { ...cw, rows: cw.rows.filter((r) => r.group === flags.group) } : cw;
    if (flags.json) io.out(JSON.stringify(view, null, 2));
    else if (flags.md) io.out(renderMarkdown(view));
    else {
      io.out(`ACP, UCP and schema.org Product fields   (verified ${cw.meta.verified})\n`);
      io.out(renderTable(cw, { group: flags.group }));
      const s = summarise(view);
      io.out(`\n${view.rows.length} concepts: ${s['both protocols'] || 0} carried by both protocols, ${s['UCP only'] || 0} by UCP only, ${s['ACP only'] || 0} by ACP only, ${s['neither protocol'] || 0} by neither.`);
    }
    return 0;
  }

  if (cmd === 'sources') {
    io.out(`Sources every row was checked against (read ${READ_DATE})\n`);
    const a = SOURCES.acp, u = SOURCES.ucp, s = SOURCES.schemaorg;
    io.out(`ACP         ${a.repo}  ${a.pinned.label}\n            commit ${a.pinned.ref}  (${a.pinned.refDate})\n            ${a.pinned.file}\n            ${a.licence}. ${a.status}\n`);
    io.out(`UCP         ${u.repo}  ${u.pinned.label}\n            commit ${u.pinned.ref}\n            ${u.pinned.files.join(', ')} and the files they reference\n            ${u.licence}. ${u.status}\n`);
    io.out(`schema.org  ${s.pinned.label} (released ${s.pinned.refDate}), commit ${s.pinned.ref}\n            ${s.pinned.url}\n            ${s.licence}. ${s.status}`);
    return 0;
  }

  if (cmd === 'check' || cmd === 'convert') {
    const target = rest[1];
    if (!target) { io.err(`usage: agent-commerce-map ${cmd} <file|url|->`); return 2; }
    if (cmd === 'convert' && !['acp', 'ucp'].includes(flags.to)) { io.err('convert needs --to acp or --to ucp'); return 2; }
    let input;
    try { input = await readInput(target, io); } catch (e) { io.err(`could not read ${target}: ${e.message}`); return 2; }
    const { results, errors } = analyse(input.text, loadSnapshots(), loadCrosswalk());
    for (const e of errors) io.err(`note: ${e}`);
    if (!results.length) { io.err('no schema.org Product or ProductGroup found in JSON-LD'); return 2; }
    if (cmd === 'convert') {
      const items = results.map((r) => r[flags.to]);
      const bad = items.filter((x) => !x.ready);
      for (const x of bad) for (const e of x.errors) io.err(`${x.protocol} schema: ${e}`);
      if (flags.jsonl) io.out(items.map((x) => JSON.stringify(x.product)).join('\n'));
      else io.out(JSON.stringify(flags.to === 'acp' ? { products: items.map((x) => x.product) } : items.length === 1 ? items[0].product : items.map((x) => x.product), null, 2));
      return bad.length ? 1 : 0;
    }
    if (flags.json) {
      io.out(JSON.stringify(results.map((r) => ({
        kind: r.model.kind,
        name: r.model.name,
        variants: r.model.variants.length,
        acp: { ready: r.acp.ready, errors: r.acp.errors, issues: r.acp.issues },
        ucp: { ready: r.ucp.ready, errors: r.ucp.errors, issues: r.ucp.issues },
        withoutAHome: r.coverage.filter((c) => !c.acp || !c.ucp)
      })), null, 2));
    } else io.out(renderCheck(input.label, results));
    return flags.strict && results.some((r) => !r.acp.ready || !r.ucp.ready) ? 1 : 0;
  }

  if (cmd === 'drift') {
    let last = 0;
    const slow = async (url) => {
      const wait = Math.max(0, last + 1000 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return io.httpText(url);
    };
    const report = await runDrift({ fetchText: io.driftFetch || slow, pinned: loadSnapshots(), crosswalk: loadCrosswalk() });
    if (flags.out) { fs.mkdirSync(path.dirname(flags.out), { recursive: true }); fs.writeFileSync(flags.out, JSON.stringify(report, null, 2) + '\n'); }
    io.out(flags.json ? JSON.stringify(report, null, 2) : renderDrift(report));
    return report.ok ? 0 : 1;
  }

  if (cmd === 'x402-demo') {
    if (!rest[1]) { io.err('usage: agent-commerce-map x402-demo <dir>'); return 2; }
    try { scaffoldDemo(path.resolve(rest[1])); } catch (e) { io.err(e.message); return 2; }
    io.out(`copied the testnet-only x402 demo to ${rest[1]}\nnext: set PAY_TO to a public testnet address in Netlify, deploy, then run x402-probe on /premium/guide.md`);
    return 0;
  }

  if (cmd === 'x402-probe') {
    if (!rest[1]) { io.err('usage: agent-commerce-map x402-probe <url>'); return 2; }
    const p = await probe(rest[1], io.fetch);
    io.out(flags.json ? JSON.stringify(p, null, 2) : renderProbe(p));
    return p.findings.some((f) => f.level === 'fail') || p.status !== 402 ? 1 : 0;
  }

  io.err(`unknown command "${cmd}". Run with --help.`);
  return 2;
}
