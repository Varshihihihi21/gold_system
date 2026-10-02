# Test Data Plan

## Status: seed implementation blocked on executable schema and safe test markers

This plan combines checked-in code, the owner-provided ERD, and read-only live-schema metadata supplied by the owner in [live_schema.md](./live_schema.md). A seed script is **not included**: seeding a shared Neon database without an isolated branch and safe test marker could affect business balances or make cleanup unsafe.

## A. Database connection

- **Database driver:** raw PostgreSQL through the `pg` Node.js package. No Prisma, Drizzle, Knex, Sequelize, or other ORM was found.
- **Configuration loader:** `dotenv` is called by `backend/db.js`.
- **Connection settings read by code:** `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`. `backend/.env` exists in the local workspace and is ignored by Git.
- **Connection string:** the backend does not read a single `DATABASE_URL` connection string. Its pool is configured from separate environment variables. Secret values are intentionally not reproduced in this report or logs.
- **Connection pooling:** the application uses a `pg.Pool`. Neon hosting is suggested by a source comment but is not independently confirmed by deployment configuration.
- **Schema source:** the owner supplied live column, key, and enum query results. The checked-in finance migration is additive and manual; it is not a complete schema dump and has not been applied to Neon.

## B. Entity inventory from code evidence

The names below are tables explicitly named by SQL in the backend. Confirmed types, keys, and enum labels are recorded in [live_schema.md](./live_schema.md); use it to qualify the summarized evidence here.

| Table | Fields observed in queries | Type / constraints / notes |
|---|---|---|
| `authorised_devices` | `device_id`, `device_guid`, `device_name`, `is_active` | Types, required fields, defaults, key and unique constraints are unknown. Login and protected-request checks depend on active device records. Do not seed or activate devices without explicit authorization. |
| `daily_gold_rates` | `rate_date`, `rate_999_sell`, `rate_49_sell`, `rate_999_buy`, `rate_fine_gatti_buy` | Types and constraints are unknown. `rate_date` must have a unique constraint/index because the upsert uses `ON CONFLICT (rate_date)`. No nullable/default information is present. |
| `customers` | `customer_id`, `full_name`, `phone_number`, `address`, `pending_balance`, `created_at` | Types/defaults are unknown. The create route writes only `full_name`, `phone_number`, `address`; search reads `created_at`; payment reads/updates `pending_balance`. A uniqueness violation is treated as duplicate phone, but the exact unique constraint is unknown. |
| `debt_payments` | `receipt_number`, `customer_id`, `amount_paid`, `payment_mode`, `notes` | Types/defaults are unknown. Payment inserts these fields. `customer_id` logically points to `customers.customer_id`, but a database FK is not confirmed. A payment date column is not used by the backend insert. |

The supplied metadata confirms enum labels and key constraints. Triggers, generated columns, and every check constraint should still be verified against the target branch before writing a seed tool.

## C. Dependency graph and insert order

The application establishes one **logical** dependency:

```text
customers.customer_id  <--  debt_payments.customer_id
```

The actual foreign-key declaration is unknown. If confirmed in the database, insert customers before payments and clean payments before customers. `authorised_devices` and `daily_gold_rates` are independent in the observed SQL.

`--only customers,payments` would still need dependency-aware behavior: payment seeding requires existing test customers, and cleanup must only remove test payments before their test customers. This is not implemented until test-record marking and actual constraints are known.

## D. Business rules evidenced in backend code

- Device login requires an active device row with a provisioned Ed25519 public key, a one-use 60-second challenge, and a 5-minute JWT. Never generate or activate test devices incidentally; public keys are deployment credentials.
- Protected API access checks JWT validity, matching `device_guid`, and current `is_active`.
- Gold rates write to database `CURRENT_DATE` and upsert by `rate_date`. The application has no route to insert historical rate dates, and `ON CONFLICT` means overwriting an existing date is possible.
- Rate values are required positive decimal strings with at most 2 fractional places and a DECIMAL(12,2) maximum. Mid-day changes require an OWNER device and are audited.
- Customer creation supplies only name, phone number, and address. PostgreSQL unique error code `23505` is converted to an “already registered” response; exact unique columns are unknown.
- Customer search uses a partial phone match and returns the ten newest records.
- Payment processing locks the customer row, subtracts `amount_paid` from `pending_balance`, inserts a payment row, and commits both actions in one transaction.
- Payment endpoint validates positive bounded amounts and supported enum modes; overpayment remains intentionally permitted.
- Receipt numbers are application-generated and fit the confirmed `VARCHAR(30)` limit; uniqueness is enforced by the confirmed schema.
- The payment date is assigned from the PostgreSQL business date within the transaction.
- No validation/state machine, email, customer status, payment status, or rate-range rule beyond the behavior above is found.

Requested generation values such as Indian names, `TEST_` name prefixes, 10-digit phones, rates of ₹65,000–₹85,000, payment amounts of ₹500–₹500,000, UTC dates, and UUID v4 IDs are **test-data requirements from the task**, not existing application rules. Several requested fields (email, test flags, payment date, and UUID keys) are not evidenced in the backend queries and must not be inserted without the real schema.

## E. Provisional volume plan

These are suggested planning counts only, not executable insert counts. The schema, test-data marker, Neon branch, and approved semantics must be confirmed first.

| Table | Min | Standard | Stress | Status |
|---|---:|---:|---:|---|
| `authorised_devices` | 0 | 0 | 0 | Intentionally excluded: test device enrollment grants API access. |
| `customers` | 10 | 100 | 1,000 | Proposed; schema and safe marker required. |
| `daily_gold_rates` | 1 | 30 | 30 | Proposed; date uniqueness could collide with real rates; safe marker/isolated branch required. |
| `debt_payments` | 25 | 500 | 5,000 | Proposed; needs real FK/date fields and balance reconciliation rules. |

Stress counts use batches of 100 once implementation is safe. Run stress data only on an isolated disposable Neon branch, never on production.

## Required read-only schema inventory

Run this against the intended Neon branch using its SQL editor or `psql`. It reads catalog metadata; it does not insert, update, or delete records. Do not share a connection URI or password with the output.

```sql
-- Relations, columns, types, nullability, and defaults
SELECT
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale
FROM information_schema.columns AS c
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position;

-- Primary keys, foreign keys, unique/check constraints, and their definitions
SELECT
  n.nspname AS table_schema,
  t.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint AS con
JOIN pg_class AS t ON t.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, t.relname, con.contype, con.conname;

-- User-defined enum values
SELECT
  n.nspname AS type_schema,
  t.typname AS enum_name,
  e.enumsortorder,
  e.enumlabel
FROM pg_type AS t
JOIN pg_enum AS e ON e.enumtypid = t.oid
JOIN pg_namespace AS n ON n.oid = t.typnamespace
ORDER BY n.nspname, t.typname, e.enumsortorder;

-- User triggers and generated-column expressions
SELECT
  event_object_schema AS table_schema,
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY event_object_schema, event_object_table, trigger_name;

SELECT
  table_schema, table_name, column_name, data_type, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND is_generated <> 'NEVER'
ORDER BY table_schema, table_name, ordinal_position;
```

Alternatively, from a shell with `pg_dump` installed, use a schema-only dump with a connection string held in a local environment variable:

```sh
pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL"
```

Never paste the expanded connection string into chat, source control, a ticket, or terminal screenshots. Share only the schema DDL/catalog query output after removing database names/owners if desired.

## Clarifications required before seed implementation

See [questions.md](./questions.md). Most importantly, provide the schema inventory above and confirm the test-data Neon branch. Until then, no migration, clean script, seed script, or verification SQL using guessed key names is safe to generate.
