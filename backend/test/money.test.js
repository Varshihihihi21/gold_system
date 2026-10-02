const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMoneyCents, formatMoneyCents } = require('../money');

test('money parsing preserves exact decimal cents', () => {
  assert.equal(parseMoneyCents('100.05'), 10005n);
  assert.equal(formatMoneyCents(parseMoneyCents('0.10')), '0.10');
  assert.equal(formatMoneyCents(parseMoneyCents('-0.10', 'Balance', { allowSigned: true })), '-0.10');
});

test('money parsing rejects invalid scale, scientific notation, and overflow', () => {
  assert.throws(() => parseMoneyCents('1.001'), /at most 2/);
  assert.throws(() => parseMoneyCents('1e2'), /non-negative amount/);
  assert.throws(() => parseMoneyCents('-1.00'), /non-negative amount/);
  assert.throws(() => parseMoneyCents('10000000000.00'), /DECIMAL/);
});
