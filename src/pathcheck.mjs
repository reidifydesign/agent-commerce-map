// Resolve a field path such as "Variant.price.amount" or "Offer.price" against a snapshot.
// Returns { found, type, required, enumValues, note }.
const posix = (p) => {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg !== '.' && seg !== '') out.push(seg);
  }
  return out.join('/');
};
const dirname = (p) => p.split('/').slice(0, -1).join('/');

function makeJsonSchemaResolver({ getRoot, getFile, localDefs }) {
  // ctx = { file, node }
  function deref(ctx) {
    let { file, node } = ctx;
    for (let i = 0; i < 20 && node && node.$ref; i++) {
      const ref = node.$ref;
      const extra = { ...node };
      delete extra.$ref;
      if (ref.startsWith('#/$defs/')) {
        const def = localDefs(file)?.[ref.slice(8)];
        if (!def) return { file, node: null };
        node = Object.keys(extra).length ? { allOf: [def, extra] } : def;
      } else {
        const [rel] = ref.split('#');
        const target = posix(dirname(file) + '/' + rel);
        const json = getFile(target);
        if (!json) return { file, node: null };
        file = target;
        node = Object.keys(extra).length ? { allOf: [json, extra] } : json;
      }
    }
    return { file, node };
  }
  function findProp(ctx, key, depth = 0) {
    if (depth > 12) return null;
    const c = deref(ctx);
    if (!c.node) return null;
    const n = c.node;
    if (n.properties && key in n.properties) return { ctx: { file: c.file, node: n.properties[key] }, parent: n };
    if (n.type === 'array' && n.items) return findProp({ file: c.file, node: n.items }, key, depth + 1);
    for (const k of ['allOf', 'oneOf', 'anyOf']) {
      for (const sub of n[k] || []) {
        const r = findProp({ file: c.file, node: sub }, key, depth + 1);
        if (r) return r;
      }
    }
    return null;
  }
  function typeOf(ctx, depth = 0) {
    if (depth > 12) return undefined;
    const c = deref(ctx);
    const n = c.node;
    if (!n) return undefined;
    if (n.type === 'array') return 'array<' + (typeOf({ file: c.file, node: n.items || {} }, depth + 1) || 'any') + '>';
    if (n.type) return n.type;
    for (const k of ['allOf', 'oneOf', 'anyOf']) {
      for (const sub of n[k] || []) {
        const t = typeOf({ file: c.file, node: sub }, depth + 1);
        if (t) return t;
      }
    }
    return undefined;
  }
  function requiredList(parent) {
    const out = new Set(parent.required || []);
    for (const k of ['allOf']) for (const sub of parent[k] || []) for (const r of sub.required || []) out.add(r);
    return out;
  }
  return function resolve(path) {
    const [root, ...segs] = path.split('.');
    const start = getRoot(root);
    if (!start) return { found: false, note: `unknown root ${root}` };
    let ctx = start;
    let required = false;
    let parentNode = null;
    for (const raw of segs) {
      const key = raw.replace(/\[\]$/, '');
      const hit = findProp(ctx, key);
      if (!hit) return { found: false, note: `no property ${key}` };
      parentNode = hit.parent;
      required = requiredList(parentNode).has(key);
      ctx = hit.ctx;
    }
    const d = deref(ctx);
    const enumValues = d.node && d.node.enum ? d.node.enum : undefined;
    return { found: true, type: typeOf(ctx), required: segs.length ? required : undefined, enumValues };
  };
}

export function makeAcpResolver(snap) {
  const defs = snap.schema.$defs || {};
  return makeJsonSchemaResolver({
    getRoot: (r) => (defs[r] ? { file: 'acp', node: defs[r] } : null),
    getFile: () => null,
    localDefs: () => defs
  });
}

export function makeUcpResolver(snap) {
  const files = snap.files;
  const roots = { Product: 'shopping/types/product.json', Variant: 'shopping/types/variant.json' };
  return makeJsonSchemaResolver({
    getRoot: (r) => (roots[r] && files[roots[r]] ? { file: roots[r], node: files[roots[r]] } : null),
    getFile: (f) => files[f],
    localDefs: () => ({})
  });
}

export function makeSchemaorgResolver(snap) {
  const classes = snap.classes;
  return function resolve(path) {
    const [cls, prop] = path.split('.');
    if (!classes[cls] || !classes[cls].found) return { found: false, note: `unknown class ${cls}` };
    if (!prop) return { found: true };
    const seen = new Set();
    const walk = (c) => {
      if (seen.has(c) || !classes[c]) return null;
      seen.add(c);
      if (classes[c].props[prop]) return { owner: c, range: classes[c].props[prop].range };
      for (const p of classes[c].parents) {
        const r = walk(p);
        if (r) return r;
      }
      return null;
    };
    const hit = walk(cls);
    return hit ? { found: true, type: hit.range.join(' | '), owner: hit.owner } : { found: false, note: `no property ${prop} on ${cls} or its parents` };
  };
}

export function makeResolvers(snaps) {
  return { acp: makeAcpResolver(snaps.acp), ucp: makeUcpResolver(snaps.ucp), schemaorg: makeSchemaorgResolver(snaps.schemaorg) };
}
