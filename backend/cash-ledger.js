const { parseMoneyCents, formatMoneyCents, MAX_CENTS } = require('./money');

/** Create an in-memory daily cash ledger with a fixed opening balance. */
function createLogbook({ date, openingBalance }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new TypeError('Logbook date must be a valid date in YYYY-MM-DD format.');
  }
  return {
    date,
    openingCents: parseMoneyCents(openingBalance, 'Opening balance'),
    entries: new Map(),
    isClosed: false,
    actualCents: null,
    closedAt: null,
  };
}

/** Post one idempotent cash event to an open in-memory ledger. */
function postCashEvent(logbook, event) {
  const { sourceType, sourceReferenceId, direction, amount, paymentMode, description = '' } = event;
  if (typeof sourceType !== 'string' || !sourceType.trim()
      || typeof sourceReferenceId !== 'string' || !sourceReferenceId.trim()) {
    throw new TypeError('A source type and reference are required.');
  }
  if (direction !== 'INFLOW' && direction !== 'OUTFLOW') throw new TypeError('Direction must be INFLOW or OUTFLOW.');
  if (typeof paymentMode !== 'string' || !paymentMode.trim()) throw new TypeError('Payment mode is required.');
  const cents = parseMoneyCents(amount);
  if (cents === 0n) throw new RangeError('Cash event amount must be greater than zero.');

  const normalizedSourceType = sourceType.trim();
  const normalizedSourceReference = sourceReferenceId.trim();
  const key = JSON.stringify([normalizedSourceType, normalizedSourceReference]);
  const existing = logbook.entries.get(key);
  if (existing) {
    if (existing.direction !== direction || existing.amountCents !== cents
        || existing.paymentMode !== paymentMode.trim()) {
      throw new Error('Idempotency conflict: this source was already posted with different cash details.');
    }
    return { entry: existing, created: false };
  }
  if (logbook.isClosed) throw new Error('The logbook is closed and cannot accept new entries.');
  const entry = {
    date: logbook.date,
    sourceType: normalizedSourceType,
    sourceReferenceId: normalizedSourceReference,
    direction,
    amountCents: cents,
    paymentMode: paymentMode.trim(),
    description: String(description),
  };
  logbook.entries.set(key, entry);
  try {
    getCashSummary(logbook);
  } catch (error) {
    logbook.entries.delete(key);
    throw error;
  }
  return { entry, created: true };
}

/** Calculate the current drawer balance and reconciliation variance. */
function getCashSummary(logbook) {
  let inflowCents = 0n;
  let outflowCents = 0n;
  for (const entry of logbook.entries.values()) {
    if (entry.direction === 'INFLOW') inflowCents += entry.amountCents;
    else outflowCents += entry.amountCents;
  }
  if (inflowCents > MAX_CENTS || outflowCents > MAX_CENTS) {
    throw new RangeError('Logbook totals exceed DECIMAL(12,2).');
  }
  const closingCents = logbook.openingCents + inflowCents - outflowCents;
  if (closingCents > MAX_CENTS || closingCents < -MAX_CENTS) {
    throw new RangeError('Calculated closing balance exceeds DECIMAL(12,2).');
  }
  const cashVariance = logbook.actualCents === null ? null : logbook.actualCents - closingCents;
  if (cashVariance !== null && (cashVariance > MAX_CENTS || cashVariance < -MAX_CENTS)) {
    throw new RangeError('Cash variance exceeds DECIMAL(12,2).');
  }
  return {
    openingBalance: formatMoneyCents(logbook.openingCents),
    totalInflows: formatMoneyCents(inflowCents),
    totalOutflows: formatMoneyCents(outflowCents),
    calculatedClosingBalance: formatMoneyCents(closingCents),
    actualPhysicalCash: logbook.actualCents === null ? null : formatMoneyCents(logbook.actualCents),
    cashVariance: cashVariance === null ? null : formatMoneyCents(cashVariance),
    isClosed: logbook.isClosed,
  };
}

/** Reconcile physical cash and lock the in-memory daily ledger. */
function closeLogbook(logbook, actualPhysicalCash, closedAt = new Date().toISOString()) {
  if (logbook.isClosed) throw new Error('The logbook is already closed.');
  const physicalCents = parseMoneyCents(actualPhysicalCash, 'Physical cash');
  const closingCents = getClosingCents(logbook);
  const variance = physicalCents - closingCents;
  if (variance > MAX_CENTS || variance < -MAX_CENTS) {
    throw new RangeError('Cash variance exceeds DECIMAL(12,2).');
  }
  logbook.actualCents = physicalCents;
  logbook.closedAt = closedAt;
  logbook.isClosed = true;
  return getCashSummary(logbook);
}

/** Open a new in-memory logbook from the previous day's calculated close. */
function createNextDayLogbook(previous, date) {
  if (!previous.isClosed) throw new Error('Close the previous logbook before starting a new day.');
  return createLogbook({ date, openingBalance: formatMoneyCents(getClosingCents(previous)) });
}

function getClosingCents(logbook) {
  const summary = getCashSummary(logbook);
  return parseMoneyCents(summary.calculatedClosingBalance, 'Closing balance', { allowSigned: true });
}

module.exports = {
  createLogbook,
  postCashEvent,
  getCashSummary,
  closeLogbook,
  createNextDayLogbook,
};
