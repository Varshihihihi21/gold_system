# Open questions and backend gaps

These points cannot be safely inferred from the checked-in routes or schema. They affect how a complete frontend should behave.

1. **Database schema deployment:** The owner has supplied a reference ER diagram, now saved in [database_schema.md](./database_schema.md). Is it the live database schema, and can an executable migration (including nullability, defaults, indexes, FK delete/update rules, and DECIMAL precision/scale) be provided?
2. **Device identity — resolved:** Configure `GOLD_DEVICE_GUID` per terminal. Login uses administrator-provisioned Ed25519 public keys and one-time challenges; the GUID is only an identifier, not a credential.
3. **Rate semantics:** Rates are now required positive decimal strings with two fractional digits. Confirm that every rate is denominated per gram and whether derived values should be shown.
4. **Customer rules:** Is phone number globally unique, what phone formats are accepted, and is address optional? The API treats a uniqueness violation as duplicate phone but provides no database schema.
5. **Payment rules:** May a payment exceed the balance, be zero/negative, or create a credit balance? Which `payment_mode` values are valid? The backend currently subtracts any supplied amount and only the UI lists three modes.
6. **Payment retrieval:** Is a payment history or receipt detail view required? There is no endpoint to fetch prior payments.
7. **Customer management:** Should users be able to list, view, edit, or deactivate customers? Current routes only create and search by phone.
8. **Session behavior:** Should login persist across reloads, or should the backend add token revocation? The UI keeps the token in memory, clears it on sign-out or protected `401`/`403`, and the API has no refresh/logout route.
9. **Runtime configuration:** What is the intended production API base URL and hosting target? The browser currently targets localhost directly.
10. **Error contract:** Should database errors remain exposed as raw `500` messages, or should the backend normalize validation/not-found errors into stable status codes?
11. **Owner overrides and rate audit:** What secure owner PIN/password verification endpoint and user-ID source should protect rate changes and price overrides? The current device roles are not sufficient to identify an owner, and the provided audit table omits buy-rate before/after values.
12. **Ledger enum and atomicity contract:** Please confirm the exact PostgreSQL enum labels for payment mode, cash entry direction, cash source, and expense category. The story asks for UPI, while the current UI/database contract only uses CASH, BANK_TRANSFER, and CHEQUE. Confirm that `(source_type, source_reference_id)` may be unique and that business transaction and logbook entry must commit in one DB transaction.
13. **Payment overpayment:** Existing behavior permits a debt payment larger than the customer's pending balance and therefore a negative balance. Should overpayment remain permitted, be rejected, or become a credit?
14. **Profit period denominator:** Does “Total Days in Period” mean all calendar days or only days the store was open?
15. **Cloud TLS and CORS:** Configure TLS 1.3 at the selected HTTPS ingress and set `CORS_ORIGINS` to the packaged `goldline://app` origin and any required development origins. The repository cannot configure a cloud load balancer.
16. **Client API endpoint:** Set `VITE_API_BASE_URL` to the actual production HTTPS API before packaging. The frontend defaults to localhost only for development.
17. **Host-level zero-storage controls:** Apply managed OS policy for paging/swap, crash dumps, disk encryption, and operator/debugger privileges. The application cannot guarantee volatile-only RAM at the operating-system level.
18. **Printer spooler exception — accepted:** Standard USB/driver printing is allowed even though the OS spooler may write temporary data to disk. Treat this as an explicit policy exception and configure retention/cleanup on managed terminals.
19. **Analytics and inventory contracts:** Define how inventory intake is recorded and how sales/purchase/expense rows map to profit analytics. Those fields/routes are absent from the live API/schema.
