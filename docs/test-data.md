# Database smoke-test data

## Status

`backend/database_setup.sql` contains small sample rows for every application table. The rows are inserted only when the connected database name is exactly `kalash_gold_smoke_test`; the fixture guard is intentionally disabled for ordinary and production Neon databases.

To use them:

1. Create a disposable local database or Neon branch whose database name is exactly `kalash_gold_smoke_test`.
2. Confirm the SQL Editor is connected to that disposable target, then review and execute the consolidated SQL file.
3. From `backend/`, run `node set-owner-pin.js` in an interactive terminal before testing owner-protected actions. The fixture PIN hash cannot authenticate.
4. Verify record counts and calculations before using the fixture app session. Do not run fixture data in a production database.

The sample transaction set includes one terminal/challenge, owner credential placeholder, rate row and audit, customer, sale and line item, Gatti purchase, debt payment, office expense, daily cash summary and four logbook entries, current inventory, price override, and owner action audit. The sample inventory is the resulting stock/cost after the included sale and buyback.

## Commands

- `npm test` — runs backend unit tests; it does not connect to PostgreSQL.
- `node set-owner-pin.js` from `backend/` — provisions/rotates an owner credential in the configured database; requires an interactive terminal.
- There are no `seed`, `seed:clean`, or `seed:verify` npm commands. The guarded SQL fixtures must not be cleaned by broad `TRUNCATE` or `DELETE` statements.

No Neon database has been connected to or changed by this work.
