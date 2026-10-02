const { formatMoneyCents, parseMoneyCents, MAX_CENTS } = require('../money');
const { FinanceError } = require('./errors');

/** Lock or create the day's summary using the most recent closed balance. */
async function lockOpenLogbook(client, date) {
  const prior = await client.query(
    `SELECT log_date, calculated_closing_balance, is_closed
     FROM daily_logbook_summary WHERE log_date < $1
     ORDER BY log_date DESC LIMIT 1 FOR UPDATE`,
    [date]
  );
  if (prior.rows[0] && !prior.rows[0].is_closed) {
    const priorDate = String(prior.rows[0].log_date).slice(0, 10);
    throw new FinanceError(409, `Close the ${priorDate} logbook before posting today's cash.`);
  }
  const opening = prior.rows[0]?.calculated_closing_balance ?? '0.00';
  await client.query(
    `INSERT INTO daily_logbook_summary (log_date, opening_balance, calculated_closing_balance)
     VALUES ($1, $2, $2) ON CONFLICT (log_date) DO NOTHING`,
    [date, opening]
  );
  const result = await client.query(
    'SELECT * FROM daily_logbook_summary WHERE log_date = $1 FOR UPDATE',
    [date]
  );
  if (result.rows[0].is_closed) throw new FinanceError(409, 'Today’s logbook is closed and cannot accept cash entries.');
  return result.rows[0];
}

/** Post one cash-only movement and update the locked daily totals. */
async function postCashEntry(client, { date, direction, amount, paymentMode, sourceType, sourceId, description }) {
  if (paymentMode !== 'CASH') return false;
  const cents = parseMoneyCents(amount, 'Logbook amount');
  if (cents <= 0n) throw new RangeError('Logbook amount must be greater than zero.');
  const summary = await lockOpenLogbook(client, date);
  const inflows = parseMoneyCents(summary.total_inflows, 'Logbook inflows');
  const outflows = parseMoneyCents(summary.total_outflows, 'Logbook outflows');
  const closing = parseMoneyCents(summary.calculated_closing_balance, 'Logbook closing balance', { allowSigned: true });
  const nextInflows = inflows + (direction === 'INFLOW' ? cents : 0n);
  const nextOutflows = outflows + (direction === 'OUTFLOW' ? cents : 0n);
  const nextClosing = closing + (direction === 'INFLOW' ? cents : -cents);
  if (nextInflows > MAX_CENTS || nextOutflows > MAX_CENTS
      || nextClosing > MAX_CENTS || nextClosing < -MAX_CENTS) {
    throw new FinanceError(422, 'Cash totals exceed the supported DECIMAL(12,2) range.');
  }
  await client.query(
    `INSERT INTO logbook_entries
       (log_date, entry_type, amount, payment_mode, source_type, source_reference_id, description)
     VALUES ($1, $2, $3, 'CASH', $4, $5, $6)`,
    [date, direction, formatMoneyCents(cents), sourceType, sourceId, description]
  );
  const signed = direction === 'INFLOW' ? formatMoneyCents(cents) : formatMoneyCents(-cents);
  await client.query(
    `UPDATE daily_logbook_summary
     SET total_inflows = total_inflows + CASE WHEN $2 = 'INFLOW' THEN $3::numeric ELSE 0 END,
         total_outflows = total_outflows + CASE WHEN $2 = 'OUTFLOW' THEN $3::numeric ELSE 0 END,
         calculated_closing_balance = calculated_closing_balance + $4::numeric
     WHERE log_date = $1`,
    [date, direction, formatMoneyCents(cents), signed]
  );
  return true;
}

module.exports = { lockOpenLogbook, postCashEntry };
