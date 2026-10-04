-- Kalash Gold database schema for the current backend.
--
-- Safe for a fresh database and rerunnable against the supplied existing
-- schema. Back up the database and inspect the preflight queries in
-- docs/live_schema.md before applying this to a database with business data.
-- Outside the explicitly named smoke-test database, it does not seed devices,
-- rates, customers, or business opening inventory.
--
-- Derived user stories covered by this schema:
-- US-01 Set four daily gold rates and retain before/after owner audit records.
-- US-02 Store category, actual/billed/fine weights, rates, and sale line totals.
-- US-03 Retain owner-authorized price overrides with expected and charged values.
-- US-04 Store 999/GATTI purchase weights, touch, rate, payout, and customer.
-- US-05 Store invoice payment and pending amounts and customer debt balances.
-- US-06 Search customers and retrieve their previous debt and invoice history.
-- US-07 Store standalone customer repayments, receipt numbers, and payment mode.
-- US-08 Link logbook cash-flow entries to sales, purchases, repayments, expenses.
-- US-09 Store office/household expense categories and payment modes.
-- US-10 Store daily cash summaries, opening/closing counts, and variance/lock.
-- US-11 Store period-dated sales, purchase, and expenses for profit aggregation.
-- Additional implicit code-level requirements:
-- IM-01 Authenticate approved terminals using single-use challenges and public keys.
-- IM-02 Register customers and search by name, phone, or customer UUID.
-- IM-03 Configure opening stock once and maintain stock/cost with sales and buys.
-- IM-04 Issue invoices, buyback vouchers, and debt-payment receipts.
-- IM-05 Record owner-authorized actions and reject inactive terminal requests.
-- 
-- Assumptions:
-- * Money uses NUMERIC(12,2); gram weights use NUMERIC(12,4).
-- * 999 and 49 fine-stock factors are 0.9990 and 0.9999. The 49 surcharge
--   increases billed weight for pricing only, not physical stock depletion.
-- * A sale's unpaid portion is pending_amount_added; the app updates the
--   customer's cached pending_balance in the same transaction.
-- * Only CASH entries affect physical drawer balances. Non-cash entries are
--   retained in logbook_entries for transaction reporting.
-- * Purchase vouchers represent CASH payouts; the current purchase API has no
--   payment-mode field.
-- * Gross profit follows US-11 literally: selected-period sales less
--   selected-period purchase payouts, rather than inventory COGS.
-- * Owner identity is a singleton PIN credential; there is no person-level
--   login/account subsystem in the current application.
--
-- Deliberate denormalizations:
-- * customers.pending_balance caches the result of unpaid invoices minus
--   debt repayments so billing search can display it quickly. Transaction
--   routes update it together with the source records.
-- * inventory_balances is a singleton current-balance projection maintained
--   with purchases and sales; the vouchers and invoice lines remain history.
-- * daily_logbook_summaries caches running totals and close status; entries
--   remain the detail source.
--
-- Smoke fixtures are inserted only when current_database() is exactly
-- 'kalash_gold_smoke_test'. They do not run in a normal Neon production DB.
-- In that disposable DB, run `node backend/set-owner-pin.js` after this script
-- before testing owner-protected API actions; the fixture hash is unusable.

BEGIN;
SET LOCAL search_path TO public, pg_catalog;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

DO $$
BEGIN
    CREATE TYPE entry_type AS ENUM ('INFLOW', 'OUTFLOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE expense_category AS ENUM ('OFFICE', 'HOUSEHOLD');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE gold_category AS ENUM ('999', '49');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE payment_mode AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE purchase_category AS ENUM ('999', 'GATTI');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE source_type AS ENUM ('SALE', 'PURCHASE', 'DEBT_PAYMENT', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
DECLARE
    labels TEXT[];
BEGIN
    SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumsortorder)
    INTO labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'entry_type';
    IF labels IS DISTINCT FROM ARRAY['INFLOW', 'OUTFLOW']::TEXT[] THEN
        RAISE EXCEPTION 'entry_type labels differ from the application contract: %', labels;
    END IF;

    SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumsortorder)
    INTO labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'expense_category';
    IF labels IS DISTINCT FROM ARRAY['OFFICE', 'HOUSEHOLD']::TEXT[] THEN
        RAISE EXCEPTION 'expense_category labels differ from the application contract: %', labels;
    END IF;

    SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumsortorder)
    INTO labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'gold_category';
    IF labels IS DISTINCT FROM ARRAY['999', '49']::TEXT[] THEN
        RAISE EXCEPTION 'gold_category labels differ from the application contract: %', labels;
    END IF;

    SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumsortorder)
    INTO labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'payment_mode';
    IF labels IS DISTINCT FROM ARRAY['CASH', 'BANK_TRANSFER', 'UPI', 'CARD']::TEXT[] THEN
        RAISE EXCEPTION 'payment_mode labels differ from the application contract: %', labels;
    END IF;

    SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumsortorder)
    INTO labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'purchase_category';
    IF labels IS DISTINCT FROM ARRAY['999', 'GATTI']::TEXT[] THEN
        RAISE EXCEPTION 'purchase_category labels differ from the application contract: %', labels;
    END IF;

    SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumsortorder)
    INTO labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'source_type';
    IF labels IS DISTINCT FROM ARRAY['SALE', 'PURCHASE', 'DEBT_PAYMENT', 'EXPENSE']::TEXT[] THEN
        RAISE EXCEPTION 'source_type labels differ from the application contract: %', labels;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS authorised_devices (
    device_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_guid VARCHAR(100) NOT NULL UNIQUE,
    device_name VARCHAR(200),
    role VARCHAR(50) NOT NULL DEFAULT 'TERMINAL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    first_authorized_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    device_public_key TEXT,
    CHECK (role IN ('TERMINAL', 'OWNER'))
);

ALTER TABLE authorised_devices
    ADD COLUMN IF NOT EXISTS device_public_key TEXT;

CREATE TABLE IF NOT EXISTS device_auth_challenges (
    challenge_id VARCHAR(43) PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES authorised_devices(device_id) ON DELETE CASCADE,
    nonce BYTEA NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_gold_rates (
    rate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_date DATE NOT NULL UNIQUE,
    rate_999_sell NUMERIC(12, 2) NOT NULL CHECK (rate_999_sell > 0),
    rate_49_sell NUMERIC(12, 2) NOT NULL CHECK (rate_49_sell > 0),
    rate_999_buy NUMERIC(12, 2) NOT NULL CHECK (rate_999_buy > 0),
    rate_fine_gatti_buy NUMERIC(12, 2) NOT NULL CHECK (rate_fine_gatti_buy > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_gold_rates_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_id UUID NOT NULL REFERENCES daily_gold_rates(rate_id) ON DELETE RESTRICT,
    old_rate_999_sell NUMERIC(12, 2),
    new_rate_999_sell NUMERIC(12, 2),
    old_rate_49_sell NUMERIC(12, 2),
    new_rate_49_sell NUMERIC(12, 2),
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    old_rate_999_buy NUMERIC(12, 2),
    new_rate_999_buy NUMERIC(12, 2),
    old_rate_fine_gatti_buy NUMERIC(12, 2),
    new_rate_fine_gatti_buy NUMERIC(12, 2),
    owner_user_id UUID
);

ALTER TABLE daily_gold_rates_audit
    ADD COLUMN IF NOT EXISTS old_rate_999_buy NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS new_rate_999_buy NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS old_rate_fine_gatti_buy NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS new_rate_fine_gatti_buy NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS owner_user_id UUID;

CREATE TABLE IF NOT EXISTS owner_pin_credentials (
    credential_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (credential_id = 1),
    owner_user_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    owner_name VARCHAR(200) NOT NULL,
    pin_salt BYTEA NOT NULL CHECK (octet_length(pin_salt) = 16),
    pin_hash BYTEA NOT NULL CHECK (octet_length(pin_hash) = 64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owner_action_audit (
    owner_action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES owner_pin_credentials(owner_user_id) ON DELETE RESTRICT,
    device_id UUID NOT NULL REFERENCES authorised_devices(device_id) ON DELETE RESTRICT,
    action VARCHAR(40) NOT NULL CHECK (
        action IN ('RATE_SETUP', 'RATE_CHANGE', 'SALES_PRICE_OVERRIDE', 'OPENING_INVENTORY', 'LOGBOOK_CLOSE')
    ),
    reference_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(200) NOT NULL,
    phone_number VARCHAR(15) NOT NULL UNIQUE,
    address TEXT,
    pending_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE RESTRICT,
    invoice_date DATE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    cash_received NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pending_amount_added NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (total_amount >= 0),
    CHECK (cash_received >= 0 AND cash_received <= total_amount),
    CHECK (pending_amount_added >= 0),
    CHECK (total_amount = cash_received + pending_amount_added)
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(invoice_id) ON DELETE CASCADE,
    category gold_category NOT NULL,
    actual_weight_grams NUMERIC(12, 4) NOT NULL,
    billed_weight_grams NUMERIC(12, 4) NOT NULL,
    applied_rate_per_gram NUMERIC(12, 2) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL,
    fine_weight_grams NUMERIC(12, 4) NOT NULL,
    cost_basis_amount NUMERIC(12, 2),
    CHECK (actual_weight_grams > 0),
    CHECK (billed_weight_grams > 0),
    CHECK (applied_rate_per_gram > 0),
    CHECK (line_total >= 0),
    CHECK (fine_weight_grams >= 0 AND fine_weight_grams <= actual_weight_grams),
    CHECK (cost_basis_amount IS NULL OR cost_basis_amount >= 0)
);

ALTER TABLE sales_invoice_items
    ADD COLUMN IF NOT EXISTS fine_weight_grams NUMERIC(12, 4),
    ADD COLUMN IF NOT EXISTS cost_basis_amount NUMERIC(12, 2);

UPDATE sales_invoice_items
SET fine_weight_grams = ROUND(
    actual_weight_grams * CASE category::text
        WHEN '999' THEN 0.9990
        WHEN '49' THEN 0.9999
    END,
    4
)
WHERE fine_weight_grams IS NULL;

ALTER TABLE sales_invoice_items
    ALTER COLUMN fine_weight_grams SET NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_vouchers (
    voucher_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE RESTRICT,
    purchase_date DATE NOT NULL,
    category purchase_category NOT NULL,
    actual_weight_grams NUMERIC(12, 4) NOT NULL,
    touch_percentage NUMERIC(5, 2),
    fine_weight_grams NUMERIC(12, 4),
    applied_rate_per_gram NUMERIC(12, 2) NOT NULL,
    total_payout_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (actual_weight_grams > 0),
    CHECK (touch_percentage IS NULL OR (touch_percentage > 0 AND touch_percentage <= 100)),
    CHECK (fine_weight_grams IS NULL OR (fine_weight_grams >= 0 AND fine_weight_grams <= actual_weight_grams)),
    CHECK (applied_rate_per_gram > 0),
    CHECK (total_payout_amount >= 0),
    CHECK ((category = 'GATTI' AND touch_percentage IS NOT NULL)
        OR (category = '999' AND touch_percentage IS NULL))
);

CREATE TABLE IF NOT EXISTS debt_payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE RESTRICT,
    payment_date DATE NOT NULL,
    amount_paid NUMERIC(12, 2) NOT NULL,
    payment_mode payment_mode NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (amount_paid > 0)
);

CREATE TABLE IF NOT EXISTS expenses (
    expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date DATE NOT NULL,
    category expense_category NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode payment_mode NOT NULL,
    description VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (amount > 0)
);

DO $$
BEGIN
    IF to_regclass('public.daily_logbook_summaries') IS NULL
       AND to_regclass('public.daily_logbook_summary') IS NOT NULL THEN
        ALTER TABLE public.daily_logbook_summary RENAME TO daily_logbook_summaries;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS daily_logbook_summaries (
    logbook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_date DATE NOT NULL UNIQUE,
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_inflows NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_outflows NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    calculated_closing_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    actual_physical_cash NUMERIC(12, 2),
    cash_variance NUMERIC(12, 2),
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    closed_at TIMESTAMP WITH TIME ZONE,
    CHECK (opening_balance >= 0),
    CHECK (total_inflows >= 0),
    CHECK (total_outflows >= 0),
    CHECK (calculated_closing_balance = opening_balance + total_inflows - total_outflows),
    CHECK (actual_physical_cash IS NULL OR actual_physical_cash >= 0),
    CHECK (cash_variance IS NULL OR (
        actual_physical_cash IS NOT NULL
        AND cash_variance = actual_physical_cash - calculated_closing_balance
    )),
    CHECK (is_closed = FALSE OR (
        actual_physical_cash IS NOT NULL AND cash_variance IS NOT NULL AND closed_at IS NOT NULL
    ))
);

CREATE TABLE IF NOT EXISTS logbook_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_date DATE NOT NULL,
    entry_type entry_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    payment_mode payment_mode NOT NULL,
    source_type source_type NOT NULL,
    source_reference_id UUID,
    description VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (amount > 0)
);

-- source_reference_id points to one of four source tables based on source_type;
-- PostgreSQL cannot express this polymorphic reference as one ordinary FK.

CREATE TABLE IF NOT EXISTS inventory_balances (
    balance_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (balance_id = 1),
    physical_stock_grams NUMERIC(12, 4) NOT NULL DEFAULT 0,
    fine_stock_grams NUMERIC(12, 4) NOT NULL DEFAULT 0,
    inventory_cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    opening_configured BOOLEAN NOT NULL DEFAULT FALSE,
    has_activity BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (physical_stock_grams >= 0),
    CHECK (fine_stock_grams >= 0 AND fine_stock_grams <= physical_stock_grams),
    CHECK (inventory_cost_amount >= 0),
    CHECK (fine_stock_grams <> 0 OR inventory_cost_amount = 0)
);

INSERT INTO inventory_balances (balance_id)
VALUES (1)
ON CONFLICT (balance_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS sales_price_overrides (
    override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(invoice_id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES sales_invoice_items(item_id) ON DELETE RESTRICT,
    owner_device_id UUID NOT NULL REFERENCES authorised_devices(device_id) ON DELETE RESTRICT,
    owner_user_id UUID NOT NULL REFERENCES owner_pin_credentials(owner_user_id) ON DELETE RESTRICT,
    expected_amount NUMERIC(12, 2) NOT NULL,
    charged_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (expected_amount > 0),
    CHECK (charged_amount > 0)
);

ALTER TABLE sales_price_overrides
    ADD COLUMN IF NOT EXISTS owner_user_id UUID
        REFERENCES owner_pin_credentials(owner_user_id) ON DELETE RESTRICT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'daily_gold_rates_audit_owner_user_id_fkey'
          AND conrelid = 'daily_gold_rates_audit'::regclass
    ) THEN
        ALTER TABLE daily_gold_rates_audit
            ADD CONSTRAINT daily_gold_rates_audit_owner_user_id_fkey
            FOREIGN KEY (owner_user_id) REFERENCES owner_pin_credentials(owner_user_id) ON DELETE RESTRICT;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_owner_action_audit_user_time
    ON owner_action_audit(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_action_audit_device_time
    ON owner_action_audit(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_action_audit_reference
    ON owner_action_audit(reference_id);
CREATE INDEX IF NOT EXISTS idx_sales_price_overrides_owner_user
    ON sales_price_overrides(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_device_auth_challenges_expiry
    ON device_auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_device_auth_challenges_device_expiry
    ON device_auth_challenges(device_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_audit_rate_changed
    ON daily_gold_rates_audit(rate_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_audit_owner_user
    ON daily_gold_rates_audit(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rate_audit_changed_by
    ON daily_gold_rates_audit(changed_by);
CREATE INDEX IF NOT EXISTS idx_customers_created_at
    ON customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_full_name_trgm
    ON customers USING GIN (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
    ON customers USING GIN (phone_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_id_text_trgm
    ON customers USING GIN ((customer_id::text) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_date
    ON sales_invoices(customer_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_date
    ON sales_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice
    ON sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_vouchers_customer_date
    ON purchase_vouchers(customer_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_vouchers_date
    ON purchase_vouchers(purchase_date);
CREATE INDEX IF NOT EXISTS idx_debt_payments_customer_date
    ON debt_payments(customer_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date_category
    ON expenses(expense_date, category);
CREATE INDEX IF NOT EXISTS idx_logbook_entries_date_created
    ON logbook_entries(log_date, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_price_overrides_invoice
    ON sales_price_overrides(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_price_overrides_item
    ON sales_price_overrides(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_price_overrides_device
    ON sales_price_overrides(owner_device_id);

CREATE OR REPLACE FUNCTION prevent_financial_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Financial audit rows are immutable.';
END
$$;

DROP TRIGGER IF EXISTS daily_gold_rates_audit_immutable ON daily_gold_rates_audit;
CREATE TRIGGER daily_gold_rates_audit_immutable
    BEFORE UPDATE OR DELETE ON daily_gold_rates_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_audit_mutation();

DROP TRIGGER IF EXISTS owner_action_audit_immutable ON owner_action_audit;
CREATE TRIGGER owner_action_audit_immutable
    BEFORE UPDATE OR DELETE ON owner_action_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_audit_mutation();

DROP TRIGGER IF EXISTS sales_price_overrides_immutable ON sales_price_overrides;
CREATE TRIGGER sales_price_overrides_immutable
    BEFORE UPDATE OR DELETE ON sales_price_overrides
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_audit_mutation();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM logbook_entries
        WHERE source_reference_id IS NOT NULL
        GROUP BY source_type, source_reference_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Duplicate logbook source references exist. Resolve duplicates before installing the unique index.';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_logbook_source_reference
    ON logbook_entries(source_type, source_reference_id)
    WHERE source_reference_id IS NOT NULL;

-- Smoke fixtures are created only in an explicitly named disposable database.
-- Change this guard only after confirming the selected database is non-production.
DO $$
BEGIN
    IF current_database() <> 'kalash_gold_smoke_test' THEN
        RETURN;
    END IF;

    INSERT INTO authorised_devices
        (device_id, device_guid, device_name, role, is_active, device_public_key)
    VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SMOKE-TERMINAL-DO-NOT-AUTH',
         'Smoke test terminal (disabled)', 'TERMINAL', FALSE, NULL)
    ON CONFLICT (device_id) DO NOTHING;

    INSERT INTO device_auth_challenges (challenge_id, device_id, nonce, expires_at)
    VALUES ('smoke-test-challenge', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            decode('00112233445566778899aabbccddeeff', 'hex'), NOW() + INTERVAL '60 seconds')
    ON CONFLICT (challenge_id) DO NOTHING;

    INSERT INTO owner_pin_credentials
        (credential_id, owner_user_id, owner_name, pin_salt, pin_hash)
    VALUES
        (1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Smoke Test Owner',
         decode('00112233445566778899aabbccddeeff', 'hex'),
         decode(repeat('00', 64), 'hex'))
    ON CONFLICT (credential_id) DO NOTHING;

    INSERT INTO daily_gold_rates
        (rate_id, rate_date, rate_999_sell, rate_49_sell, rate_999_buy, rate_fine_gatti_buy)
    VALUES
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', CURRENT_DATE, 7250.00, 6800.00, 7100.00, 7000.00)
    ON CONFLICT (rate_id) DO NOTHING;

    INSERT INTO daily_gold_rates_audit
        (audit_id, rate_id, old_rate_999_sell, new_rate_999_sell,
         old_rate_49_sell, new_rate_49_sell, old_rate_999_buy, new_rate_999_buy,
         old_rate_fine_gatti_buy, new_rate_fine_gatti_buy, changed_by, owner_user_id)
    VALUES
        ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
         7200.00, 7250.00, 6750.00, 6800.00, 7050.00, 7100.00,
         6950.00, 7000.00, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    ON CONFLICT (audit_id) DO NOTHING;

    INSERT INTO customers (customer_id, full_name, phone_number, address, pending_balance)
    VALUES
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
         'Smoke Test Customer', '9000000001', 'Disposable database fixture', 876.00)
    ON CONFLICT (customer_id) DO NOTHING;

    INSERT INTO sales_invoices
        (invoice_id, invoice_number, customer_id, invoice_date, total_amount, cash_received, pending_amount_added)
    VALUES
        ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'SMOKE-INV-0001',
         'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', CURRENT_DATE, 1001.00, 100.00, 901.00)
    ON CONFLICT (invoice_id) DO NOTHING;

    INSERT INTO sales_invoice_items
        (item_id, invoice_id, category, actual_weight_grams, billed_weight_grams,
         applied_rate_per_gram, line_total, fine_weight_grams, cost_basis_amount)
    VALUES
        ('11111111-1111-4111-8111-111111111111',
         'ffffffff-ffff-4fff-8fff-ffffffffffff', '999', 0.1380, 0.1380,
         7250.00, 1001.00, 0.1379, 900.00)
    ON CONFLICT (item_id) DO NOTHING;

    INSERT INTO purchase_vouchers
        (voucher_id, voucher_number, customer_id, purchase_date, category, actual_weight_grams,
         touch_percentage, fine_weight_grams, applied_rate_per_gram, total_payout_amount)
    VALUES
        ('22222222-2222-4222-8222-222222222222', 'SMOKE-PUR-0001',
         'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', CURRENT_DATE, 'GATTI',
         0.1000, 88.50, 0.0885, 7000.00, 619.50)
    ON CONFLICT (voucher_id) DO NOTHING;

    INSERT INTO debt_payments
        (payment_id, receipt_number, customer_id, payment_date, amount_paid, payment_mode, notes)
    VALUES
        ('33333333-3333-4333-8333-333333333333', 'SMOKE-RCP-0001',
         'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', CURRENT_DATE, 25.00, 'CASH', 'Smoke test only')
    ON CONFLICT (payment_id) DO NOTHING;

    INSERT INTO expenses (expense_id, expense_date, category, amount, payment_mode, description)
    VALUES
        ('44444444-4444-4444-8444-444444444444',
         CURRENT_DATE, 'OFFICE', 10.00, 'CASH', 'Smoke test expense')
    ON CONFLICT (expense_id) DO NOTHING;

    INSERT INTO daily_logbook_summaries
        (logbook_id, log_date, opening_balance, total_inflows, total_outflows,
         calculated_closing_balance, is_closed)
    VALUES
        ('55555555-5555-4555-8555-555555555555', CURRENT_DATE, 1000.00, 125.00, 629.50,
         495.50, FALSE)
    ON CONFLICT (logbook_id) DO NOTHING;

    INSERT INTO logbook_entries
        (entry_id, log_date, entry_type, amount, payment_mode, source_type, source_reference_id, description)
    VALUES
        ('66666666-6666-4666-8666-666666666661', CURRENT_DATE, 'INFLOW', 100.00, 'CASH',
         'SALE', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Smoke test invoice'),
        ('66666666-6666-4666-8666-666666666662', CURRENT_DATE, 'OUTFLOW', 619.50, 'CASH',
         'PURCHASE', '22222222-2222-4222-8222-222222222222', 'Smoke test buyback'),
        ('66666666-6666-4666-8666-666666666663', CURRENT_DATE, 'INFLOW', 25.00, 'CASH',
         'DEBT_PAYMENT', '33333333-3333-4333-8333-333333333333', 'Smoke test debt receipt'),
        ('66666666-6666-4666-8666-666666666664', CURRENT_DATE, 'OUTFLOW', 10.00, 'CASH',
         'EXPENSE', '44444444-4444-4444-8444-444444444444', 'Smoke test expense')
    ON CONFLICT (entry_id) DO NOTHING;

    INSERT INTO inventory_balances
        (balance_id, physical_stock_grams, fine_stock_grams, inventory_cost_amount,
         opening_configured, has_activity)
    VALUES (1, 100.0380, 99.9494, 650280.50, TRUE, TRUE)
    ON CONFLICT (balance_id) DO UPDATE
    SET physical_stock_grams = EXCLUDED.physical_stock_grams,
        fine_stock_grams = EXCLUDED.fine_stock_grams,
        inventory_cost_amount = EXCLUDED.inventory_cost_amount,
        opening_configured = TRUE,
        has_activity = TRUE,
        updated_at = NOW()
    WHERE inventory_balances.has_activity = FALSE;

    INSERT INTO sales_price_overrides
        (override_id, invoice_id, item_id, owner_device_id, owner_user_id, expected_amount, charged_amount)
    VALUES
        ('77777777-7777-4777-8777-777777777777',
         'ffffffff-ffff-4fff-8fff-ffffffffffff',
         '11111111-1111-4111-8111-111111111111',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1000.50, 1001.00)
    ON CONFLICT (override_id) DO NOTHING;

    INSERT INTO owner_action_audit
        (owner_action_id, owner_user_id, device_id, action, reference_id, details)
    VALUES
        ('88888888-8888-4888-8888-888888888888',
         'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
         'SALES_PRICE_OVERRIDE', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
         '{"smoke_test": true, "overridden_items": 1}'::jsonb)
    ON CONFLICT (owner_action_id) DO NOTHING;
END
$$;

COMMIT;
