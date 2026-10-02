# Owner-provided database schema reference

**Source:** ER diagram supplied by the project owner on 2026-10-02.  
**Status:** Reference only; this is not an SQL migration and has not been verified against a running database.

The diagram has been retained as supplied, including the entities, columns, key annotations, and relationships. The normalized standalone Mermaid file is [`diagrams/database_schema.mmd`](./diagrams/database_schema.mmd). For field descriptions and observed API alignment, see [data_model.md](./data_model.md).

The owner subsequently provided an authorized-device table definition. It is saved with its comments and seed example in [authorised_devices_reference.sql](./authorised_devices_reference.sql), also as reference only. The table identifier is `authorised_devices`, matching the owner's database.

- The table needs a `device_public_key` column for the approved Ed25519 challenge-response login. That additive deployment SQL is in [backend/device_auth_schema.sql](../backend/device_auth_schema.sql); this repository has no migration runner, so apply it manually after review and backup.

The table uses `uuid_generate_v4()`, so applying it requires the corresponding UUID extension to be available. Its seed uses `ON CONFLICT (device_id) DO NOTHING`; a row already using the same GUID under another ID can still cause a unique-GUID conflict. Do not apply this reference without confirming the target schema and intended idempotent enrollment process.

```mermaid
erDiagram
    daily_gold_rates {
        UUID rate_id PK
        DATE rate_date UK
        DECIMAL rate_999_sell
        DECIMAL rate_49_sell
        DECIMAL rate_999_buy
        DECIMAL rate_fine_gatti_buy
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    daily_gold_rates_audit {
        UUID audit_id PK
        UUID rate_id FK
        DECIMAL old_rate_999_sell
        DECIMAL new_rate_999_sell
        DECIMAL old_rate_49_sell
        DECIMAL new_rate_49_sell
        VARCHAR changed_by
        TIMESTAMP changed_at
    }

    customers {
        UUID customer_id PK
        VARCHAR full_name
        VARCHAR phone_number UK
        TEXT address
        DECIMAL pending_balance
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    sales_invoices {
        UUID invoice_id PK
        VARCHAR invoice_number UK
        UUID customer_id FK
        DATE invoice_date
        DECIMAL total_amount
        DECIMAL cash_received
        DECIMAL pending_amount_added
        TIMESTAMP created_at
    }

    sales_invoice_items {
        UUID item_id PK
        UUID invoice_id FK
        ENUM category
        DECIMAL actual_weight_grams
        DECIMAL billed_weight_grams
        DECIMAL applied_rate_per_gram
        DECIMAL line_total
    }

    purchase_vouchers {
        UUID voucher_id PK
        VARCHAR voucher_number UK
        UUID customer_id FK
        DATE purchase_date
        ENUM category
        DECIMAL actual_weight_grams
        DECIMAL touch_percentage
        DECIMAL fine_weight_grams
        DECIMAL applied_rate_per_gram
        DECIMAL total_payout_amount
        TIMESTAMP created_at
    }

    debt_payments {
        UUID payment_id PK
        VARCHAR receipt_number UK
        UUID customer_id FK
        DATE payment_date
        DECIMAL amount_paid
        ENUM payment_mode
        TEXT notes
        TIMESTAMP created_at
    }

    expenses {
        UUID expense_id PK
        DATE expense_date
        ENUM category
        DECIMAL amount
        ENUM payment_mode
        VARCHAR description
        TIMESTAMP created_at
    }

    daily_logbook_summary {
        UUID logbook_id PK
        DATE log_date UK
        DECIMAL opening_balance
        DECIMAL total_inflows
        DECIMAL total_outflows
        DECIMAL calculated_closing_balance
        DECIMAL actual_physical_cash
        DECIMAL cash_variance
        BOOLEAN is_closed
        TIMESTAMP closed_at
    }

    logbook_entries {
        UUID entry_id PK
        DATE log_date
        ENUM entry_type
        DECIMAL amount
        ENUM payment_mode
        ENUM source_type
        UUID source_reference_id
        VARCHAR description
        TIMESTAMP created_at
    }

    daily_gold_rates ||--o{ daily_gold_rates_audit : "audited by"
    customers ||--o{ sales_invoices : "places"
    customers ||--o{ purchase_vouchers : "sells to"
    customers ||--o{ debt_payments : "pays"
    sales_invoices ||--|{ sales_invoice_items : "contains"
    sales_invoices ||--o| logbook_entries : "logged as"
    purchase_vouchers ||--o| logbook_entries : "logged as"
    debt_payments ||--o| logbook_entries : "logged as"
    expenses ||--o| logbook_entries : "logged as"
```

### Clarifications still needed before using this as an executable schema

- Enumerate the allowed values for each ENUM.
- Specify DECIMAL precision and scale, particularly the requested money and weight precisions.
- Specify nullability, defaults, and delete/update behavior for foreign keys.
- Decide whether rate audit history must include all four rates.
- Confirm how `logbook_entries.source_reference_id` is constrained and how exactly-once postings are enforced.
