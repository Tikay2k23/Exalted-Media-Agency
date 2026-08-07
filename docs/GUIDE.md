# How the system works

A practical guide for the team. No technical knowledge assumed.

---

## The one idea

Every client moves along a fixed path, and **the system will not let an account
move forward until the things that stage depends on are actually in place.**

That is the whole design. Everything else is a detail of it.

If a client cannot move to *In Production*, it is because something real is
missing — no payment recorded, no project set up, nobody assigned. The system
tells you which, in plain words, and links you to the screen that fixes it.

It is not being awkward. It is stopping the agency starting work it will have to
redo, or working for free.

---

## Signing in

Everyone signs in at the same place. What you see afterwards depends on your
**seat**. There are six.

| Seat | Runs |
|---|---|
| Agency Owner | Everything, including money and governance |
| Sales | Leads, calls, proposals, closing |
| Project Manager | Onboarding, delivery, clients, renewals |
| Automation Specialist | GoHighLevel, CRM, workflows, integrations |
| Creative Specialist | Websites, funnels, design, copy |
| Ads and Reporting | Campaigns, tracking, performance |

Your seat decides your menu, your homepage, and what you are allowed to change.
A Creative Specialist genuinely cannot see the client list or any financial
figure — not hidden, actually unavailable.

Development sign-ins, all with the same local password:

```
owner@theexaltedmedia.com          Agency Owner
sales@theexaltedmedia.com          Sales
pm@theexaltedmedia.com             Project Manager
automation@theexaltedmedia.com     Automation Specialist
creative@theexaltedmedia.com       Creative Specialist
ads@theexaltedmedia.com            Ads and Reporting
```

---

## Your homepage

The Dashboard answers one question: **what needs me today.**

It is a list of things to act on, not a wall of numbers. Every item says why it
needs you and links straight to it. Empty sections stay visible and say so —
"Nothing of yours is overdue" is worth knowing.

- **Owner** — accounts needing attention, any stage requirement that was
  overridden, critical alerts
- **Sales** — follow-ups overdue, leads never contacted, leads with nothing booked
- **Project Manager** — accounts needing attention, overdue work, waiting on the
  client, blocked
- **Specialists** — your overdue work, what is coming up, what is stuck, what is
  waiting on your review

---

## The path a client takes

### 1. A lead arrives — *Leads and Sales*

Create the lead with whatever you know. The system scores it 0–100 from budget,
whether you are talking to the decision maker, timeline, source, how much
discovery you have captured, and whether you can actually reach them.

The score orders your follow-up list. It does not decide anything — you do.

Log calls as you make them. A connected call moves the lead to *Contacted* on its
own; a no-answer moves it to *Attempting Contact*. You do not maintain the status
by hand.

Marking a lead lost **requires a reason**. Losing without recording why throws
away the only useful thing about losing.

### 2. They say yes — *Convert*

Hit **Convert** on the lead. In one step this:

- creates the client account
- opens it at the first journey stage, *Payment Received*
- **creates the onboarding work automatically** — welcome email, kickoff call,
  record the contract terms
- closes the lead as Won, and locks it

That last point matters: a converted lead becomes read-only. It is now part of an
account's history.

### 3. Onboarding and delivery — *Client Journey* and the account page

Open the account. The top panel is **"Ready for [next stage]?"** — the single
most useful thing on the page. It lists exactly what is outstanding, what each
item means, and how to sort it.

Everything it asks for is on the same page, below:

| Panel | Handles |
|---|---|
| Account details | Owner, health, contract dates, monthly value, next action, blocker |
| Client contacts | Who to talk to, and who is allowed to approve work |
| Quality assurance | Defects and test plans |
| Launches | Launch checklist, backup, rollback plan, monitoring |
| Platform access | Which platforms we can get into, and at what level |
| Delivery projects | Projects and milestones |
| Invoices | What has been billed and what has been paid (Owner only) |

### 4. Moving the account forward

**Client Journey → Move.** Pick the destination and the system checks it before
letting you go. Three outcomes:

- **Everything is in place** → it moves.
- **Something is missing** → each item is listed with what it means and how to
  fix it. Items already done collapse out of the way.
- **You have override authority** → an amber panel appears. See below.

### 5. Launch

Scheduling a launch creates the standard sixteen-point checklist automatically.

**Going live cannot be overridden.** It requires a named owner, a verified
backup, a written rollback plan, and every required checklist item done. Those
four are what make a bad launch survivable, so there is no way around them.

Once live, four monitoring windows open — 2 hours, 24 hours, 72 hours, 7 days —
timed from the moment it actually went live. Recording a result requires saying
what you observed.

---

## When you are blocked

Read the item. It tells you what it means and where to go. Almost everything is
fixable in a minute or two:

| It says | Do this |
|---|---|
| Contract recorded | Account details — set start date and monthly value |
| Payment confirmed | Invoices — raise one, record the payment (Owner) |
| Account owner assigned | Account details — set the owner |
| Client health assessed | Account details — set Green, Yellow or Red |
| Primary contact / approver | Client contacts — add them, tick the box |
| Critical platform access | Platform access — add the platform, mark it granted, then tested |
| Delivery project / manager | Delivery projects — create it, name a manager |
| Critical defects closed | Quality assurance — close them |
| Work assigned | Team page — create work items and assign them |
| Backup verified | Launches — tick the backup, write the rollback plan |

Items marked **"Recommended, does not block"** are ones the system tracks but
cannot yet help you complete. They do not stop you.

---

## Overriding

Some things genuinely have to move before everything is tidy. The Owner and the
Project Manager can override a blocked move.

It needs a written reason of at least ten characters and an explicit tick saying
you accept the risk. "Asap" is rejected.

What happens then: your name, your reason, and a list of exactly what was skipped
are saved against the account **permanently**, and the agency owner is notified
immediately. Every override shows on the Owner dashboard.

The point is not to prevent overriding. It is to make sure it is a decision
somebody owns, rather than a habit.

---

## Two rules the system enforces on people

**You cannot sign off your own work.** Whoever built something cannot be the only
person who says it is fixed. Anyone who can test may raise a defect, including
against work they did not do. Closing one is separate authority. If someone with
that authority closes a defect assigned to themselves, they must write why, it is
stored on the defect, and the owner is told.

**Passwords never go in the system.** The platform access tracker records whether
we can get in, at what level, and *where the credential is kept* — "Client
1Password vault". It has no password field. If you paste a password or an API key
into any box there, it is refused with an explanation.

---

## Things that update themselves

Do not type these; they are worked out from the records:

- **Invoice status** — from the payments recorded against it
- **Project progress** — from how many milestones are done
- **Launch readiness** — from the checklist, backup and rollback plan
- **Time in stage** — from when the account entered it

---

## Not built yet

Three things are tracked but have no screen, so they are marked *recommended*
rather than blocking:

- Strategy briefs
- Client approval records
- Offboarding

Everything else — thirty-six requirements — is enforced.

---

## For whoever maintains this

- `npm run dev` — start locally
- `npm run db:seed` — sync required data and stage gates, safe to rerun
- `npm run db:seed-team` — create one account per seat (never runs in production)
- `npm test` — full suite
- Stage gates live in the `StageRequirement` table and can be retuned there
  without a code change. A requirement only blocks when the app provides a way to
  satisfy it; that is set in `lib/journey/requirement-remedies.ts`.
