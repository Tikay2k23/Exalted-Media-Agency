# Human UAT Runbook

Forty-four test cases, executed by people, against a database built for the
purpose. Nothing in here is passed until somebody runs it and writes down what
happened.

> **This one is point-in-time.** It describes the Limited Beta round. The case
> numbers, the assignments and the gate arithmetic are true of that round; the
> rules for recording a result are not going to change.
> [USER-HANDBOOK.md](USER-HANDBOOK.md) is the document that stays current.

| | |
| --- | --- |
| Test cases | 44, of which **40** are in the beta gate |
| Environment | `exalted_uat`, on `http://localhost:3100` |
| Test accounts | 4 clients, named `UAT …` |
| Seats | 6, each verified able to sign in |

See [DATABASE-ENVIRONMENTS.md](DATABASE-ENVIRONMENTS.md) for how the UAT
environment is stood up.

---

## Before you start

**Sign in at localhost:3100.** Your address is your seat: `owner@`, `pm@`,
`sales@`, `automation@`, `creative@` or `ads@` **theexaltedmedia.com**. All six
share one password, which is not written down here — it lives in `.env.uat`,
which is git-ignored. Ask whoever set the environment up.

**This is not production.** A separate database, on a separate port, with its
own accounts. Nothing you do here reaches a real client. The application has no
mailer and no outbound integrations, so no email, message or external call can
leave it.

**Find your cases.** *SOPs and Audits → System UAT.* Filter by area to reach
yours. Every case carries its own steps and expected result — those live in the
application, not in this document, so there is only one copy to trust.

---

## Recording a result

The part that decides whether this exercise is worth anything.

**Run it, then record it.** A case is passed when you executed the steps and
saw the expected result — not when you read them and they sounded right. An
unrun case marked passed is worse than an untested one, because nobody will
look at it again.

**A failure needs what happened.** The form will not accept a failure without
it, deliberately. Write what you saw, not what you expected: the screen, the
message, the account you were on. A failure nobody can reproduce cannot be
fixed or retested.

**Blocked is not failed.** Use *Blocked* when something outside the case
stopped you — missing data, another case not yet run, an environment problem.
It keeps the count honest and tells whoever unblocks you what to fix.

The five statuses: **Not tested** · **Passed** · **Failed** · **Blocked** ·
**Retest required**.

---

## What happens after a failure

This one is a sequence, and the system enforces it. A case that has failed
cannot become passed by anybody changing its status — only by being run again.

1. **Failed** — you record what actually happened.
2. **Fix task raised** — created from the case itself, carrying the failure
   with it.
3. **Retest required** — the case moves here on its own once the fix task is
   done.
4. **Run again** — by a person, against the fix. Same steps as the first time.
5. **Passed** — every run stays on the record. The history is the evidence.

---

## Who tests what

Grouped by the seat the case is written for. Severity is shown after each
reference. An asterisk marks a case outside the beta gate — run it if there is
time, but it does not hold the release.

### Agency Owner — 11 cases
Permissions, money, and the end of the lifecycle. Also the only seat, with the
Project Manager, that can sign the release off.

`0034 P0` `0035 P0` `0027 P0` `0028 P0` `0019 P0` `0020 P1` `0029 P1`
`0030 P1` `0031 P1` `0032 P0` `0044 P1`

*Permissions, Billing, Approvals, Renewal, Offboarding*

### Project Manager — 12 cases
The journey and the work that hangs off it — the busiest seat in this round.

`0016 P0` `0017 P0` `0018 P1` `0001 P1` `0002 P2` `0005 P2` `0006 P2`
`0011 P1` `0010 P1` `0023 P1` `0024 P0` `0025 P2`

*Journey, Dashboard, Weekly Work, Strategy, Account, Files*

### Sales Representative — 4 cases
Lead through to a won client, and records its own results.

`0007 P1` `0008 P0` `0009 P1` `0012 P2`

*Sales, Won Conversion, Intake*

### Automation Specialist — 5 cases
The plumbing, and how the product behaves when something is wrong.

`0013 P1` `0040 P2` `0041 P1` `0042 P2` `0026 P1*`

*A2P, Error Handling, Data Consistency, Integrations*

### Creative Specialist — 4 cases
A specialist's own day: what is assigned to them, and what they file at the end
of it.

`0003 P0` `0004 P1` `0015 P1` `0014 P1`

*My Work, EOD, Work*

### Ads & Reporting Specialist — 3 cases
Reporting, account health, and whether the application stays quick under real
use.

`0022 P2` `0036 P2` `0021 P1*`

*Reports & Health, Performance*

### Anyone — front-end sweep, 4 cases
Best done on a real phone and with a keyboard only, rather than by resizing a
window.

`0037 P2` `0038 P2` `0039 P2*` `0033 P2*`

*Responsive, Accessibility, Notifications*

### The whole team, together — 1 case
Lead to archive, with no manual database intervention. Run it **last**, once
the modules it passes through have been tested individually — and on a lead you
create yourselves, not on the four accounts below.

`0043 P0` — *End-to-End Lifecycle. The one that proves the product.*

---

## The accounts to test against

Four, each put where it is on purpose. Every contact address ends in
`@uat.invalid`, a domain that can never resolve.

| Account | Service | Stage | What it is for |
| --- | --- | --- | --- |
| **UAT Northwind Trading** | SEO | Payment Received | A brand new account. Onboarding, the intake form, access collection, the first stages of the journey. |
| **UAT Fabrikam Interiors** | Website Support | In Production | Mid-journey, with all nine stage gates genuinely satisfied. Work, EOD, strategy, and the approach to QA. |
| **UAT Contoso Wellness** | Social Media | In Production | As above, plus a paid invoice and an open one. Billing, reports, account health, renewal. |
| **UAT Adventure Works** | SEO | Offboarding complete | Every offboarding step done and the account not yet archived. Press the button yourself — that is UAT-0044. |

No account is advanced past In Production, deliberately. QA, client approval
and launch are themselves test cases; walking an account through them in
advance would have spent the very transitions you are here to execute.

---

## What finishing looks like

Limited Beta is not a judgement call. The gate is arithmetic, and the
application computes it.

| | |
| --- | --- |
| **Must be run** | 40 — every case in the beta scope, executed by a person |
| **Must be passing** | 40 — a blocked or failed case holds the gate, whatever its severity |
| **P0 failures allowed** | 0 — a P0 blocks the beta wherever it sits, in scope or out |
| **Outside the gate** | 4 — three needed before production, one deferred |

When the gate is satisfied, **Approve for Limited Beta** becomes available to
the Agency Owner and the Project Manager. Until then it stays disabled and the
board says which areas have not been tested — it will not let anybody sign off
around it.
