import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { snaps, crosswalk } from './helpers.mjs';
import { analyse } from '../src/cli.mjs';
import { toMinorUnits, minorExponent, AVAILABILITY_MAP, UNMAPPED_AVAILABILITY, CONDITION_MAP } from '../src/convert.mjs';

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const run = (doc) => analyse(typeof doc === 'string' ? doc : JSON.stringify(doc), snaps, crosswalk).results;

test('minor units follow the currency exponent', () => {
  assert.equal(minorExponent('USD'), 2);
  assert.equal(minorExponent('JPY'), 0);
  assert.equal(minorExponent('KWD'), 3);
  assert.equal(toMinorUnits('19.99', 'USD').value, 1999);
  assert.equal(toMinorUnits(19.99, 'USD').value, 1999);
  assert.equal(toMinorUnits('500', 'JPY').value, 500);
  assert.equal(toMinorUnits('1.250', 'KWD').value, 1250);
  assert.equal(toMinorUnits('10', 'EUR').value, 1000);
  assert.equal(toMinorUnits('10.50', 'JPY').error === undefined, false);
  assert.equal(toMinorUnits('10.00', 'JPY').value, 10);
});

test('prices that are not plain decimals are refused, not guessed', () => {
  assert.match(toMinorUnits('1,299.00', 'USD').error, /plain decimal/);
  assert.match(toMinorUnits('$19.99', 'USD').error, /plain decimal/);
  assert.match(toMinorUnits('19.999', 'USD').error, /more decimals/);
  assert.match(toMinorUnits('19.99', 'usd').error, /ISO 4217/);
  assert.match(toMinorUnits('19.99', 'ZZZ').error, /not a known/);
  assert.match(toMinorUnits('19.99', undefined).error, /currency/);
  assert.match(toMinorUnits(undefined, 'USD').error, /no price/);
});

test('every availability and condition value the converter maps is a real schema.org value', () => {
  const av = snaps.schemaorg.enums.ItemAvailability;
  for (const k of [...Object.keys(AVAILABILITY_MAP), ...UNMAPPED_AVAILABILITY]) assert.ok(av.includes(k), k);
  // every ItemAvailability value is either mapped or listed as having no equivalent
  for (const k of av) assert.ok(k in AVAILABILITY_MAP || UNMAPPED_AVAILABILITY.includes(k), `${k} is neither mapped nor listed as unmapped`);
  for (const k of Object.keys(CONDITION_MAP)) assert.ok(snaps.schemaorg.enums.OfferItemCondition.includes(k), k);
});

test('the converter emits only ACP status values the ACP schema names', () => {
  const desc = snaps.acp.schema.$defs.Availability.properties.status.description;
  for (const a of Object.values(AVAILABILITY_MAP)) assert.ok(desc.includes(a.status), a.status);
});

test('a real product page (ScrapeMe, read 2026-09-30) converts to valid ACP and UCP', () => {
  const [r] = run(fx('scrapeme-bulbasaur.json'));
  assert.equal(r.acp.ready, true, r.acp.errors.join('; '));
  assert.equal(r.ucp.ready, true, r.ucp.errors.join('; '));
  const v = r.acp.product.variants[0];
  assert.deepEqual(v.price, { amount: 6300, currency: 'GBP' });
  assert.deepEqual(v.availability, { status: 'in_stock', available: true });
  assert.equal(v.id, '4391');
  assert.equal(r.ucp.product.price_range.min.amount, 6300);
});

test('a ProductGroup becomes one product with options, list price, GTIN and a price range', () => {
  const [r] = run(fx('variant-group.json'));
  assert.equal(r.model.variants.length, 3);
  assert.equal(r.acp.ready, true, r.acp.errors.join('; '));
  assert.equal(r.ucp.ready, true, r.ucp.errors.join('; '));
  const [white, whiteL, blue] = r.acp.product.variants;
  assert.deepEqual(white.barcodes, [{ type: 'GTIN', value: '4006381333931' }]);
  assert.deepEqual(white.list_price, { amount: 11000, currency: 'USD' });
  assert.deepEqual(white.condition, ['new']);
  assert.deepEqual(white.variant_options, [{ name: 'Color', value: 'White' }, { name: 'Size', value: 'M' }]);
  assert.equal(whiteL.title, 'Linen shirt - White - L', 'a missing variant name is built from the group name and options');
  assert.equal(whiteL.price.amount, 8950, 'a numeric 89.5 becomes 8950');
  assert.deepEqual(blue.availability, { status: 'out_of_stock', available: false });
  assert.equal(r.acp.product.id, 'LINEN-SHIRT');
  assert.ok(r.acp.product.media[1].width === 1200 && r.acp.product.media[1].height === 1600);
  const u = r.ucp.product;
  assert.deepEqual(u.price_range, { min: { amount: 8950, currency: 'USD' }, max: { amount: 9400, currency: 'USD' } });
  assert.deepEqual(u.options, [
    { name: 'Color', values: [{ label: 'White' }, { label: 'Blue' }] },
    { name: 'Size', values: [{ label: 'M' }, { label: 'L' }] }
  ]);
  assert.deepEqual(u.rating, { value: 4.6, scale_max: 5, scale_min: 1, count: 87 });
  assert.deepEqual(u.tags, ['linen', 'shirt', 'summer']);
  assert.equal(u.variants[1].availability.status, 'in_stock', 'LimitedAvailability has no UCP status, so it becomes in_stock');
  assert.equal(r.acp.product.variants[1].availability.status, 'limited_stock');
  assert.ok(u.variants.every((v) => v.description && v.description.plain), 'UCP requires a description on every variant');
});

test('brand, country of origin and shipping are reported as having no home, and never emitted', () => {
  const [r] = run(fx('variant-group.json'));
  const homeless = r.coverage.filter((c) => !c.acp && !c.ucp).map((c) => c.row);
  for (const k of ['brand', 'origin', 'shipping']) assert.ok(homeless.includes(k), k);
  assert.ok(!JSON.stringify(r.acp.product).includes('"brand"'));
  assert.ok(!JSON.stringify(r.ucp.product).includes('India'));
  assert.deepEqual(r.acp.errors, [], 'an extra field would be rejected by the ACP schema');
});

test('missing data is reported as missing, never invented', () => {
  const [r] = run({ '@type': 'Product', name: 'Bare product' });
  assert.equal(r.acp.ready, false);
  assert.equal(r.ucp.ready, false);
  assert.ok(r.acp.issues.some((i) => i.level === 'missing' && /no variant id/.test(i.msg)));
  assert.ok(r.acp.issues.some((i) => i.level === 'missing' && /no offers/.test(i.msg)));
  assert.ok(r.ucp.issues.some((i) => /no description/.test(i.msg)));
  assert.equal(r.acp.product.id, undefined);
});

test('a price with a thousands separator makes the product not ready and says why', () => {
  const [r] = run({ '@type': 'Product', '@id': '#p', sku: 'X', name: 'X', offers: { '@type': 'Offer', price: '1,299.00', priceCurrency: 'USD' } });
  assert.equal(r.acp.ready, false);
  assert.ok(r.acp.issues.some((i) => /plain decimal/.test(i.msg)));
});

test('an availability with no equivalent is left out with a warning', () => {
  const [r] = run({ '@type': 'Product', '@id': '#p', sku: 'X', name: 'X', offers: { '@type': 'Offer', price: '5', priceCurrency: 'USD', availability: 'https://schema.org/InStoreOnly' } });
  assert.equal(r.acp.product.variants[0].availability, undefined);
  assert.ok(r.acp.issues.some((i) => i.level === 'warn' && /InStoreOnly/.test(i.msg)));
  assert.equal(r.acp.ready, true);
});

test('BackOrder and PreOrder leave "available" unset', () => {
  const [r] = run({ '@type': 'Product', '@id': '#p', sku: 'X', name: 'X', offers: { '@type': 'Offer', price: '5', priceCurrency: 'USD', availability: 'https://schema.org/PreOrder' } });
  assert.deepEqual(r.acp.product.variants[0].availability, { status: 'preorder' });
});

test('prices in different currencies across variants block the UCP price range', () => {
  const [r] = run({
    '@type': 'ProductGroup', productGroupID: 'G', name: 'G', description: 'd', variesBy: ['size'],
    hasVariant: [
      { '@type': 'Product', sku: 'A', size: 'S', offers: { '@type': 'Offer', price: '5', priceCurrency: 'USD' } },
      { '@type': 'Product', sku: 'B', size: 'L', offers: { '@type': 'Offer', price: '5', priceCurrency: 'EUR' } }
    ]
  });
  assert.equal(r.ucp.ready, false);
  assert.ok(r.ucp.issues.some((i) => /different currencies/.test(i.msg)));
});

test('several offers on one product: the first is used and the rest are flagged', () => {
  const [r] = run({
    '@type': 'Product', '@id': '#p', sku: 'X', name: 'X',
    offers: [{ '@type': 'Offer', price: '5', priceCurrency: 'USD' }, { '@type': 'Offer', price: '6', priceCurrency: 'USD' }]
  });
  assert.equal(r.acp.product.variants[0].price.amount, 500);
  assert.ok(r.acp.issues.some((i) => /2 offers/.test(i.msg)));
});

test('a ProductGroup with no variants is flagged', () => {
  const [r] = run({ '@type': 'ProductGroup', productGroupID: 'G', name: 'G' });
  assert.ok(r.acp.issues.some((i) => /no hasVariant/.test(i.msg)));
  assert.equal(r.acp.ready, false);
});
