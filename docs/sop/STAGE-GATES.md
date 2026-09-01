# Stage gates, and where each one comes from

The client journey refuses to advance an account until the stage it is leaving
has met its exit criteria. Those criteria are the strictest rules in the
system — nine of them on In Production alone — and until this page existed they
could not be traced to any written procedure.

This is that trace. Every requirement the system enforces is listed with the
SOP step it comes from. Three had no such step when this page was written; the
step was added to the SOP rather than a citation invented to fit.

- **What enforces them:** `STAGE_REQUIREMENT_SEED` in
  `lib/journey/stage-requirements.ts`, installed into `StageRequirement` by
  `prisma/seed.ts`, evaluated by `evaluateStageRequirements()`.
- **Kept honest by:** `tests/stage-gate-traceability.test.ts`, which fails if a
  requirement is added to the seed and not to this page.

## How to read the source column

**Explicit** — the SOP names the thing the gate checks.
**Implied** — the SOP requires the outcome, and the gate is how the system
knows it happened.
**None** — no step in any of the ten documents calls for it. No gate is in
this state today; see [Gates with no written source](#gates-with-no-written-source).

---

## Onboarding

### Access Collection

| Requirement | Source | |
|---|---|---|
| `primary_contact_recorded` | SOP 03 §11 — Confirm client contacts | Explicit |

### Onboarding Complete

| Requirement | Source | |
|---|---|---|
| `primary_contact_recorded` | SOP 03 §11 — Confirm client contacts | Explicit |
| `onboarding_tasks_complete` | SOP 03 Completion — onboarding requirements are complete | Implied |
| `critical_access_collected` | SOP 03 §7 — Collect platform access | Explicit |
| `critical_access_tested` | SOP 03 §8 — Test access | Explicit |

SOP 03 separates collecting access from testing it, and so does the system.
Granted is not the same as working, and the difference is whether production
starts or stalls on day one.

### Strategy and Planning

| Requirement | Source | |
|---|---|---|
| `account_owner_assigned` | SOP 02 §16 — Complete sales handoff | Implied |
| `onboarding_tasks_complete` | SOP 03 Completion | Implied |

---

## Production

### In Production

The gate the code used to attribute to "SOP section 10". No document here has
such a section; these are its real sources.

| Requirement | Source | |
|---|---|---|
| `payment_confirmed` | SOP 03 §1 — Confirm payment | Explicit |
| `contract_recorded` | SOP 03 §2 — Record the contract start date and monthly value | Explicit |
| `onboarding_tasks_complete` | SOP 03 Completion | Implied |
| `critical_access_collected` | SOP 03 §7 — Collect platform access | Explicit |
| `strategy_brief_approved` | SOP 04 §16 — Create project brief; Completion — approved project plan exists | Explicit |
| `account_owner_assigned` | SOP 04 §12 — Assign team members | Explicit |
| `project_exists` | SOP 04 §9–§11 — Define deliverables, milestones, timeline | Implied |
| `project_manager_assigned` | SOP 04 §12 — Assign team members | Explicit |
| `work_assigned` | SOP 05 §1 — Assign tasks | Explicit |

### Internal Quality Assurance

| Requirement | Source | |
|---|---|---|
| `production_work_complete` | SOP 05 §12 — Submit completed work for QA | Explicit |

---

## Review

### Client Review

| Requirement | Source | |
|---|---|---|
| `qa_tasks_complete` | SOP 06 §2, §9 — Test deliverables; complete regression testing | Explicit |
| `critical_defects_closed` | SOP 06 §7 — Correct defects, with Critical severity | Explicit |
| `client_approver_recorded` | SOP 06 §15 — Obtain final client approval | Implied |

The approver must be a contact marked as authorised to approve. SOP 06 asks for
*final client approval*, which is only meaningful if the person giving it can.

### Client Approved

| Requirement | Source | |
|---|---|---|
| `revisions_complete` | SOP 06 §13 — Complete included revisions | Explicit |
| `critical_defects_closed` | SOP 06 §7 — Correct defects | Explicit |

---

## Launch

### Ready for Launch

The second gate the code attributed to "SOP section 10". SOP 07 opens with
these, in almost this order.

| Requirement | Source | |
|---|---|---|
| `qa_tasks_complete` | SOP 06 Completion — QA passes | Explicit |
| `critical_defects_closed` | SOP 06 §7 — Correct defects | Explicit |
| `revisions_complete` | SOP 06 §13 — Complete included revisions | Explicit |
| `client_approval_recorded` | SOP 07 §1 — Confirm final approval | Explicit |
| `backup_verified` | SOP 07 §2 — Confirm backup | Explicit |
| `launch_record_owned` | SOP 07 §4 — Confirm launch owner | Explicit |
| `no_critical_open_work` | SOP 07 §5 — Confirm no critical or urgent work is still open | Explicit |

### Live / Active

| Requirement | Source | |
|---|---|---|
| `launch_tasks_complete` | SOP 07 §5–§11 — Activate systems through to the live end-to-end test | Implied |

---

## Ongoing and renewal

### Ongoing Management

| Requirement | Source | |
|---|---|---|
| `account_owner_assigned` | SOP 08 Primary Owner | Implied |
| `health_assessed` | SOP 08 §10 — Monitor client health | Explicit |

### Renewal Discussion

| Requirement | Source | |
|---|---|---|
| `renewal_date_set` | SOP 09 Renewal §1 — Record the renewal date on the account | Explicit |

---

## Ending the engagement

### Offboarding

| Requirement | Source | |
|---|---|---|
| `account_owner_assigned` | SOP 09 Primary Owner | Implied |

### Archived

| Requirement | Source | |
|---|---|---|
| `no_open_work` | SOP 09 Offboarding §3 — Finish or write off remaining work | Explicit |
| `final_billing_settled` | SOP 09 Offboarding §2 — Settle final billing | Explicit |
| `client_admin_access_confirmed` | SOP 09 Offboarding §6 — Confirm the client is an administrator on their own platforms | Explicit |

The ordering matters and SOP 09 now says so: agency access cannot be recorded
as removed until the client is confirmed as an administrator of their own
platforms. Getting those two the wrong way round locks a client out of their
own business permanently, and it is the one offboarding step whose consequence
cannot be undone from inside the system.

---

## Gates with no written source

**None, as of 2026-09-01.** All twenty-six trace to a step.

Three did not, and were closed by writing the missing step rather than by
finding a citation that fit:

- `no_critical_open_work` — SOP 07 gained an opening check for open critical
  work, which is what the gate had been enforcing without being asked to.
- `renewal_date_set` — SOP 09's renewal process now begins by recording the
  date it had always assumed existed.
- `contract_recorded` — SOP 03 now records the contract on the account. It
  previously cited SOP 02 *send agreement*, and sending is not recording.

If a gate is ever added without a source, list it here rather than citing a
step that nearly covers it. A rule the software invented is a rule nobody
agreed to, and the honest version of that is a short list, not a stretched
reference.

## Keeping this page true

`tests/stage-gate-traceability.test.ts` compares every requirement key in
`STAGE_REQUIREMENT_SEED` against the keys named on this page, in both
directions. Adding a gate without documenting it fails the suite, and so does
leaving an entry here for a gate that has been removed.

That test cannot tell whether a citation is *correct* — only that one exists.
The citations were checked by hand on 2026-09-01, against the documents in this
directory.
