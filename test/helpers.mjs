import { loadSnapshots, loadCrosswalk } from '../src/data.mjs';
import { setSnapshots } from '../src/convert.mjs';

export const snaps = loadSnapshots();
export const crosswalk = loadCrosswalk();
setSnapshots(snaps);

// Rebuild a schema.org JSON-LD file from a snapshot, so drift tests can run without the network.
export function synthJsonld(snap) {
  const graph = [];
  for (const [name, c] of Object.entries(snap.classes)) {
    graph.push({ '@id': 'schema:' + name, '@type': 'rdfs:Class', 'rdfs:subClassOf': c.parents.map((p) => ({ '@id': 'schema:' + p })) });
    for (const [prop, v] of Object.entries(c.props)) {
      let e = graph.find((g) => g['@id'] === 'schema:' + prop && g['@type'] === 'rdf:Property');
      if (!e) {
        e = { '@id': 'schema:' + prop, '@type': 'rdf:Property', 'schema:domainIncludes': [], 'schema:rangeIncludes': v.range.map((r) => ({ '@id': 'schema:' + r })) };
        graph.push(e);
      }
      e['schema:domainIncludes'].push({ '@id': 'schema:' + name });
    }
  }
  for (const [en, members] of Object.entries(snap.enums)) for (const m of members) graph.push({ '@id': 'schema:' + m, '@type': 'schema:' + en });
  return { '@graph': graph };
}

// A fetchText that serves the pinned snapshots back, with optional edits per source.
export function fakeFetch({ acp, ucp, schemaorg } = {}) {
  return async (url) => {
    if (url.includes('raw.githubusercontent.com/agentic-commerce-protocol')) return JSON.stringify((acp || ((x) => x))(structuredClone(snaps.acp.schema)));
    if (url.includes('raw.githubusercontent.com/Universal-Commerce-Protocol')) {
      const file = url.split('/source/schemas/')[1];
      const json = snaps.ucp.files[file];
      if (!json) throw new Error('404 ' + url);
      return JSON.stringify((ucp || ((f, x) => x))(file, structuredClone(json)));
    }
    if (url.includes('schema.org')) return JSON.stringify((schemaorg || ((x) => x))(synthJsonld(structuredClone(snaps.schemaorg))));
    throw new Error('unexpected url ' + url);
  };
}
