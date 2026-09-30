import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractJsonLd, findProducts, typeNames } from '../src/jsonld.mjs';

const fx = (n) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('reads JSON-LD script tags out of an HTML page, and reports a broken block', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Product","name":"A"}</script>
    <script type='application/ld+json'>{ not json }</script>
    <script type="text/javascript">var x = 1;</script>
    <script type="application/ld+json"><!-- {"@type":"Product","name":"B"} --></script>
  </head></html>`;
  const { nodes, errors } = extractJsonLd(html);
  assert.deepEqual(nodes.map((n) => n.name), ['A', 'B']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /block 2/);
});

test('says so when a page has no JSON-LD (microdata is not read)', () => {
  const { nodes, errors } = extractJsonLd('<html><div itemscope itemtype="https://schema.org/Product"></div></html>');
  assert.equal(nodes.length, 0);
  assert.match(errors[0], /microdata/);
});

test('accepts a raw JSON file with a byte order mark', () => {
  const { nodes, errors } = extractJsonLd('﻿{"@type":"Product","name":"A"}');
  assert.equal(nodes.length, 1);
  assert.equal(errors.length, 0);
});

test('typeNames strips schema.org prefixes', () => {
  assert.deepEqual(typeNames({ '@type': ['https://schema.org/Product', 'schema:ProductGroup', 'Thing'] }), ['Product', 'ProductGroup', 'Thing']);
});

test('finds the product in a @graph and ignores the breadcrumb', () => {
  const { nodes } = extractJsonLd(fx('scrapeme-bulbasaur.json'));
  const { products } = findProducts(nodes);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Bulbasaur');
});

test('variants of a ProductGroup are not reported as separate products', () => {
  const { nodes } = extractJsonLd(fx('variant-group.json'));
  const { products } = findProducts(nodes);
  assert.equal(products.length, 1);
  assert.deepEqual(typeNames(products[0]), ['ProductGroup']);
});

test('variants linked by isVariantOf and @id are attached to their group', () => {
  const doc = {
    '@graph': [
      { '@type': 'ProductGroup', '@id': '#g', productGroupID: 'G', name: 'Group' },
      { '@type': 'Product', sku: 'A', isVariantOf: { '@id': '#g' } },
      { '@type': 'Product', sku: 'B', inProductGroupWithID: 'G' },
      { '@type': 'Product', sku: 'C', name: 'Standalone' }
    ]
  };
  const { products } = findProducts(doc);
  assert.deepEqual(products.map((p) => p.sku || p.productGroupID), ['G', 'C']);
});
