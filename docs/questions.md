# Open questions and backend gaps

These points cannot be safely inferred from the checked-in routes or schema. They affect how a complete frontend should behave.

1. **Database schema deployment:** The owner has supplied a reference ER diagram, now saved in [database_schema.md](./database_schema.md). Is it the live database schema, and can an executable migration (including nullability, defaults, indexes, FK delete/update rules, and DECIMAL precision/scale) be provided?
2. **Device identity:** Should the terminal GUID remain a fixed frontend constant, or should an operator/admin configure it securely per installation? The backend accepts a GUID as the login credential and no user/password login route exists.
3. **Rate semantics:** Are rate fields required, positive-only, and denominated per gram/another unit? Should the UI display or calculate any derived values? Current backend does not validate these rules.
4. **Customer rules:** Is phone number globally unique, what phone formats are accepted, and is address optional? The API treats a uniqueness violation as duplicate phone but provides no database schema.
5. **Payment rules:** May a payment exceed the balance, be zero/negative, or create a credit balance? Which `payment_mode` values are valid? The backend currently subtracts any supplied amount and only the UI lists three modes.
6. **Payment retrieval:** Is a payment history or receipt detail view required? There is no endpoint to fetch prior payments.
7. **Customer management:** Should users be able to list, view, edit, or deactivate customers? Current routes only create and search by phone.
8. **Session behavior:** Should login persist across reloads, or should the backend add token revocation? The UI keeps the token in memory, clears it on sign-out or protected `401`/`403`, and the API has no refresh/logout route.
9. **Runtime configuration:** What is the intended production API base URL and hosting target? The browser currently targets localhost directly.
10. **Error contract:** Should database errors remain exposed as raw `500` messages, or should the backend normalize validation/not-found errors into stable status codes?
11. **Device proof-of-possession:** The supplied `authorized_devices` table has a GUID but no per-device key. You selected an OS-protected per-device key. Please provide the credential field/proof-of-possession contract and explain how a device receives its key securely, or explicitly authorize a proposed migration and activation API.
12. **Electron/browser origin:** What exact origin will the packaged client use? Add it to `CORS_ORIGINS`; file URLs have an opaque `null` origin and should not be broadly allowed.
13. **Cloud TLS termination:** Where will HTTPS/TLS 1.3 terminate (for example, a managed load balancer or reverse proxy), and is traffic encrypted from the desktop client to that endpoint? No TLS deployment configuration is checked in.
14. **JWT rotation:** What access-token lifetime and renewal mechanism does the SaaS backend support? The current API issues a 12-hour JWT and has no refresh endpoint; changing expiry alone would force operators to sign in again.
15. **Rate audit completeness:** The supplied `daily_gold_rates_audit` records only before/after values for the two sell rates. Should the 999 buy and Fine Gatti buy rates also be audited?
16. **Enum definitions:** What exact values are valid for invoice/purchase `category`, `payment_mode`, expense `category`, logbook `entry_type`, and `source_type`?
17. **Logbook cardinality:** The diagram allows zero or one entry per source row, while the stories require every successful cash-affecting transaction to post exactly once. Should this be one-to-one, enforced by a unique `(source_type, source_reference_id)` constraint or equivalent?
