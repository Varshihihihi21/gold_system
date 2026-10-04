const { formatMoneyCents, parseMoneyCents, MAX_CENTS } = require('../money');
const { formatScaled, roundRatio } = require('./validation');

const MAX_WEIGHT_UNITS = 999999999999n;

/** Load and lock the single weighted-average inventory balance. */
async function lockInventory(client) {
  await client.query('INSERT INTO inventory_balances (balance_id) VALUES (1) ON CONFLICT (balance_id) DO NOTHING');
  const result = await client.query('SELECT * FROM inventory_balances WHERE balance_id = 1 FOR UPDATE');
  return result.rows[0];
}

/** Add a purchase to physical stock, fine-gold stock, and weighted-average cost. */
function addInventory(inventory, physicalUnits, fineUnits, costCents) {
  const physical = BigInt(inventory.physical_stock_grams.replace('.', ''));
  const fine = BigInt(inventory.fine_stock_grams.replace('.', ''));
  const cost = parseMoneyCents(inventory.inventory_cost_amount, 'Inventory cost');
  const nextPhysical = physical + physicalUnits;
  const nextFine = fine + fineUnits;
  const nextCost = cost + costCents;
  assertInventoryBounds(nextPhysical, nextFine, nextCost);
  return { physical: nextPhysical, fine: nextFine, cost: nextCost };
}

/** Allocate weighted-average cost and remove actual and fine stock for a sale. */
function removeInventory(inventory, physicalUnits, fineUnits) {
  physicalUnits = BigInt(physicalUnits);
  fineUnits = BigInt(fineUnits);
  const physical = BigInt(inventory.physical_stock_grams.replace('.', ''));
  const fine = BigInt(inventory.fine_stock_grams.replace('.', ''));
  const cost = parseMoneyCents(inventory.inventory_cost_amount, 'Inventory cost');
  if (physical < physicalUnits || fine < fineUnits) throw new RangeError('Insufficient gold inventory for this sale.');
  if (fine === 0n && cost !== 0n) throw new Error('Inventory cost exists without fine-gold stock.');
  const costCents = fineUnits === fine
    ? cost
    : fine === 0n ? 0n : roundRatio(cost * fineUnits, fine);
  const nextPhysical = physical - physicalUnits;
  const nextFine = fine - fineUnits;
  const nextCost = cost - costCents;
  assertInventoryBounds(nextPhysical, nextFine, nextCost);
  return { physical: nextPhysical, fine: nextFine, cost: nextCost, costOfGoodsSold: costCents };
}

/** Persist the locked inventory's new totals in the active business transaction. */
async function saveInventory(client, inventory) {
  await client.query(
    `UPDATE inventory_balances
     SET physical_stock_grams = $1, fine_stock_grams = $2,
         inventory_cost_amount = $3, has_activity = TRUE, updated_at = NOW()
     WHERE balance_id = 1`,
    [formatScaled(inventory.physical, 4), formatScaled(inventory.fine, 4), formatMoneyCents(inventory.cost)]
  );
}

function assertInventoryBounds(physical, fine, cost) {
  if (physical < 0n || fine < 0n || physical > MAX_WEIGHT_UNITS || fine > MAX_WEIGHT_UNITS) {
    throw new RangeError('Inventory weight exceeds DECIMAL(12,4).');
  }
  if (fine > physical) throw new RangeError('Fine-gold stock cannot exceed physical stock.');
  if (cost < 0n || cost > MAX_CENTS) throw new RangeError('Inventory cost exceeds DECIMAL(12,2).');
  if (fine === 0n && cost !== 0n) throw new RangeError('Inventory cost cannot exist without fine-gold stock.');
}

module.exports = { lockInventory, addInventory, removeInventory, saveInventory, assertInventoryBounds };
