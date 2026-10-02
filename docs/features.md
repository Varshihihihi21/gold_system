# Feature guide

This guide describes behavior that is present in the code, not a promise that every business rule is complete. “API” means the backend's HTTP interface: the URLs the frontend calls to request or change information.

## 1. Device sign-in and protected access

**What it does:** The initial screen asks the operator to authenticate the terminal. The browser sends the device identifier to the backend. The backend checks that the identifier is present and active in `authorized_devices`, then returns a signed token that expires after 12 hours.

**Implementation:**

- `frontend/src/api.js`: configured `DEVICE_GUID` and shared authenticated request helper.
- `frontend/src/App.jsx`: device-login request and in-memory session state.
- `frontend/src/pages/LoginPage.jsx`: accessible sign-in experience, loading state, and API error display.
- `backend/server.js`: `POST /api/auth/device-login` and `authenticateDevice`.

**Inputs and outputs:**

- Input: `{ "device_guid": "..." }`.
- Success: `{ "token": "...", "device_name": "..." }`.
- Failure: `400` if the identifier is missing; `401` if the device is unknown/inactive; other login database errors return `500`.
- Protected calls send the token as a bearer token and the device identifier in `x-device-guid`.

**Edge cases and limitations:**

- The frontend's device identifier is fixed in source code; it is not read from device hardware.
- The token is held only in React state. Refreshing the page requires signing in again.
- The frontend returns to device sign-in if a protected request receives `401` or `403`; there is no backend logout/revocation endpoint.
- The backend verifies that the token's `device_guid` equals the header and checks that the database still marks the device active.
- The middleware's broad `try/catch` also converts database lookup failures into the same `401` response used for invalid/expired tokens.
- The backend has a source-code fallback JWT secret if `JWT_SECRET` is unset. Set a unique, strong secret in real deployments.

**Connections:** Every `/api` route except device login is behind this middleware. The frontend does not show the gold-terminal modules until it has a token.

## 2. Daily gold rates

**What it does:** Lets the operator save four rates for the current database date and retrieve the saved row for today.

**Implementation:**

- `frontend/src/pages/RatesPage.jsx`: loads today's row, manages rate form state, validates values, and submits changes.
- `backend/server.js`: `POST /api/gold-rates` and `GET /api/gold-rates/today`.

**Inputs and outputs:**

- Rate fields: `rate_999_sell`, `rate_49_sell`, `rate_999_buy`, and `rate_fine_gatti_buy`.
- The write uses `CURRENT_DATE`. If a row for that date already exists, it updates that row; this relies on a unique constraint or primary key for `rate_date`.
- Success returns the inserted/updated database row. The today lookup returns the row or JSON `null` when none exists.

**Edge cases and limitations:**

- The page marks each rate field required and accepts numeric input with a step of `0.01`, but the server does not validate that values exist, are positive, or are within business limits.
- Database errors are returned as `500` with an error message.
- The rates view loads today's existing row before enabling the form. A GET failure is shown separately from the no-rates-saved state.

**Connections:** Rate information is stored independently of customers and payments. No automatic calculations using rates are implemented in the inspected code.

## 3. Customer registration

**What it does:** Creates a customer record with a name, phone number, and optional address.

**Implementation:**

- `frontend/src/pages/CustomersPage.jsx`: registration form, validation, status messages, and customer search results.
- `backend/server.js`: `POST /api/customers`.

**Inputs and outputs:**

- Input: `{ "full_name": "...", "phone_number": "...", "address": "..." }`.
- Success: HTTP `201` with the database row.
- Duplicate phone: HTTP `409` with `Phone number already registered`.
- Other database errors: HTTP `500`.

**Edge cases and limitations:**

- The browser requires a name and phone number, but the backend itself does not validate required fields or normalize phone numbers.
- The duplicate-number behavior assumes a database uniqueness constraint that is not defined in this repository.
- After successful creation the form is cleared and the generated customer ID is shown.

**Connections:** Customer records can be found by the phone search and are referenced by payments using `customer_id`.

## 4. Customer phone search

**What it does:** Finds up to ten customers whose phone number contains the entered text, ordered newest first.

**Implementation:**

- `frontend/src/hooks/useCustomerSearch.js`: shared 300 ms debounced request and search states.
- `frontend/src/pages/CustomersPage.jsx` and `frontend/src/pages/PaymentsPage.jsx`: labeled phone search and results.
- `backend/server.js`: `GET /api/customers/search`.

**Inputs and outputs:**

- Query parameter: `phone`, used as a substring rather than an exact phone match.
- Success: a JSON array of customer rows; each shown result includes name, phone, balance, and a Select button.
- Database errors: HTTP `500`.

**Edge cases and limitations:**

- Results are fetched after the operator pauses typing for 300 ms; the query is URI-encoded.
- The backend does not check that `phone` was supplied. The intended use is to provide a phone substring.
- An empty result array displays no customer list or dedicated “no results” message.

**Connections:** Selecting a result copies its `customer_id` into the payment form.

## 5. Debt payment

**What it does:** Records a payment against one customer's pending balance. The backend wraps the payment insert and balance update in a PostgreSQL transaction and locks the customer row while processing.

**Implementation:**

- `frontend/src/pages/PaymentsPage.jsx`: customer selection, payment form validation, submission, and receipt feedback.
- `backend/server.js`: `POST /api/payments`.

**Inputs and outputs:**

- Input: `{ "customer_id": "...", "amount_paid": "...", "payment_mode": "CASH", "notes": "..." }`.
- Supported UI modes: `CASH`, `BANK_TRANSFER`, and `CHEQUE`. If omitted, the backend defaults to `CASH`.
- Success: HTTP `201` with a `payment` row, `previous_balance`, and `updated_balance`, with balances formatted to two decimal places.
- The browser displays the returned receipt number and new balance, then clears the payment form.

**Edge cases and limitations:**

- If the customer is not found, the backend rolls back and currently returns `500` with `Customer not found`.
- The backend subtracts `amount_paid` directly from the balance; no server-side check prevents a negative amount, a payment larger than the balance, or an invalid payment mode.
- The unique receipt format is assembled by the application from the current time and a random four-digit number; no retry is implemented for a collision.
- Database errors trigger a rollback and return `500`.

**Connections:** The payment record references a customer and adjusts that customer's `pending_balance`. No gold-rate calculations or invoice/sale records are involved in this payment endpoint.

## 6. Shared frontend request and status handling

The shared `apiRequest` helper in `frontend/src/api.js` adds JSON content type and the device header to API calls, and adds the bearer token after sign-in. If a response is not successful, it reads the JSON `error` and raises an error for the calling action to display. A protected request rejected with `401` or `403` clears the local session and returns the operator to device sign-in. Form values are kept in React memory only; navigating away from a page or signing out discards unsaved values.

The helper does not set a timeout or automatically retry. The API URL defaults to `http://localhost:4000` and may be configured with `VITE_API_BASE_URL`.
