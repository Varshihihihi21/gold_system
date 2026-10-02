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

## Required additive migration

The current finance implementation expects [migration 001](../backend/migrations/001_financial_workflows.sql) to be reviewed and applied manually before deploying the new backend:

- Adds the buy-rate old/new fields missing from the existing rate audit table.
- Adds sale fine weight and nullable cost-basis fields. Legacy sale lines receive a fine-weight backfill using the confirmed purity factors; their unknown historical cost basis remains `NULL`, so analytics reports those periods as incomplete.
- Creates the single-row weighted-average inventory balance.
- Creates an owner-device price-override audit table.
- Adds a unique logbook source index for exactly-once posting and intentionally fails if existing duplicate source references need review.

The app never runs this migration automatically and never connects to or modifies Neon on your behalf. Enter and independently verify opening inventory using the owner-only in-app flow; a zero inventory with no cost is the new table's initial state.

## Confirmed accounting rules

- `999` sale inventory fine-gold factor: `0.9990`; `49` sale factor: `0.9999`.
- Physical inventory is reduced by actual grams. Fine-gold stock and weighted-average cost use the fine-gold equivalent. For `49`, billed weight with its 0.1% surcharge is used only for pricing, never inventory depletion.
- `999` purchase payout uses actual weight times the 999 buy rate; its fine-gold inventory contribution uses factor `0.9990`. Gatti fine weight uses actual weight times touch percentage.
- Only `CASH` entries affect drawer totals. Purchase vouchers have no payment-mode column and are posted as cash outflows as specified by the story.
- An owner-authorized device is provisioned with `authorised_devices.role = 'OWNER'`. Rate edits after initial daily setup and mismatched-price overrides require this role; overrides record the owner device and both amounts.
- Gross profit uses sales revenue less per-item weighted-average cost of fine gold sold. Purchase outlays remain inventory cost until the corresponding stock is sold. Historic sale rows without known cost basis are not treated as zero-cost sales.
