// A small JSON Schema checker for the subset ACP and UCP use:
// $ref, type, required, properties, additionalProperties:false, items, allOf, enum, const,
// minimum, maximum, minItems, pattern. `if` blocks are ignored.

const posix = (p) => {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '..') out.pop();
    else if (seg !== '.' && seg !== '') out.push(seg);
  }
  return out.join('/');
};
const dirname = (p) => p.split('/').slice(0, -1).join('/');

function typeOk(type, v) {
  switch (type) {
    case 'string': return typeof v === 'string';
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'null': return v === null;
    default: return true;
  }
}

export function makeValidator({ rootFor, getFile, defs }) {
  function deref(ctx) {
    let { file, node } = ctx;
    for (let i = 0; i < 20 && node && node.$ref; i++) {
      const extra = { ...node };
      delete extra.$ref;
      let target;
      if (node.$ref.startsWith('#/$defs/')) {
        target = defs && defs[node.$ref.slice(8)];
      } else {
        file = posix(dirname(file) + '/' + node.$ref.split('#')[0]);
        target = getFile(file);
      }
      if (!target) return { file, node: {} };
      node = Object.keys(extra).length ? { allOf: [target, extra] } : target;
    }
    return { file, node };
  }
  function check(ctx, value, path, errors) {
    const c = deref(ctx);
    const n = c.node || {};
    const at = path || '(root)';
    if (n.type && !typeOk(n.type, value)) {
      errors.push(`${at}: expected ${n.type}, got ${Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value}`);
      return;
    }
    if (n.enum && !n.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} is not one of ${n.enum.join(', ')}`);
    if ('const' in n && n.const !== value) errors.push(`${at}: must be ${JSON.stringify(n.const)}`);
    if (typeof value === 'number') {
      if (typeof n.minimum === 'number' && value < n.minimum) errors.push(`${at}: ${value} is below the minimum ${n.minimum}`);
      if (typeof n.maximum === 'number' && value > n.maximum) errors.push(`${at}: ${value} is above the maximum ${n.maximum}`);
    }
    if (typeof value === 'string' && n.pattern && !new RegExp(n.pattern).test(value)) errors.push(`${at}: does not match ${n.pattern}`);
    if (Array.isArray(value)) {
      if (n.minItems && value.length < n.minItems) errors.push(`${at}: needs at least ${n.minItems} item(s)`);
      if (n.items) value.forEach((v, i) => check({ file: c.file, node: n.items }, v, `${path}[${i}]`, errors));
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const r of n.required || []) if (!(r in value)) errors.push(`${at}: missing required ${r}`);
      if (n.properties) {
        for (const [k, v] of Object.entries(value)) {
          if (n.properties[k]) check({ file: c.file, node: n.properties[k] }, v, path ? `${path}.${k}` : k, errors);
          else if (n.additionalProperties === false) errors.push(`${at}: ${k} is not allowed here`);
        }
      }
    }
    for (const sub of n.allOf || []) check({ file: c.file, node: sub }, value, path, errors);
  }
  return function validate(rootName, value) {
    const root = rootFor(rootName);
    if (!root) return [`unknown root ${rootName}`];
    const errors = [];
    check(root, value, '', errors);
    return errors;
  };
}

export function acpValidator(snap) {
  const defs = snap.schema.$defs;
  return makeValidator({ rootFor: (r) => (defs[r] ? { file: 'acp', node: defs[r] } : null), getFile: () => null, defs });
}

export function ucpValidator(snap) {
  const roots = { Product: 'shopping/types/product.json', Variant: 'shopping/types/variant.json' };
  return makeValidator({ rootFor: (r) => (roots[r] ? { file: roots[r], node: snap.files[roots[r]] } : null), getFile: (f) => snap.files[f], defs: {} });
}
