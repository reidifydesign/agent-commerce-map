// Build snapshots of the three sources. Everything here takes a fetchText function so tests run offline.
import { SOURCES, SCHEMAORG_CLASSES, SCHEMAORG_ENUMS, rawUrl } from './sources.mjs';

const posix = (p) => {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg !== '.' && seg !== '') out.push(seg);
  }
  return out.join('/');
};
const dirname = (p) => p.split('/').slice(0, -1).join('/');

export async function snapshotAcp(fetchText, which = 'pinned') {
  const s = SOURCES.acp[which];
  const ref = s.ref;
  const url = rawUrl(SOURCES.acp.repo, ref, s.file);
  const schema = JSON.parse(await fetchText(url));
  return { source: { repo: SOURCES.acp.repo, ref, file: s.file, label: s.label, url }, schema };
}

// Follows relative $ref files from the root files, so new referenced types are picked up by themselves.
export async function snapshotUcp(fetchText, which = 'pinned') {
  const s = SOURCES.ucp[which];
  const ref = s.ref;
  const files = {};
  const missing = [];
  const queue = [...s.files];
  while (queue.length) {
    const f = queue.shift();
    if (files[f] || missing.includes(f)) continue;
    let text;
    try {
      text = await fetchText(rawUrl(SOURCES.ucp.repo, ref, s.root + f));
    } catch (e) {
      missing.push(f);
      continue;
    }
    const json = JSON.parse(text);
    files[f] = json;
    const refs = [];
    JSON.stringify(json, (k, v) => { if (k === '$ref' && typeof v === 'string' && !v.startsWith('#') && !v.startsWith('http')) refs.push(v); return v; });
    for (const r of refs) queue.push(posix(dirname(f) + '/' + r.split('#')[0]));
  }
  return { source: { repo: SOURCES.ucp.repo, ref, tag: s.tag || null, label: s.label, root: s.root }, files, missing };
}

const asArr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const idOf = (x) => (typeof x === 'string' ? x : x && x['@id']);
const strip = (id) => (id || '').replace(/^schema:/, '');
const typesOf = (e) => asArr(e['@type']);

export function buildSchemaorgTerms(jsonld) {
  const graph = jsonld['@graph'];
  const byId = new Map(graph.map((e) => [e['@id'], e]));
  const keep = new Set(SCHEMAORG_CLASSES);
  const classes = {};
  for (const name of SCHEMAORG_CLASSES) {
    const e = byId.get('schema:' + name);
    classes[name] = { found: !!e, parents: e ? asArr(e['rdfs:subClassOf']).map(idOf).filter((i) => i && i.startsWith('schema:')).map(strip) : [], props: {} };
  }
  for (const e of graph) {
    if (!typesOf(e).includes('rdf:Property')) continue;
    const domains = asArr(e['schema:domainIncludes']).map(idOf).map(strip);
    const ranges = asArr(e['schema:rangeIncludes']).map(idOf).map(strip);
    for (const d of domains) if (keep.has(d)) classes[d].props[strip(e['@id'])] = { range: ranges };
  }
  const enums = {};
  for (const en of SCHEMAORG_ENUMS) {
    enums[en] = graph.filter((e) => typesOf(e).includes('schema:' + en)).map((e) => strip(e['@id'])).sort();
  }
  return { classes, enums };
}

export async function snapshotSchemaorg(fetchText, which = 'pinned') {
  const s = SOURCES.schemaorg[which];
  const jsonld = JSON.parse(await fetchText(s.url));
  return { source: { url: s.url, label: s.label, ref: s.ref || null }, ...buildSchemaorgTerms(jsonld) };
}

export async function snapshotAll(fetchText, which = 'pinned') {
  return {
    acp: await snapshotAcp(fetchText, which),
    ucp: await snapshotUcp(fetchText, which),
    schemaorg: await snapshotSchemaorg(fetchText, which)
  };
}

export async function httpText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'agent-commerce-map/0.1 (+https://github.com/reidifydesign/agent-commerce-map)' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
