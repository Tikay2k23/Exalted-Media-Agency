# The Operations Handbook

How to use the system, written once for each seat. Find your role below and
read that section — the rest is there when you need to know what somebody else
is doing.

For a picture of each screen with every button numbered, see
[BUTTON-GUIDE.md](BUTTON-GUIDE.md).

**Contents**

- [Start here, whoever you are](#start-here-whoever-you-are)
- [Agency Owner](#agency-owner)
- [Project Manager](#project-manager)
- [Sales Representative](#sales-representative)
- [Automation Specialist](#automation-specialist)
- [Creative Specialist](#creative-specialist)
- [Ads & Reporting Specialist](#ads--reporting-specialist)
- [The client journey, end to end](#the-client-journey-end-to-end)
- [If something will not let you do it](#if-something-will-not-let-you-do-it)

---

## Start here, whoever you are

Five things that work the same way for all six seats.

**Signing in.** Your work email and your own password. What you can see and do
follows your seat, so the system never shows you a page that will then refuse
you — if a link is not in your sidebar, that area is not yours.

**The sidebar is the whole app.** Four groups: *Overview* (Dashboard, My Work,
Weekly Work), *Sales*, *Delivery* (Clients, Journey) and *Organisation* (SOPs
and Audits, Settings). Which of them you see depends on your seat.

**Three places work shows up.** *Dashboard* is where things stand today. *My
Work* is what needs you, and everything assigned to you. *Weekly Work* is daily
reporting and each person's week.

**Every account has the same shape.** Open a client and you get the same eight
tabs every time, so you are never hunting.

### The client record, tab by tab

| Tab | What is on it |
| --- | --- |
| **Overview** | Where the account stands and what needs attention. |
| **Account** | Who they are: contacts, contract, the commercial basics. |
| **Strategy** | Services, the strategy brief, goals, A2P registration. |
| **Work** | Projects, milestones and the work items underneath them. |
| **Journey** | Which stage the account is at, and what is blocking the next one. |
| **Approvals** | QA plans and tests, defects, revision rounds, client sign-off, launch. |
| **Reports** | Client reports, account health, optimisations. |
| **More** | *Operations* (Files & Access, Activity & Notes, Integrations), *Commercial* (Billing & Payments, Renewal & Growth), *Lifecycle* (Offboarding). |

### Three rules the system enforces on everybody

**An account cannot skip a stage.** Each stage has exit criteria. If they are
not met, the move is refused and you are shown exactly which ones and a link to
the page that fixes each. Two seats can override that, and an override is
recorded with a written reason and the name of whoever approved it.

**Finishing with an account means archiving it, not deleting it.** Offboard it,
then archive: that takes it off the active lists and the dashboard counts,
keeps every record it ever had, and can be undone.

**There is also a real delete, and it is not the same thing.** *Delete client*,
at the foot of the More menu on a client record, permanently destroys the
account and everything attached to it — contacts, contract, notes, projects,
invoices, journey history, approvals and reports. Internal tasks survive but
lose their link to the account. It asks you to type the company name first, and
it cannot be undone. Use it only for an account that should never have existed,
such as a duplicate or a test row. An engagement that ended gets archived.

---

## Agency Owner

Every door in the building opens. The seat that answers for money, governance
and how an engagement ends.

**Your sidebar:** Dashboard · My Work · Weekly Work · **Sales** · **Clients** ·
**Journey** · **SOPs and Audits** · Settings — everything. You are the only
seat with no restrictions anywhere in the system.

### Your morning

1. **Dashboard** — the agency-wide view, not just your own. Every card filters
   to exactly what it counted, so click the number rather than hunting for the
   list.
2. **Journey** — anything stuck. Blocked accounts surface here before they
   surface in a client conversation.
3. **Notifications** — overrides, escalations and approvals waiting on you.

### Money

- **Billing & Payments** lives on the client, under More. Invoices and payments
  against the account they belong to.
- **Renewal & Growth** is next to it: renewals, expansion opportunities,
  testimonials and referrals.
- You are one of only two seats that sees internal reporting, and the only one
  that sees sales reporting as well.

### Governance is yours

**SOPs and Audits** holds the procedures the agency runs on, whether they are
being followed, and what is being done when they are not.

- **SOPs** — the ten written procedures. Loaded as drafts; somebody other than
  the author activates them.
- **Audits and findings** — and the corrective actions that come out of them.
- **Improvement requests** — raised by anyone on the team; what happens to them
  is decided here.
- **System UAT** — the acceptance test board, and the release sign-off that
  depends on it.

### Ending an engagement

1. Open the client, then **More → Offboarding**.
2. Work down the checklist. The order matters most around access — confirm
   somebody at the client is an administrator on their own platforms *before*
   agency access is removed, or they are locked out of their own accounts
   permanently.
3. Set the status to **Complete**. The account status becomes Completed on its
   own.
4. **Archive** appears once offboarding is complete. It files the account away
   and destroys nothing — and it can be undone.

> **Do not reach for Delete client instead.** It sits in the same More menu you
> opened at step one, and it is a real delete: the account and everything
> attached to it are destroyed and cannot be recovered. Archive is the end of
> an engagement; delete is for an account that should never have existed.

### Use the override sparingly

You can force an account past an unmet stage gate. It needs a written reason,
it is stamped with your name, and everyone who can audit is told. That is the
point: an override is a governance event, not a shortcut. If you find yourself
using it often, the gate is wrong and should be changed rather than bypassed.

---

## Project Manager

The busiest seat in a six-person agency. You own the client relationship and
everything between a signed contract and a launched build.

**Your sidebar:** Dashboard · My Work · Weekly Work · Sales · **Clients** ·
**Journey** · **SOPs and Audits** · Settings. The same reach as the Owner
across delivery, minus creating leads and sales reporting.

### Taking on a new account

1. **Clients → Add Client.** Who they are, what they bought, what they want,
   and who does it.
2. Creating the account does the rest for you: it starts at Payment Received,
   creates the workstreams that service calls for, generates the onboarding
   work, and tells whoever needs to know.
3. Record the **primary contact** under Account. Several later gates read it,
   so it is worth doing first.
4. Collect access under **More → Files & Access**. Mark the platforms that
   matter as critical, and mark them tested once somebody has actually logged
   in — granted is not the same as working.

### Moving an account forward

1. Open the account in **Journey**, or its Journey tab.
2. The stage panel lists the exit criteria and how many are met.
3. Press **Advance Stage**. If something is unmet you are told which, with a
   link to the page that fixes it.
4. Moving a stage generates that stage's work automatically. You do not need to
   create it yourself.

### Through QA to launch

1. **Approvals** on the client: build the QA plan, and let the specialists run
   their tests.
2. Close defects. You cannot close one against your own work — that is
   deliberate.
3. Run the revision rounds, then record the client's approval against a named
   contact who is authorised to give it.
4. Schedule and activate the launch.

### Keeping accounts healthy

- **Reports** — write and send client reports, record a health assessment, log
  optimisations.
- **Complaints and recovery plans** sit with health. Raise them early; the
  dashboard reads them.
- **Renewal & Growth** under More — renewals before they lapse, and the
  expansion conversations worth having.
- **Weekly Work** — each person's week, and who has not filed. Weekly reports
  are due **Friday at 17:00**.

### Not yours

- **Creating or converting leads** — that is the Sales seat. You can see the
  pipeline, not write to it.
- **Sales reporting** — the Owner and Sales see it; you do not.
- **Submitting A2P registration** — the Automation Specialist does that.

---

## Sales Representative

Everything before the money arrives. Your job ends where delivery begins, and
the handoff between them is a real step, not a hope.

**Your sidebar:** Dashboard · My Work · Weekly Work · **Sales** · **Clients** ·
**Journey** · **SOPs and Audits** · Settings. You can open client records for
context, but not change them.

### The procedures you work to

**SOP-01 Lead Capture & Qualification** and **SOP-02 Discovery, Proposal &
Closing** are yours. Both are under **SOPs and Audits**, alongside the
improvement backlog — if a procedure gets in the way of the job, raise it there
rather than working around it.

### The pipeline

Thirteen stages, ending in one of three ways.

New Website Lead → Application Submitted → Attempting Contact → Contacted →
Strategy Call Booked → Strategy Call Showed → Qualified → Proposal Sent →
Negotiation

Ends as **Won**, **Lost** or **Abandoned** — or parks in **Long-Term Nurture**.

### Working a lead

1. **Sales → new lead**, or work the ones already assigned to you.
2. Log every call and its outcome. The call log is what tells you a third
   attempt is a third attempt.
3. Set a next action and a follow-up date. A lead with neither goes quiet and
   nobody notices.
4. Move the stage as reality changes — not in a batch at the end of the week.

### Closing one as Won

1. Mark the opportunity **Won**.
2. **Convert** it. That creates the client account and hands it to delivery —
   you do not create the client separately.
3. The handoff is recorded. A lead can only be converted once, and the system
   will tell you if somebody already has.

### Not yours, on purpose

- **Editing client details, moving journey stages, assigning work.** Once an
  account is won it belongs to delivery.
- **Internal reporting and account health.** You see sales reporting instead.
- **Signing anything off.** You read the procedures, raise improvements and
  record your own test results — but closing an audit, deciding what happens to
  an improvement and approving a release stay with the Owner and the Project
  Manager.

---

## Automation Specialist

The plumbing: CRM, workflows, tracking and the messaging registration that has
to be right before anything sends.

**Your sidebar:** Dashboard · **My Work** · **Weekly Work** · Clients ·
Journey · **SOPs and Audits** · Settings. Clients and Journey are there, but
scoped: you see the accounts assigned to you, not the whole book. No Sales.

### Your day

1. **My Work** — what is due today, what is overdue, what is waiting on
   somebody else.
2. Move your own items along as you go. Blocked is a real status; use it, and
   say what you are blocked on.
3. **Weekly Work** — file your end-of-day entry. It takes a minute and it is
   what makes the week readable.

### Quality assurance

You run QA tests on the part of the build you are responsible for. QA is shared
across the three specialist seats rather than given to a seventh person — the
agency has six. You cannot mark your own work correct: closing a defect against
your own build is blocked separately, whatever your permissions say.

### A2P registration

Yours alone. Found on the client under **Strategy**.

- Complete the profile and the sample messages before submitting.
- Internal readiness is not carrier approval, and the system will not let the
  two be confused. An account is not cleared to send because you finished the
  form.

### Not yours

- **Assigning work to other people**, or editing their items.
- **Moving accounts between stages.** Tell the Project Manager when your part
  is done; the gate reads your work automatically.
- **The sales pipeline**, and accounts you are not assigned to.
- You *can* open SOPs and Audits, read the procedures you are held to, and
  raise an improvement request. Deciding what happens to it sits with
  governance.

---

## Creative Specialist

Design, copy and build. The seat whose output the client sees first.

**Your sidebar:** Dashboard · **My Work** · **Weekly Work** · Clients ·
Journey · **SOPs and Audits** · Settings. Clients and Journey show the accounts
assigned to you.

### Your day

1. **My Work** first. Today, overdue, and anything waiting on a client.
2. Keep your own items current. A task that sits in progress for a week tells
   the board something false.
3. **End of day** under Weekly Work — what you did, what is next, anything in
   the way.

### Where your work is reviewed

1. Finish the item and move it on. That is what the Internal QA gate reads.
2. Defects raised against your work come back as work items — they are not a
   separate inbox.
3. Somebody else closes them. You cannot sign off your own build, and that is
   the rule working.

### Running a QA test

You test the part of the build you are responsible for, on the account's
**Approvals** tab. Record what you actually saw. A test marked passed without
being run is worse than one left untouched, because nobody looks at it again.

### Not yours

- **Assigning work**, or editing other people's items.
- **Moving accounts between stages**, or seeing accounts you are not on.
- **Client reports.** The Ads & Reporting seat and the Project Manager send
  those.

---

## Ads & Reporting Specialist

Paid media, and the numbers the client actually reads. The only specialist seat
that sends anything to a client.

**Your sidebar:** Dashboard · **My Work** · **Weekly Work** · Clients ·
Journey · **SOPs and Audits** · Settings. Scoped to the accounts assigned to
you, like the other specialist seats.

### Your day

1. **My Work** — campaign work, reporting deadlines, anything overdue.
2. File your end-of-day entry under Weekly Work.
3. Check the accounts you hold for optimisations worth logging — they are the
   evidence behind the next report.

### Client reporting

1. Open the account's **Reports** tab.
2. Write the report. Say what changed and what you did about it, not only what
   the numbers were.
3. Submit it for review. A report goes to the client after somebody has read
   it, not straight from your desk.

### Optimisations and health

- Log optimisations as you make them. A month later they are the difference
  between a report and a list of numbers.
- You can see account health; the Project Manager records the assessment and
  owns any recovery plan.
- You run QA tests on your part of the build, like the other specialists.

### Not yours

- **Assigning work** or editing other people's items.
- **Moving accounts between stages.**
- **Billing.** You send the report; the Owner sends the invoice.

---

## The client journey, end to end

Eighteen stages. Everyone sees the same board; who may move an account along it
depends on the seat.

| Phase | Stages | Who drives it |
| --- | --- | --- |
| **Onboarding** | Payment Received · Onboarding Form Sent · Waiting for Client Information · Access Collection · Onboarding Complete | Project Manager |
| **Planning** | Strategy and Planning | Project Manager, with the specialists |
| **Build** | In Production · Internal Quality Assurance | Specialists |
| **Review** | Client Review · Revisions Required · Client Approved | Project Manager |
| **Launch** | Ready for Launch · Live / Active | Project Manager |
| **Ongoing** | Ongoing Management · Renewal Discussion | Project Manager and Owner |
| **Ending** | Offboarding · Project Completed · Archived | Owner |

The heavily gated stages are Onboarding Complete, In Production and Ready for
Launch — the three points where carrying on without something in place causes
real damage. In Production alone has nine exit criteria.

---

## If something will not let you do it

**The gate is not met.** You are told which criterion and given a link straight
to the page that satisfies it. Fix the thing rather than asking for an
override.

**It is not your seat.** The action belongs to somebody else. Check your
section above — it lists what is not yours and who to ask.

**It is your own work.** You cannot approve, close or sign off your own build.
That is deliberate and cannot be granted around.
