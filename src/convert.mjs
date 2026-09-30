// Turn schema.org Product JSON-LD into ACP feed Product objects and UCP catalog Product objects,
// then check the result against the pinned schemas. Nothing is invented: a value that is not in
// the markup is left out and reported.
import { typeNames, resolveRef, isVariantOfGroup } from './jsonld.mjs';
import { acpValidator, ucpValidator } from './validate.mjs';

const asArr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const tail = (s) => String(s).replace(/^.*[/#:]/, '');

// ---------- small value readers ----------
export function text(v) {
  if (v == null) return undefined;
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['@value'] ?? v.name ?? v['@id']);
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

export function minorExponent(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return null;
  }
}

let knownCurrencies;
export function isKnownCurrency(code) {
  if (!knownCurrencies) knownCurrencies = new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : []);
  return knownCurrencies.size === 0 ? /^[A-Z]{3}$/.test(code) : knownCurrencies.has(code);
}

// "19.99" + USD -> 1999. Returns { value } or { error }.
export function toMinorUnits(price, currency) {
  if (price == null || price === '') return { error: 'no price' };
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return { error: 'no valid ISO 4217 currency code (three capital letters)' };
  if (!isKnownCurrency(currency)) return { error: `${currency} is not a known ISO 4217 currency` };
  const s = typeof price === 'number' ? String(price) : String(price).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: `price "${s}" is not a plain decimal number (no thousands separators or symbols)` };
  const exp = minorExponent(currency);
  const [whole, frac = ''] = s.split('.');
  const extra = frac.slice(exp);
  if (/[1-9]/.test(extra)) return { error: `price ${s} has more decimals than ${currency} allows (${exp})` };
  const digits = whole + frac.slice(0, exp).padEnd(exp, '0');
  const n = Number(digits);
  if (!Number.isSafeInteger(n)) return { error: `price ${s} is too large` };
  return { value: n, exponent: exp };
}

const AVAILABILITY = {
  InStock: { status: 'in_stock', available: true },
  LimitedAvailability: { status: 'limited_stock', available: true },
  BackOrder: { status: 'backorder' },
  PreOrder: { status: 'preorder' },
  PreSale: { status: 'preorder' },
  OutOfStock: { status: 'out_of_stock', available: false },
  SoldOut: { status: 'out_of_stock', available: false },
  Discontinued: { status: 'discontinued', available: false }
};
export const UNMAPPED_AVAILABILITY = ['InStoreOnly', 'OnlineOnly', 'MadeToOrder', 'Reserved'];
const CONDITION = { NewCondition: 'new', UsedCondition: 'secondhand', RefurbishedCondition: 'refurbished', DamagedCondition: 'damaged' };
export const AVAILABILITY_MAP = AVAILABILITY;
export const CONDITION_MAP = CONDITION;

const LIST_PRICE_TYPES = ['ListPrice', 'MSRP', 'StrikethroughPrice'];
const GTIN_PROPS = ['gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14'];
const OPTION_PROPS = ['color', 'size', 'material', 'pattern'];

// ---------- the intermediate model ----------
function readImages(v, index) {
  const out = [];
  for (const raw of asArr(v)) {
    const i = resolveRef(raw, index);
    if (typeof i === 'string') out.push({ url: i });
    else if (i && typeof i === 'object') {
      const url = text(i.contentUrl) || text(i.url);
      if (!url) continue;
      const num = (x) => {
        const n = Number(text(x && x.value != null ? x.value : x));
        return Number.isInteger(n) && n >= 1 ? n : undefined;
      };
      out.push({ url, width: num(i.width), height: num(i.height) });
    }
  }
  return out;
}

function readOffer(v, index) {
  const offers = asArr(v.offers).map((o) => resolveRef(o, index)).filter((o) => o && typeof o === 'object');
  if (offers.length === 0) return { offer: null, count: 0 };
  const offer = offers[0];
  const specs = asArr(offer.priceSpecification).map((s) => resolveRef(s, index)).filter(Boolean);
  const isList = (s) => asArr(s.priceType).some((t) => LIST_PRICE_TYPES.includes(tail(t)));
  const selling = specs.find((s) => !isList(s) && s.price != null);
  const listing = specs.find((s) => isList(s) && s.price != null);
  const price = offer.price != null ? offer.price : selling && selling.price;
  const currency = text(offer.priceCurrency) || (selling && text(selling.priceCurrency)) || (listing && text(listing.priceCurrency));
  const seller = resolveRef(offer.seller, index);
  return {
    count: offers.length,
    types: typeNames(offer),
    raw: offer,
    offer: {
      price,
      currency,
      listPrice: listing ? listing.price : undefined,
      listCurrency: listing ? text(listing.priceCurrency) || currency : undefined,
      availability: offer.availability ? tail(text(offer.availability)) : undefined,
      condition: offer.itemCondition ? tail(text(offer.itemCondition)) : undefined,
      seller: seller ? text(typeof seller === 'string' ? seller : seller.name) : undefined,
      url: text(offer.url),
      low: offer.lowPrice,
      high: offer.highPrice
    }
  };
}

function readOptionsFor(v, names) {
  const out = [];
  for (const name of names) {
    let value = text(v[name]);
    if (value === undefined) {
      const pv = asArr(v.additionalProperty).find((p) => p && text(p.name) && text(p.name).toLowerCase() === name.toLowerCase());
      if (pv) value = text(pv.value);
    }
    if (value !== undefined) out.push({ name: name.charAt(0).toUpperCase() + name.slice(1), value });
  }
  return out;
}

export function buildModel(node, { index, all }) {
  const issues = [];
  const isGroup = typeNames(node).includes('ProductGroup');
  let variantNodes;
  if (isGroup) {
    variantNodes = asArr(node.hasVariant).map((v) => resolveRef(v, index)).filter((v) => v && typeof v === 'object');
    for (const n of all) if (n !== node && typeNames(n).length && isVariantOfGroup(n, node, index) && !variantNodes.includes(n)) variantNodes.push(n);
    if (variantNodes.length === 0) issues.push({ level: 'missing', where: 'product', msg: 'ProductGroup has no hasVariant products, so there is nothing to sell' });
  } else {
    variantNodes = [node];
  }
  const varies = asArr(node.variesBy).map((x) => tail(text(x) || '')).filter(Boolean);
  const optionNames = varies.length ? varies : isGroup && variantNodes.length > 1 ? OPTION_PROPS : [];
  if (isGroup && variantNodes.length > 1 && varies.length === 0) issues.push({ level: 'info', where: 'product', msg: 'no variesBy on the ProductGroup, so options were read from color, size, material and pattern where present' });

  const groupImages = readImages(node.image, index);
  const model = {
    kind: isGroup ? 'ProductGroup' : typeNames(node)[0] || 'Product',
    id: text(node.productGroupID) || text(node['@id']) || text(node.productID) || (!isGroup ? text(node.sku) : undefined),
    name: text(node.name),
    description: text(node.description),
    url: text(node.url),
    images: groupImages,
    category: asArr(node.category).map((c) => text(c)).filter(Boolean),
    keywords: asArr(node.keywords).flatMap((k) => (text(k) || '').split(',')).map((s) => s.trim()).filter(Boolean),
    rating: null,
    variants: [],
    issues,
    present: new Set()
  };
  const rating = resolveRef(node.aggregateRating, index);
  if (rating && typeof rating === 'object') {
    const num = (x) => (x == null || x === '' ? undefined : Number(x));
    model.rating = { value: num(rating.ratingValue), max: num(rating.bestRating), min: num(rating.worstRating), count: num(rating.ratingCount ?? rating.reviewCount) };
  }
  const note = (n) => { for (const k of Object.keys(n)) if (!k.startsWith('@')) model.present.add(k); };
  note(node);

  for (const vn of variantNodes) {
    note(vn);
    const ro = readOffer(vn, index);
    if (ro.raw) for (const k of Object.keys(ro.raw)) if (!k.startsWith('@')) model.present.add('offer.' + k);
    if (ro.count > 1) issues.push({ level: 'warn', where: text(vn.sku) || text(vn.name) || 'variant', msg: `${ro.count} offers on one product, only the first was used` });
    const own = readImages(vn.image, index);
    const opts = readOptionsFor(vn, optionNames);
    const gtins = [];
    for (const p of GTIN_PROPS) {
      const val = text(vn[p]);
      if (val && !gtins.some((g) => g.value === val)) gtins.push({ prop: p, value: val });
    }
    const name = text(vn.name);
    model.variants.push({
      id: text(vn.sku) || text(vn.productID) || text(vn['@id']),
      sku: text(vn.sku),
      name: name || (isGroup && model.name ? [model.name, ...opts.map((o) => o.value)].join(' - ') : undefined),
      nameDerived: !name && isGroup,
      description: text(vn.description),
      url: text(vn.url) || (ro.offer && ro.offer.url),
      images: own,
      options: opts,
      gtins,
      offer: ro.offer,
      offerTypes: ro.types || [],
      category: asArr(vn.category).map((c) => text(c)).filter(Boolean)
    });
  }
  if (!model.description) model.description = model.variants.map((v) => v.description).find(Boolean);
  return model;
}

// ---------- shared pieces ----------
function priceObject(price, currency, where, issues, label) {
  const r = toMinorUnits(price, currency);
  if (r.error) {
    issues.push({ level: 'missing', where, msg: `${label}: ${r.error}` });
    return undefined;
  }
  return { amount: r.value, currency };
}

function mediaList(images) {
  return images.map((i) => {
    const m = { type: 'image', url: i.url };
    if (i.width) m.width = i.width;
    if (i.height) m.height = i.height;
    return m;
  });
}

function availabilityFor(offer, where, issues, protocol) {
  if (!offer || !offer.availability) return undefined;
  const a = AVAILABILITY[offer.availability];
  if (!a) {
    issues.push({ level: 'warn', where, msg: UNMAPPED_AVAILABILITY.includes(offer.availability) ? `availability ${offer.availability} has no equivalent in ${protocol}, so it was left out` : `availability ${offer.availability} is not a schema.org ItemAvailability value, so it was left out` });
    return undefined;
  }
  const out = { status: a.status };
  if (a.available !== undefined) out.available = a.available;
  if (protocol === 'UCP' && a.status === 'limited_stock') {
    out.status = 'in_stock';
    issues.push({ level: 'info', where, msg: 'LimitedAvailability became in_stock because UCP has no limited_stock status' });
  }
  if (a.available === undefined) issues.push({ level: 'info', where, msg: `${offer.availability} left "available" unset: whether it can be bought now is your call` });
  return out;
}

// ---------- ACP ----------
export function toAcp(model) {
  const issues = [...model.issues];
  const product = {};
  if (model.id) product.id = model.id;
  else issues.push({ level: 'missing', where: 'product', msg: 'no id: add @id (or productGroupID on a ProductGroup)' });
  if (model.name) product.title = model.name;
  if (model.description) product.description = { plain: model.description };
  if (model.url) product.url = model.url;
  if (model.images.length) product.media = mediaList(model.images);
  product.variants = model.variants.map((v, i) => {
    const where = v.sku || v.name || `variant ${i + 1}`;
    const out = {};
    if (v.id) out.id = v.id;
    else issues.push({ level: 'missing', where, msg: 'no variant id: add sku, productID or @id' });
    if (v.name) out.title = v.name;
    else issues.push({ level: 'missing', where, msg: 'no title: add name' });
    if (v.nameDerived) issues.push({ level: 'info', where, msg: 'title was built from the group name and the option values, because the variant has no name' });
    if (v.description) out.description = { plain: v.description };
    if (v.url) out.url = v.url;
    if (v.gtins.length) out.barcodes = v.gtins.map((g) => ({ type: 'GTIN', value: g.value }));
    if (v.offer) {
      const price = priceObject(v.offer.price, v.offer.currency, where, issues, 'price');
      if (price) out.price = price;
      if (v.offer.listPrice != null) {
        const lp = priceObject(v.offer.listPrice, v.offer.listCurrency, where, issues, 'list price');
        if (lp) out.list_price = lp;
      }
      const av = availabilityFor(v.offer, where, issues, 'ACP');
      if (av) out.availability = av;
      if (v.offer.condition) {
        if (CONDITION[v.offer.condition]) out.condition = [CONDITION[v.offer.condition]];
        else issues.push({ level: 'warn', where, msg: `condition ${v.offer.condition} is not a schema.org OfferItemCondition value, so it was left out` });
      }
      if (v.offer.seller) out.seller = { name: v.offer.seller };
    } else {
      issues.push({ level: 'missing', where, msg: 'no offers: the variant has no price' });
    }
    const cats = v.category.length ? v.category : model.category;
    if (cats.length) out.categories = cats.map((c) => ({ value: c }));
    if (v.options.length) out.variant_options = v.options.map((o) => ({ name: o.name, value: o.value }));
    if (v.images.length) out.media = mediaList(v.images);
    return out;
  });
  return finish('ACP', 'Product', product, issues);
}

// ---------- UCP ----------
export function toUcp(model) {
  const issues = [...model.issues];
  const product = {};
  if (model.id) product.id = model.id;
  else issues.push({ level: 'missing', where: 'product', msg: 'no id: add @id (or productGroupID on a ProductGroup)' });
  if (model.name) product.title = model.name;
  else issues.push({ level: 'missing', where: 'product', msg: 'no title: add name' });
  if (model.description) product.description = { plain: model.description };
  else issues.push({ level: 'missing', where: 'product', msg: 'no description: UCP requires one on the product and on every variant' });
  if (model.url) product.url = model.url;
  if (model.category.length) product.categories = model.category.map((c) => ({ value: c }));
  if (model.images.length) product.media = mediaList(model.images);
  if (model.keywords.length) product.tags = model.keywords;
  if (model.rating && model.rating.value != null && model.rating.max != null) {
    const r = { value: model.rating.value, scale_max: model.rating.max };
    if (model.rating.min != null) r.scale_min = model.rating.min;
    if (model.rating.count != null) r.count = model.rating.count;
    product.rating = r;
  } else if (model.rating) {
    issues.push({ level: 'warn', where: 'product', msg: 'aggregateRating needs ratingValue and bestRating to become a UCP rating, so it was left out' });
  }
  const optionMenu = new Map();
  const prices = [];
  product.variants = model.variants.map((v, i) => {
    const where = v.sku || v.name || `variant ${i + 1}`;
    const out = {};
    if (v.id) out.id = v.id;
    else issues.push({ level: 'missing', where, msg: 'no variant id: add sku, productID or @id' });
    if (v.sku) out.sku = v.sku;
    if (v.gtins.length) out.barcodes = v.gtins.map((g) => ({ type: 'GTIN', value: g.value }));
    if (v.name) out.title = v.name;
    else issues.push({ level: 'missing', where, msg: 'no title: add name' });
    if (v.description) out.description = { plain: v.description };
    else if (model.description) {
      out.description = { plain: model.description };
      issues.push({ level: 'info', where, msg: 'variant description copied from the product, because UCP requires one on each variant' });
    }
    if (v.url) out.url = v.url;
    if (v.offer) {
      const price = priceObject(v.offer.price, v.offer.currency, where, issues, 'price');
      if (price) { out.price = price; prices.push(price); }
      if (v.offer.listPrice != null) {
        const lp = priceObject(v.offer.listPrice, v.offer.listCurrency, where, issues, 'list price');
        if (lp) out.list_price = lp;
      }
      const av = availabilityFor(v.offer, where, issues, 'UCP');
      if (av) out.availability = av;
      if (v.offer.condition) issues.push({ level: 'warn', where, msg: 'itemCondition was left out: UCP has no condition field' });
      if (v.offer.seller) out.seller = { name: v.offer.seller };
    } else {
      issues.push({ level: 'missing', where, msg: 'no offers: the variant has no price' });
    }
    const cats = v.category;
    if (cats.length) out.categories = cats.map((c) => ({ value: c }));
    if (v.options.length) {
      out.options = v.options.map((o) => ({ name: o.name, label: o.value }));
      for (const o of v.options) {
        if (!optionMenu.has(o.name)) optionMenu.set(o.name, []);
        if (!optionMenu.get(o.name).includes(o.value)) optionMenu.get(o.name).push(o.value);
      }
    }
    if (v.images.length) out.media = mediaList(v.images);
    return out;
  });
  if (optionMenu.size) product.options = [...optionMenu].map(([name, values]) => ({ name, values: values.map((label) => ({ label })) }));
  if (prices.length) {
    const cur = new Set(prices.map((p) => p.currency));
    if (cur.size === 1) {
      const sorted = [...prices].sort((a, b) => a.amount - b.amount);
      product.price_range = { min: sorted[0], max: sorted[sorted.length - 1] };
    } else {
      issues.push({ level: 'missing', where: 'product', msg: `variants use different currencies (${[...cur].join(', ')}), so no price range could be built` });
    }
  } else {
    issues.push({ level: 'missing', where: 'product', msg: 'no variant has a usable price, so there is no price range (UCP requires one)' });
  }
  return finish('UCP', 'Product', product, issues);
}

let validators;
export function setSnapshots(snaps) {
  validators = { ACP: acpValidator(snaps.acp), UCP: ucpValidator(snaps.ucp) };
}

function finish(protocol, root, product, issues) {
  if (!validators) throw new Error('call setSnapshots() first');
  const errors = validators[protocol](root, product);
  // Ready means the schema accepts it and nothing we treat as essential (a usable price, an id) is missing.
  // The ACP schema does not require a price, but a product feed without one is no use to anybody.
  return { protocol, product, issues, errors, ready: errors.length === 0 && !issues.some((i) => i.level === 'missing') };
}

// ---------- which of the page's schema.org properties have a home ----------
export function coverage(model, crosswalk) {
  const has = (k) => model.present.has(k);
  const out = [];
  for (const row of crosswalk.rows) {
    const paths = (row.schemaorg || []).map((p) => p.path);
    const hit = paths.some((p) => {
      const [cls, prop] = p.split('.');
      if (!prop) return false;
      if (cls === 'Product' || cls === 'ProductGroup') return has(prop);
      if (cls === 'Offer' || cls === 'AggregateOffer') return has('offer.' + prop);
      return false;
    });
    if (hit) out.push({ row: row.id, concept: row.concept, acp: !!row.acp, ucp: !!row.ucp, gap: row.gap || null });
  }
  return out;
}
