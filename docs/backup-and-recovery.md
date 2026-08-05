# Backup and recovery runbook

Status: launch gate; not yet executed against production.

## Required configuration

- Use a Supabase plan and region whose backup, point-in-time recovery and retention meet the approved risk assessment and customer commitments.
- Record backup frequency, retention, encryption, region, responsible owner and escalation contact.
- Keep Stripe as the financial system of record for payments and preserve webhook/event identifiers for reconciliation.
- Do not place Supabase secret keys, database passwords or exported personal data in Git.

## Quarterly restore test

1. Create an isolated recovery project with access limited to the test team.
2. Restore the latest approved backup using the Supabase-supported procedure.
3. Verify row counts and referential integrity for organisations, members, screenings, reports, audit events, credit ledger, billing events and source snapshots.
4. Run tenant-isolation checks using accounts from two test organisations.
5. Reconcile credit-ledger totals and a sample of Stripe payment references.
6. Verify that source files remain private and that secrets were not copied into user-visible tables.
7. Delete the recovery environment securely after evidence is approved.
8. Record recovery point achieved, recovery time achieved, failures, remediation owner and next test date.

Public launch is blocked until one successful restore test is evidenced by an authorised operator.
