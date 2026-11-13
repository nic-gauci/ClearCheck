# ClearCheck launch checklist

Reviewed 12 November 2026 against the local private-beta branch. Production settings, live payments and the handling of real privacy requests require separate verification.

| # | Item | Finding and remaining work |
| --- | --- | --- |
| 1 | Privacy policy | Published in the app at /privacy. Complete the operator and contact disclosures, applicable legal bases, retention schedules and processor/transfer review before launch. |
| 2 | Terms of service | Available at /terms and linked from signup. Review the final terms for the chosen markets, operator and customer types. |
| 3 | Refund policy | /terms#refunds explains test transactions and how to report an unexpected charge. Approve and publish live refund eligibility, timelines and contact before enabling live checkout. |
| 4 | Cookie policy | /cookies explains the app’s use of device storage and links from public, auth and account screens. Confirm deployment-specific cookies against the hosted site. |
| 5 | Cookie consent | No advertising or analytics integration was found in app source. Confirm hosted responses and network traffic before closing. If optional tracking is introduced, require opt-in before it runs and an accessible way to withdraw. See [Malta IDPC guidance](https://idpc.org.mt/idpc-publications/guidance-note-on-cookies-consent-requirements/). |
| 6 | Form consents | Signup requires an affirmative terms checkbox and shows privacy separately. Review lawful bases per workflow and decide whether terms version and acceptance need a server-side record. |
| 7 | Data minimisation | Document the purpose, required fields and retention per feature. Client evidence, identity records, notes and billing details still need a field-level review. |
| 8 | Third-party SDKs | Supabase Auth/data and Stripe are the main external services in the app. Stripe billing calls are server-side and users leave the app for hosted checkout. Review hosting, configured mail, public source calls, data flows, provider agreements and deployed dependencies. |
| 9 | Dark patterns | Removed the scheduled deletion toggle because saving it did not schedule deletion. Signup checkbox starts unchecked. Review paid checkout, cancellation and account exit as a signed-in user. |
| 10 | Hidden fees | Plans show credits and billing periods. Checkout requests Stripe automatic tax. Verify displayed amounts, tax, renewals and cancellation on hosted test checkout before enabling live billing. |
| 11 | Fake reviews | No testimonials found on the public homepage. Require provenance and permission if testimonials are added. |
| 12 | Unsupported claims | Public terms identify coverage limits and human review. Substantiate product, privacy, hosting and security claims against deployed settings before publishing broadly. |
| 13 | Accessibility alt text | No inline image elements found in app pages. Social image metadata has alternative text. Key UI icons are hidden from assistive technology where the control has a text label or accessible name. Confirm accessible names in the rendered screens. |
| 14 | Colour contrast | Check text, focus indicators, controls and status colours in both themes across public and signed-in pages. Source review alone does not close this item. |
| 15 | Keyboard navigation | Native links, inputs and buttons, a skip link and focus styles are in place. Complete a keyboard-only walkthrough including navigation, forms, overlays and result review. |
| 16 | Business details | Open. Publish verified legal name, registered address, applicable registration/VAT details, and monitored support and privacy contacts. Keep the existing live-payment gate in place. |
| 17 | Children’s data | Terms identify accounts as intended for adults acting for organisations. Review whether customers can submit minors’ records in screening or onboarding, and document the applicable rules. The app does not collect an account holder’s birth date for age checks. |
| 18 | Email unsubscribe | The repo contains account/security email flows and no marketing sender. Verify the configured sender and templates. Add a working unsubscribe and suppression flow before sending marketing mail. |
| 19 | Font/image licences | The bundled Geist font includes its OFL notice in public/fonts. Verify provenance and usage rights for the active social preview image and external evidence before public launch. |
| 20 | Data deletion | The privacy notice links to Settings, where a signed-in user can submit a request for review. Verify delivery to a named reviewer, handling and response. Publish a monitored route for people without account access. |

The [launch gates](launch-gates.md) track deployment, legal and provider approvals.
