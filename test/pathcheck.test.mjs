import test from 'node:test';
import assert from 'node:assert/strict';
import { snaps } from './helpers.mjs';
import { makeResolvers } from '../src/pathcheck.mjs';

const r = makeResolvers(snaps);

test('ACP: nested paths, arrays and required flags', () => {
  const p = r.acp('Variant.price.amount');
  assert.equal(p.found, true);
  assert.equal(p.type, 'integer');
  assert.equal(p.required, true);
  assert.equal(r.acp('Variant.barcodes[].value').found, true);
  assert.equal(r.acp('Variant.list_price.amount').required, true);
  assert.equal(r.acp('Product.title').required, false);
  assert.equal(r.acp('Variant.brand').found, false);
  assert.equal(r.acp('Nope.id').found, false);
});

test('UCP: follows $ref across files and allOf', () => {
  assert.equal(r.ucp('Variant.unit_price.measure.scale').found, true);
  assert.equal(r.ucp('Product.price_range.max.currency').found, true);
  assert.equal(r.ucp('Variant.options[].label').required, true);
  assert.equal(r.ucp('Variant.condition').found, false);
});

test('schema.org: properties inherited from parents resolve, others do not', () => {
  assert.equal(r.schemaorg('Product.name').owner, 'Thing');
  assert.equal(r.schemaorg('ProductGroup.sku').owner, 'Product');
  assert.equal(r.schemaorg('Offer.price').found, true);
  assert.equal(r.schemaorg('Offer.gtin13').found, true);
  assert.equal(r.schemaorg('Offer.color').found, false);
  assert.equal(r.schemaorg('Nothing.name').found, false);
});

test('schema.org enumerations used by the converter exist', () => {
  assert.ok(snaps.schemaorg.enums.ItemAvailability.includes('InStock'));
  assert.ok(snaps.schemaorg.enums.PriceTypeEnumeration.includes('ListPrice'));
  assert.equal(snaps.schemaorg.enums.ItemAvailability.length, 12);
});
