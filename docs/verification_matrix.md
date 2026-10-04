# User stories and verification matrix

This document maps the supplied US-01–US-11 requirements to the current application and database contract. “Implemented” means code exists; it does not mean a Neon deployment or live end-to-end test has passed.

## Derived functional requirements

1. **US-01 — Daily rates:** an owner configures four positive, cent-precision rates per business date; invoices and purchase vouchers use those saved rates; changes are recorded with before/after values, timestamp, owner identity, and terminal.
2. **US-02 — Gold sales:** create invoice lines for 999 or 49 gold; apply today’s category rate; apply the 0.1% billed-weight uplift only to 49; retain actual, billed, and fine weights to four decimal places and money to cents.
3. **US-03 — Price guard:** compare the submitted line total with the server calculation; reject differences greater than ₹0.01 unless an owner PIN approves; retain an immutable override audit with expected and charged amounts.
4. **US-04 — Gold buyback:** create a customer voucher for 999 or Gatti; calculate 999 payout from actual weight, or Gatti fine weight from weight × touch%; atomically update inventory and post the payout as a cash outflow.
5. **US-05 — Partial sale payment:** accept a payment no greater than the sale total; add the unpaid remainder to customer pending debt; record only payment received as the sale’s logbook inflow.
6. **US-06 — Customer debt visibility:** search customers by name, phone, or ID; show existing pending debt; include previous debt, current bill, payment today, and revised balance in the printed invoice.
7. **US-07 — Standalone debt payment:** accept a positive payment and payment mode without a sale; reduce the customer balance; provide a receipt with starting, paid, and remaining amounts; record an inflow entry.
8. **US-08 — Automatic logbook:** transaction routes create source-linked entries for sales, purchases, debt payments, and expenses in the same database transaction as their source records; duplicate source postings are prevented.
9. **US-09 — Expenses:** record a positive expense as OFFICE or HOUSEHOLD and classify it as an outflow for reporting; only a CASH expense changes drawer totals.
10. **US-10 — Cash reconciliation:** carry the last closed day’s calculated balance forward; calculate cash-only running totals; require an owner PIN to record physical cash, variance, and close the day; reject subsequent postings to a closed day.
11. **US-11 — Profit reporting:** for the selected inclusive date range, calculate sales revenue less purchase payouts, then subtract OFFICE expenses and optionally HOUSEHOLD expenses; return total and average per calendar day.
12. **Cross-cutting precision and integrity:** validate amounts/weights at API boundaries; keep source transactions, customer balance, inventory, and cash posting atomic; retain audit records; index customer search, foreign keys, dates, and reporting filters.

## Additional implicit requirements from current code

13. **IM-01 — Approved-terminal sign-in:** provision a terminal public key, issue and consume a one-time challenge, verify an Ed25519 signature, and check active status on protected requests.
14. **IM-02 — Customer registry:** register customers with unique phone numbers and find them by partial name, phone, or UUID.
15. **IM-03 — Inventory setup/accounting:** configure one verified opening balance, prevent a second setup after activity, and atomically adjust physical grams, fine grams, and carrying cost on sale/buyback.
16. **IM-04 — Transaction documents:** return and print a sale invoice, purchase voucher, or debt-payment receipt after the corresponding transaction commits.
17. **IM-05 — Transaction safety:** roll back all related customer, inventory, and logbook changes if any write fails; reject inactive terminals and rotate the short-lived access token after protected calls.

## Story-to-schema and test matrix

| # | User Story (derived) | Tables/Columns that satisfy it | Index supporting it |
|---|---|---|---|
| 1 | US-01 Daily rates and audited changes | `daily_gold_rates(rate_date, rate_999_sell, rate_49_sell, rate_999_buy, rate_fine_gatti_buy)`; `daily_gold_rates_audit(old_*, new_*, changed_by, changed_at, owner_user_id)`; `owner_pin_credentials`; `owner_action_audit` | `daily_gold_rates(rate_date)` unique; `idx_rate_audit_rate_changed(rate_id, changed_at DESC)`; `idx_owner_action_audit_user_time(owner_user_id, created_at DESC)` |
| 2 | US-02 999/49 sales math | `sales_invoices`; `sales_invoice_items(category, actual_weight_grams, billed_weight_grams, applied_rate_per_gram, fine_weight_grams, line_total)` | `idx_sales_invoices_date(invoice_date)`; `idx_sales_invoice_items_invoice(invoice_id)` |
| 3 | US-03 Price validation and authorized override | `sales_price_overrides(expected_amount, charged_amount, invoice_id, item_id, owner_device_id, owner_user_id)`; `owner_action_audit` | `idx_sales_price_overrides_invoice(invoice_id)`; `idx_sales_price_overrides_item(item_id)`; `idx_sales_price_overrides_owner_user(owner_user_id)` |
| 4 | US-04 999/Gatti purchase and intake | `purchase_vouchers(customer_id, category, actual_weight_grams, touch_percentage, fine_weight_grams, applied_rate_per_gram, total_payout_amount)`; `inventory_balances`; `logbook_entries` | `idx_purchase_vouchers_customer_date(customer_id, purchase_date)`; `idx_purchase_vouchers_date(purchase_date)`; `uq_logbook_source_reference(source_type, source_reference_id)` |
| 5 | US-05 Partial sale and pending balance | `sales_invoices(total_amount, cash_received, pending_amount_added, customer_id)`; `customers(pending_balance)`; `logbook_entries` | `idx_sales_invoices_customer_date(customer_id, invoice_date)`; `uq_logbook_source_reference(source_type, source_reference_id)` |
| 6 | US-06 Debt lookup and receipt summary | `customers(customer_id, full_name, phone_number, pending_balance)`; `sales_invoices`; `debt_payments` | `idx_customers_full_name_trgm`; `idx_customers_phone_trgm`; `idx_customers_id_text_trgm`; `idx_sales_invoices_customer_date(customer_id, invoice_date)` |
| 7 | US-07 Debt settlement receipt | `debt_payments(customer_id, amount_paid, payment_mode, payment_date, receipt_number)`; `customers(pending_balance)`; `logbook_entries` | `idx_debt_payments_customer_date(customer_id, payment_date)`; `uq_logbook_source_reference(source_type, source_reference_id)` |
| 8 | US-08 Source-linked cash flow | `logbook_entries(log_date, entry_type, amount, payment_mode, source_type, source_reference_id)`; `daily_logbook_summaries`; source tables | `idx_logbook_entries_date_created(log_date, created_at)`; partial unique `uq_logbook_source_reference(source_type, source_reference_id)` |
| 9 | US-09 Office/household expenses | `expenses(expense_date, category, amount, payment_mode)`; `logbook_entries` | `idx_expenses_date_category(expense_date, category)`; `uq_logbook_source_reference(source_type, source_reference_id)` |
| 10 | US-10 Opening, close, variance, lock | `daily_logbook_summaries(log_date, opening_balance, total_inflows, total_outflows, calculated_closing_balance, actual_physical_cash, cash_variance, is_closed, closed_at)`; `owner_action_audit` | Unique `daily_logbook_summaries(log_date)`; `idx_logbook_entries_date_created(log_date, created_at)` |
| 11 | US-11 Profit and calendar-day average | `sales_invoices(invoice_date)` + `sales_invoice_items(line_total)`; `purchase_vouchers(purchase_date, total_payout_amount)`; `expenses(expense_date, category, amount)` | `idx_sales_invoices_date(invoice_date)`; `idx_purchase_vouchers_date(purchase_date)`; `idx_expenses_date_category(expense_date, category)` |
| 12 | IM-01 Approved-terminal authentication | `authorised_devices(device_guid, device_public_key, is_active, role)`; `device_auth_challenges(device_id, nonce, expires_at)` | Unique `authorised_devices(device_guid)`; `idx_device_auth_challenges_device_expiry(device_id, expires_at)`; `idx_device_auth_challenges_expiry(expires_at)` |
| 13 | IM-02 Customer registry and search | `customers(customer_id, full_name, phone_number, address, pending_balance)` | Unique `customers(phone_number)`; `idx_customers_full_name_trgm`; `idx_customers_phone_trgm`; `idx_customers_id_text_trgm` |
| 14 | IM-03 Opening inventory and cost tracking | `inventory_balances(physical_stock_grams, fine_stock_grams, inventory_cost_amount, opening_configured, has_activity)`; `sales_invoice_items(cost_basis_amount)`; `purchase_vouchers` | Singleton primary key `inventory_balances(balance_id)`; purchase/sale date indexes listed above |
| 15 | IM-04 Printed transaction documents | `sales_invoices` + items; `purchase_vouchers`; `debt_payments` | Unique invoice, voucher, and receipt number constraints; customer/date indexes listed above |
| 16 | IM-05 Transaction safety and token checks | Source transaction tables, `customers`, `inventory_balances`, `daily_logbook_summaries`, `logbook_entries`, `authorised_devices` | `uq_logbook_source_reference`; row locks serialize customer, inventory, and daily logbook updates |

## Verification vectors

| Story | Verification vector | Required result |
|---|---|---|
| US-01 | Save four positive rates, update at least one, query `daily_gold_rates_audit`, then attempt update/delete on an audit row. | Original and new values plus owner and terminal are retained; audit row mutation is rejected. |
| US-02 | 999: `10.1250 g × ₹70.00`; 49: `100.0000 g × 1.001 × ₹70.00`. | ₹708.75 and ₹7,007.00 respectively; billed gram precision is four places. |
| US-03 | Expected ₹100.00, entered ₹100.01, then ₹100.02 without and with correct owner PIN. | One-paisa variance is accepted; two-paisa variance is blocked without authorization and audited if overridden. |
| US-04 | Gatti: `10.0000 g × 88.50% × ₹70.00`; try touch 0 and >100. | Fine weight 8.8500 g; payout ₹619.50; invalid touch and zero weight are rejected. Voucher, stock, and outflow are committed together. |
| US-05 | Invoice ₹100.00, received ₹40.25. | Pending addition ₹59.75; customer balance grows by ₹59.75; cash logbook inflow is ₹40.25. |
| US-06 | Starting debt ₹25.00; new bill ₹100.00; pay ₹60.00. | Invoice summary shows previous ₹25.00, current ₹100.00, received ₹60.00, revised debt ₹65.00. |
| US-07 | Starting debt ₹50.00; pay ₹12.35 by CASH, then separately test UPI. | Receipt shows ₹50.00, ₹12.35, ₹37.65. Both source payments are logged; only CASH changes drawer totals. |
| US-08 | Post each transaction type twice using the same source reference. | First transaction writes one posting; duplicate source posting is rejected. |
| US-09 | Record OFFICE CASH ₹20.00 and HOUSEHOLD UPI ₹15.00. | Both are classified OUTFLOW; only ₹20.00 reduces physical drawer balance. |
| US-10 | Opening ₹50.00, inflow ₹5.00, outflow ₹1.25, counted cash ₹53.25. | Calculated close ₹53.75, variance -₹0.50; close requires owner PIN and then blocks further posting. |
| US-11 | Revenue ₹1,000.00; purchases ₹600.00; OFFICE ₹50.00; HOUSEHOLD ₹25.00, for a 2-day date range. | Gross ₹400.00; operating ₹350.00; retained ₹325.00 (or ₹350.00 with household excluded); daily averages ₹162.50 or ₹175.00. |

## Assumptions and known gaps

- Sales accept only cash received today in the current form; debt payments and expenses allow CASH, BANK_TRANSFER, UPI, and CARD. Purchases are recorded as cash payouts by the current purchase API.
- Non-cash movements are included in `logbook_entries`, but excluded from physical drawer inflow/outflow totals and closing balance.
- The owner is represented by a singleton PIN credential, not separate user accounts. Audit rows identify the PIN credential and authorized terminal.
- A printed purchase voucher is available from the purchase success state. Sales and debt-payment receipts are also printable. There are no dedicated browse/history endpoints or pages yet for invoices, purchases, or expenses.
- `daily_gold_rates_audit`, `owner_action_audit`, and `sales_price_overrides` are protected against UPDATE/DELETE by database triggers. Production database owners can still disable triggers; backups and database permissions remain important.
- The SQL fixtures run only when the current database is named `kalash_gold_smoke_test`. The seeded owner PIN hash is intentionally unusable; configure a PIN with `node backend/set-owner-pin.js` in that disposable database.
- `backend/database_setup.sql` has not been executed against Neon. Do not treat source review or fixture presence as a successful database deployment.
