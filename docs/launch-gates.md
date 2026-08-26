# ClearCheck launch gates

No public or live-payment launch is authorised until every gate below has a named approver and dated evidence.

- [ ] Malta-qualified counsel approves the legal entity details, customer terms, privacy notice, retention model, sanctions disclaimers and source reuse rights.
- [ ] A privacy lead documents controller/processor roles, lawful bases, records of processing, processor DPAs, international transfers and whether a DPIA is required.
- [ ] EU Financial Sanctions Files crawler token and source-sync secret are stored server-side; the matching Vault secret protects the scheduled trigger; the daily sync plus stale-source alert is proven.
- [ ] A compliance owner reviews new EUR-Lex sanctions acts and automated extraction exceptions at least weekly, confirms potential matches remain current, and reports material consolidated-file omissions to the source owner.
- [ ] Written or clearly applicable commercial-reuse permission is recorded for every enabled source, especially Malta ARB.
- [ ] Supabase migrations are applied; Security and Performance Advisors have no unresolved high-risk findings; two-tenant isolation tests pass.
- [ ] Supabase Auth leaked-password protection is enabled, and the non-relocatable `pg_net` extension warning is reviewed and accepted or remediated by the database owner.
- [ ] Supabase backup settings are approved and one isolated restore test passes.
- [ ] Stripe remains in test mode until successful, cancelled, failed, duplicated, asynchronous and subscription-renewal test cases pass and webhook alerting is active.
- [ ] `ALLOW_LIVE_STRIPE=true` is added only as part of an approved production change with live price IDs, webhook secret, tax/refund rules and support ownership.
- [ ] Monitoring alerts reach an accountable person for source staleness, application errors, webhook failures and uptime.
- [ ] End-to-end testing covers signup, email verification, login, organisation isolation, payment, credit grant, screening, incomplete-source behavior, PDF evidence and privacy requests.
- [ ] Incident response, vulnerability reporting, customer support and privacy-request contacts are published.
- [ ] `CLEARCHECK_LEGAL_IDENTITY_COMPLETE=true` is set only after the verified operator name, registered address, registration/VAT details, monitored support and privacy contacts are published and counsel-approved.

Passing automated tests is necessary but does not satisfy legal, licensing, backup or live-payment approval by itself.
