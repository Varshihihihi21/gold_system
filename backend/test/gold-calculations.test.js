const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculate999Sale,
  calculate49Sale,
  calculate999Purchase,
  calculateGattiPurchase,
  isPriceWithinTolerance,
} = require('../gold-calculations');

test('999 sale multiplies weight by rate and rounds to cents', () => {
  assert.deepEqual(calculate999Sale('10.1250', '70.00'), {
    billedWeightGrams: '10.1250',
    fineWeightGrams: '10.1149',
    lineTotal: '708.75',
  });
});

test('49 sale applies a 0.1 percent surcharge at four decimal places', () => {
  assert.deepEqual(calculate49Sale('100.0000', '70.00'), {
    billedWeightGrams: '100.1000',
    fineWeightGrams: '99.9900',
    lineTotal: '7007.00',
  });
});

test('Gatti purchase calculates fine weight before applying rate', () => {
  assert.deepEqual(calculateGattiPurchase('10.0000', '88.50', '70.00'), {
    fineWeightGrams: '8.8500',
    payout: '619.50',
  });
});

test('999 purchase pays against gross weight', () => {
  assert.deepEqual(calculate999Purchase('1.2500', '68.40'), {
    fineWeightGrams: '1.2488',
    payout: '85.50',
  });
});

test('money rounds a half-cent upward and rejects a zero rate', () => {
  assert.deepEqual(calculate999Sale('0.0001', '50.00'), {
    billedWeightGrams: '0.0001',
    lineTotal: '0.01',
  });
  assert.throws(() => calculate999Sale('1.0000', '0.00'), /rate must be greater than zero/);
});

test('calculations reject excessive precision, zero weights and invalid purity', () => {
  assert.throws(() => calculate999Sale('1.00001', '70.00'), /at most 4/);
  assert.throws(() => calculate49Sale('0', '70.00'), /greater than zero/);
  assert.throws(() => calculateGattiPurchase('1.0000', '100.01', '70.00'), /Touch percentage/);
});

test('price guardrail accepts at most one cent of difference', () => {
  assert.equal(isPriceWithinTolerance('100.00', '100.01'), true);
  assert.equal(isPriceWithinTolerance('100.00', '100.02'), false);
});
