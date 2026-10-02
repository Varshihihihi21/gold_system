const express = require('express');
const { formatMoneyCents, parseMoneyCents } = require('../money');
const { parseScaled, formatScaled } = require('../finance/validation');
const { lockInventory, assertInventoryBounds } = require('../finance/inventory');
const { withTransaction } = require('../finance/transactions');
const { FinanceError } = require('../finance/errors');

/** Create inventory balance and one-time owner opening-stock routes. */
function createInventoryRouter(pool) {
  const router = express.Router();

  router.get('/inventory', async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM inventory_balances WHERE balance_id = 1');
      return res.json(result.rows[0] || {
        physical_stock_grams: '0.0000',
        fine_stock_grams: '0.0000',
        inventory_cost_amount: '0.00',
        opening_configured: false,
      });
    } catch (error) {
      console.error('Inventory read failed:', error.message);
      return res.status(500).json({ error: 'Could not load inventory.' });
    }
  });

  router.post('/inventory/opening', async (req, res) => {
    if (req.user.role !== 'OWNER') return res.status(403).json({ error: 'An OWNER-authorized terminal is required.' });
    const { physical_stock_grams: physicalValue, fine_stock_grams: fineValue, inventory_cost_amount: costValue } = req.body || {};
    try {
      const physical = parseWeightAllowZero(physicalValue, 'physical_stock_grams');
      const fine = parseWeightAllowZero(fineValue, 'fine_stock_grams');
      const cost = parseMoneyCents(costValue, 'inventory_cost_amount');
      assertInventoryBounds(physical, fine, cost);
      if (fine > physical) throw new FinanceError(400, 'fine_stock_grams cannot exceed physical_stock_grams.');
      if (fine === 0n && cost > 0n) throw new FinanceError(400, 'Inventory cost requires positive fine-gold stock.');
      const inventory = await withTransaction(pool, async (client) => {
        const row = await lockInventory(client);
        if (row.opening_configured || row.has_activity) {
          throw new FinanceError(409, 'Opening inventory can only be configured once, before stock activity.');
        }
        const result = await client.query(
          `UPDATE inventory_balances
           SET physical_stock_grams = $1, fine_stock_grams = $2,
               inventory_cost_amount = $3, opening_configured = TRUE, updated_at = NOW()
           WHERE balance_id = 1 RETURNING *`,
          [formatScaled(physical, 4), formatScaled(fine, 4), formatMoneyCents(cost)]
        );
        return result.rows[0];
      });
      return res.status(201).json({ inventory });
    } catch (error) {
      if (error instanceof FinanceError) return res.status(error.status).json({ error: error.message });
      if (error instanceof TypeError || error instanceof RangeError) return res.status(400).json({ error: error.message });
      console.error('Opening inventory update failed:', error.message);
      return res.status(500).json({ error: 'Could not configure opening inventory.' });
    }
  });

  return router;
}

function parseWeightAllowZero(value, label) {
  return parseScaled(value, 4, label);
}

module.exports = { createInventoryRouter };
