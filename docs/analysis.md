# Project Analysis — Re-run

## Scope and evidence

This report reflects the checked-in source/configuration, the user stories, and the ER diagram supplied by the owner on 2026-10-02. The diagram is preserved in [database_schema.md](./database_schema.md) and [diagrams/database_schema.mmd](./diagrams/database_schema.mmd). It is a reference model, not an executable migration or proof of the live database.

## A. Tech stack detection

| Area | Finding |
|---|---|
| Languages | JavaScript (ES modules/JSX in frontend; CommonJS in backend), CSS, HTML, SQL embedded in backend. |
| Runtime | Node.js is not pinned. Vite requires `^20.19.0` or `>=22.12.0`; declared Electron 44.5.1 requires Node `>=22.12.0`. |
| Frontend | React 19.2.8 with Vite 8.2.1 and `@vitejs/plugin-react`. |
| CSS | Plain CSS and CSS custom properties; no Tailwind, CSS Modules, or CSS-in-JS. |
| State | React hooks and component state; no external store. Protected session and form values are held in renderer memory. |
| UI kit | None. Native semantic HTML and project-owned components are used. |
| TypeScript | No; JavaScript/JSX. |
| Backend | Node.js, Express 5.2.1. |
| Data | PostgreSQL through `pg` 8.22.0. |
| Authentication | `jsonwebtoken` 9.0.3; Ed25519 device challenge-response, 5-minute JWTs, and per-request token rotation are implemented in backend source. |
| Other packages | `cors` 2.8.6, `dotenv` 17.4.2. |
| Desktop app | Electron 44.5.1 is declared in `frontend/package.json`; main/preload source uses OS-protected credentials and IPC. Electron lockfile installation and distributable packaging remain incomplete. |
| Hosting | Not declared. A comment mentions Neon, but no database hosting or API deployment setup is checked in. |

## B. API inventory

**Updated implementation status (2026-10-02):** In addition to auth, rates, customers, and payments, the backend now exposes rate-audit, invoice, purchase, expense, inventory/opening-stock, logbook/close, and profit-analytics routes. Full contracts are in [api_reference.md](./api_reference.md); confirmed column/enum metadata is in [live_schema.md](./live_schema.md).

Frontend base URL defaults to `http://localhost:4000` in development, configurable with `VITE_API_BASE_URL`; production builds reject non-HTTPS API URLs. The backend uses `PORT` (default 4000). Requests/responses are JSON.

| Method and path | Request | Current response |
|---|---|---|
| `POST /api/auth/device-challenge` | `{ "device_guid": string }` | `200 { challengeId, challenge }`; PostgreSQL stores a one-use challenge with a 60-second expiry. |
| `POST /api/auth/device-login` | `{ "device_guid": string, "challenge_id": string, "signature": string }` | `200 { token, device_name, device_guid, role }`; verifies Ed25519 proof and issues a 5-minute token. |
| `POST /api/gold-rates` | Four positive decimal strings: `rate_999_sell`, `rate_49_sell`, `rate_999_buy`, `rate_fine_gatti_buy` | `200` returned upserted row; validates scale and range. |
| `GET /api/gold-rates/today` | No body/query | `200` today's rate row or JSON `null`. |
| `POST /api/customers` | `{ full_name, phone_number, address? }` | `201` created customer; `400` invalid fields; `409` unique constraint error; otherwise `500`. |
| `GET /api/customers/search?q=...` | Non-empty name or phone substring | `200` array, newest first, limit 10; `400` if the query is absent or invalid. |
| `POST /api/payments` | `{ customer_id, amount_paid, payment_mode?, notes? }` | `201 { payment, previous_balance, updated_balance }`; mode defaults to `CASH`. |

All routes except device login use `Authorization` Bearer JWT and `x-device-guid`. Middleware also checks the GUID in the JWT and whether the device remains active. Protected middleware failures use `401` or `403`. Typical error body is `{ "error": string }`; missing customer and other payment errors currently return `500`.

**Correction to the preceding sentence:** It is outdated and should be disregarded. Both `/api/auth/device-challenge` and `/api/auth/device-login` are public; other registered API routes require `Authorization: Bearer <token>` and `x-device-guid`. Customer registration validates required strings and may return `400`; customer search requires a non-empty `phone` and may return `400`. Payments return `404` for an unknown customer, `400` for invalid input, and `422` if the updated balance exceeds the supported decimal range.

Protected requests return a replacement access token in `X-Access-Token`; the client holds the newest token in React memory. There is no pagination, upload, explicit refresh/logout endpoint, owner-PIN, sales-invoice, purchase, expense, logbook, day-close, profit-report, audit-write, or print API endpoint.

**Authentication/deployment limitation:** Device keys must be manually provisioned in PostgreSQL using the additive SQL in `backend/device_auth_schema.sql`. There is no owner portal or public enrollment API. The backend listens on HTTP; production TLS must terminate at a configured HTTPS ingress.

## C. Data model

The owner-provided logical model contains the entities below. Actual public column types, constraints, and enums supplied from Neon are documented in [live_schema.md](./live_schema.md).

| Entity | Fields and types (as supplied) | Role and relationship |
|---|---|---|
| `daily_gold_rates` | UUID `rate_id` PK; DATE `rate_date` UK; four DECIMAL rate fields; TIMESTAMP `created_at`, `updated_at` | Operator rates; one date can have audit history. |
| `daily_gold_rates_audit` | UUID `audit_id` PK; UUID `rate_id` FK; DECIMAL old/new 999 sell and 49 sell; VARCHAR `changed_by`; TIMESTAMP `changed_at` | Internal immutable rate audit model, as described in the story. |
| `customers` | UUID `customer_id` PK; VARCHAR `full_name`; VARCHAR `phone_number` UK; TEXT `address`; DECIMAL `pending_balance`; TIMESTAMP `created_at`, `updated_at` | Customer accounts. |
| `sales_invoices` | UUID `invoice_id` PK; VARCHAR `invoice_number` UK; UUID `customer_id` FK; DATE `invoice_date`; DECIMAL `total_amount`, `cash_received`, `pending_amount_added`; TIMESTAMP `created_at` | Customer sales and partial payments. |
| `sales_invoice_items` | UUID `item_id` PK; UUID `invoice_id` FK; ENUM `category`; DECIMAL actual/billed weights, applied rate, line total | Lines contained by an invoice. |
| `purchase_vouchers` | UUID `voucher_id` PK; VARCHAR `voucher_number` UK; UUID `customer_id` FK; DATE `purchase_date`; ENUM `category`; DECIMAL actual weight, touch, fine weight, rate, payout; TIMESTAMP `created_at` | Customer buyback/purchase voucher. |
| `debt_payments` | UUID `payment_id` PK; VARCHAR `receipt_number` UK; UUID `customer_id` FK; DATE `payment_date`; DECIMAL `amount_paid`; ENUM `payment_mode`; TEXT `notes`; TIMESTAMP `created_at` | Debt settlements. |
| `expenses` | UUID `expense_id` PK; DATE `expense_date`; ENUM `category`, `payment_mode`; DECIMAL `amount`; VARCHAR `description`; TIMESTAMP `created_at` | Office/household cash expenses. |
| `daily_logbook_summaries` | UUID `logbook_id` PK; DATE `log_date` UK; DECIMAL opening, inflows, outflows, calculated close, actual cash, variance; BOOLEAN `is_closed`; TIMESTAMP `closed_at` | Daily cash reconciliation. Renamed from the original singular table during setup. |
| `logbook_entries` | UUID `entry_id` PK; DATE `log_date`; ENUM `entry_type`, `payment_mode`, `source_type`; DECIMAL `amount`; UUID `source_reference_id`; VARCHAR `description`; TIMESTAMP `created_at` | Cash movements, linked polymorphically to their source. |

The app queries `authorised_devices` (`device_id`, `device_guid`, `device_name`, `device_public_key`, `is_active`, `role`) and `device_auth_challenges`. Public-key and challenge-table additions are documented in [the manual auth schema SQL](../backend/device_auth_schema.sql).

Live enum values, precision/scale, and constraints supplied by the owner are documented in [live_schema.md](./live_schema.md). The consolidated setup adds buy-rate audit fields, owner PIN support, inventory support, and source-linked cash-flow indexes.

The finance APIs now write invoices, purchases, expenses, debt payments, rate audit records, inventory changes, and source-linked logbook entries in database transactions. Only CASH transactions affect drawer totals. Earlier statements in this analysis that say these workflows are absent are historical and superseded by [api_reference.md](./api_reference.md).

## D. Existing frontend

The Electron/React UI has authenticated views for Daily Rates, Customers, Payments, Billing, Purchases, Expenses, Logbook, and Analytics. It uses React state, fetch, loading/error/empty feedback, debounced name/phone search, toast feedback, and memory-only form state. Its source inventory is in [README.md](./README.md#project-file-catalog).

The design uses warm gold accent tokens, neutral light/dark surfaces, system fonts, and plain responsive CSS. There is no router, UI library, or external state library. Electron main/preload sources exist, but the dependency lock and distributable packaging still need completion.

### Gaps against the new stories

- US-01 through US-11 have corresponding API/UI workflows, including PIN-authorized rate changes/overrides/stock setup/day close, source-linked logbook detail, and date-range analytics. See the [verification matrix](./verification_matrix.md); source code has not been run against Neon.
- US-11 follows the supplied formula: period revenue minus period purchase payouts, then office costs and optionally household costs. The daily average divides by inclusive calendar days.
- The application has no person-level login system. Audit identity is a single provisioned owner PIN credential plus terminal identity.
- There are no dedicated invoice, purchase, or expense history endpoints/pages, cloud-hosting/TLS configuration, or desktop installer workflow.
- Electron main/preload source adds OS-protected private-key storage, memory-only Chromium session controls, and IPC printing through the OS driver for invoices, vouchers, and receipts. The accepted spooler exception may retain jobs on disk. Packaging and an owner portal are absent.
- Current backend transfer security is deployment-dependent: the code listens with plain HTTP and no TLS 1.3 termination is configured in this repository.

## E. Gaps and recommendations

1. Keep React/Vite/Express/PostgreSQL and use Electron only as the requested desktop wrapper. Use scaled `BigInt` arithmetic instead of adding a decimal library.
2. Use the supplied live-schema metadata in [live_schema.md](./live_schema.md), and review/apply [database_setup.sql](../backend/database_setup.sql) manually.
3. Manually provision each terminal's Ed25519 public key after the schema is installed.
4. Configure production HTTPS/TLS, `VITE_API_BASE_URL`, runtime `GOLD_API_URL`, and exact CORS origins. CORS is not an authentication control.
5. Back up and review `backend/database_setup.sql`, then apply it to the intended database; no schema script has been applied to Neon by this work.
6. OS paging/swap, crash dumps, privileged process inspection, and accepted printer-spooler retention remain host-level controls; Electron cannot guarantee that process data never reaches disk.

## Phase 2 — security and local-exposure audit

| Finding | Status | Why it matters / next step |
|---|---|---|
| Device GUID was the only login factor | **Hardened in source; DB setup required** | Login now requires Ed25519 proof, a single-use 60-second challenge, and 5-minute JWTs. Apply the manual SQL and provision each terminal's public key. |
| Browser form persistence | **Fixed in this repo** | Earlier form drafts used `sessionStorage`; form values now exist only in React memory and are discarded on view unmount. |
| JWT signing fallback | **Fixed in this repo** | Backend now refuses to start unless `JWT_SECRET` is set. The deployed secret still needs protected delivery and rotation procedures. |
| CORS origin reflection | **Hardened, deployment pending** | Backend uses an exact-origin allowlist with `goldline://app` and Vite development origins as defaults. Production allowlist must be explicitly configured. |
| PostgreSQL certificate verification | **Fixed in this repo** | `rejectUnauthorized` is now true. Private database CA trust must be configured rather than disabling verification. |
| Client-to-API TLS 1.3 | **Open** | Backend starts with `app.listen` and no HTTPS listener/proxy config. The localhost default is HTTP. Production TLS 1.3 must be provided and verified at the selected ingress. |
| Process memory and OS paging | **Platform control required** | JavaScript strings/GC and OS swap/pagefile/core dumps prevent a reliable app-only guarantee that RAM contents never reach disk. Use managed endpoint controls, crash policy, disk encryption, and threat-model decisions. |
| Chromium web storage/cache | **Hardened in Electron source** | Uses a non-persistent session partition, disables caches, clears session data on startup/logout/exit, and lints against browser persistence APIs. |
| Chromium DevTools inspection | **Reduced, not eliminated** | DevTools is disabled in packaged builds; privileged process inspection can still read memory. |
| Printer spooler retention | **Accepted exception** | Receipt data is passed over IPC to the standard OS print driver. The spooler may write temporary data to disk, an exception accepted by the owner. |

### Remaining implementation limits

The owner accepted external OS controls, administrator-provisioned keys, and standard printer-spooler retention as an exception. See the [verification matrix](./verification_matrix.md) for the status of each story. The pure cash ledger is not a substitute for persistent DB constraints or transaction integration; open contracts are listed in [questions.md](./questions.md). Electron installation/lockfile synchronization and distributable packaging remain unverified in this environment.
