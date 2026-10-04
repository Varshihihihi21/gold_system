const crypto = require('node:crypto');
const express = require('express');
const { calculate999Sale, calculate49Sale, isPriceWithinTolerance } = require('../gold-calculations');
const { parseMoneyCents, formatMoneyCents, MAX_CENTS } = require('../money');
const { parseWeight } = require('../finance/validation');
const { lockInventory, removeInventory, saveInventory } = require('../finance/inventory');
const { currentBusinessDate } = require('../finance/transactions');
const { postCashEntry } = require('../finance/logbook');
const { verifyOwnerPin, recordOwnerAction } = require('../finance/owner-pin');
const { FinanceError } = require('../finance/errors');

function publicAmount(value, label) {
  try {
    return parseMoneyCents(value, label);
  } catch (error) {
    throw new FinanceError(400, error.message);
  }
}

function calculatedLine(item, rates) {
  try {
    if (item.category === '999') return calculate999Sale(item.actual_weight_grams, rates.rate_999_sell);
    if (item.category === '49') return calculate49Sale(item.actual_weight_grams, rates.rate_49_sell);
    throw new FinanceError(400, 'category must be 999 or 49.');
  } catch (error) {
    if (error instanceof FinanceError) throw error;
    throw new FinanceError(400, error.message);
  }
}

/** Create atomic invoice, customer debt, cost-of-goods, stock, and cash posting routes. */
function createSalesRouter(pool) {
  const router = express.Router();

  router.post('/sales/invoices', async (req, res) => {
    const { customer_id: customerId, items, cash_received: cashReceived, owner_override: ownerOverride = false,
      owner_pin: ownerPin } = req.body || {};
    if (typeof customerId !== 'string' || !customerId.trim() || !Array.isArray(items)
        || items.length < 1 || items.length > 20 || typeof ownerOverride !== 'boolean') {
      return res.status(400).json({ error: 'customer_id, 1–20 invoice items, and a boolean owner_override are required.' });
    }

    const client = await pool.connect().catch((error) => {
      console.error('Invoice database connection failed:', error.message);
      return null;
    });
    if (!client) return res.status(503).json({ error: 'Sales service is temporarily unavailable.' });
    let open = false;
    try {
      await client.query('BEGIN');
      open = true;
      const date = await currentBusinessDate(client);
      const ratesResult = await client.query('SELECT * FROM daily_gold_rates WHERE rate_date = $1', [date]);
      if (!ratesResult.rows.length) throw new FinanceError(409, 'Save today’s gold rates before creating an invoice.');
      const rates = ratesResult.rows[0];
      const lines = [];
      const savedItems = [];
      let ownerUserId = null;
      let totalCents = 0n;

      for (const item of items) {
        const expected = calculatedLine(item, rates);
        let actualWeight;
        try {
          actualWeight = parseWeight(item.actual_weight_grams);
        } catch (error) {
          throw new FinanceError(400, error.message);
        }
        const expectedCents = parseMoneyCents(expected.lineTotal);
        const enteredCents = item.entered_line_total === undefined
          ? expectedCents
          : publicAmount(item.entered_line_total, 'entered_line_total');
        if (enteredCents <= 0n) throw new FinanceError(400, 'entered_line_total must be greater than zero.');
        const differs = !isPriceWithinTolerance(expected.lineTotal, formatMoneyCents(enteredCents));
        if (differs && !ownerOverride) {
          throw new FinanceError(422, `Price mismatch for ${item.category}. Expected: ${expected.lineTotal}. Please verify milligrams.`);
        }
        if (differs && ownerUserId === null) ownerUserId = await verifyOwnerPin(client, ownerPin);
        const billedCents = differs ? enteredCents : expectedCents;
        totalCents += billedCents;
        lines.push({
          category: item.category,
          actualWeight: formatWeightUnits(actualWeight),
          billedWeight: expected.billedWeightGrams,
          fineWeight: expected.fineWeightGrams,
          rate: rates[item.category === '999' ? 'rate_999_sell' : 'rate_49_sell'],
          expectedCents,
          billedCents,
          differs,
        });
      }
      if (totalCents > MAX_CENTS) throw new FinanceError(422, 'Invoice total exceeds DECIMAL(12,2).');
      const cashCents = publicAmount(cashReceived, 'cash_received');
      if (cashCents > totalCents) throw new FinanceError(400, 'cash_received cannot exceed the invoice total.');

      const customer = await client.query(
        'SELECT full_name, phone_number, pending_balance FROM customers WHERE customer_id = $1 FOR UPDATE',
        [customerId]
      );
      if (!customer.rows.length) throw new FinanceError(404, 'Customer not found.');
      const previous = parseMoneyCents(customer.rows[0].pending_balance);
      const pending = totalCents - cashCents;
      if (previous + pending > MAX_CENTS) throw new FinanceError(422, 'Updated customer balance exceeds DECIMAL(12,2).');

      let inventory = await lockInventory(client);
      for (const line of lines) {
        let result;
        try {
          result = removeInventory(inventory, BigInt(line.actualWeight.replace('.', '')), BigInt(line.fineWeight.replace('.', '')));
        } catch (error) {
          if (error instanceof RangeError) throw new FinanceError(409, error.message);
          throw error;
        }
        line.costBasisCents = result.costOfGoodsSold;
        inventory = {
          ...inventory,
          physical_stock_grams: formatWeightUnits(result.physical),
          fine_stock_grams: formatWeightUnits(result.fine),
          inventory_cost_amount: formatMoneyCents(result.cost),
          physical: result.physical,
          fine: result.fine,
          cost: result.cost,
        };
      }

      const invoiceNumber = `INV-${crypto.randomBytes(13).toString('hex')}`;
      const invoice = await client.query(
        `INSERT INTO sales_invoices
           (invoice_number, customer_id, invoice_date, total_amount, cash_received, pending_amount_added)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [invoiceNumber, customerId, date, formatMoneyCents(totalCents), formatMoneyCents(cashCents), formatMoneyCents(pending)]
      );
      for (const line of lines) {
        const inserted = await client.query(
          `INSERT INTO sales_invoice_items
             (invoice_id, category, actual_weight_grams, billed_weight_grams, applied_rate_per_gram,
              line_total, fine_weight_grams, cost_basis_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [invoice.rows[0].invoice_id, line.category, line.actualWeight, line.billedWeight, line.rate,
            formatMoneyCents(line.billedCents), line.fineWeight, formatMoneyCents(line.costBasisCents)]
        );
        savedItems.push(inserted.rows[0]);
        if (line.differs) {
          await client.query(
            `INSERT INTO sales_price_overrides
               (invoice_id, item_id, owner_device_id, owner_user_id, expected_amount, charged_amount)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [invoice.rows[0].invoice_id, inserted.rows[0].item_id, req.user.device_id, ownerUserId,
              formatMoneyCents(line.expectedCents), formatMoneyCents(line.billedCents)]
          );
        }
      }
      await client.query('UPDATE customers SET pending_balance = $1 WHERE customer_id = $2',
        [formatMoneyCents(previous + pending), customerId]);
      await saveInventory(client, inventory);
      if (cashCents > 0n) await postCashEntry(client, {
        date, direction: 'INFLOW', amount: formatMoneyCents(cashCents), paymentMode: 'CASH',
        sourceType: 'SALE', sourceId: invoice.rows[0].invoice_id, description: `Invoice ${invoiceNumber}`,
      });
      if (ownerUserId) {
        await recordOwnerAction(client, {
          ownerUserId,
          deviceId: req.user.device_id,
          action: 'SALES_PRICE_OVERRIDE',
          referenceId: invoice.rows[0].invoice_id,
          details: { overridden_items: lines.filter((line) => line.differs).length },
        });
      }
      await client.query('COMMIT');
      open = false;
      return res.status(201).json({
        invoice: invoice.rows[0],
        customer_name: customer.rows[0].full_name,
        customer_phone: customer.rows[0].phone_number,
        items: savedItems,
        previous_balance: formatMoneyCents(previous),
        current_bill: formatMoneyCents(totalCents),
        cash_paid_today: formatMoneyCents(cashCents),
        updated_balance: formatMoneyCents(previous + pending),
      });
    } catch (error) {
      if (open) await client.query('ROLLBACK').catch((rollbackError) => console.error('Invoice rollback failed:', rollbackError.message));
      console.error('Invoice transaction failed:', error);
      if (error instanceof FinanceError) return res.status(error.status).json({ error: error.message });
      if (error instanceof TypeError || error instanceof RangeError) return res.status(400).json({ error: error.message });
      return res.status(500).json({ error: 'Could not record the invoice.' });
    } finally {
      client.release();
    }
  });

  return router;
}

function formatWeightUnits(units) {
  const weightUnits = BigInt(units);
  return `${weightUnits / 10000n}.${String(weightUnits % 10000n).padStart(4, '0')}`;
}

module.exports = { createSalesRouter };
