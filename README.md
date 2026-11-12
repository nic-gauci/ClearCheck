# ClearCheck

ClearCheck is a private-beta AML and sanctions screening workspace for Malta and the EU. It records official-source coverage, potential matches, human-review evidence, credits, payments and audit reports for an organisation.

## Local development

Requirements: Node.js 22.13 or newer and a Supabase project with the repository migrations applied.

1. Copy `.env.example` to `.env.local` and provide test credentials.
2. Run `npm install`.
3. Run `npm run dev`.
4. Run `npm test` before committing.

Stripe live keys are rejected unless `ALLOW_LIVE_STRIPE=true`. Do not enable that flag until every item in `docs/launch-gates.md` is approved.

## Official EU sanctions sources

EU screening requires two regularly refreshed snapshots: the European Commission Consolidated Financial Sanctions List and a generic extraction of named designations from recent restrictive-measures implementing regulations in the EU Publications Office Cellar. Obtain a dedicated crawler token through the Commission Financial Sanctions Files service and store it as the Supabase Edge Function secret `EU_FSF_CRAWLER_TOKEN`. Deploy the `sync-eu-sanctions` function and configure the existing scheduled sync; `npm run sources:sync-eu-journal` can refresh the Cellar snapshot manually. The latest successfully downloaded and validated snapshot remains usable regardless of elapsed time. If either snapshot is missing, marked failed or fails validation, ClearCheck marks the EU check and overall screening incomplete.

## Governance

- `docs/source-register.md`: licensing and source approval status.
- `docs/privacy-rights-procedure.md`: access, correction and deletion workflow.
- `docs/backup-and-recovery.md`: production backup and restore-test procedure.
- `docs/launch-gates.md`: mandatory legal, security, data and payment approvals.

The in-product legal pages are operational drafts. A Malta-qualified lawyer and privacy professional must approve the final service before public launch.

## Signup email confirmation

Enable **Confirm email** in the Supabase Auth email provider settings. Add the app's exact confirmation URL (for local development, `http://localhost:3000/check-email?confirm=1`) to Auth's allowed redirect URLs. Add the corresponding URL for each deployed environment. The Supabase signup template should use its standard confirmation link (`{{ .ConfirmationURL }}`). Configure SMTP for delivery to users outside the Supabase project team.
