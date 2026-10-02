const test = require('node:test');
const assert = require('node:assert/strict');

test('frontend financial previews match the agreed four-decimal and cent vectors', async () => {
  const { previewSale, previewPurchase } = await import('../../frontend/src/financial-math.js');
  assert.deepEqual(previewSale('999', '10.1250', '70.00'), {
    lineTotal: '708.75',
    billedWeight: '10.1250',
    fineWeight: '10.1149',
  });
  assert.deepEqual(previewSale('49', '100.0000', '70.00'), {
    lineTotal: '7007.00',
    billedWeight: '100.1000',
    fineWeight: '99.9900',
  });
  assert.deepEqual(previewPurchase('GATTI', '10.0000', '88.50', '70.00'), {
    fineWeight: '8.8500',
    payout: '619.50',
  });
});
