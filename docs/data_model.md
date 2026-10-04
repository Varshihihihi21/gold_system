# Data model and data flow

## Schema source and implementation status

The owner-supplied ER diagram is documented in [database_schema.md](./database_schema.md). Live public-table columns, enum values, and constraints were later confirmed using Neon metadata and are summarized in [live_schema.md](./live_schema.md). The consolidated current schema is [database_setup.sql](../backend/database_setup.sql); it must be applied manually and is not run by the application.

The backend now implements daily rates and audit, customer search by name/phone, sales, buyback purchases, debt payments, expenses, inventory valuation, cash logbook, day close, and profit analytics. Confirmed decimal types and enums are documented in [live_schema.md](./live_schema.md).

## Entities

“User-facing” indicates business records operators are expected to view or enter. “Internal” indicates system-control or generated accounting records.

### `authorised_devices` — internal authorization (owner-provided DDL)

The database and backend use the table name `authorised_devices`, matching the owner-provided DDL.

| Field | Type | Key / meaning |
|---|---|---|
| `device_id` | UUID | Primary key; defaults to `uuid_generate_v4()`. |
| `device_guid` | VARCHAR(100) | Required and unique device identifier; not a secret or sufficient proof of identity. |
| `device_name` | VARCHAR(200) | Optional terminal name returned by the login route. |
| `role` | VARCHAR(50) | Required; defaults to `TERMINAL`. |
| `device_public_key` | TEXT | Added as a manual deployment step; Ed25519 public key in SPKI PEM format. Login rejects devices without it. |
| `is_active` | BOOLEAN | Required; defaults to true and checked by authentication middleware. |
| `last_login_at` | TIMESTAMP WITH TIME ZONE | Updated after a successful challenge-response login. |
| `first_authorized_at` | TIMESTAMP WITH TIME ZONE | Required; defaults to the current time. |
| `created_at`, `updated_at` | TIMESTAMP WITH TIME ZONE | Required; default to the current time. The shown DDL does not define automatic update behavior for `updated_at`. |

The supplied SQL creates indexes for GUID, active rows (partial index), and role. The unique constraint on `device_guid` may make the separate GUID index redundant. It requires `uuid_generate_v4()` to be available. The seed's `ON CONFLICT (device_id)` does not handle a GUID collision under a different device ID.

The original owner DDL is a reference, not a migration. The current setup includes `device_public_key` and the challenge table. Device login uses a one-time challenge and Ed25519 proof, then issues 5-minute JWTs that are replaced in the response header after each authenticated API request. Every API request also checks the device's active database status. The private key is encrypted with Electron `safeStorage`; this intentionally persists only the OS-protected device credential, not customer or transaction data.

### `daily_gold_rates` — user-facing

| Field | Type | Key / meaning |
|---|---|---|
| `rate_id` | UUID | Primary key. |
| `rate_date` | DATE | Unique business date. |
| `rate_999_sell` | DECIMAL | 999 sell rate. |
| `rate_49_sell` | DECIMAL | 49 sell rate. |
| `rate_999_buy` | DECIMAL | 999 buy rate. |
| `rate_fine_gatti_buy` | DECIMAL | Fine Gatti buy rate. |
| `created_at` | TIMESTAMP | Creation time. |
| `updated_at` | TIMESTAMP | Last update time. |

The API currently upserts these four rates by `rate_date`, which matches the supplied unique key.

### `daily_gold_rates_audit` — internal audit history

| Field | Type | Key / meaning |
|---|---|---|
| `audit_id` | UUID | Primary key. |
| `rate_id` | UUID | Foreign key to `daily_gold_rates.rate_id`. |
| `old_rate_999_sell`, `new_rate_999_sell` | DECIMAL | Before/after 999 sell rate. |
| `old_rate_49_sell`, `new_rate_49_sell` | DECIMAL | Before/after 49 sell rate. |
| `changed_by` | VARCHAR | Identity of the person who made the change. |
| `changed_at` | TIMESTAMP | Time of the change. |

The original live audit entity lacked old/new values for `rate_999_buy` or `rate_fine_gatti_buy`. The current schema adds those columns and rate edits write all four before/after pairs.

### `customers` — user-facing

| Field | Type | Key / meaning |
|---|---|---|
| `customer_id` | UUID | Primary key. |
| `full_name` | VARCHAR | Customer name. |
| `phone_number` | VARCHAR | Unique phone number. |
| `address` | TEXT | Customer address. |
| `pending_balance` | DECIMAL | Current outstanding balance. |
| `created_at`, `updated_at` | TIMESTAMP | Creation and last-update times. |

### `sales_invoices` — user-facing

| Field | Type | Key / meaning |
|---|---|---|
| `invoice_id` | UUID | Primary key. |
| `invoice_number` | VARCHAR | Unique invoice number. |
| `customer_id` | UUID | Foreign key to `customers.customer_id`. |
| `invoice_date` | DATE | Business date. |
| `total_amount` | DECIMAL | Invoice total. |
| `cash_received` | DECIMAL | Cash collected for this invoice. |
| `pending_amount_added` | DECIMAL | Additional debt created by this invoice. |
| `created_at` | TIMESTAMP | Creation time. |

### `sales_invoice_items` — user-facing invoice details

| Field | Type | Key / meaning |
|---|---|---|
| `item_id` | UUID | Primary key. |
| `invoice_id` | UUID | Foreign key to `sales_invoices.invoice_id`. |
| `category` | `gold_category` | `999` or `49`. |
| `actual_weight_grams` | DECIMAL | Measured weight. |
| `billed_weight_grams` | DECIMAL | Weight used for the price calculation. |
| `applied_rate_per_gram` | DECIMAL | Rate used for this line. |
| `line_total` | DECIMAL | Final line price. |
| `fine_weight_grams` | DECIMAL(12,4) | Inventory fine-gold equivalent used for stock and cost allocation. |
| `cost_basis_amount` | DECIMAL(12,2), nullable | Weighted-average carrying cost allocated to this sale; legacy unknown values remain NULL. |

### `purchase_vouchers` — user-facing

| Field | Type | Key / meaning |
|---|---|---|
| `voucher_id` | UUID | Primary key. |
| `voucher_number` | VARCHAR | Unique voucher number. |
| `customer_id` | UUID | Foreign key to `customers.customer_id`. |
| `purchase_date` | DATE | Business date. |
| `category` | `purchase_category` | `999` or `GATTI`. |
| `actual_weight_grams` | DECIMAL | Measured item weight. |
| `touch_percentage` | DECIMAL | Purity percentage, where applicable. |
| `fine_weight_grams` | DECIMAL | Pure-gold weight derived from weight and touch. |
| `applied_rate_per_gram` | DECIMAL | Rate used for payout. |
| `total_payout_amount` | DECIMAL | Amount paid to customer. |
| `created_at` | TIMESTAMP | Creation time. |

### `debt_payments` — user-facing

| Field | Type | Key / meaning |
|---|---|---|
| `payment_id` | UUID | Primary key. |
| `receipt_number` | VARCHAR | Unique receipt number. |
| `customer_id` | UUID | Foreign key to `customers.customer_id`. |
| `payment_date` | DATE | Business date. |
| `amount_paid` | DECIMAL | Payment amount. |
| `payment_mode` | `payment_mode` | `CASH`, `BANK_TRANSFER`, `UPI`, or `CARD`. |
| `notes` | TEXT | Optional operator note. |
| `created_at` | TIMESTAMP | Creation time. |

### `expenses` — user-facing

| Field | Type | Key / meaning |
|---|---|---|
| `expense_id` | UUID | Primary key. |
| `expense_date` | DATE | Business date. |
| `category` | `expense_category` | `OFFICE` or `HOUSEHOLD`. |
| `amount` | DECIMAL | Expense amount. |
| `payment_mode` | `payment_mode` | `CASH`, `BANK_TRANSFER`, `UPI`, or `CARD`. |
| `description` | VARCHAR | Expense description. |
| `created_at` | TIMESTAMP | Creation time. |

### `daily_logbook_summaries` — internal daily reconciliation

| Field | Type | Key / meaning |
|---|---|---|
| `logbook_id` | UUID | Primary key. |
| `log_date` | DATE | Unique business date. |
| `opening_balance` | DECIMAL | Cash at the beginning of the day. |
| `total_inflows` | DECIMAL | Sum of cash coming in. |
| `total_outflows` | DECIMAL | Sum of cash going out. |
| `calculated_closing_balance` | DECIMAL | Opening + inflows - outflows. |
| `actual_physical_cash` | DECIMAL | Cash counted at close. |
| `cash_variance` | DECIMAL | Difference between actual and calculated cash. |
| `is_closed` | BOOLEAN | Whether the day is locked. |
| `closed_at` | TIMESTAMP | Time the day was closed. |

### `logbook_entries` — internal cash-flow entries

| Field | Type | Key / meaning |
|---|---|---|
| `entry_id` | UUID | Primary key. |
| `log_date` | DATE | Business date of the entry. |
| `entry_type` | `entry_type` | `INFLOW` or `OUTFLOW`. |
| `amount` | DECIMAL | Amount posted. |
| `payment_mode` | `payment_mode` | `CASH`, `BANK_TRANSFER`, `UPI`, or `CARD`. |
| `source_type` | `source_type` | `SALE`, `PURCHASE`, `DEBT_PAYMENT`, or `EXPENSE`. |
| `source_reference_id` | UUID | Identifier of the source record. |
| `description` | VARCHAR | Human-readable entry description. |
| `created_at` | TIMESTAMP | Creation time. |

`source_reference_id` is a polymorphic reference in the supplied model: it can point at different source tables depending on `source_type`. The ER model does not specify database-enforced foreign keys for it.

### `owner_pin_credentials` and `owner_action_audit` — internal authorization audit

`owner_pin_credentials` stores one owner identity, a random salt, and a scrypt password hash. The plain PIN/password is not stored. Each owner-only action receives that PIN and writes an immutable `owner_action_audit` row containing the action, credential ID, terminal ID, optional business reference, JSON details, and timestamp. This is not a full user-account system.

### `inventory_balances` — internal singleton stock and valuation

Contains the row with `balance_id = 1`: physical grams, fine-gold equivalent grams, total carrying cost, and flags for one-time opening setup/activity. Sale and purchase transactions lock this row while calculating weighted-average inventory cost. In a normal database the installer creates an empty row; owner PIN authorization is required to record verified opening stock before sales.

### `sales_price_overrides` — internal owner-override audit

Each mismatched invoice line approved with the owner PIN records the invoice, item, owner credential, terminal, formula amount, charged amount, and timestamp. An owner override is not a replacement for normal formula validation.

## Relationships

- One daily rate row may have multiple immutable audit records.
- The singleton owner PIN credential may authorize many immutable owner action audit records and price overrides.
- A customer may have multiple sales invoices, purchase vouchers, and debt payments.
- A sales invoice contains one or more invoice items.
- A sale invoice, purchase voucher, debt payment, or expense may have one corresponding logbook entry (optional one-to-zero-or-one as drawn).
- A daily logbook summary is unique per date. The supplied diagram does not draw a direct relationship from summaries to entries; `log_date` is the apparent grouping key.

The diagram reflects the current application schema. Check the actual Neon catalog after setup; a source SQL file does not prove that it has been applied to a particular database.

## Existing API-to-schema data flow

1. Device login looks up an active terminal in the `authorised_devices` table. That internal table is not included in the supplied business ER diagram.
2. `GET /api/gold-rates/today` reads the row for the current date from `daily_gold_rates`.
3. Daily rate edits write four-rate audit rows. Sale/purchase transactions read the current database-date rates.
4. Customer creation/search reads and writes `customers` by phone/name.
5. Billing writes invoices/items, adjusts customer balance, consumes weighted-average stock, and posts actual cash received to the logbook atomically.
6. Purchases write vouchers, add weighted-average inventory and post the cash payout as an outflow atomically.
7. Debt payments adjust customer balance and expenses persist their category. Both create source-linked logbook entries for all modes, but only CASH changes physical drawer totals.
8. Logbook close stores physical cash and variance and locks further postings for the date. Analytics subtracts selected-period purchase payouts from sales revenue, then OFFICE costs and (optionally) HOUSEHOLD costs; the daily average uses inclusive calendar days. No dedicated invoice/purchase/expense history endpoints currently exist.

## Known schema/API alignment questions

- The device-auth and finance support tables are not shown in the original business ERD; their definitions are in the consolidated schema.
- The current code permits debt-payment overpayment, which can result in a negative pending balance.
- Live enum labels, numeric scales, and nullability are recorded in [live_schema.md](./live_schema.md).
- The polymorphic logbook source has no cross-table foreign key; a partial unique index prevents duplicate non-null source entries.

See [questions.md](./questions.md) for project-level decisions, [diagrams/database_schema.mmd](./diagrams/database_schema.mmd) for the complete ER source, and [the owner-provided source](./database_schema.md) for a literal schema reference.
