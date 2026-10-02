-- Additive migration for the financial API. Review and apply manually.
BEGIN;

ALTER TABLE daily_gold_rates_audit
    ADD COLUMN IF NOT EXISTS old_rate_999_buy NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS new_rate_999_buy NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS old_rate_fine_gatti_buy NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS new_rate_fine_gatti_buy NUMERIC(12, 2);

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

CREATE TABLE IF NOT EXISTS inventory_balances (
    balance_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (balance_id = 1),
    physical_stock_grams NUMERIC(12, 4) NOT NULL DEFAULT 0,
    fine_stock_grams NUMERIC(12, 4) NOT NULL DEFAULT 0,
    inventory_cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    opening_configured BOOLEAN NOT NULL DEFAULT FALSE,
    has_activity BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO inventory_balances (balance_id)
VALUES (1)
ON CONFLICT (balance_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS sales_price_overrides (
    override_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES sales_invoices(invoice_id),
    item_id UUID NOT NULL REFERENCES sales_invoice_items(item_id),
    owner_device_id UUID NOT NULL REFERENCES authorised_devices(device_id),
    expected_amount NUMERIC(12, 2) NOT NULL,
    charged_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM logbook_entries
        WHERE source_reference_id IS NOT NULL
        GROUP BY source_type, source_reference_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate non-null logbook source references exist; review them before applying this migration.';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_logbook_source_reference
    ON logbook_entries(source_type, source_reference_id)
    WHERE source_reference_id IS NOT NULL;

COMMIT;
