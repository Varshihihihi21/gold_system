const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createLogbook,
  postCashEvent,
  getCashSummary,
  closeLogbook,
  createNextDayLogbook,
} = require('../cash-ledger');

function event(reference, direction, amount) {
  return {
    sourceType: 'SALE',
    sourceReferenceId: reference,
    direction,
    amount,
    paymentMode: 'CASH',
  };
}

test('cash entries update the running balance without floating point arithmetic', () => {
  const day = createLogbook({ date: '2026-10-02', openingBalance: '100.00' });
  postCashEvent(day, event('sale-1', 'INFLOW', '20.10'));
  postCashEvent(day, event('expense-1', 'OUTFLOW', '3.25'));
  assert.deepEqual(getCashSummary(day), {
    openingBalance: '100.00',
    totalInflows: '20.10',
    totalOutflows: '3.25',
    calculatedClosingBalance: '116.85',
    actualPhysicalCash: null,
    cashVariance: null,
    isClosed: false,
  });
});

test('source references are idempotent and conflicting retries fail', () => {
  const day = createLogbook({ date: '2026-10-02', openingBalance: '0.00' });
  assert.equal(postCashEvent(day, event('sale-1', 'INFLOW', '10.00')).created, true);
  assert.equal(postCashEvent(day, event('sale-1', 'INFLOW', '10.00')).created, false);
  assert.throws(() => postCashEvent(day, event('sale-1', 'INFLOW', '12.00')), /Idempotency conflict/);
  assert.equal(getCashSummary(day).totalInflows, '10.00');
});

test('closing reconciles physical cash and locks the day', () => {
  const day = createLogbook({ date: '2026-10-02', openingBalance: '50.00' });
  postCashEvent(day, event('payment-1', 'INFLOW', '5.00'));
  const summary = closeLogbook(day, '54.50', '2026-10-02T18:00:00.000Z');
  assert.equal(summary.cashVariance, '-0.50');
  assert.equal(summary.isClosed, true);
  assert.throws(() => postCashEvent(day, event('sale-2', 'INFLOW', '1.00')), /closed/);
});

test('next business day starts with yesterday calculated close', () => {
  const day = createLogbook({ date: '2026-10-02', openingBalance: '50.00' });
  postCashEvent(day, event('sale-1', 'INFLOW', '7.25'));
  closeLogbook(day, '60.00');
  const next = createNextDayLogbook(day, '2026-10-03');
  assert.equal(getCashSummary(next).openingBalance, '57.25');
});

test('rejects impossible calendar dates', () => {
  assert.throws(() => createLogbook({ date: '2026-02-30', openingBalance: '0.00' }), /valid date/);
});
