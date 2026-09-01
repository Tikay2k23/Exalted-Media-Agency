# The SOP library

The ten standard operating procedures this system was built to enforce. These
are the source documents: where a procedure and the software disagree, the
document is right and the software has a bug.

They are kept here in full, unedited. Changing a procedure means editing the
document *and* changing what the system enforces — the table below is the map
between the two.

> **Last reviewed against the system: 2026-09-01.**
>
> The documents were written on 2026-08-08 and reviewed against the running
> system on 2026-09-01. That review found four disagreements; all four are
> closed, and what was decided is recorded at the bottom rather than silently
> applied. SOP 10 asks for regular review; this is that record.

## Where each procedure lives in the system

| SOP | Enforced by |
|---|---|
| [01 — Lead Capture & Qualification](SOP-01-Lead-Capture-and-Qualification.md) | Leads and Sales. Lead scoring in `lib/sales/lead-scoring.ts`; the six lead statuses are the first six values of the `LeadStatus` enum. |
| [02 — Discovery, Proposal & Closing](SOP-02-Discovery-Proposal-and-Closing.md) | Leads and Sales: call logging, and Convert, which generates the onboarding work and hands the account over. |
| [03 — Payment, Onboarding & Access Collection](SOP-03-Payment-Onboarding-and-Access-Collection.md) | Invoices on the account page; the access register in `lib/security/`. Stage gates `payment_confirmed` and `critical_access_collected`. |
| [04 — Strategy, Project Planning & Internal Handoff](SOP-04-Strategy-Project-Planning-and-Internal-Handoff.md) | The strategy brief (`lib/strategy/brief-service.ts`). Production is gated on an approved brief, and its author cannot approve it. |
| [05 — Production & Implementation](SOP-05-Production-and-Implementation.md) | Projects and milestones (`lib/delivery/`); work items, whose ten statuses are `EmployeeTaskStatus`. |
| [06 — Internal QA, Client Review & Revisions](SOP-06-Internal-QA-Client-Review-and-Revisions.md) | The defect tracker and QA plans (`lib/quality/`). The QA rule at the bottom of that document is enforced in `defect-closure.ts`. |
| [07 — Launch, Monitoring & Client Training](SOP-07-Launch-Monitoring-and-Client-Training.md) | Launches (`lib/launch/`), including the 2h / 24h / 72h / 7-day monitoring windows. Client approval is gated by `lib/approvals/`. |
| [08 — Ongoing Client Management, Reporting & Retention](SOP-08-Ongoing-Client-Management-Reporting-and-Retention.md) | Account health and the dashboards; reports and optimisations under the account's Reports tab. |
| [09 — Renewal, Upsell, Testimonials, Referrals & Offboarding](SOP-09-Renewal-Upsell-Testimonials-Referrals-and-Offboarding.md) | Renewals under More → Renewal & Growth; the offboarding checklist and Archive under More → Offboarding. |
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

- **Work status** — SOP 05 now lists all ten, split into the seven that count as
  open and the three that close an item.

---

## Known disagreements

**None open.** All four found in the 2026-09-01 review are closed. What was
done, so the reasoning survives:

**1. Work statuses (SOP 05) — closed by changing the document.** *Waiting for
Internal Input* was removed: Blocked already records what work is waiting on,
and two ways of saying stuck meant people chose inconsistently. *Ready for QA*
was not a missing status but a category error — it is the account moving to the
Internal Quality Assurance stage once no production item is still open, and SOP
05 now says so. `Revision Required`, `Approved` and `Cancelled` were added to
the list, which had stopped at Complete.

**2. Offboarding (SOP 09) — closed by changing the document.** The thirteen
steps are now twelve and match the checklist the system tracks. The ordering
rule the software enforced and the document did not is written down: confirm
the client is an administrator of their own platforms *before* removing agency
access. It is the one step in offboarding whose consequence cannot be undone
from inside the system.

**3. Stage gate provenance — closed by writing the trace.** All 26 requirements
are traced in [STAGE-GATES.md](STAGE-GATES.md), and the code cites the steps it
actually derives from. Three gates had no source at all; rather than finding
citations that nearly fit, the missing step was added to SOP 07, SOP 09 and SOP
03 respectively.

**4. Procedures with no document — closed by writing them.** SOP 10 gained
*Acceptance testing and release sign-off* and *Overriding a stage requirement*.
SOP 03 gained A2P registration, and now calls the onboarding form by the name
the system uses, the intake form. SOP 05 gained daily reporting and
workstreams.

Optimisations, client-facing weekly updates and the intake form were reported
as missing in the first pass and were not: they are SOP 08 §9, SOP 08 §2 and
SOP 03 §4. The scan that found them missing used a broken pattern.

## When you find the next one

List it here rather than editing the document to match the code. This page
opens by saying the document wins, and a disagreement is a decision — sometimes
the software is wrong, and quietly rewriting the procedure to match it destroys
the only record that anyone disagreed.
