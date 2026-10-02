# Project Analysis — Re-run

## Scope and evidence

This report reflects the checked-in source/configuration, the user stories, and the ER diagram supplied by the owner on 2026-10-02. The diagram is preserved in [database_schema.md](./database_schema.md) and [diagrams/database_schema.mmd](./diagrams/database_schema.mmd). It is a reference model, not an executable migration or proof of the live database.

## A. Tech stack detection

| Area | Finding |
|---|---|
| Languages | JavaScript (ES modules/JSX in frontend; CommonJS in backend), CSS, HTML, SQL embedded in backend. |
| Runtime | Node.js is not pinned. Locked Vite requires Node `^20.19.0` or `>=22.12.0`; Express 5 requires Node `>=18`. |
| Frontend | React 19.2.8 with Vite 8.2.1 and `@vitejs/plugin-react`. |
| CSS | Plain CSS and CSS custom properties; no Tailwind, CSS Modules, or CSS-in-JS. |
| State | React hooks and component state; no external store. Protected session and form values are held in renderer memory. |
| UI kit | None. Native semantic HTML and project-owned components are used. |
| TypeScript | No; JavaScript/JSX. |
| Backend | Node.js, Express 5.2.1. |
| Data | PostgreSQL through `pg` 8.22.0. |
| Authentication | `jsonwebtoken` 9.0.3, device JWT currently issued for 12 hours. |
| Other packages | `cors` 2.8.6, `dotenv` 17.4.2. |
| Desktop app | No Electron dependency, main/preload process, IPC, packaging configuration, OS keychain integration, or native printer support exists in this repository. |
| Hosting | Not declared. A comment mentions Neon, but no database hosting or API deployment setup is checked in. |

## B. API inventory

Frontend base URL defaults to `http://localhost:4000`, configurable with `VITE_API_BASE_URL`. The backend uses `PORT` (default 4000). Requests/responses are JSON.

| Method and path | Request | Current response |
|---|---|---|
| `POST /api/auth/device-login` | `{ "device_guid": string }` | `200 { token, device_name }`; `400` missing GUID, `401` unknown/inactive device, `500` database error. |
| `POST /api/gold-rates` | Four rate values: `rate_999_sell`, `rate_49_sell`, `rate_999_buy`, `rate_fine_gatti_buy` | `200` returned upserted row; writes the database's current date. |
| `GET /api/gold-rates/today` | No body/query | `200` today's rate row or JSON `null`. |
| `POST /api/customers` | `{ full_name, phone_number, address }` | `201` created customer; `409` unique constraint error; otherwise `500`. |
| `GET /api/customers/search?phone=...` | Phone-number substring | `200` array, newest first, limit 10. |
| `POST /api/payments` | `{ customer_id, amount_paid, payment_mode?, notes? }` | `201 { payment, previous_balance, updated_balance }`; mode defaults to `CASH`. |

All routes except device login use `Authorization` Bearer JWT and `x-device-guid`. Middleware also checks the GUID in the JWT and whether the device remains active. Protected middleware failures use `401` or `403`. Typical error body is `{ "error": string }`; missing customer and other payment errors currently return `500`.

There is no pagination, upload, refresh-token, logout/revocation, owner-PIN, sales-invoice, purchase, expense, logbook, day-close, profit-report, audit-write, or print endpoint.

**Authentication limitation:** Device login accepts the public client’s fixed `device_guid` as its only credential. A GUID shipped in frontend assets is discoverable and does not prove device possession.

## C. Data model

The owner-provided logical model contains:

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
| `daily_logbook_summary` | UUID `logbook_id` PK; DATE `log_date` UK; DECIMAL opening, inflows, outflows, calculated close, actual cash, variance; BOOLEAN `is_closed`; TIMESTAMP `closed_at` | Daily cash reconciliation. |
| `logbook_entries` | UUID `entry_id` PK; DATE `log_date`; ENUM `entry_type`, `payment_mode`, `source_type`; DECIMAL `amount`; UUID `source_reference_id`; VARCHAR `description`; TIMESTAMP `created_at` | Cash movements, linked polymorphically to their source. |

The app queries `authorized_devices` (`device_id`, `device_guid`, `device_name`, `is_active`). The supplied DDL has been normalized to the same table spelling, as confirmed by the project owner. It still does not define a device secret/public key; see [the device schema reference](./authorised_devices_reference.sql).

Not specified by the model: ENUM values; DECIMAL precision/scale; nullability/defaults; FK delete/update rules; unique strategy for polymorphic logbook references. The audit entity only records changes to two sell rates, not the buy rates.

The current API implements only rate read/upsert, customer create/search, and debt-payment insert/balance adjustment. It does not currently insert rate audit rows or model the other listed business flows.

## D. Existing frontend

The current browser UI has a device-auth screen and three authenticated views: Daily Rates, Customers (create/search), and Payments (customer selection/payment). Source is organized across `frontend/src/pages/`, `components/`, `hooks/`, `api.js`, and CSS files. It uses React state, fetch, skeleton/empty/error states, debounced phone search, toast feedback, and tab-independent memory-only form state. Its exact current source inventory is in [README.md](./README.md#project-file-catalog).

The design uses warm gold accent tokens, neutral light/dark surfaces, system fonts, and plain responsive CSS. No router, UI library, design-token framework, or Electron renderer/main-process split exists.

### Gaps against the new stories

- Only US-01's basic rate entry/read is partially supported; no owner PIN or immutable audit record is implemented.
- US-02/03 sale calculations, overrides, and invoices/items do not exist.
- US-04 buyback/purchase voucher and inventory intake do not exist.
- US-05/06 invoice-based partial payment, debt banners, and invoice balance summaries do not exist.
- US-07 has a basic debt-payment API, but no UPI mode contract, payment-history receipt endpoint, or logbook inflow.
- US-08 through US-11 (automated logbook entries, expenses, close/reconciliation, profit analytics) do not exist in backend routes.
- Electron, secure device provisioning, credential vault access, native ESC/POS IPC printing, packaging, and update/kill-switch support are absent.
- Current backend transfer security is deployment-dependent: the code listens with plain HTTP and no TLS 1.3 termination is configured in this repository.

## E. Gaps and recommendations

1. Keep the present React/Vite/Express/PostgreSQL stack; do not add replacement UI or state libraries. Electron is explicitly part of the target but not currently installed or configured.
2. Treat the owner ERD and device DDL as reference models until a migration or live schema export confirms their constraints.
3. Complete authentication design before adding an Electron shell: per-device proof-of-possession must use an OS credential vault and a matching server-side enrollment/verification contract. The current public GUID login is insufficient; the supplied DDL contains no per-device key.
4. Define production HTTPS/TLS termination and the Electron renderer origin before configuring CORS. CORS is not an access-control substitute.
5. Agree the transaction/API contracts and numeric constraints for invoices, purchase vouchers, expenses, logbook entries and close, and analytics before UI or state-machine implementation.
6. Use scaled integer arithmetic or an already-installed arbitrary-precision package for money/weight calculations. No decimal arithmetic package is currently declared; do not silently rely on binary floating-point for ledger postings.
7. Printer spooler retention, OS pagefile/swap, crash dumps, and privileged DevTools/runtime inspection cannot be guaranteed away by React or Electron alone. Require managed OS/device policy and validate the actual printer/driver path.

## Phase 2 — security and local-exposure audit

| Finding | Status | Why it matters / next step |
|---|---|---|
| Device GUID is public and sole login factor | **Open, high risk** | A caller who extracts the frontend constant can request a 12-hour JWT for an active device. The confirmed `authorized_devices` DDL has no per-device key hash. Requires an approved provisioning/schema contract. |
| Browser form persistence | **Fixed in this repo** | Earlier form drafts used `sessionStorage`; form values now exist only in React memory and are discarded on view unmount. |
| JWT signing fallback | **Fixed in this repo** | Backend now refuses to start unless `JWT_SECRET` is set. The deployed secret still needs protected delivery and rotation procedures. |
| CORS origin reflection | **Hardened, deployment pending** | Backend now has an exact-origin allowlist. Current defaults are Vite localhost origins; Electron `file:`/opaque `null` origin is not allowed. Final origin requires deployment choice. CORS is not authentication. |
| PostgreSQL certificate verification | **Fixed in this repo** | `rejectUnauthorized` is now true. Private database CA trust must be configured rather than disabling verification. |
| Client-to-API TLS 1.3 | **Open** | Backend starts with `app.listen` and no HTTPS listener/proxy config. The localhost default is HTTP. Production TLS 1.3 must be provided and verified at the selected ingress. |
| Process memory and OS paging | **Platform control required** | JavaScript strings/GC and OS swap/pagefile/core dumps prevent a reliable app-only guarantee that RAM contents never reach disk. Use managed endpoint controls, crash policy, disk encryption, and threat-model decisions. |
| Chromium DevTools inspection | **Open platform risk** | A local operator with debugging privileges can inspect renderer state. No Electron production policy or debugger restriction exists; privileged host compromise cannot be solved by UI code alone. |
| Printer spooler retention | **No implementation yet** | No print path exists. Raw ESC/POS over IPC still needs a platform/device path that avoids or formally accepts spooler persistence. Validate on target OS/printer. |

### Stop gate before implementation

Per the supplied execution protocol, the audit stops here rather than adding Electron, calculations, financial state machines, or new routes. Required decisions are recorded in [questions.md](./questions.md). The device table columns and canonical spelling are now confirmed, but the absent per-device credential/provisioning contract leaves authentication design blocked.

The new stories also add 11 workflows beyond the existing 3 protected views. Phase 3's verification matrix and Phase 4 code deliverables must wait until the owner confirms the security architecture and missing API/data contracts. The earlier top navigation map is not sufficient for these newly specified flows.
