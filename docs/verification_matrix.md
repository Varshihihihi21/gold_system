# User-story verification matrix

This matrix translates US-01 through US-11 into concrete verification cases. Monetary inputs and outputs use decimal strings; calculations use scaled integers. Listed finance routes and screens are implemented in source but remain dependent on manually applying migration 001 and have not been run against Neon.

| Story | Boundary cases and risks | Verification vectors and expected results | Current coverage |
|---|---|---|---|
| US-01 Daily rates | Missing/zero/negative rate; more than 2 decimal places; unauthorized edits; immutable before/after audit rows for all rates. | `100.25` accepted; `100.256` and `0.00` rejected. Update twice from OWNER device and verify both audit records. | Implemented in rate API/UI. Owner authorization uses a provisioned OWNER terminal, not a PIN. Buy-rate audit columns require migration 001. |
| US-02 Sales calculations | Maximum `DECIMAL(12,4)` weight; 0.1% billed-weight rounding; half-cent rounding; money overflow. | 999: `10.1250 g × 70.00 = 708.75`. 49: `100.0000 g → 100.1000 g × 70.00 = 7007.00`. Reject weight `1.00001`. | Exact helpers, automated vectors, invoice API and UI implemented. |
| US-03 Price validation | One-cent tolerance; mismatches and unauthorized override. | Expected `100.00`: `100.01` accepted; `100.02` rejected unless the authenticated device is OWNER. Confirm override audit row contains both values and device. | Exact-cent helper, server guard, owner-device override and audit table implemented. |
| US-04 Gold purchase | Weight precision; touch at 0%, 100%, and above 100%; fine-weight rounding; zero weight. | 999: `1.2500 g × 68.40 = 85.50`. Gatti: `10.0000 g × 88.50% = 8.8500 g`; at `70.00`, payout `619.50`. Reject touch `100.01` and zero weight. | Purchase helper, voucher/inventory API, UI and cash outflow implemented. |
| US-05 Partial sale payment | Cash equal to, below, or above invoice total; rollback consistency. | Total `100.00`, cash `40.25` → pending `59.75`; cash inflow exactly `40.25`. Cash above total rejected. | Invoice, debt and logbook posting are transactionally implemented. |
| US-06 Outstanding debt banner | Zero/positive/negative balance; name or phone search; split-balance summary. | Previous debt `25.00`, sale `100.00`, paid `60.00` → revised debt `65.00`; show previous balance, current bill, cash paid, and remaining balance. | Name/phone picker and sale balance summary implemented. |
| US-07 Standalone repayment | Zero/negative payment; exact-cent subtraction; permitted overpayment; payment modes. | Previous debt `50.00`, payment `12.35` → new debt `37.65`, CASH inflow `12.35`; reject `0.00`; non-CASH doesn't change drawer totals. | Debt-payment route and UI support CASH, BANK_TRANSFER, UPI, CARD; updates and cash posting are transactional. |
| US-08 Automatic logbook postings | Duplicate source; competing requests; rollback; non-cash mode; closed day. | Sale/payment creates one inflow; purchase/expense creates one outflow. Verify unique source reference and all-or-nothing commit. | PostgreSQL transactions and partial unique source index (migration 001) protect postings. |
| US-09 Expense categories | Office/household classification; invalid amount; cash versus non-cash. | CASH expense `20.00` decreases drawer by `20.00`; non-cash expense does not. | Expense API/UI and confirmed enums implemented; reporting classifies both categories. |
| US-10 Day reconciliation | Missing/unfinished prior close; variance signs; repeated close; posting after close. | Opening `50.00`, inflow `5.00`, outflow `1.25` → close `53.75`; physical `53.25` → variance `-0.50`; reject new entries after close. | Persistent logbook summary, transaction lock and UI close workflow implemented. |
| US-11 Profit analytics | Empty range; inclusive dates; household toggle; missing legacy costs; average rounding. | Revenue `1000`, COGS `600`, office `50`, household `25` → gross `400`, operating `350`, retained `325`; operating dates determine average. | API/UI implemented. Operating day is a date with a sale, purchase, payment, or expense; missing historical cost returns incomplete/null profit. |

## Cross-cutting acceptance checks

- Reject malformed decimals, scientific notation, excess scale, and values beyond the stated `DECIMAL` limits.
- Verify the 49 surcharge and touch calculations at four-decimal gram precision, then round currency once to cents as documented in the pure calculation helpers.
- Verify sales, customer balance updates, invoices, logbook entries, and close operations share one PostgreSQL transaction. Run concurrency/idempotency checks after manually applying migration 001.
- Verify a disabled device is rejected on its next protected request and the renderer clears its in-memory session; the current API checks active status on every protected call.
- Test packaged Electron with the actual operating-system account, GPU/cache configuration, production API origin, and target printer. OS paging, crash dumps, privileged process inspection, and standard printer spooler retention remain host-level exposure controls, not app guarantees.

## Deployment prerequisites before end-to-end testing

1. Apply and review `backend/device_auth_schema.sql`; provision each row with the Ed25519 public key displayed by its terminal.
2. Set `GOLD_DEVICE_GUID` per terminal and `VITE_API_BASE_URL` to the production HTTPS endpoint before packaging.
3. Set the backend's `CORS_ORIGINS` to the actual client origin and configure TLS 1.3 at the selected cloud ingress.
4. Apply the operating-system controls documented in [questions.md](./questions.md), and acknowledge that standard USB/driver printing may retain spool data on disk.
5. Review and apply `backend/migrations/001_financial_workflows.sql` manually; then run backend tests and end-to-end testing on a disposable Neon branch before production deployment.
