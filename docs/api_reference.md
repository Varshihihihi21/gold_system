# API reference

The backend listens on `PORT`, defaulting to `4000`. Routes are registered by `backend/server.js` and implemented in `backend/auth-routes.js` and `backend/routes/`. Apply [the consolidated database setup](../backend/database_setup.sql) before deploying; do not also run the older auth/finance scripts when using it. The development frontend defaults to `http://localhost:4000`; a packaged Electron build requires `VITE_API_BASE_URL` to use HTTPS.

## Authentication and common requirements

`POST /api/auth/device-challenge` and `POST /api/auth/device-login` are public. Every other route is mounted behind device authentication and requires both:

- `Authorization` — set its value to the `Bearer` scheme followed by the JWT returned by device login.
- `x-device-guid: <device-guid>` — must match the device identifier inside the token, and the device must still be active in the database.

The Electron main process stores an Ed25519 private key encrypted with the OS credential facility. The renderer requests a server challenge; the main process signs it, and login verifies the signature against `authorised_devices.device_public_key`. The database challenge is single-use and expires after 60 seconds. Login issues a 5-minute JWT. Successful protected requests receive a replacement 5-minute token in `X-Access-Token`; the renderer keeps the latest token in React memory. Every protected request checks the active device row, so disabling the license is enforced on its next request.

If login reports a malformed/unsupported key, open **Show device details for administrator provisioning** on that terminal and update `authorised_devices.device_public_key` with the complete displayed Ed25519 public key, including the `BEGIN/END PUBLIC KEY` lines. The key must be SPKI PEM and must come from the same terminal's OS-stored private key. Do not use an example key or a private key.

Protected-route failures use `401` for a missing/invalid/expired token and `403` for a missing device header, device mismatch, or unauthorized/inactive device. Database authorization failures return `500`. All request bodies are JSON. Error response shape is generally `{ "error": "message" }`.

## `POST /api/auth/device-challenge`

Starts a one-time proof-of-possession challenge for an active, provisioned terminal. Requires the schema in `backend/database_setup.sql`.

**Request**

```json
{
  "device_guid": "terminal-device-id"
}
```

**Success — `200`**

```json
{
  "challengeId": "<one-time-id>",
  "challenge": "<base64url-encoded-32-byte-nonce>"
}
```

**Errors:** `400` invalid GUID; `401` device not active or not provisioned; `503` database/authentication service unavailable.

## `POST /api/auth/device-login`

Verifies the one-time signature produced by the Electron main process and issues an access token.

**Request**

```json
{
  "device_guid": "terminal-device-id",
  "challenge_id": "<challengeId from the challenge request>",
  "signature": "<base64 Ed25519 signature>"
}
```

**Success — `200`**

```json
{
  "token": "<signed-jwt, expires in 5 minutes>",
  "device_name": "Counter terminal",
  "device_guid": "terminal-device-id",
  "role": "TERMINAL"
}
```

**Errors:** `400` malformed request; `401` inactive/unprovisioned device or invalid/expired/replayed proof; `503` database/authentication service unavailable.

## `POST /api/gold-rates`

Creates today's initial rates or updates existing rates. Every setup or change requires the separately configured owner PIN/password. Include it in the request body; authorization is independent of whether the active terminal's role is `OWNER` or `TERMINAL`. Each change records all four old/new values, timestamp, owner credential, and terminal in audit records.

**Request**

```json
{
  "rate_999_sell": "7250.00",
  "rate_49_sell": "6800.00",
  "rate_999_buy": "7100.00",
  "rate_fine_gatti_buy": "7000.00",
  "owner_pin": "<owner PIN/password>"
}
```

All rates must be positive decimal strings with at most two decimal places and must fit `DECIMAL(12,2)`.

**Success — `200`:** Returns the inserted or updated `daily_gold_rates` row. Exact response fields/types depend on the database schema.

**Errors:** `400` invalid rates; `403` missing/incorrect PIN; `503` PIN is not configured; `401`/`403` from device authentication; `500` for a database error.

## `GET /api/gold-rates/today`

Returns today's rates. Requires device authentication.

**Success — `200`:** The matching row as JSON, or `null` if no row exists for the current date.

**Errors:** `401`/`403` from authentication; `500` for a database error.

## `GET /api/gold-rates/audit?date=YYYY-MM-DD`

Returns rate changes for the selected date (defaults to the database's current date), including old/new rates, editor device, and timestamp.

## `POST /api/sales/invoices`

Creates an invoice, item rows, customer balance adjustment, weighted-average inventory depletion, owner override audit (if used), and cash inflow in one PostgreSQL transaction.

```json
{
  "customer_id": "<customer UUID>",
  "items": [
    { "category": "49", "actual_weight_grams": "1.0000", "entered_line_total": "6806.80" }
  ],
  "cash_received": "1000.00",
  "owner_override": false,
  "owner_pin": "<required only for a price override>"
}
```

The server uses today's saved rate and calculates the expected line amount. The `49` billed-weight surcharge is only commercial pricing; actual physical grams and the `0.9999` fine-gold equivalent drive stock depletion. The `999` fine-gold factor is `0.9990`. A difference up to one cent is accepted at the calculated total. A larger mismatch returns `422` unless `owner_override` is true and the correct owner PIN is supplied; approved overrides are recorded with expected/charged amounts, owner credential, and terminal. Cash may not exceed the invoice total; the remainder increases customer debt. The API rejects sales exceeding physical or fine-gold inventory.

**Success — `201`:** Returns the invoice, customer name/phone, saved line items, previous balance, current bill, cash paid today, and revised balance. Those fields are used by the printable invoice summary.

## `POST /api/purchases`

Creates a customer purchase voucher and, atomically, adds actual/fine stock, purchase carrying cost, and a cash outflow.

```json
{
  "customer_id": "<customer UUID>",
  "category": "GATTI",
  "actual_weight_grams": "10.0000",
  "touch_percentage": "88.50"
}
```

Category is `999` or `GATTI`. Gatti fine weight is actual weight times touch percentage. The 999 fine-stock factor is `0.9990`; the 999 payout uses actual weight times the 999 buy rate. The schema has no purchase payment-mode field, so purchase payouts are recorded as cash. Success returns the voucher details, which can be printed from the purchase success view.

## `POST /api/expenses`

Records an expense. Body: `{ "category": "OFFICE|HOUSEHOLD", "amount": "50.00", "payment_mode": "CASH|BANK_TRANSFER|UPI|CARD", "description": "..." }`. Only CASH expenses post an outflow to the physical drawer; all categories are persisted for reports.

## Inventory routes

- `GET /api/inventory` returns physical grams, fine-gold grams, inventory carrying cost, and opening setup status.
- `POST /api/inventory/opening` sets the initial balance once and requires the owner PIN/password. Body: `{ "physical_stock_grams": "100.0000", "fine_stock_grams": "99.9000", "inventory_cost_amount": "650000.00", "owner_pin": "<PIN>" }`. It is rejected after opening was configured or purchase/sale activity begins.

## Logbook routes

- `GET /api/logbook/today` returns today's summary and source-linked entries. It creates an empty daily summary when needed, using the most recent closed balance as the opening amount. Posting is blocked if the previous recorded logbook is still open.
- `POST /api/logbook/close` body: `{ "actual_physical_cash": "1234.50", "owner_pin": "<PIN>" }`. Requires the owner PIN/password. It calculates variance as physical count minus calculated close and locks the date. Closed days reject new postings.
- CASH and non-cash transactions create source-linked entries. Only CASH affects drawer totals. A unique partial index on `(source_type, source_reference_id)` prevents a business source from being posted twice.

## `GET /api/analytics/profit?from=YYYY-MM-DD&to=YYYY-MM-DD&include_household=true`

Returns sales revenue, purchase costs, gross/operating/net profit, expense totals, inclusive calendar-day count, and rounded daily average. Gross profit is selected-period sales revenue minus selected-period purchase payouts, per US-11; inventory weighted-average cost is not substituted for those payouts. `include_household=false` leaves household expenses out of net retained profit. Example: `GET /api/analytics/profit?from=2026-05-01&to=2026-05-31&include_household=false`.

## `POST /api/customers`

Registers a customer. Requires device authentication.

**Request**

```json
{
  "full_name": "Asha Rao",
  "phone_number": "5550100",
  "address": "Optional address"
}
```

**Success — `201`:** Returns the inserted customer row.

**Errors:** `400` if the name, phone number, or address has the wrong shape; `401`/`403` from authentication; `409` if the database reports a unique-key violation (used for duplicate phone numbers); `500` for other database errors.

The backend requires non-empty name and phone strings, trims their outer whitespace, and accepts an optional text address. Exact returned fields are database-schema dependent.

## `GET /api/customers/search`

Searches up to ten customers by partial name or phone number. Requires device authentication.

**Parameters**

| Name | Location | Meaning |
|---|---|---|
| `q` | Query string | Partial name or phone-number substring. |
| `phone` | Query string | Legacy alias for a partial name/phone search. |

**Example:** `GET /api/customers/search?q=Asha`

**Success — `200`:** JSON array of at most ten matching customer rows, newest `created_at` first.

**Errors:** `400` if the search query is absent, empty, or too long; `401`/`403` from authentication; `500` for a database error.

## `POST /api/payments`

Records a debt payment and reduces a customer's pending balance inside a database transaction. Requires device authentication.

**Request**

```json
{
  "customer_id": "123",
  "amount_paid": "25.50",
  "payment_mode": "CASH",
  "notes": "Part payment"
}
```

`amount_paid` must be a positive decimal string with at most two decimal places. `payment_mode` is optional and defaults to `CASH`; accepted values are `CASH`, `BANK_TRANSFER`, `UPI`, and `CARD`. Overpayment is permitted and results in a negative customer balance. Only CASH is posted to the physical drawer. Every payment records the database's current date.

**Success — `201`**

```json
{
  "payment": {
    "receipt_number": "RCP-<26 hex characters>",
    "customer_id": "123",
    "amount_paid": "25.5",
    "payment_mode": "CASH",
    "notes": "Part payment"
  },
  "previous_balance": "100.00",
  "updated_balance": "74.50"
}
```

Generated receipt numbers contain 30 characters (`RCP-` plus 26 random hexadecimal characters) to fit the deployed `VARCHAR(30)` column. The payment row's other exact fields and numeric representation depend on PostgreSQL column types.

**Errors:** `400` invalid customer ID, amount, payment mode, or notes; `404` customer not found; `422` resulting balance outside `DECIMAL(12,2)`; `401`/`403` from authentication; `500` transaction/database failure.

## API-wide notes

- CORS uses the backend's exact `CORS_ORIGINS` allowlist. Packaged Electron currently uses the internal `goldline://app` protocol for compatibility; configure only trusted origins.
- No pagination, API version negotiation, or request schema-validation layer is configured.
- Most routes return a user-safe generic database error; server logs include the underlying database error for operators.
