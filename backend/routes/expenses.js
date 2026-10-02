const express = require('express');
const { formatMoneyCents, parseMoneyCents } = require('../money');
const { currentBusinessDate, withTransaction } = require('../finance/transactions');
const { postCashEntry } = require('../finance/logbook');
const { FinanceError } = require('../finance/errors');

/** Create office and household expense recording with cash-only drawer posting. */
function createExpensesRouter(pool) {
  const router = express.Router();

  router.post('/expenses', async (req, res) => {
    const { category, amount, payment_mode: paymentMode = 'CASH', description = '' } = req.body || {};
    if (!['OFFICE', 'HOUSEHOLD'].includes(category)
        || !['CASH', 'BANK_TRANSFER', 'UPI', 'CARD'].includes(paymentMode)
        || typeof description !== 'string' || description.length > 500) {
      return res.status(400).json({ error: 'Valid category, payment_mode, and a description of at most 500 characters are required.' });
    }
    let cents;
    try {
      cents = parseMoneyCents(amount, 'amount');
      if (cents <= 0n) throw new TypeError('amount must be greater than zero.');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    try {
      const expense = await withTransaction(pool, async (client) => {
        const date = await currentBusinessDate(client);
        const inserted = await client.query(
          `INSERT INTO expenses (expense_date, category, amount, payment_mode, description)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [date, category, formatMoneyCents(cents), paymentMode, description.trim() || null]
        );
        await postCashEntry(client, {
          date, direction: 'OUTFLOW', amount: formatMoneyCents(cents), paymentMode,
          sourceType: 'EXPENSE', sourceId: inserted.rows[0].expense_id,
          description: `${category} expense`,
        });
        return inserted.rows[0];
      });
      return res.status(201).json({ expense });
    } catch (error) {
      if (error instanceof FinanceError) return res.status(error.status).json({ error: error.message });
      console.error('Expense transaction failed:', error.message);
      return res.status(500).json({ error: 'Could not record the expense.' });
    }
  });

  return router;
}

module.exports = { createExpensesRouter };
