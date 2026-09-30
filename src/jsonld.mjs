// Read schema.org Product data out of JSON-LD (a .json file or the script tags of an HTML page).
const asArr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

export function extractJsonLd(text) {
  const t = text.replace(/^﻿/, '').trim();
  const nodes = [];
  const errors = [];
  const push = (raw, label) => {
    const cleaned = raw.replace(/^\s*<!--/, '').replace(/-->\s*$/, '').replace(/^\s*\/\/\s*<!\[CDATA\[/, '').replace(/\/\/\s*\]\]>\s*$/, '').trim();
    if (!cleaned) return;
    try {
      nodes.push(JSON.parse(cleaned));
    } catch (e) {
      errors.push(`${label}: not valid JSON (${e.message})`);
    }
  };
  if (t.startsWith('{') || t.startsWith('[')) {
    push(t, 'input');
  } else {
    const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    let i = 0;
    while ((m = re.exec(t))) push(m[1], `JSON-LD block ${++i}`);
    if (i === 0) errors.push('no application/ld+json blocks found (microdata and RDFa are not read)');
  }
  return { nodes, errors };
}

export const typeNames = (node) => asArr(node && node['@type']).map((t) => String(t).replace(/^https?:\/\/schema\.org\//, '').replace(/^schema:/, ''));

// Expand arrays and @graph into a flat list, and index everything that has an @id.
export function flatten(docs) {
  const all = [];
  const visit = (d) => {
    for (const n of asArr(d)) {
      if (!n || typeof n !== 'object') continue;
      if (n['@graph']) visit(n['@graph']);
      else all.push(n);
    }
  };
  visit(docs);
  const index = new Map();
  for (const n of all) if (n['@id']) index.set(n['@id'], n);
  return { all, index };
}

const PRODUCT_TYPES = ['Product', 'ProductGroup', 'IndividualProduct', 'SomeProducts', 'ProductModel'];
export const isProduct = (n) => typeNames(n).some((t) => PRODUCT_TYPES.includes(t));

export function resolveRef(v, index) {
  if (v && typeof v === 'object' && v['@id'] && Object.keys(v).every((k) => k === '@id') && index.has(v['@id'])) return index.get(v['@id']);
  return v;
}

// Top-level products: skip any product that belongs to a ProductGroup found in the same document.
export function findProducts(docs) {
  const { all, index } = flatten(docs);
  const groups = all.filter((n) => typeNames(n).includes('ProductGroup'));
  const memberIds = new Set();
  const memberNodes = new Set();
  for (const g of groups) {
    for (const v of asArr(g.hasVariant)) {
      const r = resolveRef(v, index);
      if (r && r['@id']) memberIds.add(r['@id']);
      if (r && typeof r === 'object') memberNodes.add(r);
    }
  }
  const products = all.filter((n) => isProduct(n) && !memberNodes.has(n) && !(n['@id'] && memberIds.has(n['@id'])) && !groups.some((g) => n !== g && isVariantOfGroup(n, g, index)));
  return { products, index, all };
}

export function isVariantOfGroup(n, g, index) {
  const of = resolveRef(n.isVariantOf, index);
  if (of && typeof of === 'object' && (of === g || (of['@id'] && of['@id'] === g['@id']))) return true;
  if (n.inProductGroupWithID && g.productGroupID && String(n.inProductGroupWithID) === String(g.productGroupID)) return true;
  return false;
}
