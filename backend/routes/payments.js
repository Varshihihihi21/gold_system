const crypto = require('node:crypto');
const express = require('express');
const { parseMoneyCents, formatMoneyCents, MAX_CENTS } = require('../money');
const { currentBusinessDate } = require('../finance/transactions');
const { postCashEntry } = require('../finance/logbook');

function createReceiptNumber() {
  return `RCP-${crypto.randomBytes(13).toString('hex')}`;
}

/** Create atomic debt-payment and customer-balance API routes. */
function createPaymentsRouter(pool) {
  const router = express.Router();

  router.post('/payments', async (req, res) => {
    const { customer_id: customerId, amount_paid: amountPaid, payment_mode: paymentMode = 'CASH', notes = '' } = req.body || {};
    let amountCents;
    try {
      if (typeof customerId !== 'string' || !customerId.trim()) {
        return res.status(400).json({ error: 'customer_id is required.' });
      }
      amountCents = parseMoneyCents(amountPaid, 'amount_paid');
      if (amountCents <= 0n) return res.status(400).json({ error: 'amount_paid must be greater than zero.' });
      if (!['CASH', 'BANK_TRANSFER', 'UPI', 'CARD'].includes(paymentMode)) {
        return res.status(400).json({ error: 'payment_mode must be CASH, BANK_TRANSFER, UPI, or CARD.' });
      }
      if (typeof notes !== 'string' || notes.length > 1000) {
        return res.status(400).json({ error: 'notes must be text no longer than 1000 characters.' });
      }
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('Payment database connection failed:', err.message);
      return res.status(503).json({ error: 'Payment service is temporarily unavailable.' });
    }
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const customer = await client.query(
        'SELECT pending_balance FROM customers WHERE customer_id = $1 FOR UPDATE',
        [customerId]
      );
      if (!customer.rows.length) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(404).json({ error: 'Customer not found.' });
      }
      const oldBalance = parseMoneyCents(customer.rows[0].pending_balance ?? '0.00', 'Customer balance', {
        allowSigned: true,
      });
      const newBalance = oldBalance - amountCents;
      if (newBalance > MAX_CENTS || newBalance < -MAX_CENTS) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(422).json({ error: 'Updated customer balance exceeds DECIMAL(12,2).' });
      }
      const receiptNumber = createReceiptNumber();
      const paymentDate = await currentBusinessDate(client);
      const payment = await client.query(
        `INSERT INTO debt_payments (receipt_number, customer_id, payment_date, amount_paid, payment_mode, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [receiptNumber, customerId, paymentDate, formatMoneyCents(amountCents), paymentMode, notes]
      );
      await client.query('UPDATE customers SET pending_balance = $1 WHERE customer_id = $2', [
        formatMoneyCents(newBalance), customerId,
      ]);
      await postCashEntry(client, {
        date: paymentDate,
        direction: 'INFLOW',
        amount: formatMoneyCents(amountCents),
        paymentMode,
        sourceType: 'DEBT_PAYMENT',
        sourceId: payment.rows[0].payment_id,
        description: `Debt payment ${receiptNumber}`,
      });
      await client.query('COMMIT');
      transactionOpen = false;
      return res.status(201).json({
        payment: payment.rows[0],
        previous_balance: formatMoneyCents(oldBalance),
        updated_balance: formatMoneyCents(newBalance),
      });
    } catch (err) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Payment rollback failed:', rollbackError.message);
        }
      }
      console.error('Payment transaction failed:', err.message);
      return res.status(err.status || 500).json({ error: err.status ? err.message : 'Could not record the payment.' });
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = { createPaymentsRouter, createReceiptNumber };
