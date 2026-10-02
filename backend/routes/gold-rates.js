const express = require('express');
const { parseMoneyCents, formatMoneyCents } = require('../money');

/** Create API routes for the current day's four validated gold rates. */
function createGoldRatesRouter(pool) {
  const router = express.Router();
  const fields = ['rate_999_sell', 'rate_49_sell', 'rate_999_buy', 'rate_fine_gatti_buy'];

  router.post('/gold-rates', async (req, res) => {
    const rates = {};
    try {
      for (const field of fields) {
        rates[field] = parseMoneyCents(req.body?.[field], field);
        if (rates[field] <= 0n) return res.status(400).json({ error: `${field} must be greater than zero.` });
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const client = await pool.connect().catch((error) => {
      console.error('Gold-rate database connection failed:', error.message);
      return null;
    });
    if (!client) return res.status(503).json({ error: 'Rate service is temporarily unavailable.' });
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query("SELECT pg_advisory_xact_lock(hashtext('daily-gold-rates:' || CURRENT_DATE::text))");
      const currentResult = await client.query(
        'SELECT * FROM daily_gold_rates WHERE rate_date = CURRENT_DATE FOR UPDATE'
      );
      const current = currentResult.rows[0];
      const values = fields.map((field) => formatMoneyCents(rates[field]));
      const changed = current && fields.some((field) =>
        parseMoneyCents(current[field], field) !== rates[field]
      );
      if (changed && req.user.role !== 'OWNER') {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(403).json({ error: 'An OWNER-authorized terminal is required to change today’s saved rates.' });
      }
      if (changed) {
        await client.query(
          `INSERT INTO daily_gold_rates_audit
             (rate_id, old_rate_999_sell, new_rate_999_sell, old_rate_49_sell, new_rate_49_sell,
              old_rate_999_buy, new_rate_999_buy, old_rate_fine_gatti_buy, new_rate_fine_gatti_buy, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [current.rate_id, current.rate_999_sell, values[0], current.rate_49_sell, values[1],
            current.rate_999_buy, values[2], current.rate_fine_gatti_buy, values[3], req.user.device_id]
        );
      }
      const result = current
        ? await client.query(
          `UPDATE daily_gold_rates SET rate_999_sell = $1, rate_49_sell = $2,
             rate_999_buy = $3, rate_fine_gatti_buy = $4, updated_at = NOW()
           WHERE rate_id = $5 RETURNING *`,
          [...values, current.rate_id]
        )
        : await client.query(
          `INSERT INTO daily_gold_rates
             (rate_date, rate_999_sell, rate_49_sell, rate_999_buy, rate_fine_gatti_buy)
           VALUES (CURRENT_DATE, $1, $2, $3, $4) RETURNING *`,
          values
        );
      await client.query('COMMIT');
      transactionOpen = false;
      return res.json(result.rows[0]);
    } catch (err) {
      if (transactionOpen) await client.query('ROLLBACK').catch((rollbackError) =>
        console.error('Gold-rate rollback failed:', rollbackError.message));
      console.error('Gold-rate update failed:', err.message);
      return res.status(500).json({ error: 'Could not save the daily rates.' });
    } finally {
      client.release();
    }
  });

  router.get('/gold-rates/today', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM daily_gold_rates WHERE rate_date = CURRENT_DATE');
      return res.json(result.rows[0] || null);
    } catch (err) {
      console.error('Gold-rate read failed:', err.message);
      return res.status(500).json({ error: 'Could not load the daily rates.' });
    }
  });

  router.get('/gold-rates/audit', async (req, res) => {
    const requestedDate = req.query.date;
    const dateParsed = typeof requestedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? new Date(`${requestedDate}T00:00:00.000Z`)
      : null;
    if (requestedDate !== undefined && (!dateParsed || Number.isNaN(dateParsed.valueOf())
        || dateParsed.toISOString().slice(0, 10) !== requestedDate)) {
      return res.status(400).json({ error: 'date must use YYYY-MM-DD format.' });
    }
    try {
      const result = await pool.query(
        `SELECT a.*, d.device_name, d.device_guid
         FROM daily_gold_rates_audit a
         JOIN daily_gold_rates r ON r.rate_id = a.rate_id
         LEFT JOIN authorised_devices d ON d.device_id::text = a.changed_by
         WHERE r.rate_date = COALESCE($1::date, CURRENT_DATE)
         ORDER BY a.changed_at DESC`,
        [requestedDate || null]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error('Gold-rate audit read failed:', err.message);
      return res.status(500).json({ error: 'Could not load the rate audit history.' });
    }
  });

  return router;
}

module.exports = { createGoldRatesRouter };
