# Kalash Gold Terminal

## What this project does

This repository contains a gold-trading terminal with a React interface wrapped by Electron for desktop use. It supports approved-device sign-in, daily rates, customer accounts, sales billing, gold purchases and inventory, debt payments, categorized expenses, cash reconciliation, and profit reporting.

The project has two parts:

- A **frontend**, the web page the operator uses, built with React and Vite.
- A **backend**, a Node.js service that checks the terminal's access token and reads or writes records in PostgreSQL.

Development targets a backend at `http://localhost:4000`; packaged builds require an HTTPS API URL. Electron uses an administrator-assigned device GUID and an OS-encrypted Ed25519 private key for device proof. Owner-only changes require the separately configured owner PIN/password. Customer and transaction records are stored in PostgreSQL; unsaved form data and the short-lived access token are held in renderer memory. The encrypted device credential is intentionally stored through the OS credential facility. Review and manually apply [the consolidated setup](../backend/database_setup.sql); the app never changes the database automatically. TLS/cloud deployment is external.

## Technology at a glance

| Area | Technology |
|---|---|
| Browser interface | React 19, JavaScript, JSX, CSS |
| Frontend development/build | Vite 8, `@vitejs/plugin-react` |
| Backend/API | Node.js, Express 5 |
| Database access | PostgreSQL through `pg` |
| Login token | JSON Web Token (`jsonwebtoken`) |
| Browser-to-server access | Express CORS middleware |
| Configuration | Environment variables loaded with `dotenv` |
| Database hosting | Not declared. The database connection comment mentions Neon, but no hosting configuration is checked in. |
| External business APIs | None found in the application source. |

## Documentation

- [Feature guide](./features.md) — what each screen/module does and how it behaves.
- [Data model](./data_model.md) — owner-provided model, observed API usage, gaps, and data flow.
- [Live Neon schema notes](./live_schema.md) — column types, enum values, keys, and constraints supplied from read-only Neon metadata queries.
- [Owner-provided database schema](./database_schema.md) — supplied ERD retained as a project reference, not a migration.
- [Authorized-device SQL reference](./authorised_devices_reference.sql) — owner-provided `authorised_devices` table and seed example; reference only, not a migration.
- [Complete database setup SQL](../backend/database_setup.sql) — idempotent schema for a fresh database and the current known auth/finance additions; inspect and back up before applying to a database with existing data.
- [Legacy device-auth SQL](../backend/device_auth_schema.sql) — incremental reference; use the consolidated setup script for a complete/current deployment.
- [API reference](./api_reference.md) — all implemented HTTP routes, inputs, outputs, and errors.
- [Developer guide](./developer_guide.md) — local setup, configuration, folder layout, and conventions.
- [US-01–US-11 verification matrix](./verification_matrix.md) — boundary cases, expected values, coverage, and remaining prerequisites.
- [Project analysis](./analysis.md) — verified stack, API, data model, existing UI, and implementation gaps.
- [Design system](./DESIGN.md) — proposed interface tokens and accessibility baseline.
- [Open questions](./questions.md) — unresolved API, database, and business-rule decisions.
- [Test data status](./test-data.md) — confirms no test rows or seed commands exist.
- [Test data plan](./test-data-plan.md) — source-backed inventory and safe seeding blockers.

## Diagrams

- [Main request and user flow](./diagrams/main_flow.mmd)
- [Primary use-case sequence](./diagrams/primary_sequence.mmd)
- [Database entity relationship diagram](./diagrams/data_model.mmd)
- [Owner-provided database schema diagram](./diagrams/database_schema.mmd)
- [High-level architecture](./diagrams/architecture.mmd)

## Project file catalog

The descriptions below cover first-party project files and directories. Generated dependencies under either `node_modules/` are intentionally not cataloged file-by-file; they are installed third-party package contents, not application source. Manual SQL schema changes, backend tests, and the owner-provided reference ERD are cataloged below.

### Repository root

| Path | Purpose |
|---|---|
| `.gitignore` | Excludes dependency directories, environment files, generated builds, logs, and Git ignore files. |
| `backend/` | Node.js API and PostgreSQL connection code. |
| `frontend/` | React interface, Vite build configuration, Electron desktop host, and static assets. |
| `docs/` | This documentation set and its Mermaid diagrams. |

### `backend/`

| Path | Purpose |
|---|---|
| `backend/server.js` | Express application, CORS setup, authentication middleware, and API route registration. |
| `backend/auth-routes.js` | Challenge-response terminal login and short-lived JWT issuance. |
| `backend/device-middleware.js` | Protected-request device checks and token rotation. |
| `backend/routes/` | Authentication-protected rates, customer, payment, and finance API implementations. |
| `backend/routes/sales.js` | Atomic sales invoice, customer debt, inventory cost, price override, and cash-inflow workflow. |
| `backend/routes/purchases.js` | Customer buyback voucher, inventory intake, weighted-average cost, and cash outflow. |
| `backend/set-owner-pin.js` | Interactive CLI to provision or rotate the owner PIN/password without echoing it. |
| `backend/routes/expenses.js` | Office/household expenses and cash-only drawer postings. |
| `backend/routes/logbook.js` | Daily logbook summary, cash entries, reconciliation, and close. |
| `backend/routes/analytics.js` | Date-range revenue, purchase-cost profit, and inclusive calendar-day average calculations. |
| `backend/routes/inventory.js` | Inventory balance and one-time owner opening stock configuration. |
| `backend/finance/` | Shared exact validation, transactions, inventory valuation, logbook posting, and error helpers. |
| `backend/finance/owner-pin.js` | Scrypt PIN hashing/verification and owner-action audit insertion. |
| `backend/migrations/001_financial_workflows.sql` | Manual additive migration for inventory, cost basis, audit fields, override audit, and unique logbook-source protection. |
| `backend/routes/gold-rates.js` | Read and upsert daily gold rates. |
| `backend/routes/customers.js` | Register customers and search by name, phone, or UUID substring. |
| `backend/routes/payments.js` | Record a customer debt payment and update its balance in one transaction. |
| `backend/db.js` | Loads environment configuration and creates the PostgreSQL connection pool. |
| `backend/device-auth.js` | Creates one-time challenges and verifies Ed25519 signatures. |
| `backend/money.js` | Exact integer-cent parsing and formatting. |
| `backend/gold-calculations.js` | Exact 999/49 sale and 999/Gatti purchase calculations. |
| `backend/cash-ledger.js` | In-memory cash-flow domain model and day-closing arithmetic. |
| `backend/device_auth_schema.sql` | Legacy additive key/challenge schema; superseded by the consolidated schema for new deployments. |
| `backend/database_setup.sql` | Consolidated PostgreSQL schema, constraints/indexes, immutable audit triggers, and fixtures guarded to the disposable `kalash_gold_smoke_test` database. |
| `backend/test/` | Node built-in tests for calculations, cash flow, device signatures, inventory, analytics and frontend previews. |
| `backend/test/money.test.js` | Money parsing and formatting boundary tests. |
| `backend/test/gold-calculations.test.js` | Gold weight, purity, and payout calculation tests. |
| `backend/test/cash-ledger.test.js` | In-memory cash-flow and daily close model tests. |
| `backend/test/device-auth.test.js` | Device challenge signature verification tests. |
| `backend/test/finance.test.js` | Inventory carrying-cost allocation and exact analytics arithmetic tests. |
| `backend/test/owner-pin.test.js` | Owner PIN validation and scrypt verification tests. |
| `backend/test/frontend-financial-math.test.js` | Frontend preview math tests using Node's built-in test runner. |
| `backend/package.json` | Backend dependencies and `node --test` script. |
| `backend/package-lock.json` | Locks the backend's npm dependency resolution. |
| `backend/.env` | Local database/server secrets and settings, ignored by Git. Values are intentionally not reproduced in documentation. The expected PostgreSQL variable names are listed in the developer guide. |
| `backend/node_modules/` | Installed backend dependencies; generated/third-party files are not project source. |

### `frontend/`

| Path | Purpose |
|---|---|
| `frontend/.gitignore` | Frontend-local ignore rules. |
| `frontend/package.json` | Frontend scripts, React/Vite/lint dependencies, and Electron 44 declaration. |
| `frontend/package-lock.json` | Existing frontend dependency lock; Electron addition still needs `npm install` to synchronize it. |
| `frontend/vite.config.js` | Enables Vite's React plugin; no API proxy or deployment configuration is set. |
| `frontend/eslint.config.js` | ESLint settings for JavaScript, JSX, React Hooks, and React refresh. |
| `frontend/index.html` | Browser HTML shell and the mount point for the React app. |
| `frontend/README.md` | Frontend-specific run instructions and script summary. |
| `frontend/node_modules/` | Installed frontend dependencies; generated/third-party files are not project source. |
| `frontend/src/` | Frontend application code and styles. |
| `frontend/src/main.jsx` | Creates the React root and renders `App` inside `StrictMode`. |
| `frontend/src/App.jsx` | Terminal session state, view selection, and authenticated app shell composition. |
| `frontend/src/api.js` | Fetch-based API helper, HTTPS production guard, and in-memory token rotation handling. |
| `frontend/src/validation.js` | Shared finite-number and two-decimal-place input validation. |
| `frontend/src/components/AppShell.jsx` | Top navigation, device identity, sign-out, and content layout. |
| `frontend/src/components/FormField.jsx` | Labeled control wrapper with accessible hint and error wiring. |
| `frontend/src/components/Feedback.jsx` | Inline status, error, warning, and empty-state panel. |
| `frontend/src/components/Skeleton.jsx` | Accessible content placeholder for loading states. |
| `frontend/src/components/Toast.jsx` | Temporary success/error notification and dismiss control. |
| `frontend/src/hooks/useDraftForm.js` | React-memory-only form state, discarded when its view unmounts. |
| `frontend/src/hooks/useCustomerSearch.js` | Debounced customer search through the name/phone/ID search route. |
| `frontend/src/pages/LoginPage.jsx` | Challenge-based device sign-in and administrator-visible public-key details. |
| `frontend/src/pages/RatesPage.jsx` | Load, validate, and save today's rates. |
| `frontend/src/pages/CustomersPage.jsx` | Customer registration and name/phone search. |
| `frontend/src/pages/PaymentsPage.jsx` | Customer selection and transactional payment submission. |
| `frontend/src/pages/SalesPage.jsx` | Billing with rate-based math, customer debt breakdown, and owner override. |
| `frontend/src/pages/PurchasesPage.jsx` | Buyback calculations, printable vouchers, inventory intake, and opening-stock setup. |
| `frontend/src/pages/ExpensesPage.jsx` | Office and household expense entry. |
| `frontend/src/pages/LogbookPage.jsx` | Cash-flow review and day close/reconciliation. |
| `frontend/src/pages/AnalyticsPage.jsx` | Daily/weekly/monthly/custom profit reporting. |
| `frontend/src/financial-math.js` | BigInt-based client previews matching backend gold math. |
| `frontend/src/finance.css` | Responsive styling for the added financial views. |
| `frontend/src/App.css` | Global shell, controls, shared components, and responsive styling. |
| `frontend/src/pages.css` | Rates, customer, and payment page layouts and responsive styles. |
| `frontend/src/index.css` | Global starter styles and `--terminal-*` design tokens. |
| `frontend/src/assets/` | Images and SVG assets. |
| `frontend/src/assets/hero.png` | Static image asset; no application behavior is attached to it in the inspected component. |
| `frontend/src/assets/react.svg` | React logo asset from the starter template. |
| `frontend/src/assets/vite.svg` | Vite logo asset from the starter template. |
| `frontend/electron/main.cjs` | Hardened Electron window, ephemeral session, custom protocol, and IPC wiring. |
| `frontend/electron/device-credentials.cjs` | OS-encrypted Ed25519 terminal key generation, storage, and challenge signing. |
| `frontend/electron/receipt-printer.cjs` | Validates receipt content and prints through the standard OS print driver. |
| `frontend/electron/preload.cjs` | Context-isolated IPC methods exposed to the React renderer. |
| `frontend/public/` | Files served directly from the site root by Vite. |
| `frontend/public/favicon.svg` | Browser tab icon. |
| `frontend/public/icons.svg` | Static SVG icon resource. |

### `docs/`

| Path | Purpose |
|---|---|
| `docs/README.md` | Plain-English project overview, documentation contents, and project file catalog. |
| `docs/features.md` | Feature behavior, code locations, inputs/outputs, limitations, and connections. |
| `docs/data_model.md` | Current data entities, implementation mapping, relationships, and data flow. |
| `docs/live_schema.md` | Supplied live-schema metadata, enum values, device-key provisioning repair, setup additions, and deployment checks. |
| `docs/database_schema.md` | Owner-provided full ER diagram retained for future reference, with implementation status and outstanding clarifications. |
| `docs/authorised_devices_reference.sql` | Owner-provided `authorised_devices` DDL and seed, saved as a non-executable reference. |
| `docs/verification_matrix.md` | Derived US-01–US-11 and implicit stories, schema/index mapping, boundary cases, and known gaps. |
| `docs/api_reference.md` | Implemented API routes, headers, request/response examples, and errors. |
| `docs/developer_guide.md` | Local setup, environment settings, commands, structure, and coding patterns. |
| `docs/analysis.md` | Phase 1 technical findings and implementation gaps. |
| `docs/DESIGN.md` | Product colors, typography, spacing, component patterns, and accessibility tokens. |
| `docs/questions.md` | Unresolved backend/data/product decisions that should not be guessed. |
| `docs/test-data.md` | Conditional smoke-fixture coverage and safe disposable-database instructions. |
| `docs/test-data-plan.md` | Smoke-fixture scope, safety gate, and manual test workflow. |
| `docs/diagrams/` | Mermaid source diagrams for the main flows, interactions, data model, and architecture. |
| `docs/diagrams/main_flow.mmd` | Sign-in, financial workflows, owner authorization, and reporting flow. |
| `docs/diagrams/primary_sequence.mmd` | Device login and transactional sale sequence between components. |
| `docs/diagrams/data_model.mmd` | Mermaid ER diagram of the current finance and device schema. |
| `docs/diagrams/database_schema.mmd` | Mermaid ER diagram for the owner-provided schema. |
| `docs/diagrams/architecture.mmd` | Frontend, backend, database, and operator architecture overview. |

## Inventory and coverage

The documentation catalog covers the first-party frontend, backend, tests, configuration, SQL setup and migration references, project documentation, diagrams, static assets, supplied user stories, and owner-provided ERD. Installed `node_modules` content is third-party generated dependency material and is excluded. The local `.env` values and other secrets are not reproduced.

**No inventoried first-party application files were intentionally skipped.** Generated dependency trees and local secret values are excluded. Important absent items are called out rather than guessed: there is no route-level automated test suite, no dedicated invoice/purchase/expense history endpoints, and no declared deployment/hosting setup. The SQL has not been run against Neon.
