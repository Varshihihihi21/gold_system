# Safe database smoke-test plan

## Scope and safety

The consolidated schema and smoke fixtures live in [backend/database_setup.sql](../backend/database_setup.sql). The script has fixture data for all current app tables, but inserts it only when `current_database()` is exactly `kalash_gold_smoke_test`. That database name is a deliberate safety gate; never change it to target a live or shared production database.

No Neon credentials were used and no Neon database was connected to or modified. The fixtures are not a production migration or realistic inventory ledger.

## Fixture coverage

The disposable database receives:

| Area | Example rows |
|---|---|
| Device authentication | Disabled smoke terminal and one short-lived challenge |
| Owner actions | Placeholder PIN credential, one rate audit, one price override, one owner action audit |
| Daily rates | Current date with four representative positive rates |
| Customer billing | One customer, a partially paid invoice, and a sale line that demonstrates an audited price override |
| Inventory intake | One Gatti purchase voucher; resulting singleton stock/cost includes both the sample purchase and sale |
| Customer debt | One standalone CASH payment; customer pending balance reflects the invoice remainder less payment |
| Expenses and cash flow | One OFFICE expense and source-linked sale, purchase, payment, and expense logbook entries |
| Reconciliation | One open daily summary whose opening + CASH inflows - CASH outflows matches calculated closing |

The placeholder owner hash consists of zero bytes and is not a valid owner PIN. After the schema is applied to the disposable database, run `node set-owner-pin.js` from the backend directory in an interactive terminal.

## Manual workflow

1. Create an isolated, disposable database/branch with database name `kalash_gold_smoke_test`.
2. Check the active database and schema with `SELECT current_database(), current_schema();`.
3. Review the SQL and apply `backend/database_setup.sql`.
4. Provision an owner PIN using `node set-owner-pin.js` from `backend/`.
5. Run `npm test` in `backend/` for unit tests; this command does not connect to PostgreSQL. Use the disposable database only for API smoke checks.
6. Confirm the seeded summary and logbook entries reconcile and test that audit rows reject UPDATE/DELETE.

No cleanup script is provided. Delete the isolated branch/database through the database provider when testing is complete; do not issue broad deletes against a shared database.
