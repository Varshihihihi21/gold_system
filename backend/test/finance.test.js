const test = require('node:test');
const assert = require('node:assert/strict');
const { addInventory, removeInventory, assertInventoryBounds } = require('../finance/inventory');
const { aggregateCents, averageCents } = require('../routes/analytics');

function stock(physical = '10.0000', fine = '10.0000', cost = '1000.00') {
  return {
    physical_stock_grams: physical,
    fine_stock_grams: fine,
    inventory_cost_amount: cost,
  };
}

test('weighted-average cost is allocated exactly and the final sale consumes the remainder', () => {
  const first = removeInventory(stock(), 10000n, 10000n);
  assert.equal(first.costOfGoodsSold, 10000n);
  assert.equal(first.physical, 90000n);
  assert.equal(first.fine, 90000n);
  assert.equal(first.cost, 90000n);

  const remaining = {
    physical_stock_grams: '9.0000',
    fine_stock_grams: '9.0000',
    inventory_cost_amount: '900.00',
  };
  const final = removeInventory(remaining, 90000n, 90000n);
  assert.equal(final.costOfGoodsSold, 90000n);
  assert.equal(final.cost, 0n);
});

test('purchase intake increases physical stock, fine stock, and carrying cost', () => {
  const updated = addInventory(stock('2.0000', '1.5000', '250.00'), 12500n, 10000n, 7500n);
  assert.deepEqual(updated, { physical: 32500n, fine: 25000n, cost: 32500n });
});

test('inventory rejects a sale exceeding physical or fine-gold stock', () => {
  assert.throws(() => removeInventory(stock('1.0000', '0.5000', '40.00'), 10001n, 10000n), /Insufficient/);
  assert.throws(() => assertInventoryBounds(-1n, 0n, 0n), /Inventory weight/);
});

test('analytics aggregates and daily averages use exact signed cents', () => {
  assert.equal(aggregateCents('1234.56'), 123456n);
  assert.equal(averageCents(100n, 3), 33n);
  assert.equal(averageCents(-100n, 3), -33n);
  assert.equal(averageCents(50n, 0), null);
});
