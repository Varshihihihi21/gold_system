# Live PostgreSQL schema notes

**Source:** Read-only `information_schema` and PostgreSQL enum queries supplied from the Neon SQL Editor on 2026-10-02. No database connection or data rows were accessed by this documentation task.

This is the observed `public` schema contract used to implement the finance routes. Monetary columns use `NUMERIC(12,2)` and weight columns use `NUMERIC(12,4)` except where listed. `NULL` and defaults below reflect the metadata query.

## Tables and columns

- **`authorised_devices`**: `device_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `device_guid VARCHAR(100) NOT NULL`; `device_name VARCHAR(200) NULL`; `role VARCHAR(50) NOT NULL DEFAULT 'TERMINAL'`; `is_active BOOLEAN NOT NULL DEFAULT true`; `last_login_at TIMESTAMPTZ NULL`; `first_authorized_at`, `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`; `device_public_key TEXT NULL`.
- **`device_auth_challenges`**: `challenge_id VARCHAR(43) NOT NULL`; `device_id UUID NOT NULL`; `nonce BYTEA NOT NULL`; `expires_at TIMESTAMPTZ NOT NULL`.
- **`customers`**: `customer_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `full_name VARCHAR(200) NOT NULL`; `phone_number VARCHAR(15) NOT NULL`; `address TEXT NULL`; `pending_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00`; `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- **`daily_gold_rates`**: `rate_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `rate_date DATE NOT NULL`; four `NUMERIC(12,2) NOT NULL` rates (`rate_999_sell`, `rate_49_sell`, `rate_999_buy`, `rate_fine_gatti_buy`); `created_at`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- **`daily_gold_rates_audit`**: `audit_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `rate_id UUID NOT NULL`; old/new 999 sell and 49 sell `NUMERIC(12,2) NULL`; `changed_by VARCHAR(100) NOT NULL`; `changed_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- **`sales_invoices`**: `invoice_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `invoice_number VARCHAR(30) NOT NULL`; `customer_id UUID NOT NULL`; `invoice_date DATE NOT NULL`; `total_amount`, `cash_received`, `pending_amount_added NUMERIC(12,2) NOT NULL` (`cash_received` and `pending_amount_added` default to zero); `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- **`sales_invoice_items`**: `item_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `invoice_id UUID NOT NULL`; `category gold_category NOT NULL`; `actual_weight_grams`, `billed_weight_grams NUMERIC(12,4) NOT NULL`; `applied_rate_per_gram`, `line_total NUMERIC(12,2) NOT NULL`.
- **`purchase_vouchers`**: `voucher_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `voucher_number VARCHAR(30) NOT NULL`; `customer_id UUID NOT NULL`; `purchase_date DATE NOT NULL`; `category purchase_category NOT NULL`; `actual_weight_grams NUMERIC(12,4) NOT NULL`; `touch_percentage NUMERIC(5,2) NULL`; `fine_weight_grams NUMERIC(12,4) NULL`; `applied_rate_per_gram`, `total_payout_amount NUMERIC(12,2) NOT NULL`; `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- **`debt_payments`**: `payment_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `receipt_number VARCHAR(30) NOT NULL`; `customer_id UUID NOT NULL`; `payment_date DATE NOT NULL`; `amount_paid NUMERIC(12,2) NOT NULL`; `payment_mode payment_mode NOT NULL`; `notes TEXT NULL`; `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- **`expenses`**: `expense_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `expense_date DATE NOT NULL`; `category expense_category NOT NULL`; `amount NUMERIC(12,2) NOT NULL`; `payment_mode payment_mode NOT NULL`; `description VARCHAR(500) NULL`; `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- **`daily_logbook_summary`**: `logbook_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `log_date DATE NOT NULL`; opening, inflow, outflow, calculated closing, physical cash, and variance `NUMERIC(12,2)` (physical cash and variance nullable; inflows/outflows default to zero); `is_closed BOOLEAN NOT NULL DEFAULT false`; `closed_at TIMESTAMPTZ NULL`.
- **`logbook_entries`**: `entry_id UUID NOT NULL DEFAULT uuid_generate_v4()`; `log_date DATE NOT NULL`; `entry_type entry_type NOT NULL`; `amount NUMERIC(12,2) NOT NULL`; `payment_mode payment_mode NOT NULL`; `source_type source_type NOT NULL`; `source_reference_id UUID NULL`; `description VARCHAR(500) NULL`; `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

## Observed keys and relationships

- Primary keys: each table uses its named ID column, except `device_auth_challenges`, whose primary key is `challenge_id`.
- Unique keys: `authorised_devices.device_guid`, `customers.phone_number`, `daily_gold_rates.rate_date`, `daily_logbook_summary.log_date`, `sales_invoices.invoice_number`, `purchase_vouchers.voucher_number`, and `debt_payments.receipt_number`.
- Foreign keys: rate audit to daily rates; sales invoices to customers; invoice items to sales invoices; purchase vouchers and debt payments to customers; and challenges to `authorised_devices`.
- `logbook_entries` had no observed foreign key or unique source-reference constraint. The added migration installs a unique partial index on `(source_type, source_reference_id)` where the reference is not null, after checking for existing duplicates.

## Enum labels supplied from Neon

| Type | Values |
|---|---|
| `entry_type` | `INFLOW`, `OUTFLOW` |
| `expense_category` | `OFFICE`, `HOUSEHOLD` |
| `gold_category` | `999`, `49` |
| `payment_mode` | `CASH`, `BANK_TRANSFER`, `UPI`, `CARD` |
| `purchase_category` | `999`, `GATTI` |
| `source_type` | `SALE`, `PURCHASE`, `DEBT_PAYMENT`, `EXPENSE` |

## Current code's page-to-database map

All API calls require an authenticated active device except the two challenge/login calls. The schema stores amounts as `NUMERIC(12,2)` and weights as `NUMERIC(12,4)`; the backend calculates with scaled integers.

| UI page | API operations | Tables read/written |
|---|---|---|
| Sign in | `POST /api/auth/device-challenge`, `POST /api/auth/device-login` | `authorised_devices`, `device_auth_challenges` |
| Daily rates | `GET /api/gold-rates/today`, `GET /api/gold-rates/audit`, `POST /api/gold-rates` | `daily_gold_rates`, `daily_gold_rates_audit`, `authorised_devices` |
| Customers | `POST /api/customers`, `GET /api/customers/search?q=` | `customers` |
| Billing | customer search, rates lookup, `POST /api/sales/invoices` | `customers`, `daily_gold_rates`, `sales_invoices`, `sales_invoice_items`, `inventory_balances`, `sales_price_overrides`, `daily_logbook_summaries`, `logbook_entries` |
| Purchases | customer search, rates/inventory lookup, `POST /api/purchases`, `POST /api/inventory/opening` | `customers`, `daily_gold_rates`, `purchase_vouchers`, `inventory_balances`, `daily_logbook_summaries`, `logbook_entries`, `authorised_devices` |
| Debt payments | customer search, `POST /api/payments` | `customers`, `debt_payments`, `daily_logbook_summaries`, `logbook_entries` |
| Expenses | `POST /api/expenses` | `expenses`, `daily_logbook_summaries`, `logbook_entries` |
| Logbook | `GET /api/logbook/today`, `POST /api/logbook/close` | `daily_logbook_summaries`, `logbook_entries`, `authorised_devices` |
| Analytics | `GET /api/analytics/profit?from=&to=` | `sales_invoice_items`, `sales_invoices`, `purchase_vouchers`, `expenses`, `debt_payments` |

**Important current limitation:** Billing, purchase, and expense screens submit records but the code does not expose dedicated invoice-history, purchase-history, or expense-history list/read endpoints. Analytics and the daily logbook provide aggregate/recent cash views, not full transaction browsing. Missing history in those screens is therefore an API/UI capability gap, not necessarily missing database rows.

## Current consolidated setup additions

`backend/database_setup.sql` is the canonical schema for the current backend, not the older owner-supplied ERD. In addition to the observed base records above, it creates or extends:

- `owner_pin_credentials(credential_id, owner_user_id, owner_name, pin_salt, pin_hash, created_at, updated_at)`: one configurable owner identity; the plaintext PIN is never stored.
- `owner_action_audit(owner_action_id, owner_user_id, device_id, action, reference_id, details, created_at)`: immutable history for rate setup/change, sale-price overrides, opening inventory, and day close.
- `inventory_balances(balance_id, physical_stock_grams, fine_stock_grams, inventory_cost_amount, opening_configured, has_activity, updated_at)`: singleton current inventory projection.
- `sales_price_overrides(override_id, invoice_id, item_id, owner_device_id, owner_user_id, expected_amount, charged_amount, created_at)`: immutable price-override detail.
- Added sale fine-weight and optional historical cost-basis fields; all four rate before/after pairs and owner identity on rate audit; support indexes and a unique partial logbook source index. The setup renames observed `daily_logbook_summary` to `daily_logbook_summaries`.
- Numeric checks for positive rates, weights, payments, and expenses, plus database triggers that reject UPDATE/DELETE on audit records.

Owner-protected actions require a separately provisioned PIN/password at every action. After applying the schema, run `node set-owner-pin.js` from `backend/`. There is no person-level account/login table: audit rows identify the singleton PIN credential and authorized terminal.

### Device login public-key provisioning

The terminal's **Show device details for administrator provisioning** panel displays a PEM public key. Copy the entire value (including both header/footer lines) for the matching `device_guid` into `authorised_devices.device_public_key`. It must be that terminal's Ed25519 SubjectPublicKeyInfo (SPKI) public key; never paste a private key or a sample from another terminal.

If a key was stored as one line containing literal `\n` sequences, normalize it first:

```sql
UPDATE authorised_devices
SET device_public_key = replace(device_public_key, E'\\n', E'\n'),
    updated_at = NOW()
WHERE device_guid = 'PASTE_THE_EXACT_DEVICE_GUID';
```

If that does not fix the problem, replace it with the current full key copied from the terminal:

```sql
INSERT INTO authorised_devices (device_guid, device_name, role, is_active, device_public_key)
VALUES (
    'PASTE_THE_EXACT_DEVICE_GUID',
    'Kalash Gold login test terminal',
    'TERMINAL',
    TRUE,
    $ed25519_public_key$
-----BEGIN PUBLIC KEY-----
PASTE_THE_COMPLETE_PUBLIC_KEY_BODY_HERE
-----END PUBLIC KEY-----$ed25519_public_key$
)
ON CONFLICT (device_guid) DO UPDATE
SET device_name = EXCLUDED.device_name,
    is_active = TRUE,
    device_public_key = EXCLUDED.device_public_key,
    updated_at = NOW();
```

Replace both placeholders with the exact GUID and complete public key shown by the terminal; do not run this template unchanged. For a login test, configure `GOLD_DEVICE_GUID` to that same GUID. Verify the intended row after updating:

```sql
SELECT device_guid, is_active,
       left(device_public_key, 26) AS key_header,
       right(trim(device_public_key), 24) AS key_footer
FROM authorised_devices
WHERE device_guid = 'PASTE_THE_EXACT_DEVICE_GUID';
```

The `kalash_gold_smoke_test` fixture intentionally seeds its terminal as disabled with no public key. It is schema-only test data, not a usable login. Use the real key displayed by the terminal or generate a separate disposable terminal/key pair for a login test.

## Apply the schema the current code requires

The consolidated script [database_setup.sql](../backend/database_setup.sql) is the authoritative setup for the current backend. It can create the schema on a new database and adds known auth/finance requirements to an existing database matching the supplied live schema. In normal databases it creates a zero inventory singleton but does not set business opening stock. Smoke fixtures are inserted only when the database name is exactly `kalash_gold_smoke_test`.

For the reported error `relation "inventory_balances" does not exist`, the finance schema was not installed in the database/schema currently selected by the backend. Back up first, run `database_setup.sql` in the Neon database that matches `PGHOST` and `PGDATABASE`, then verify that `current_schema()` is `public`. Restarting the backend alone cannot create that table.

Do not run the consolidated script alongside the two older incremental scripts below. `device_auth_schema.sql` and migration 001 remain for historical/reference use. The consolidated script does not resolve arbitrary schema drift: existing base tables created with different columns, types, keys, or constraints need a targeted migration after inspection. It checks enum values and aborts if source duplicates would make the exactly-once index unsafe.

Before applying to an existing database, check for duplicate logbook sources (this is read-only):

```sql
SELECT source_type, source_reference_id, COUNT(*) AS occurrences
FROM logbook_entries
WHERE source_reference_id IS NOT NULL
GROUP BY source_type, source_reference_id
HAVING COUNT(*) > 1;
```

If rows are returned, inspect them and determine which entries are correct before changing anything. Do not blindly delete accounting entries. The script uses PostgreSQL's built-in `gen_random_uuid()` and requests `pg_trgm` for customer substring search. Confirm the SQL Editor role can create/use that extension and that the backend role has schema usage plus required table privileges.

Run these read-only checks in the same Neon database:

```sql
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_user AS database_user;

SELECT required.table_name,
       to_regclass(format('%I.%I', current_schema(), required.table_name)) AS relation
FROM (VALUES
  ('authorised_devices'), ('device_auth_challenges'),
  ('daily_gold_rates'), ('daily_gold_rates_audit'), ('customers'),
  ('sales_invoices'), ('sales_invoice_items'), ('purchase_vouchers'),
  ('debt_payments'), ('expenses'), ('daily_logbook_summaries'),
  ('logbook_entries'), ('inventory_balances'), ('sales_price_overrides')
) AS required(table_name)
ORDER BY required.table_name;

SELECT * FROM inventory_balances WHERE balance_id = 1;
```

Every relation result should be non-null, and the last query should return one zeroed inventory row in a normal database before you enter one-time verified opening stock through the PIN-protected app screen. If `inventory_balances` exists in Neon but the backend still logs this error, check that the backend is pointed at that exact Neon project/database and that its PostgreSQL search path includes `public`. Never paste database passwords or connection strings into chat.

## Finance additions included in the consolidated schema

For reference, [migration 001](../backend/migrations/001_financial_workflows.sql) contained these additive finance changes; all are included in `database_setup.sql`:

- Adds the buy-rate old/new fields missing from the existing rate audit table.
- Adds sale fine weight and nullable cost-basis fields. Legacy sale lines receive a fine-weight backfill using the confirmed purity factors; their unknown historical cost basis remains `NULL`, so analytics reports those periods as incomplete.
- Creates the single-row weighted-average inventory balance.
- Creates owner PIN credentials, owner action audit, price-override audit, and PIN-protected action support.
- Adds a unique logbook source index for exactly-once posting and intentionally fails if existing duplicate source references need review.

The app never runs this migration automatically and never connects to or modifies Neon on your behalf. Enter and independently verify opening inventory using the PIN-protected in-app flow; a zero inventory with no cost is the new table's initial state in normal databases.

## Confirmed accounting rules

- `999` sale inventory fine-gold factor: `0.9990`; `49` sale factor: `0.9999`.
- Physical inventory is reduced by actual grams. Fine-gold stock and weighted-average cost use the fine-gold equivalent. For `49`, billed weight with its 0.1% surcharge is used only for pricing, never inventory depletion.
- `999` purchase payout uses actual weight times the 999 buy rate; its fine-gold inventory contribution uses factor `0.9990`. Gatti fine weight uses actual weight times touch percentage.
- Only `CASH` entries affect drawer totals. Purchase vouchers have no payment-mode column and are posted as cash outflows as specified by the story.
- Owner-protected actions (rate setup/change, price override, opening inventory, and day close) require the configured owner PIN/password. A terminal may perform them if the PIN is correct; device role alone does not authorize these actions.
- Gross profit follows US-11: selected-period sales revenue less selected-period purchase payouts. Inventory weighted-average cost remains for stock accounting and is not substituted into the analytics formula.
- Profit averages divide by every inclusive calendar date in the selected range, including dates with no transactions.
- All payment modes create source-linked logbook detail entries; only CASH changes physical drawer totals.
