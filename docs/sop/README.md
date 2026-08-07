# The SOP library

The ten standard operating procedures this system was built to enforce. These
are the source documents: where a procedure and the software disagree, the
document is right and the software has a bug.

They are kept here in full, unedited. Changing a procedure means editing the
document *and* changing what the system enforces — the table below is the map
between the two.

## Where each procedure lives in the system

| SOP | Enforced by |
|---|---|
| [01 — Lead Capture & Qualification](SOP-01-Lead-Capture-and-Qualification.md) | Leads and Sales. Lead scoring in `lib/sales/lead-scoring.ts`; the six lead statuses are the `LeadStatus` enum. |
| [02 — Discovery, Proposal & Closing](SOP-02-Discovery-Proposal-and-Closing.md) | Leads and Sales: call logging, and Convert, which generates the onboarding work and hands the account over. |
| [03 — Payment, Onboarding & Access Collection](SOP-03-Payment-Onboarding-and-Access-Collection.md) | Invoices on the account page; the access register in `lib/security/`. Stage gates `payment_confirmed` and `critical_access_collected`. |
| [04 — Strategy, Project Planning & Internal Handoff](SOP-04-Strategy-Project-Planning-and-Internal-Handoff.md) | The strategy brief (`lib/strategy/brief-service.ts`). Production is gated on an approved brief. |
| [05 — Production & Implementation](SOP-05-Production-and-Implementation.md) | Projects and milestones (`lib/delivery/`); work items. The nine work statuses are all in `EmployeeTaskStatus`. |
| [06 — Internal QA, Client Review & Revisions](SOP-06-Internal-QA-Client-Review-and-Revisions.md) | The defect tracker and QA plans (`lib/quality/`). The QA rule at the bottom of that document is enforced in `defect-closure.ts`. |
| [07 — Launch, Monitoring & Client Training](SOP-07-Launch-Monitoring-and-Client-Training.md) | Launches (`lib/launch/`), including the 2h / 24h / 72h / 7-day monitoring windows. Client approval is gated by `lib/approvals/`. |
| [08 — Ongoing Client Management, Reporting & Retention](SOP-08-Ongoing-Client-Management-Reporting-and-Retention.md) | Account health (green / yellow / red) and the dashboards. |
| [09 — Renewal, Upsell, Testimonials, Referrals & Offboarding](SOP-09-Renewal-Upsell-Testimonials-Referrals-and-Offboarding.md) | Renewal dates and the offboarding record. The handover screen is **not built yet** — see below. |
| [10 — Governance, Auditing, Training & Continuous Improvement](SOP-10-Governance-Auditing-Training-and-Continuous-Improvement.md) | Schema only so far: `Sop`, `SopVersion`, `Audit`, `AuditFinding`, `CorrectiveAction`, `ImprovementRequest` in `prisma/schema/governance.prisma`. Nothing reads them yet. |

## What the system does not yet cover

Two gaps, both known:

**SOP 10 has no screens.** The tables exist — including `SopVersion`, which keeps
an immutable snapshot of each version so an audit can be judged against the
rules that applied at the time — but nothing reads or writes them. These ten
documents are not yet loaded into that library.

**SOP 09's offboarding handover is the last unarmed stage gate.**
`client_admin_access_confirmed` is advisory because the screen that would let
somebody confirm the client has admin access to their own platforms does not
exist. It arms itself once that screen ships.

## A note on the enumerations

Every list in these documents is present in the schema, and in several places
the schema holds more values than the document does. Those extras are
deliberate:

- **Lead status** adds `CONVERTED`, `LOST`, and `ABANDONED` — outcomes a lead
  reaches after qualification, which SOP 01 does not cover because it hands
  over at that point.
- **Work status** adds `CHANGES_REQUIRED` and `CANCELLED`.
- **Client health** adds `NOT_ASSESSED`, so a new account is honestly unknown
  rather than optimistically green.

Audit results, defect severities, feedback types, and certification levels match
their documents exactly.
