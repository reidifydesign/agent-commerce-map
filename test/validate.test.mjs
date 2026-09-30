import test from 'node:test';
import assert from 'node:assert/strict';
import { snaps } from './helpers.mjs';
import { acpValidator, ucpValidator } from '../src/validate.mjs';

const acp = acpValidator(snaps.acp);
const ucp = ucpValidator(snaps.ucp);
const okAcp = { id: 'p', variants: [{ id: 'v', title: 't', price: { amount: 1999, currency: 'USD' } }] };

test('ACP: a minimal product is valid', () => assert.deepEqual(acp('Product', okAcp), []));

test('ACP: rejects a decimal amount, a lowercase currency and an extra field', () => {
  const bad = { id: 'p', variants: [{ id: 'v', title: 't', brand: 'x', price: { amount: 19.99, currency: 'usd' } }] };
  const errs = acp('Product', bad);
  assert.ok(errs.some((e) => /expected integer/.test(e)));
  assert.ok(errs.some((e) => /does not match/.test(e)));
  assert.ok(errs.some((e) => /brand is not allowed/.test(e)));
});

test('ACP: a product needs variants', () => {
  assert.ok(acp('Product', { id: 'p' }).some((e) => /missing required variants/.test(e)));
});

test('UCP: required fields and minItems are enforced', () => {
  const errs = ucp('Product', { id: 'p', variants: [] });
  for (const f of ['title', 'description', 'price_range']) assert.ok(errs.some((e) => e.includes(f)), f);
  assert.ok(errs.some((e) => /at least 1/.test(e)));
});

test('UCP: a complete product is valid', () => {
  const price = { amount: 100, currency: 'EUR' };
  const v = { id: 'v', title: 't', description: { plain: 'd' }, price };
  assert.deepEqual(ucp('Product', { id: 'p', title: 't', description: { plain: 'd' }, price_range: { min: price, max: price }, variants: [v] }), []);
});

test('unknown root is reported, not thrown', () => assert.deepEqual(acp('Nope', {}), ['unknown root Nope']));
