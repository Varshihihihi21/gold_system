# Test Data

## Current status

No rows were seeded. The owner has supplied a reference ERD, preserved in [database_schema.md](./database_schema.md), but this repository does not contain an executable database migration and no live Neon schema was inspected. The reference diagram does not settle all nullability, defaults, constraints, or safe test-record marking needed to write or clean test records without risking business data.

Read [test-data-plan.md](./test-data-plan.md) for the source-backed entity inventory, dependency graph, observed business rules, provisional volumes, and a read-only Neon schema inventory query.

## Available commands

Seed commands are **not available yet**. The backend currently has no seed scripts or seed-specific dependencies:

- `npm run seed` — not configured.
- `npm run seed:clean` — not configured.
- `npm run seed:verify` — not configured.

Do not run an improvised `TRUNCATE` or bulk `DELETE` against a Neon database. The application has real operational data and the schema does not provide a confirmed test marker.

## Test-record identification

No `is_test` column is declared by the repository. The suggested naming prefixes (`TEST_` for customer names and `test-` for device IDs) are not sufficient to safely mark all four tables: rates are unique per date, while payment receipt/customer key constraints are unknown. A safe clean command needs either an approved test-only Neon branch or a confirmed, consistent test marker with matching schema support.

## Safe Neon workflow

After schema and seed tooling are confirmed, use an isolated disposable Neon branch:

1. Neon Dashboard → **Branches** → **New Branch**.
2. Name it `test-data`.
3. Point local backend configuration to that branch without printing or committing credentials.
4. Verify the active database/branch identity before inserting or cleaning.
5. Use a normal-size tier first. Never run stress data on a production Neon branch.

No seed count is reported because nothing was inserted. Proposed counts and the information needed to implement and verify them are in [the test data plan](./test-data-plan.md).
