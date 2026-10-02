# API reference

The backend listens on `PORT`, defaulting to `4000`. The routes below are implemented in `backend/server.js`. The frontend currently uses `http://localhost:4000` directly.

## Authentication and common requirements

`POST /api/auth/device-login` is public. Every other route is mounted behind device authentication and requires both:

- `Authorization` — set its value to the `Bearer` scheme followed by the JWT returned by device login.
- `x-device-guid: <device-guid>` — must match the device identifier inside the token, and the device must still be active in the database.

Protected-route failures from middleware use `401` for a missing/invalid/expired token and `403` for a missing device header, device mismatch, or unauthorized/inactive device. Database failures inside the middleware are also returned as `401` by its current catch block.

All request bodies are JSON. Error response shape is generally `{ "error": "message" }`.

## `POST /api/auth/device-login`

Authenticates a registered, active terminal.

**Request**

```json
{
  "device_guid": "terminal-device-id"
}
```

**Success — `200`**

```json
{
  "token": "<signed-jwt>",
  "device_name": "Counter terminal"
}
```

**Errors:** `400` if `device_guid` is missing; `401` if no active matching device exists; `500` on a database error.

## `POST /api/gold-rates`

Creates or updates the rates for the database's current date. Requires device authentication.

**Request**

```json
{
  "rate_999_sell": 0,
  "rate_49_sell": 0,
  "rate_999_buy": 0,
  "rate_fine_gatti_buy": 0
}
```

The zeroes are placeholders; use the actual numeric rates. The current code does not validate the values.

**Success — `200`:** Returns the inserted or updated `daily_gold_rates` row. Exact response fields/types depend on the database schema.

**Errors:** `401`/`403` from authentication; `500` for a database error.

## `GET /api/gold-rates/today`

Returns today's rates. Requires device authentication.

**Success — `200`:** The matching row as JSON, or `null` if no row exists for the current date.

**Errors:** `401`/`403` from authentication; `500` for a database error.

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

**Errors:** `401`/`403` from authentication; `409` if the database reports a unique-key violation (used for duplicate phone numbers); `500` for other database errors.

The backend relies on the database for required-field validation. Exact returned fields are database-schema dependent.

## `GET /api/customers/search`

Searches customers by a partial phone number. Requires device authentication.

**Parameters**

| Name | Location | Meaning |
|---|---|---|
| `phone` | Query string | Phone-number substring to search for. |

**Example:** `GET /api/customers/search?phone=55501`

**Success — `200`:** JSON array of at most ten matching customer rows, newest `created_at` first.

**Errors:** `401`/`403` from authentication; `500` for a database error. The route does not validate a missing `phone` parameter.

## `POST /api/payments`

Records a debt payment and reduces a customer's pending balance inside a database transaction. Requires device authentication.

**Request**

```json
{
  "customer_id": "123",
  "amount_paid": 25.5,
  "payment_mode": "CASH",
  "notes": "Part payment"
}
```

`payment_mode` is optional and defaults to `CASH`. The UI offers `CASH`, `BANK_TRANSFER`, and `CHEQUE`.

**Success — `201`**

```json
{
  "payment": {
    "receipt_number": "RCP-<timestamp>-<random-number>",
    "customer_id": "123",
    "amount_paid": "25.5",
    "payment_mode": "CASH",
    "notes": "Part payment"
  },
  "previous_balance": "100.00",
  "updated_balance": "74.50"
}
```

The payment row's exact fields and numeric representation depend on PostgreSQL column types. The receipt format shown is illustrative.

**Errors:** `401`/`403` from authentication; `500` if the customer is not found or a transaction/database operation fails. The current route does not have dedicated `400` validation for invalid or out-of-range amounts.

## API-wide notes

- CORS is enabled with reflected origins (`origin: true`) and credentials.
- No pagination, API version negotiation, or request schema-validation layer is configured.
- Routes return database error messages in their JSON `error` fields in several handlers.
