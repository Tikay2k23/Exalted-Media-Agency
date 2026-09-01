# The SOP library

The ten standard operating procedures this system was built to enforce. These
are the source documents: where a procedure and the software disagree, the
document is right and the software has a bug.

They are kept here in full, unedited. Changing a procedure means editing the
document *and* changing what the system enforces — the table below is the map
between the two.

> **Last reviewed against the system: 2026-09-01.**
>
> The documents themselves were written on 2026-08-08 and have not been edited
> since. This page has, and the review that produced this note found real
> disagreements between several documents and the software — they are listed at
> the bottom. SOP 10 asks for regular review; this is that record.

## Where each procedure lives in the system

| SOP | Enforced by |
|---|---|
| [01 — Lead Capture & Qualification](SOP-01-Lead-Capture-and-Qualification.md) | Leads and Sales. Lead scoring in `lib/sales/lead-scoring.ts`; the six lead statuses are the first six values of the `LeadStatus` enum. |
| [02 — Discovery, Proposal & Closing](SOP-02-Discovery-Proposal-and-Closing.md) | Leads and Sales: call logging, and Convert, which generates the onboarding work and hands the account over. |
| [03 — Payment, Onboarding & Access Collection](SOP-03-Payment-Onboarding-and-Access-Collection.md) | Invoices on the account page; the access register in `lib/security/`. Stage gates `payment_confirmed` and `critical_access_collected`. |
| [04 — Strategy, Project Planning & Internal Handoff](SOP-04-Strategy-Project-Planning-and-Internal-Handoff.md) | The strategy brief (`lib/strategy/brief-service.ts`). Production is gated on an approved brief, and its author cannot approve it. |
| [05 — Production & Implementation](SOP-05-Production-and-Implementation.md) | Projects and milestones (`lib/delivery/`); work items. See the disagreement on work statuses below. |
| [06 — Internal QA, Client Review & Revisions](SOP-06-Internal-QA-Client-Review-and-Revisions.md) | The defect tracker and QA plans (`lib/quality/`). The QA rule at the bottom of that document is enforced in `defect-closure.ts`. |
| [07 — Launch, Monitoring & Client Training](SOP-07-Launch-Monitoring-and-Client-Training.md) | Launches (`lib/launch/`), including the 2h / 24h / 72h / 7-day monitoring windows. Client approval is gated by `lib/approvals/`. |
| [08 — Ongoing Client Management, Reporting & Retention](SOP-08-Ongoing-Client-Management-Reporting-and-Retention.md) | Account health and the dashboards; reports and optimisations under the account's Reports tab. |
| [09 — Renewal, Upsell, Testimonials, Referrals & Offboarding](SOP-09-Renewal-Upsell-Testimonials-Referrals-and-Offboarding.md) | Renewals under More → Renewal & Growth; the offboarding checklist and Archive under More → Offboarding. See the disagreement on offboarding steps below. |
| [10 — Governance, Auditing, Training & Continuous Improvement](SOP-10-Governance-Auditing-Training-and-Continuous-Improvement.md) | SOPs and Audits, in the sidebar. `lib/governance/` reads `Sop`, `SopVersion`, `Audit`, `AuditFinding`, `CorrectiveAction`, `ImprovementRequest`, `TrainingRecord` and `UatTestCase`. |

## The stage gates

Every exit criterion the journey enforces, traced to the SOP step it comes
from: **[STAGE-GATES.md](STAGE-GATES.md)**. Kept in step with the code by
`tests/stage-gate-traceability.test.ts`.

## Every stage gate is armed

Requirements used to be installed as advisory when the application gave nobody
a way to satisfy them — a rule you cannot comply with only teaches people to
override it. That is no longer the case for any of them. No remedy in
`lib/journey/requirement-remedies.ts` sets `notBuiltYet` any more; the field is
still declared on the type, and nothing uses it. All 37 seeded stage
requirements are blocking.

The last one to arm was `client_admin_access_confirmed`, which needed the
offboarding screen that now exists.

## On the enumerations

Several lists in these documents are shorter than the enum that implements
them, deliberately:

- **Lead status** — the document's six, plus `CONVERTED`, `LOST` and
  `ABANDONED`: outcomes a lead reaches after qualification, which SOP 01 does
  not cover because it hands over at that point.
- **Client health** — the document's green / yellow / red, plus `NOT_ASSESSED`
  so a new account is honestly unknown rather than optimistically green, and
  `NEW`.

Audit results, defect severities, feedback types and certification levels match
their documents exactly.

Work status does **not** match, and is listed below rather than here.

---

## Known disagreements

Four, as of the 2026-09-01 review. Each needs deciding rather than quietly
patching, because this page says the document wins — so a disagreement may mean
the software is wrong, not the wording.

**1. Work statuses (SOP 05).** The document lists nine. Two of them —
*Waiting for Internal Input* and *Ready for QA* — have no value in
`EmployeeTaskStatus`. The enum has three the document does not name:
`REVISION_REQUIRED`, `APPROVED` and `CANCELLED`.

**2. Offboarding steps (SOP 09).** The document lists thirteen; the checklist in
`OFFBOARDING_STEPS` has seven. They cover the same ground at different
granularity, and the system adds an ordering rule the document does not state:
the client must be confirmed as an administrator of their own platforms before
agency access can be recorded as removed.

**3. Stage gate provenance — resolved 2026-09-01.** The code cited an
"SOP section 10" that does not exist here. All 26 requirements are now traced
in [STAGE-GATES.md](STAGE-GATES.md), and the citations in
`lib/journey/stage-requirements.ts` point at the SOP steps they actually come
from. Three gates turned out to have no written source at all — they are named
on that page rather than justified after the fact, and each still needs a
decision: add the step to the SOP, or drop the gate.

**4. Procedures with no document.** In daily use and named in none of the ten:
System UAT and release sign-off, A2P registration, stage overrides,
workstreams, and end-of-day entries.

Three near-misses, listed so nobody re-reports them: optimisations are SOP 08
§9, client-facing weekly updates are SOP 08 §2, and the intake form is SOP 03
§3 under its older name, *onboarding form*. The system calls it intake; the
document does not.
