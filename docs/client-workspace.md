# Client lifecycle workspace — implementation status

This is ClearCheck's initial client-lifecycle workspace, not KYCP feature parity or a declaration of launch readiness. The existing screening, account, billing and PDF flows are preserved.

## Available locally

- `/workspace`: overview, client directory with server-side name search and pagination, tasks, review-due and expired-document queues, and truthful integration status.
- Client files: person/business details, onboarding information, internal references, next review date and versioned edits.
- Onboarding templates: owner/admin-managed custom questions and default tasks/requests. Each client retains its template version and required questions; later edits affect new clients only.
- Relationships: manually recorded owners, directors, shareholders and representatives with optional ownership percentages. No registry verification or ownership graph is claimed.
- Screening history: existing checks can be attached; starting a screening from a client file prefills its details and attempts to link the saved check. A failed link does not hide or repeat the paid screening.
- Evidence: private PDF/JPEG/PNG uploads up to 5 MB, signature/MIME checks, checksums, expiry dates and audited attachment downloads. No authenticity verification or malware scanning is claimed.
- Internal document requests, assigned tasks and notes. Requests do not send email or create a public customer portal.
- Risk assessments: recorded scores, configurable weights, rationale, policy reference and model version. The beta model uses four factors, scores 0–5 and weights totalling 100%; low <35, medium 35–69, high >=70. This is not an approved regulatory methodology. Screening findings remain separate.
- Lifecycle decisions: owner/admin approval requires supporting evidence, resolved latest screening, no open tasks/requests, a risk assessment by a different user and a future review date. Outstanding confirmed/escalated/more-information findings also block approval.
- Relevant client changes reopen approved files for review. A linked screening's risk or disposition changing also reopens the client and records an audit event.
- Audit trail, optimistic locking, organisation-scoped reads and server-authorised atomic mutations.

## Security and storage

Four additive migrations extend the existing linked Supabase project. They do not overwrite existing screening records. All five new tables have RLS and read-only authenticated grants; mutations use service-only RPCs that check the verified actor's active membership and role. Document files use a private bucket without direct browser storage policies. The server authenticates every upload/download, bounds request bodies and validates ownership.

Never expose the server secret or substitute browser storage for these records. Do not use direct SQL/manual inserts as the normal workflow. The pending migration-history reconciliation from earlier work still needs resolution before a general CLI `db push`.

## Verification

- `npm test`: existing tests plus client validation, risk model and structural security tests.
- `tests/client-workspace-database.sql`: transactional fixtures verify cross-tenant mutation denial, RLS, stale-version rejection, evidence gates, independent approval, audit writes and review invalidation. All fixtures are rolled back.
- Local workspace HTTP response checked. No full signed-in browser walkthrough or real document upload/download E2E has been completed in this environment.
- Existing project-wide TypeScript configuration errors relating to Deno/Cloudflare and `.ts` imports remain; the application build succeeds.

## Still required for the broader KYCP-style offering

1. Advanced event/risk-driven workflow rules and organisation-approved risk-policy publishing. Templates now support custom questions and default tasks, but not a general workflow engine. Risk weights are saved per assessment.
2. Secure customer-facing intake portal, expiring/revocable invitations, email delivery and communication history. Requires a monitored sender/support mailbox and delivery configuration.
3. Licensed PEP, broader sanctions and structured adverse-media provider; commercial redistribution rights, credentials, coverage tests and pricing decisions. Manual web links are not equivalent.
4. Identity/document verification, liveness and any biometrics via a selected provider, with privacy review before real personal data processing.
5. Automated re-screening: schedule, consent/credit rules, idempotent jobs, change detection, retries and alert delivery. Source-health checks and the new due-date queue are not continuous client monitoring.
6. Public customer API, scoped keys, rate limits, signed webhooks, retry/dead-letter handling and documentation. Internal app endpoints are not a supported public API product.
7. Team invitations and deprovisioning, operational notification ownership, document malware scanning/quarantine, file quotas and complete retention/deletion/backup coverage for the new tables and bucket.
8. Optional enterprise/private-cloud/on-premises delivery and video interviews are separate engineering and operational programmes, not enabled offerings.

## Launch gates

Keep private beta and test payments. Finish business identity, source licensing, counsel/privacy review, backup recovery, tenant isolation E2E and incident-response ownership. Existing Supabase advisor warnings remain: [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and [`pg_net` in `public`](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public). Test with synthetic data until the expanded document/identity data handling is approved.

## Manual acceptance walkthrough

1. Log in as an owner/reviewer. Open Workspace → Clients → New client.
2. Save profile and onboarding details; reload and verify persistence.
3. Add a task, document request and relationship. Assign a task to an active team member, then complete it.
4. Upload a synthetic document, download it, and verify the audit entry. Test wrong type and >5 MB rejection.
5. Run a client screening, resolve its review, and confirm the history link. Test a stale client version and link recovery.
6. Record an assessment with a rationale and policy reference. Check invalid weights are rejected.
7. Attempt approval with missing evidence and as the assessor: both must fail. Have a different owner/admin approve after requirements are complete.
8. Change a linked screening disposition: the client must return to in-review.
9. Verify a user in another organisation cannot see the file or download its documents, including direct API requests.
10. Test light/dark layouts, keyboard focus, mobile widths and browser Back/Forward.
