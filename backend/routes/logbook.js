const express = require('express');
const { parseMoneyCents, formatMoneyCents, MAX_CENTS } = require('../money');
const { currentBusinessDate, withTransaction } = require('../finance/transactions');
const { lockOpenLogbook } = require('../finance/logbook');
const { verifyOwnerPin, recordOwnerAction } = require('../finance/owner-pin');
const { FinanceError } = require('../finance/errors');

/** Create daily logbook summary and physical cash-reconciliation routes. */
function createLogbookRouter(pool) {
  const router = express.Router();

  router.get('/logbook/today', async (_req, res) => {
    try {
      const summary = await withTransaction(pool, async (client) => {
        const date = await currentBusinessDate(client);
        let row = (await client.query('SELECT * FROM daily_logbook_summaries WHERE log_date = $1', [date])).rows[0];
        if (!row) row = await lockOpenLogbook(client, date);
        const entries = await client.query(
          'SELECT * FROM logbook_entries WHERE log_date = $1 ORDER BY created_at, entry_id',
          [date]
        );
        return { summary: row, entries: entries.rows };
      });
      return res.json(summary);
    } catch (error) {
      if (error instanceof FinanceError) return res.status(error.status).json({ error: error.message });
      console.error('Logbook read failed:', error.message);
      return res.status(500).json({ error: 'Could not load today’s logbook.' });
    }
  });

  router.post('/logbook/close', async (req, res) => {
    let actualCents;
    try {
      actualCents = parseMoneyCents(req.body?.actual_physical_cash, 'actual_physical_cash');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    try {
      const result = await withTransaction(pool, async (client) => {
        const ownerUserId = await verifyOwnerPin(client, req.body?.owner_pin);
        const date = await currentBusinessDate(client);
        const summary = await lockOpenLogbook(client, date);
        const calculated = parseMoneyCents(summary.calculated_closing_balance, 'calculated closing balance', {
          allowSigned: true,
        });
        const variance = actualCents - calculated;
        if (variance > MAX_CENTS || variance < -MAX_CENTS) {
          throw new FinanceError(422, 'Cash variance exceeds DECIMAL(12,2).');
        }
        const updated = await client.query(
          `UPDATE daily_logbook_summaries
           SET actual_physical_cash = $1, cash_variance = $2, is_closed = TRUE, closed_at = NOW()
           WHERE log_date = $3 RETURNING *`,
          [formatMoneyCents(actualCents), formatMoneyCents(variance), date]
        );
        await recordOwnerAction(client, {
          ownerUserId,
          deviceId: req.user.device_id,
          action: 'LOGBOOK_CLOSE',
          referenceId: updated.rows[0].logbook_id,
          details: {
            log_date: date,
            actual_physical_cash: formatMoneyCents(actualCents),
            calculated_closing_balance: formatMoneyCents(calculated),
            cash_variance: formatMoneyCents(variance),
          },
        });
        return updated.rows[0];
      });
      return res.json({ summary: result });
    } catch (error) {
      if (error instanceof FinanceError) return res.status(error.status).json({ error: error.message });
      console.error('Logbook close failed:', error.message);
      return res.status(500).json({ error: 'Could not close today’s logbook.' });
    }
  });

  return router;
}

module.exports = { createLogbookRouter };
