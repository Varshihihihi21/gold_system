const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { createAuthRouter } = require('./auth-routes');
const { createDeviceMiddleware } = require('./device-middleware');
const { createGoldRatesRouter } = require('./routes/gold-rates');
const { createCustomersRouter } = require('./routes/customers');
const { createPaymentsRouter } = require('./routes/payments');
const { createSalesRouter } = require('./routes/sales');
const { createPurchasesRouter } = require('./routes/purchases');
const { createExpensesRouter } = require('./routes/expenses');
const { createLogbookRouter } = require('./routes/logbook');
const { createAnalyticsRouter } = require('./routes/analytics');
const { createInventoryRouter } = require('./routes/inventory');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured with a strong, unique value before the API can start.');
}

const app = express();
const jwtSecret = process.env.JWT_SECRET;
const tokenTtl = '5m';
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,goldline://app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(cors({
  exposedHeaders: ['X-Access-Token'],
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use('/api/auth', createAuthRouter(pool, jwtSecret, tokenTtl));
app.use('/api', createDeviceMiddleware(pool, jwtSecret, tokenTtl));
app.use('/api', createGoldRatesRouter(pool));
app.use('/api', createCustomersRouter(pool));
app.use('/api', createPaymentsRouter(pool));
app.use('/api', createSalesRouter(pool));
app.use('/api', createPurchasesRouter(pool));
app.use('/api', createExpensesRouter(pool));
app.use('/api', createLogbookRouter(pool));
app.use('/api', createAnalyticsRouter(pool));
app.use('/api', createInventoryRouter(pool));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Kalash Gold API listening on port ${port}`));
