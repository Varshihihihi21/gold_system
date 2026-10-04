const express = require('express');

/** Create customer registration and name, phone, or ID search API routes. */
function createCustomersRouter(pool) {
  const router = express.Router();

  router.post('/customers', async (req, res) => {
    const { full_name: fullName, phone_number: phoneNumber, address } = req.body || {};
    if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 200
        || typeof phoneNumber !== 'string' || !phoneNumber.trim() || phoneNumber.trim().length > 15
        || (address !== undefined && typeof address !== 'string')) {
      return res.status(400).json({ error: 'full_name (1–200 characters) and phone_number (1–15 characters) are required; address must be text.' });
    }
    try {
      const result = await pool.query(
        'INSERT INTO customers (full_name, phone_number, address) VALUES ($1, $2, $3) RETURNING *',
        [fullName.trim(), phoneNumber.trim(), address || null]
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Phone number already registered' });
      console.error('Customer creation failed:', err.message);
      return res.status(500).json({ error: 'Could not register the customer.' });
    }
  });

  router.get('/customers/search', async (req, res) => {
    const search = req.query.q ?? req.query.phone;
    if (typeof search !== 'string' || !search.trim() || search.trim().length > 200) {
      return res.status(400).json({ error: 'A non-empty search query of at most 200 characters is required.' });
    }
    try {
      const result = await pool.query(
        `SELECT * FROM customers
         WHERE phone_number LIKE $1 OR full_name ILIKE $1 OR customer_id::text LIKE $1
         ORDER BY created_at DESC LIMIT 10`,
        [`%${search.trim()}%`]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error('Customer search failed:', err.message);
      return res.status(500).json({ error: 'Could not search customers.' });
    }
  });

  return router;
}

module.exports = { createCustomersRouter };
