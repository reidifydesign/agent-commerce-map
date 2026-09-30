// Compare the pinned snapshots with what the sources say now.
// Reports: crosswalk paths that no longer resolve, new or removed fields, and fields the
// crosswalk does not cover yet.
import { snapshotAll } from './snapshot.mjs';
import { verifyCrosswalk } from './crosswalk.mjs';
import { READ_DATE } from './sources.mjs';

function topLevel(snap, protocol) {
  const out = {};
  if (protocol === 'acp') {
    const d = snap.schema.$defs;
    for (const root of ['Product', 'Variant', 'FeedMetadata']) out[root] = Object.keys((d[root] && d[root].properties) || {});
  } else {
    for (const [root, f] of [['Product', 'shopping/types/product.json'], ['Variant', 'shopping/types/variant.json']]) {
      out[root] = Object.keys((snap.files[f] && snap.files[f].properties) || {});
    }
  }
  return out;
}

const flat = (tl) => Object.entries(tl).flatMap(([root, props]) => props.map((p) => `${root}.${p}`));
const diff = (a, b) => ({ added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) });

function covered(crosswalk, protocol, dotted) {
  return crosswalk.rows.some((r) => (r[protocol] || []).some((p) => p.path === dotted || p.path.startsWith(dotted + '.') || p.path.startsWith(dotted + '[')));
}

function schemaorgProps(snap) {
  const out = [];
  for (const [cls, v] of Object.entries(snap.classes)) for (const p of Object.keys(v.props)) out.push(`${cls}.${p}`);
  return out.sort();
}

export async function runDrift({ fetchText, pinned, crosswalk, now = new Date() }) {
  const next = await snapshotAll(fetchText, 'next');
  const broken = verifyCrosswalk(crosswalk, next);
  const report = {
    generated: now.toISOString().slice(0, 10),
    pinnedRead: READ_DATE,
    compared: {
      acp: { pinned: pinned.acp.source.label, now: next.acp.source.label },
      ucp: { pinned: pinned.ucp.source.label, now: next.ucp.source.label, ref: next.ucp.source.ref },
      schemaorg: { pinned: pinned.schemaorg.source.label, now: next.schemaorg.source.label }
    },
    brokenPaths: broken,
    changes: {},
    uncovered: {}
  };
  for (const proto of ['acp', 'ucp']) {
    const before = flat(topLevel(pinned[proto], proto));
    const after = flat(topLevel(next[proto], proto));
    report.changes[proto] = diff(before, after);
    report.uncovered[proto] = after.filter((x) => !covered(crosswalk, proto, x));
  }
  report.changes.schemaorg = diff(schemaorgProps(pinned.schemaorg), schemaorgProps(next.schemaorg));
  report.changes.schemaorgEnums = {};
  for (const e of Object.keys(pinned.schemaorg.enums)) {
    const d = diff(pinned.schemaorg.enums[e], next.schemaorg.enums[e] || []);
    if (d.added.length || d.removed.length) report.changes.schemaorgEnums[e] = d;
  }
  report.ok = broken.length === 0;
  return report;
}

export function renderDrift(r) {
  const L = [];
  L.push(`drift report  ${r.generated}  (pinned snapshots read ${r.pinnedRead})`);
  L.push(`  ACP         ${r.compared.acp.pinned}  vs  ${r.compared.acp.now}`);
  L.push(`  UCP         ${r.compared.ucp.pinned}  vs  ${r.compared.ucp.now}`);
  L.push(`  schema.org  ${r.compared.schemaorg.pinned}  vs  ${r.compared.schemaorg.now}`);
  L.push('');
  L.push(r.brokenPaths.length ? `FAIL  ${r.brokenPaths.length} crosswalk path(s) no longer resolve` : 'OK    every crosswalk path still resolves in the newest sources');
  for (const b of r.brokenPaths) L.push(`        ${b.row}: ${b.protocol} ${b.path} (${b.reason})`);
  for (const proto of ['acp', 'ucp']) {
    const c = r.changes[proto];
    L.push(`${proto.toUpperCase()} fields added since the pinned version: ${c.added.length ? c.added.join(', ') : 'none'}`);
    if (c.removed.length) L.push(`${proto.toUpperCase()} fields removed: ${c.removed.join(', ')}`);
    if (r.uncovered[proto].length) L.push(`${proto.toUpperCase()} fields the crosswalk does not cover yet: ${r.uncovered[proto].join(', ')}`);
  }
  const s = r.changes.schemaorg;
  L.push(`schema.org properties added on the classes used: ${s.added.length}${s.added.length ? ' (' + s.added.slice(0, 8).join(', ') + (s.added.length > 8 ? ', ...' : '') + ')' : ''}; removed: ${s.removed.length}`);
  for (const [e, d] of Object.entries(r.changes.schemaorgEnums)) L.push(`schema.org ${e}: added ${d.added.join(', ') || 'none'}; removed ${d.removed.join(', ') || 'none'}`);
  return L.join('\n');
}
