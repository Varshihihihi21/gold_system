# Open questions and backend gaps

These are remaining decisions or known deployment/product gaps. The owner PIN model, current enum labels, period-profit formula, and date denominator have been decided; they are documented in [verification_matrix.md](./verification_matrix.md).

1. **Database schema deployment:** The owner has supplied live-column and enum metadata; [database_setup.sql](../backend/database_setup.sql) is the consolidated setup. It has not been applied to Neon. Review, backup, and run it on an intended database, then inspect for additional drift.
2. **Device identity — resolved:** Configure `GOLD_DEVICE_GUID` per terminal. Login uses administrator-provisioned Ed25519 public keys and one-time challenges; the GUID is only an identifier, not a credential.
3. **Rate semantics:** Current UI/API treats all rates as positive currency per gram with two decimal places. Confirm the business currency and per-gram denomination if this assumption is not correct.
4. **Customer rules:** Phone number is unique in the current setup; accepted phone normalization/format remains unspecified. Address is optional.
5. **Payment overpayment:** The API currently permits a positive payment larger than the debt, resulting in a negative customer balance. Decide whether this credit behavior is intentional or whether overpayment should be blocked.
6. **Payment retrieval:** Is a payment history or receipt detail view required? There is no endpoint to fetch prior payments.
7. **Customer management:** Should users be able to list, view, edit, or deactivate customers? Current routes only create and search by phone.
8. **Session behavior:** Should login persist across reloads, or should the backend add token revocation? The UI keeps the token in memory, clears it on sign-out or protected `401`/`403`, and the API has no refresh/logout route.
9. **Runtime configuration:** What is the intended production API base URL and hosting target? The browser currently targets localhost directly.
10. **Error contract:** Should database errors remain exposed as raw `500` messages, or should the backend normalize validation/not-found errors into stable status codes?
11. **Owner overrides and rate audit — resolved:** Owner approved a separately configured PIN/password required on each owner-only action, independent of terminal role. The consolidated setup records the credential and device; it includes all four before/after rate pairs.
12. **Ledger enums and atomicity — resolved from supplied stories/schema:** Enums are `CASH`, `BANK_TRANSFER`, `UPI`, `CARD`; `INFLOW`, `OUTFLOW`; `SALE`, `PURCHASE`, `DEBT_PAYMENT`, `EXPENSE`; `OFFICE`, `HOUSEHOLD`. The app posts business records and logbook entries in the same transaction and prevents duplicate source postings.
13. **Payment overpayment:** Existing behavior permits a debt payment larger than the customer's pending balance and therefore a negative balance. Should overpayment remain permitted, be rejected, or become a credit?
14. **Profit period denominator — resolved:** Average profit divides by all inclusive calendar dates in the selected period.
15. **Cloud TLS and CORS:** Configure TLS 1.3 at the selected HTTPS ingress and set `CORS_ORIGINS` to the packaged `goldline://app` origin and any required development origins. The repository cannot configure a cloud load balancer.
16. **Client API endpoint:** Set `VITE_API_BASE_URL` to the actual production HTTPS API before packaging. The frontend defaults to localhost only for development.
17. **Host-level zero-storage controls:** Apply managed OS policy for paging/swap, crash dumps, disk encryption, and operator/debugger privileges. The application cannot guarantee volatile-only RAM at the operating-system level.
18. **Printer spooler exception — accepted:** Standard USB/driver printing is allowed even though the OS spooler may write temporary data to disk. Treat this as an explicit policy exception and configure retention/cleanup on managed terminals.
19. **Analytics formula — resolved:** Gross profit is selected-period sales revenue minus selected-period purchase payouts; subtract OFFICE and optionally HOUSEHOLD expenses next. Weighted-average inventory cost remains separate inventory accounting.
