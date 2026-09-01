# Stage gates, and where each one comes from

The client journey refuses to advance an account until the stage it is leaving
has met its exit criteria. Those criteria are the strictest rules in the
system — nine of them on In Production alone — and until this page existed they
could not be traced to any written procedure.

This is that trace. Every requirement the system enforces is listed with the
SOP step it comes from, and the three that have no such step are named as
such rather than quietly justified.

- **What enforces them:** `STAGE_REQUIREMENT_SEED` in
  `lib/journey/stage-requirements.ts`, installed into `StageRequirement` by
  `prisma/seed.ts`, evaluated by `evaluateStageRequirements()`.
- **Kept honest by:** `tests/stage-gate-traceability.test.ts`, which fails if a
  requirement is added to the seed and not to this page.

## How to read the source column

**Explicit** — the SOP names the thing the gate checks.
**Implied** — the SOP requires the outcome, and the gate is how the system
knows it happened.
**None** — no step in any of the ten documents calls for it. Three gates are in
this state; see [Gates with no written source](#gates-with-no-written-source).

---

## Onboarding

### Access Collection

| Requirement | Source | |
|---|---|---|
| `primary_contact_recorded` | SOP 03 §10 — Confirm client contacts | Explicit |

### Onboarding Complete

| Requirement | Source | |
|---|---|---|
| `primary_contact_recorded` | SOP 03 §10 — Confirm client contacts | Explicit |
| `onboarding_tasks_complete` | SOP 03 Completion — onboarding requirements are complete | Implied |
| `critical_access_collected` | SOP 03 §6 — Collect platform access | Explicit |
| `critical_access_tested` | SOP 03 §7 — Test access | Explicit |

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
| `contract_recorded` | SOP 02 §13 — Send agreement | Implied |
| `onboarding_tasks_complete` | SOP 03 Completion | Implied |
| `critical_access_collected` | SOP 03 §6 — Collect platform access | Explicit |
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
| `no_critical_open_work` | — | **None** |

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
| `renewal_date_set` | — | **None** |

---

## Ending the engagement

### Offboarding

| Requirement | Source | |
|---|---|---|
| `account_owner_assigned` | SOP 09 Primary Owner | Implied |

### Archived

| Requirement | Source | |
|---|---|---|
| `no_open_work` | SOP 09 Offboarding §3 — Complete remaining work | Explicit |
| `final_billing_settled` | SOP 09 Offboarding §2 — Confirm final billing | Explicit |
| `client_admin_access_confirmed` | SOP 09 Offboarding §6 — Transfer client ownership | Implied |

The system adds an ordering rule SOP 09 does not state: agency access cannot be
recorded as removed until the client is confirmed as an administrator of their
own platforms. Getting those two the wrong way round locks a client out of
their own business permanently. See disagreement 2 in [README.md](README.md).

---

## Gates with no written source

Three of the twenty-six. Each is defensible, and none of them is written down,
which is the problem: a rule the software invented is a rule nobody agreed to.

**`no_critical_open_work`** — blocks Ready for Launch while any critical or
urgent work item on the account is still open. Sensible, and broader than
anything SOP 06 or 07 asks for: those cover defects and approvals, not open work
in general. Either SOP 07 should add it to its opening checks, or the gate
should be narrowed to what SOP 06 already requires.

**`renewal_date_set`** — blocks Renewal Discussion until a renewal date exists.
SOP 09's renewal process assumes a date without ever asking for one to be
recorded. Probably wants a step in SOP 09.

**`contract_recorded`** — listed as Implied above, and worth flagging here too.
SOP 02 §13 says *send agreement*; the gate checks that a contract start date and
monthly value are on the account. Sending and recording are not the same act,
and only one of them is written down.

---

## Keeping this page true

`tests/stage-gate-traceability.test.ts` compares every requirement key in
`STAGE_REQUIREMENT_SEED` against the keys named on this page, in both
directions. Adding a gate without documenting it fails the suite, and so does
leaving an entry here for a gate that has been removed.

That test cannot tell whether a citation is *correct* — only that one exists.
The citations were checked by hand on 2026-09-01, against the documents in this
directory.
