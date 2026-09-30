import test from 'node:test';
import assert from 'node:assert/strict';
import { snaps, crosswalk } from './helpers.mjs';
import { verifyCrosswalk, rowStatus, summarise } from '../src/crosswalk.mjs';

test('every path in the crosswalk resolves in its pinned snapshot', () => {
  assert.deepEqual(verifyCrosswalk(crosswalk, snaps), []);
});

test('verifyCrosswalk reports a path that does not exist', () => {
  const bad = structuredClone(crosswalk);
  bad.rows[0].acp = [{ path: 'Variant.no_such_field' }];
  const broken = verifyCrosswalk(bad, snaps);
  assert.equal(broken.length, 1);
  assert.equal(broken[0].protocol, 'acp');
});

test('row ids are unique and every row names a known group', () => {
  const ids = crosswalk.rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of crosswalk.rows) assert.ok(crosswalk.meta.groups[r.group], r.id);
});

test('every row says something in schema.org or in a protocol', () => {
  for (const r of crosswalk.rows) assert.ok(r.acp || r.ucp || r.schemaorg, r.id);
});

test('a row with a missing protocol column explains the gap', () => {
  for (const r of crosswalk.rows) if (!r.acp || !r.ucp) assert.ok(r.gap, `${r.id} has a missing protocol column and no gap text`);
});

test('the summary counts add up', () => {
  const s = summarise(crosswalk);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), crosswalk.rows.length);
  assert.ok(s['both protocols'] > 0 && s['UCP only'] > 0 && s['ACP only'] > 0 && s['neither protocol'] > 0);
});

test('rowStatus names the protocols that carry a field', () => {
  assert.equal(rowStatus({ acp: [1], ucp: [1] }), 'both protocols');
  assert.equal(rowStatus({ acp: [1], ucp: null }), 'ACP only');
  assert.equal(rowStatus({ acp: null, ucp: [1] }), 'UCP only');
  assert.equal(rowStatus({ acp: null, ucp: null, schemaorg: [1] }), 'neither protocol');
});

// Facts the prose relies on, read from the snapshots rather than typed in.
const acpDefs = snaps.acp.schema.$defs;
const ucpVariant = snaps.ucp.files['shopping/types/variant.json'];
const ucpProduct = snaps.ucp.files['shopping/types/product.json'];

test('ACP availability knows limited_stock, UCP availability does not list it', () => {
  assert.match(acpDefs.Availability.properties.status.description, /limited_stock/);
  assert.doesNotMatch(snaps.ucp.files['shopping/types/availability.json'].properties.status.description, /limited_stock/);
});

test('ACP objects reject unknown fields, which is why brand cannot ride along', () => {
  for (const name of ['Product', 'Variant', 'Price']) assert.equal(acpDefs[name].additionalProperties, false, name);
});

test('the "neither protocol" rows really have no field of that name in either catalog object', () => {
  const names = new Set([
    ...Object.keys(acpDefs.Product.properties), ...Object.keys(acpDefs.Variant.properties),
    ...Object.keys(ucpProduct.properties), ...Object.keys(ucpVariant.properties)
  ].map((n) => n.toLowerCase()));
  for (const r of crosswalk.rows.filter((r) => !r.acp && !r.ucp)) {
    for (const p of r.schemaorg) {
      const prop = p.path.split('.')[1].toLowerCase();
      assert.ok(!names.has(prop), `${r.id}: ${prop} exists in a protocol object`);
    }
  }
});

test('UCP requires a price range and a description on the product, ACP does not', () => {
  assert.ok(ucpProduct.required.includes('price_range'));
  assert.ok(ucpProduct.required.includes('description'));
  assert.ok(!acpDefs.Product.required.includes('description'));
});

test('ACP has no sku, handle, tags, metadata or rating on the variant, UCP has them', () => {
  for (const k of ['sku', 'handle', 'tags', 'metadata', 'rating']) {
    assert.ok(!(k in acpDefs.Variant.properties), `ACP Variant.${k}`);
    assert.ok(k in ucpVariant.properties, `UCP Variant.${k}`);
  }
});

test('UCP has no condition field, ACP does', () => {
  assert.ok('condition' in acpDefs.Variant.properties);
  assert.ok(!('condition' in ucpVariant.properties));
});

test('media kind spellings differ: ACP model, UCP model_3d', () => {
  assert.match(acpDefs.Media.properties.type.description, /\bmodel\b/);
  assert.match(snaps.ucp.files['common/types/media.json'].properties.type.description, /model_3d/);
});
