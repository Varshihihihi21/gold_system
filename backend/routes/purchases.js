const crypto = require('node:crypto');
const express = require('express');
const { calculate999Purchase, calculateGattiPurchase } = require('../gold-calculations');
const { parseMoneyCents, formatMoneyCents } = require('../money');
const { parseWeight } = require('../finance/validation');
const { lockInventory, addInventory, saveInventory } = require('../finance/inventory');
const { currentBusinessDate, withTransaction } = require('../finance/transactions');
const { postCashEntry } = require('../finance/logbook');
const { FinanceError } = require('../finance/errors');

/** Create a gold buyback voucher and atomically post its cash and inventory effects. */
function createPurchasesRouter(pool) {
  const router = express.Router();

  router.post('/purchases', async (req, res) => {
    const { customer_id: customerId, category, actual_weight_grams: actualWeight, touch_percentage: touch } = req.body || {};
    if (typeof customerId !== 'string' || !customerId.trim()
        || !['999', 'GATTI'].includes(category)) {
      return res.status(400).json({ error: 'customer_id and category (999 or GATTI) are required.' });
    }
    try {
      const result = await withTransaction(pool, async (client) => {
        const date = await currentBusinessDate(client);
        const ratesResult = await client.query('SELECT * FROM daily_gold_rates WHERE rate_date = $1', [date]);
        if (!ratesResult.rows.length) throw new FinanceError(409, 'Save today’s gold rates before recording a purchase.');
        const rates = ratesResult.rows[0];
        const actualUnits = parseWeight(actualWeight, 'actual_weight_grams');
        let fineWeight;
        let payout;
        let appliedRate;
        if (category === '999') {
          const calculation = calculate999Purchase(actualWeight, rates.rate_999_buy);
          fineWeight = calculation.fineWeightGrams;
          payout = calculation.payout;
          appliedRate = rates.rate_999_buy;
        } else {
          const calculation = calculateGattiPurchase(actualWeight, touch, rates.rate_fine_gatti_buy);
          fineWeight = calculation.fineWeightGrams;
          payout = calculation.payout;
          appliedRate = rates.rate_fine_gatti_buy;
        }
        const customer = await client.query('SELECT customer_id FROM customers WHERE customer_id = $1', [customerId]);
        if (!customer.rows.length) throw new FinanceError(404, 'Customer not found.');
        const inventoryRow = await lockInventory(client);
        const nextInventory = addInventory(
          inventoryRow,
          actualUnits,
          BigInt(fineWeight.replace('.', '')),
          parseMoneyCents(payout)
        );
        const voucherNumber = `PUR-${crypto.randomBytes(13).toString('hex')}`;
        const inserted = await client.query(
          `INSERT INTO purchase_vouchers
             (voucher_number, customer_id, purchase_date, category, actual_weight_grams,
              touch_percentage, fine_weight_grams, applied_rate_per_gram, total_payout_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [voucherNumber, customerId, date, category, formatWeight(actualUnits),
            category === 'GATTI' ? touch : null, fineWeight, appliedRate, payout]
        );
        await saveInventory(client, nextInventory);
        await postCashEntry(client, {
          date, direction: 'OUTFLOW', amount: payout, paymentMode: 'CASH',
          sourceType: 'PURCHASE', sourceId: inserted.rows[0].voucher_id,
          description: `Gold purchase ${voucherNumber}`,
        });
        return inserted.rows[0];
      });
      return res.status(201).json({ voucher: result });
    } catch (error) {
      if (error instanceof FinanceError) return res.status(error.status).json({ error: error.message });
      if (error instanceof TypeError) return res.status(400).json({ error: error.message });
      if (error instanceof RangeError) return res.status(422).json({ error: error.message });
      console.error('Purchase transaction failed:', error.message);
      return res.status(500).json({ error: 'Could not record the purchase.' });
    }
  });

  return router;
}

function formatWeight(units) {
  return `${units / 10000n}.${String(units % 10000n).padStart(4, '0')}`;
}

module.exports = { createPurchasesRouter };
