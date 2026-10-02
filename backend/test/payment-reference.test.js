const test = require('node:test');
const assert = require('node:assert/strict');
const { createReceiptNumber } = require('../routes/payments');

test('generated receipt numbers fit VARCHAR(30) and remain prefixed', () => {
  for (let index = 0; index < 100; index += 1) {
    const receiptNumber = createReceiptNumber();
    assert.equal(receiptNumber.length, 30);
    assert.match(receiptNumber, /^RCP-[a-f0-9]{26}$/);
  }
});
