import test from 'node:test';
import assert from 'node:assert/strict';
import { snaps, crosswalk, fakeFetch, synthJsonld } from './helpers.mjs';
import { runDrift, renderDrift } from '../src/drift.mjs';
import { buildSchemaorgTerms } from '../src/snapshot.mjs';
import { SOURCES } from '../src/sources.mjs';

const run = (opts) => runDrift({ fetchText: fakeFetch(opts), pinned: snaps, crosswalk, now: new Date('2026-12-01T00:00:00Z') });

test('the snapshots record the versions pinned in src/sources.mjs', () => {
  assert.equal(snaps.acp.source.ref, SOURCES.acp.pinned.ref);
  assert.equal(snaps.ucp.source.ref, SOURCES.ucp.pinned.ref);
  assert.equal(snaps.schemaorg.source.ref, SOURCES.schemaorg.pinned.ref);
  assert.equal(snaps.ucp.missing.length, 0);
});

test('schema.org terms survive a round trip through a JSON-LD file', () => {
  const again = buildSchemaorgTerms(synthJsonld(snaps.schemaorg));
  assert.deepEqual(again.enums, snaps.schemaorg.enums);
  assert.deepEqual(Object.keys(again.classes.Offer.props).sort(), Object.keys(snaps.schemaorg.classes.Offer.props).sort());
});

test('no change in the sources means no drift and no broken paths', async () => {
  const r = await run();
  assert.equal(r.ok, true);
  assert.deepEqual(r.brokenPaths, []);
  assert.deepEqual(r.changes.acp, { added: [], removed: [] });
  assert.deepEqual(r.changes.ucp, { added: [], removed: [] });
  assert.deepEqual(r.changes.schemaorg, { added: [], removed: [] });
});

test('a field removed from the ACP schema breaks the crosswalk and fails the run', async () => {
  const r = await run({ acp: (s) => { delete s.$defs.Variant.properties.condition; return s; } });
  assert.equal(r.ok, false);
  assert.ok(r.brokenPaths.some((b) => b.protocol === 'acp' && b.path === 'Variant.condition'));
  assert.deepEqual(r.changes.acp.removed, ['Variant.condition']);
  assert.match(renderDrift(r), /FAIL {2}1 crosswalk path/);
});

test('a field added to UCP is reported as new and not covered yet', async () => {
  const r = await run({ ucp: (file, j) => { if (file === 'shopping/types/variant.json') j.properties.brand = { type: 'string' }; return j; } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.changes.ucp.added, ['Variant.brand']);
  assert.ok(r.uncovered.ucp.includes('Variant.brand'));
  assert.match(renderDrift(r), /UCP fields added since the pinned version: Variant.brand/);
});

test('a schema.org property and enum value added or removed are reported', async () => {
  const r = await run({
    schemaorg: (j) => {
      j['@graph'].push({ '@id': 'schema:newThing', '@type': 'rdf:Property', 'schema:domainIncludes': [{ '@id': 'schema:Offer' }], 'schema:rangeIncludes': [{ '@id': 'schema:Text' }] });
      j['@graph'].push({ '@id': 'schema:Layaway', '@type': 'schema:ItemAvailability' });
      j['@graph'] = j['@graph'].filter((e) => e['@id'] !== 'schema:InStoreOnly');
      return j;
    }
  });
  assert.deepEqual(r.changes.schemaorg.added, ['Offer.newThing']);
  assert.deepEqual(r.changes.schemaorgEnums.ItemAvailability, { added: ['Layaway'], removed: ['InStoreOnly'] });
});

test('fields the crosswalk leaves out are listed as uncovered', async () => {
  const thin = structuredClone(crosswalk);
  thin.rows = thin.rows.filter((row) => row.id !== 'condition');
  const r = await runDrift({ fetchText: fakeFetch(), pinned: snaps, crosswalk: thin });
  assert.ok(r.uncovered.acp.includes('Variant.condition'));
});
