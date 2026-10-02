const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./db');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured with a strong, unique value before the API can start.');
}

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
}));
app.use(express.json());

// Hardware Verification Middleware
async function authenticateDevice(req, res, next) {
  const authHeader = req.headers.authorization;
  const deviceGuidHeader = req.headers['x-device-guid'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing access token' });
  }
  if (!deviceGuidHeader) {
    return res.status(403).json({ error: 'x-device-guid header required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.device_guid !== deviceGuidHeader) {
      return res.status(403).json({ error: 'Device hardware mismatch' });
    }

    const deviceResult = await pool.query(
      'SELECT is_active FROM authorized_devices WHERE device_guid = $1',
      [deviceGuidHeader]
    );

    if (deviceResult.rows.length === 0 || !deviceResult.rows[0].is_active) {
      return res.status(403).json({ error: 'Device not authorized' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

// 1. AUTH & DEVICE LOGIN
app.post('/api/auth/device-login', async (req, res) => {
  const { device_guid } = req.body;
  if (!device_guid) {
    return res.status(400).json({ error: 'device_guid is required' });
  }

  try {
    const deviceRes = await pool.query(
      'SELECT * FROM authorized_devices WHERE device_guid = $1 AND is_active = true',
      [device_guid]
    );

    if (deviceRes.rows.length === 0) {
      return res.status(401).json({ error: 'Device not registered or inactive' });
    }

    const token = jwt.sign(
      { device_id: deviceRes.rows[0].device_id, device_guid, role: 'TERMINAL' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, device_name: deviceRes.rows[0].device_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protected Endpoints Below
app.use('/api', authenticateDevice);

// 2. DAILY GOLD RATES
app.post('/api/gold-rates', async (req, res) => {
  const { rate_999_sell, rate_49_sell, rate_999_buy, rate_fine_gatti_buy } = req.body;
  try {
    const query = `
      INSERT INTO daily_gold_rates (rate_date, rate_999_sell, rate_49_sell, rate_999_buy, rate_fine_gatti_buy)
      VALUES (CURRENT_DATE, $1, $2, $3, $4)
      ON CONFLICT (rate_date) DO UPDATE SET
        rate_999_sell = EXCLUDED.rate_999_sell,
        rate_49_sell = EXCLUDED.rate_49_sell,
        rate_999_buy = EXCLUDED.rate_999_buy,
        rate_fine_gatti_buy = EXCLUDED.rate_fine_gatti_buy
      RETURNING *;
    `;
    const result = await pool.query(query, [rate_999_sell, rate_49_sell, rate_999_buy, rate_fine_gatti_buy]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/gold-rates/today', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM daily_gold_rates WHERE rate_date = CURRENT_DATE');
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CUSTOMER MANAGEMENT
app.post('/api/customers', async (req, res) => {
  const { full_name, phone_number, address } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO customers (full_name, phone_number, address) VALUES ($1, $2, $3) RETURNING *`,
      [full_name, phone_number, address]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/search', async (req, res) => {
  const { phone } = req.query;
  try {
    const result = await pool.query(
      `SELECT * FROM customers WHERE phone_number LIKE $1 ORDER BY created_at DESC LIMIT 10`,
      [`%${phone}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DEBT PAYMENTS (ACID TRANSACTION)
app.post('/api/payments', async (req, res) => {
  const client = await pool.connect();
  const { customer_id, amount_paid, payment_mode, notes } = req.body;

  try {
    await client.query('BEGIN');
    
    const custRes = await client.query('SELECT pending_balance FROM customers WHERE customer_id = $1 FOR UPDATE', [customer_id]);
    if (custRes.rows.length === 0) throw new Error('Customer not found');

    const currentBalance = parseFloat(custRes.rows[0].pending_balance);
    const newBalance = currentBalance - parseFloat(amount_paid);
    const receiptNum = `RCP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const paymentRes = await client.query(
      `INSERT INTO debt_payments (receipt_number, customer_id, amount_paid, payment_mode, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [receiptNum, customer_id, amount_paid, payment_mode || 'CASH', notes]
    );

    await client.query('UPDATE customers SET pending_balance = $1 WHERE customer_id = $2', [newBalance, customer_id]);
    await client.query('COMMIT');

    res.status(201).json({
      payment: paymentRes.rows[0],
      previous_balance: currentBalance.toFixed(2),
      updated_balance: newBalance.toFixed(2),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Sprint 1 Backend Running on port ${PORT}`));