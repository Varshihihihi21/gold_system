const express = require('express');
const { formatMoneyCents } = require('../money');

/** Parse an aggregate PostgreSQL numeric value into signed integer cents. */
function aggregateCents(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '0'));
  if (!match) throw new TypeError('Database returned an invalid financial aggregate.');
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0') || '0');
  return match[1] ? -cents : cents;
}

/** Calculate rounded signed daily average without floating-point currency math. */
function averageCents(total, days) {
  if (!days) return null;
  const divisor = BigInt(days);
  const sign = total < 0n ? -1n : 1n;
  const absolute = total < 0n ? -total : total;
  const quotient = absolute / divisor;
  const rounded = quotient + (absolute % divisor * 2n >= divisor ? 1n : 0n);
  return sign * rounded;
}

/** Create period-based profit analytics from sales, purchase, and expense records. */
function createAnalyticsRouter(pool) {
  const router = express.Router();

  router.get('/analytics/profit', async (req, res) => {
    const { from, to, include_household: includeHousehold = 'true' } = req.query;
    if (!validDate(from) || !validDate(to) || from > to
        || !['true', 'false'].includes(includeHousehold)) {
      return res.status(400).json({ error: 'Provide valid from/to dates (YYYY-MM-DD) and include_household=true|false.' });
    }
    try {
      const values = await pool.query(
        `SELECT
           COALESCE((SELECT SUM(i.line_total) FROM sales_invoice_items i
             JOIN sales_invoices s ON s.invoice_id = i.invoice_id
             WHERE s.invoice_date BETWEEN $1 AND $2), 0)::text AS sales_revenue,
           COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN $1 AND $2 AND category = 'OFFICE'), 0)::text AS office_expenses,
           COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN $1 AND $2 AND category = 'HOUSEHOLD'), 0)::text AS household_expenses,
           COALESCE((SELECT SUM(total_payout_amount) FROM purchase_vouchers WHERE purchase_date BETWEEN $1 AND $2), 0)::text AS purchases`,
        [from, to]
      );
      const row = values.rows[0];
      const revenue = aggregateCents(row.sales_revenue);
      const purchases = aggregateCents(row.purchases);
      const office = aggregateCents(row.office_expenses);
      const household = aggregateCents(row.household_expenses);
      const gross = revenue - purchases;
      const operating = gross - office;
      const net = operating - (includeHousehold === 'true' ? household : 0n);
      const periodDays = calendarDays(from, to);
      return res.json({
        from,
        to,
        include_household: includeHousehold === 'true',
        period_days: periodDays,
        sales_revenue: formatMoneyCents(revenue),
        purchase_costs: formatMoneyCents(purchases),
        gross_profit: formatMoneyCents(gross),
        office_expenses: formatMoneyCents(office),
        operating_profit: formatMoneyCents(operating),
        household_expenses: formatMoneyCents(household),
        net_retained_profit: formatMoneyCents(net),
        daily_average_profit: periodDays
          ? formatMoneyCents(averageCents(net, periodDays))
          : null,
      });
    } catch (error) {
      if (error instanceof FinanceError) return res.status(error.status).json({ error: error.message });
      console.error('Profit analytics query failed:', error.message);
      return res.status(500).json({ error: 'Could not calculate profit analytics.' });
    }
  });

  return router;
}

function calendarDays(from, to) {
  const first = Date.parse(`${from}T00:00:00.000Z`);
  const last = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((last - first) / 86400000) + 1;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

module.exports = { createAnalyticsRouter, aggregateCents, averageCents, calendarDays };
