# Feature guide

This guide describes the implemented terminal workflows. The live schema and migration prerequisites are documented in [live_schema.md](./live_schema.md); API contracts and examples are in [api_reference.md](./api_reference.md).

## 1. Device sign-in and protected access

**What it does:** The desktop terminal proves possession of its registered Ed25519 private key without sending that key to the renderer or server. The server verifies a single-use challenge against the public key in `authorised_devices` and returns a 5-minute token.

**Implementation:**

- `frontend/electron/main.cjs`: encrypted OS credential storage, challenge signing, isolated memory-only Chromium session, and receipt-print IPC.
- `frontend/electron/preload.cjs`: narrow context-isolated bridge; no Node APIs are exposed to the renderer.
- `frontend/src/App.jsx`: challenge/login calls, in-memory token state, and session clearing.
- `frontend/src/pages/LoginPage.jsx`: accessible sign-in and public-key display for administrator provisioning.
- `backend/auth-routes.js`, `backend/device-auth.js`, and `backend/device-middleware.js`: one-time challenge, signature verification, token rotation, and active-device checks.
- `backend/device_auth_schema.sql`: manual public-key and challenge-table schema addition.

**Inputs and outputs:**

- Input to challenge route: `{ "device_guid": "..." }`; login includes the returned challenge ID and Ed25519 signature.
- Success: `{ "token": "...", "device_name": "...", "device_guid": "...", "role": "TERMINAL|OWNER" }`.
- Login fails if the public key is not provisioned, the device is inactive, or the 60-second challenge is invalid, expired, or already consumed.
- Protected calls send a bearer token and `x-device-guid`; each successful response returns a new 5-minute token in `X-Access-Token`.

**Edge cases and limitations:**

- `GOLD_DEVICE_GUID` is configured per terminal; the OS-protected private key persists encrypted in the OS user's application-data folder. No customer or transaction data is stored there.
- The token is held only in React state. Refreshing the page requires a new challenge/login.
- The server checks the device's active license state on every protected request; `401`/`403` clears the renderer session and Chromium storage.
- Packaged Electron disables DevTools, uses context isolation/sandboxing, and clears an in-memory session partition on startup, sign-out, and exit.
- Standard OS printer-driver printing is available over IPC. The OS spooler may retain temporary print data; this is an owner-approved exception to the no-disk rule.
- Process memory, OS paging/crash dumps, and privileged inspection cannot be fully controlled by Electron and require host policy.

**Connections:** Every `/api` route except the challenge and login routes is behind this middleware. The frontend does not show the gold-terminal modules until it has a token.

## 2. Daily gold rates

**What it does:** Sets today's four gold rates. An OWNER-authorized device must approve changes after the first save; rate changes record old/new values, time, and editor, and saved rates feed sale/purchase calculations.

**Implementation:**

- `frontend/src/pages/RatesPage.jsx`: loads today's row, manages rate form state, validates values, and submits changes.
- `backend/routes/gold-rates.js`: rate read/write and audit routes. Mid-day changes require `role='OWNER'`.

**Inputs and outputs:**

- Rate fields: `rate_999_sell`, `rate_49_sell`, `rate_999_buy`, and `rate_fine_gatti_buy`.
- The write uses `CURRENT_DATE`; a per-day PostgreSQL advisory lock serializes concurrent changes.
- Success returns the inserted/updated database row. The today lookup returns the row or JSON `null` when none exists.

**Edge cases and limitations:**

- The page submits decimal strings; the server rejects missing, non-positive, excess-scale, and out-of-range values. Initial setup is allowed for an authenticated terminal; subsequent changes require an OWNER terminal.
- Database failures return a generic `500` message; server-side logs contain the database error message.
- The rates view loads today's existing row before enabling the form. A GET failure is shown separately from the no-rates-saved state.

**Connections:** Rates are read by the invoice and purchase APIs in their transaction, so a transaction uses the saved rates for its database business date.

## 3. Customer registration

**What it does:** Creates a customer record with a name, phone number, and optional address.

**Implementation:**

- `frontend/src/pages/CustomersPage.jsx`: registration form, validation, status messages, and customer search results.
- `backend/routes/customers.js`: `POST /api/customers`.

**Inputs and outputs:**

- Input: `{ "full_name": "...", "phone_number": "...", "address": "..." }`.
- Success: HTTP `201` with the database row.
- Duplicate phone: HTTP `409` with `Phone number already registered`.
- Other database errors: HTTP `500`.

**Edge cases and limitations:**

- Both frontend and backend require non-empty name and phone strings; the backend trims leading/trailing whitespace but does not normalize phone-number formats.
- The duplicate-number behavior assumes a database uniqueness constraint that is not defined in this repository.
- After successful creation the form is cleared and the generated customer ID is shown.

**Connections:** Customer records can be found by the phone search and are referenced by payments using `customer_id`.

## 4. Customer name/phone search and debt lookup

**What it does:** Finds up to ten customers whose name or phone contains the entered text, ordered newest first. The finance picker also displays the selected customer's current pending balance.

**Implementation:**

- `frontend/src/hooks/useCustomerSearch.js`: shared 300 ms debounced request and search states.
- `frontend/src/pages/CustomersPage.jsx` and `frontend/src/pages/PaymentsPage.jsx`: labeled phone search and results.
- `backend/routes/customers.js`: `GET /api/customers/search`.

**Inputs and outputs:**

- Query parameter: `q` (or legacy `phone`), matched as a phone substring or case-insensitive name substring.
- Success: a JSON array of customer rows; each shown result includes name, phone, balance, and a Select button.
- Database errors: HTTP `500`.

**Edge cases and limitations:**

- Results are fetched after the operator pauses typing for 300 ms; the query is URI-encoded.
- The backend returns `400` if the query is absent, empty, or longer than 200 characters.
- An empty result array displays no customer list or dedicated “no results” message.

**Connections:** Selecting a result supplies its `customer_id` to billing, purchase, or debt-payment workflows.

## 5. Debt payment

**What it does:** Records a payment against one customer's pending balance. The backend wraps the payment insert and balance update in a PostgreSQL transaction and locks the customer row while processing.

**Implementation:**

- `frontend/src/pages/PaymentsPage.jsx`: customer selection, payment form validation, submission, and receipt feedback.
- `backend/routes/payments.js`: `POST /api/payments`.

**Inputs and outputs:**

- Input: `{ "customer_id": "...", "amount_paid": "...", "payment_mode": "CASH", "notes": "..." }`.
- Supported modes: `CASH`, `BANK_TRANSFER`, `UPI`, and `CARD`. If omitted, the backend defaults to `CASH`.
- Success: HTTP `201` with a `payment` row, `previous_balance`, and `updated_balance`, with balances formatted to two decimal places.
- The browser displays the returned receipt number and new balance, then clears the payment form.

**Edge cases and limitations:**

- If the customer is not found, the backend rolls back and returns `404`.
- The backend rejects non-positive or malformed amounts, unsupported payment modes, and notes longer than 1,000 characters. Overpayment is permitted and can produce a negative balance. CASH payments post a logbook inflow in the same transaction; non-cash modes do not affect drawer totals.
- Receipt numbers use `RCP-` plus 26 random hexadecimal characters, fitting the database's `VARCHAR(30)` column. A unique-key collision or other transaction error is logged and returned as `500`.
- Database errors trigger a rollback and return `500`.

**Connections:** The payment record references a customer and adjusts `pending_balance`; the same transaction adds a source-linked CASH inflow to the daily logbook when applicable.

## 6. Sales billing and validation

Billing creates a customer invoice with one or more `999`/`49` line items. The server—not the UI preview—recalculates each line using today's locked rates and exact integer math. It compares entered prices to the expected amount with a one-cent tolerance. A larger difference blocks submission unless the caller is an OWNER device and sets `owner_override`; every overridden line records both prices and the owner device. Cash received must not exceed the invoice total; the remainder increases customer debt. Only cash actually received is posted to the drawer. Sale, balance, stock cost, override, and logbook changes share one database transaction.

**Implementation:** `frontend/src/pages/SalesPage.jsx`, `frontend/src/financial-math.js`, `backend/routes/sales.js`, and `backend/finance/inventory.js`. A `49` surcharge changes billed weight for pricing only. Physical stock decreases by actual weight; fine stock uses the confirmed factor in [live_schema.md](./live_schema.md).

## 7. Purchases and inventory

The purchase screen records customer gold buybacks. `999` payout uses actual grams and the 999 buy rate; Gatti payout uses touch-adjusted fine grams and the fine-Gatti rate. A successful purchase creates a voucher, increases weighted-average inventory cost, adds physical/fine stock, and posts cash outflow atomically. The owner-only opening-stock screen is a one-time setup allowed before transaction activity.

**Implementation:** `frontend/src/pages/PurchasesPage.jsx`, `backend/routes/purchases.js`, `backend/routes/inventory.js`, and `backend/finance/inventory.js`.

## 8. Expenses

The expense screen classifies withdrawals as `OFFICE` or `HOUSEHOLD`, accepts the database's cash/bank/UPI/card modes, and records the expense. Only CASH reduces drawer totals. Both categories are retained for profit reporting.

**Implementation:** `frontend/src/pages/ExpensesPage.jsx` and `backend/routes/expenses.js`.

## 9. Cash logbook and close

The logbook combines opening cash with source-linked inflows and outflows. Its opening value is the prior recorded day's calculated closing balance. Posting on a day whose previous recorded logbook is open is blocked. An OWNER-authorized device enters the physical drawer count at close; variance is physical minus calculated cash, and the closed day rejects later CASH postings.

**Implementation:** `frontend/src/pages/LogbookPage.jsx`, `backend/routes/logbook.js`, and `backend/finance/logbook.js`.

## 10. Profit analytics

Analytics reports sales revenue, weighted-average cost of gold sold, gross profit, office expenses, operating profit, household expenses, net retained profit, and average profit per operating date. The household toggle controls whether household expenses reduce net retained profit. Historic invoice items without cost basis make profit unavailable for the selected range rather than being treated as free gold.

**Implementation:** `frontend/src/pages/AnalyticsPage.jsx` and `backend/routes/analytics.js`. Operating days means dates with at least one sale, purchase, debt payment, or expense.

## 11. Shared frontend request and status handling

The shared `apiRequest` helper in `frontend/src/api.js` adds JSON content type and the device header to API calls, and adds the bearer token after sign-in. If a response is not successful, it reads the JSON `error` and raises an error for the calling action to display. A protected request rejected with `401` or `403` clears the local session and returns the operator to device sign-in. Form values are kept in React memory only; navigating away from a page or signing out discards unsaved values.

The helper does not set a timeout or automatically retry. The API URL defaults to `http://localhost:4000` and may be configured with `VITE_API_BASE_URL`.
