import "dotenv/config";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createUatCase } from "@/lib/governance/uat-service";

/**
 * The UAT catalogue.
 *
 * Written once, as Not Tested. Nothing in here is marked passed by being
 * seeded - a case earns a result only when somebody executes it and records
 * what happened.
 *
 * Idempotent: re-running adds nothing, so it is safe to run after adding cases
 * to the list below.
 */

interface Seed {
  module: string;
  name: string;
  purpose: string;
  preconditions?: string;
  steps: string;
  expectedResult: string;
  severity?: "P0" | "P1" | "P2" | "P3";
}

const CASES: Seed[] = [
  /* ------------------------------------------------------------ dashboard -- */
  {
    module: "Dashboard",
    name: "Summary counts match the underlying records",
    purpose: "The command centre is only useful if its numbers are the real ones.",
    steps:
      "1. Open Dashboard.\n2. Note active clients, open work, overdue and blocked.\n3. Query the same counts directly.\n4. Compare.",
    expectedResult: "Every card matches the record count it claims to summarise.",
    severity: "P1",
  },
  {
    module: "Dashboard",
    name: "Each card opens its own filtered destination",
    purpose: "A number nobody can act on is decoration.",
    steps:
      "1. Click each summary card in turn.\n2. Confirm where it lands and what is filtered.",
    expectedResult: "Each card opens the matching view, already filtered, and mutates nothing.",
    severity: "P2",
  },

  /* -------------------------------------------------------------- my work -- */
  {
    module: "My Work",
    name: "A user sees their own work and nobody else's",
    purpose: "The most basic scoping promise in the application.",
    steps:
      "1. Sign in as a specialist.\n2. Open My Work.\n3. Compare the list with tasks assigned to that user.",
    expectedResult: "Only tasks assigned to the signed-in user appear.",
    severity: "P0",
  },
  {
    module: "My Work",
    name: "Status change reaches Weekly Work and Client Work",
    purpose: "One task record, three views - they must not drift.",
    steps:
      "1. Move a task to In Progress in My Work.\n2. Open Weekly Work.\n3. Open the client's Work tab.",
    expectedResult: "All three show the same status against the same task id.",
    severity: "P1",
  },

  /* ---------------------------------------------------------- weekly work -- */
  {
    module: "Weekly Work",
    name: "Week boundaries include the right tasks",
    purpose: "A week view that quietly drops a day is worse than none.",
    steps:
      "1. Create tasks due on the first and last day of the week.\n2. Open Weekly Work for that week.",
    expectedResult: "Both appear, and neither appears in the adjacent week.",
    severity: "P2",
  },
  {
    module: "Weekly Work",
    name: "Missing EOD is identified correctly",
    purpose: "Management monitoring depends on it.",
    steps:
      "1. Have one employee submit EOD and another not.\n2. Open Weekly Work.",
    expectedResult: "Only the employee without an entry is listed as missing.",
    severity: "P2",
  },

  /* ---------------------------------------------------------------- sales -- */
  {
    module: "Sales",
    name: "A lead moves through every pipeline stage",
    purpose: "The pipeline is the front of the whole system.",
    steps: "1. Create a lead.\n2. Move it through each stage to Won.",
    expectedResult: "Every transition is accepted and recorded in history.",
    severity: "P1",
  },

  /* -------------------------------------------------------- won conversion -- */
  {
    module: "Won Conversion",
    name: "Winning twice does not create two clients",
    purpose: "A duplicate client is the worst kind of data corruption here.",
    steps: "1. Mark a lead Won.\n2. Immediately submit Won again.",
    expectedResult: "One client exists; the second attempt is refused or returns the first.",
    severity: "P0",
  },
  {
    module: "Won Conversion",
    name: "Payment pending gates delivery",
    purpose: "Work should not start on an unpaid account.",
    steps: "1. Convert a lead with payment pending.\n2. Open the client's Journey.",
    expectedResult: "The journey does not advance past the payment gate.",
    severity: "P1",
  },

  /* -------------------------------------------------------------- account -- */
  {
    module: "Account",
    name: "Commercial values read the same everywhere",
    purpose: "One source of truth for money.",
    steps:
      "1. Set MRR and renewal date on Account.\n2. Read them on Billing, Reports, Journey Client Context and Renewal.",
    expectedResult: "Every surface shows the value Account holds.",
    severity: "P1",
  },

  /* ------------------------------------------------------------- strategy -- */
  {
    module: "Strategy",
    name: "Reports reads the same goals Strategy defines",
    purpose: "Strategy defines, Reports measures - never two goal records.",
    steps: "1. Add a business goal in Strategy.\n2. Open Reports & Health.",
    expectedResult: "The same goal appears under goal progress; Reports offers no way to create a second.",
    severity: "P1",
  },

  /* --------------------------------------------------------------- intake -- */
  {
    module: "Intake",
    name: "Send Intake Form exists only in Strategy",
    purpose: "It was explicitly not to be duplicated elsewhere.",
    steps: "1. Search the client record for a send-intake action.",
    expectedResult: "Only Strategy offers it; Journey's focus card opens the existing record instead.",
    severity: "P2",
  },

  /* ------------------------------------------------------------------ a2p -- */
  {
    module: "A2P",
    name: "Internal readiness is not shown as carrier approval",
    purpose: "Claiming a carrier approved something they have not is a compliance problem.",
    steps: "1. Move an A2P profile to Ready to Submit.\n2. Read every status label shown.",
    expectedResult: "Nothing says approved until the carrier result is recorded.",
    severity: "P1",
  },

  /* ----------------------------------------------------------------- work -- */
  {
    module: "Work",
    name: "Completing a task updates project progress",
    purpose: "Progress derived from work, not typed in.",
    steps: "1. Complete a task on a project.\n2. Open the project.",
    expectedResult: "Progress reflects the completed work without a manual step.",
    severity: "P1",
  },

  /* ------------------------------------------------------------------ eod -- */
  {
    module: "EOD",
    name: "A second EOD does not overwrite yesterday's",
    purpose: "EOD is a history, not a field.",
    steps: "1. Submit EOD.\n2. Submit again the next day.\n3. Open the task's EOD history.",
    expectedResult: "Both entries exist with their own dates.",
    severity: "P1",
  },

  /* -------------------------------------------------------------- journey -- */
  {
    module: "Journey",
    name: "A stage will not advance while a requirement blocks it",
    purpose: "The gate is the point of the journey.",
    steps: "1. Leave a blocking requirement unmet.\n2. Attempt Advance Stage.",
    expectedResult: "Refused, naming the exact requirements outstanding.",
    severity: "P0",
  },
  {
    module: "Journey",
    name: "Advancing twice does not skip a stage",
    purpose: "A double click must not move an account two stages.",
    steps: "1. With a ready stage, click Advance twice quickly.",
    expectedResult: "The account moves one stage; the second attempt is refused.",
    severity: "P0",
  },
  {
    module: "Journey",
    name: "Completing a requirement updates readiness and next best action",
    purpose: "Derived values must not go stale.",
    steps: "1. Complete the last blocking requirement.\n2. Read stage readiness and the next best action.",
    expectedResult: "Readiness reaches 100% and the action becomes advancing the stage.",
    severity: "P1",
  },

  /* ------------------------------------------------------------ approvals -- */
  {
    module: "Approvals",
    name: "A critical defect blocks the launch gate",
    purpose: "Quality control that can be walked past is decoration.",
    steps: "1. Raise a critical defect.\n2. Open the launch gate.",
    expectedResult: "The gate is closed and names the defect.",
    severity: "P0",
  },
  {
    module: "Approvals",
    name: "Approval cannot be recorded against an unauthorised contact",
    purpose: "Sign-off must come from somebody entitled to give it.",
    steps: "1. Attempt to record an approval naming a contact who is not an approver.",
    expectedResult: "Refused.",
    severity: "P1",
  },

  /* ------------------------------------------------------ reports & health -- */
  {
    module: "Reports & Health",
    name: "A sent report keeps its numbers when the data moves on",
    purpose: "History that rewrites itself is not history.",
    steps: "1. Send a report.\n2. Change the underlying data.\n3. Reopen the sent report.",
    expectedResult: "The report shows what it showed when it was sent.",
    severity: "P1",
  },
  {
    module: "Reports & Health",
    name: "Completing an optimization requires the measurement",
    purpose: "The whole reason an optimization exists.",
    steps: "1. Complete an optimization leaving metric before/after empty.",
    expectedResult: "Refused until both readings and a result are given.",
    severity: "P2",
  },

  /* ------------------------------------------------------- files & access -- */
  {
    module: "Files & Access",
    name: "Marking access received clears the journey requirement",
    purpose: "One record, read by both.",
    steps: "1. Mark a critical access record received.\n2. Open the journey requirements.",
    expectedResult: "The requirement is satisfied without a second action.",
    severity: "P1",
  },
  {
    module: "Files & Access",
    name: "No credential is ever stored in plain text",
    purpose: "Storing a client password would be a serious breach.",
    steps: "1. Inspect the access record form and the stored columns.",
    expectedResult: "Only the location of the credential is recorded, never the credential.",
    severity: "P0",
  },

  /* ----------------------------------------------------- activity & notes -- */
  {
    module: "Activity & Notes",
    name: "One action produces one activity entry",
    purpose: "A noisy trail is an unusable one.",
    steps: "1. Complete a task.\n2. Read the client's activity.",
    expectedResult: "One meaningful entry, not four restatements of it.",
    severity: "P2",
  },

  /* --------------------------------------------------------- integrations -- */
  {
    module: "Integrations",
    name: "Connect starts a real authentication flow",
    purpose: "A connected flag that connects nothing is a lie in the UI.",
    steps: "1. Open Integrations.\n2. Attempt to connect a provider.",
    expectedResult: "Either a real provider flow runs, or the page states plainly that none is configured.",
    severity: "P1",
  },

  /* ------------------------------------------------------------- billing -- */
  {
    module: "Billing & Payments",
    name: "A seat without finance permission sees no amounts",
    purpose: "Financial data is need-to-know.",
    steps: "1. Sign in without finance.view.\n2. Open Billing and read the page and its API responses.",
    expectedResult: "No amounts anywhere, including in the payload.",
    severity: "P0",
  },
  {
    module: "Billing & Payments",
    name: "Recording the same payment twice does not double it",
    purpose: "Payment corruption is unrecoverable in practice.",
    steps: "1. Record a payment.\n2. Submit the identical payment again immediately.",
    expectedResult: "One payment recorded.",
    severity: "P0",
  },

  /* ----------------------------------------------------- renewal & growth -- */
  {
    module: "Renewal & Growth",
    name: "Accepting an opportunity does not silently change services",
    purpose: "Commercial change belongs to the renewal workflow.",
    steps: "1. Mark a growth opportunity accepted.\n2. Read the client's services.",
    expectedResult: "Services are unchanged until the renewal outcome is recorded.",
    severity: "P1",
  },

  /* ---------------------------------------------------------- offboarding -- */
  {
    module: "Offboarding",
    name: "Offboarding cannot complete while a blocking step is open",
    purpose: "Closing an account with the final invoice unsettled loses money.",
    steps: "1. Start offboarding.\n2. Attempt to complete it immediately.",
    expectedResult: "Refused, naming every outstanding step.",
    severity: "P1",
  },
  {
    module: "Offboarding",
    name: "Completing offboarding ends the engagement",
    purpose: "A finished account must leave the active views.",
    steps: "1. Complete every step.\n2. Complete offboarding.\n3. Read the client's status.",
    expectedResult: "The client is no longer active.",
    severity: "P1",
  },
  {
    module: "Offboarding",
    name: "Agency access is not removed before the client is confirmed as admin",
    purpose: "The ordering mistake that locks everybody out.",
    steps: "1. Attempt to tick agency access removed first.",
    expectedResult: "Refused or flagged as a lockout risk.",
    severity: "P0",
  },

  /* -------------------------------------------------------- notifications -- */
  {
    module: "Notifications",
    name: "One event does not produce three notifications",
    purpose: "Notification fatigue makes the important ones invisible.",
    steps: "1. Trigger a health change.\n2. Read the recipients' notifications.",
    expectedResult: "One notification per recipient per event.",
    severity: "P2",
  },

  /* ---------------------------------------------------------- permissions -- */
  {
    module: "Permissions",
    name: "A specialist cannot advance a journey",
    purpose: "Lifecycle governance is not a specialist's to move.",
    steps: "1. As a specialist, attempt the advance endpoint directly.",
    expectedResult: "Refused server-side, not merely hidden.",
    severity: "P0",
  },
  {
    module: "Permissions",
    name: "A record id from another client is not a way in",
    purpose: "Cross-client exposure is the worst outcome in this system.",
    steps:
      "1. As a restricted seat, call each mutation with a record id belonging to a client they cannot see.",
    expectedResult: "Every one refused, and refused as not found rather than forbidden.",
    severity: "P0",
  },

  /* ---------------------------------------------------------- performance -- */
  {
    module: "Performance",
    name: "A client with hundreds of tasks still opens quickly",
    purpose: "Real accounts are not demo accounts.",
    steps: "1. Seed 400 tasks and 4,000 activity rows.\n2. Open the client record and time it.",
    expectedResult: "The page data loads in well under a second and the payload stays bounded.",
    severity: "P2",
  },

  /* ----------------------------------------------------------- responsive -- */
  {
    module: "Responsive",
    name: "No page scrolls horizontally on a phone",
    purpose: "Horizontal overflow makes a page unusable on mobile.",
    steps: "1. At 375px wide, open every main page and each client tab.",
    expectedResult: "No horizontal scrolling anywhere.",
    severity: "P2",
  },

  /* -------------------------------------------------------- accessibility -- */
  {
    module: "Accessibility",
    name: "Reduced motion is honoured",
    purpose: "Movement can make the application unusable for some people.",
    steps: "1. Enable reduced motion in the OS.\n2. Open the application and a drawer.",
    expectedResult: "Animation stops; everything remains usable and visible.",
    severity: "P2",
  },
  {
    module: "Accessibility",
    name: "Dialogs can be operated from the keyboard",
    purpose: "A modal that traps or loses focus is a dead end.",
    steps: "1. Open a dialog with the keyboard.\n2. Tab through it.\n3. Press Escape.",
    expectedResult: "Focus enters, stays inside, and returns on close.",
    severity: "P2",
  },

  /* ------------------------------------------------------- error handling -- */
  {
    module: "Error Handling",
    name: "One failed card does not take down the page",
    purpose: "A page that dies whole is a page nobody can work around.",
    steps: "1. Make one section's query fail.\n2. Open the page.",
    expectedResult: "That section shows an error; everything else still works.",
    severity: "P2",
  },

  /* ----------------------------------------------------- data consistency -- */
  {
    module: "Data Consistency",
    name: "Offboarded clients never remain active",
    purpose: "The lifecycle must end somewhere.",
    steps: "1. Query for clients whose offboarding is complete but whose status is not.",
    expectedResult: "None.",
    severity: "P1",
  },
  {
    module: "Data Consistency",
    name: "No optimization is concluded without a result",
    purpose: "A verdict with no evidence cannot be defended later.",
    steps: "1. Query optimizations with a concluding decision and no result.",
    expectedResult: "None.",
    severity: "P2",
  },

  /* -------------------------------------------------- end-to-end lifecycle -- */
  {
    module: "End-to-End Lifecycle",
    name: "Lead to archive without touching the database",
    purpose: "The whole product, proven once.",
    preconditions: "A safe test client and a signed-in session for each role involved.",
    steps:
      "1. Create a lead and win it.\n2. Take payment.\n3. Send and complete intake.\n4. Collect access.\n5. Do the work through QA and approval.\n6. Launch.\n7. Report and optimise.\n8. Renew.\n9. Offboard and archive.",
    expectedResult:
      "Every step completes through the interface, with no manual database intervention.",
    severity: "P0",
  },

  /* ----------------------------------------------------------- offboarding -- */
  /*
   * Added to the catalogue after the archive feature was built. It is last on
   * purpose: references are handed out in order, and this case is UAT-0044 in
   * the workspace it was first raised in.
   */
  {
    module: "Offboarding",
    name: "Archive files the account without destroying anything",
    purpose: "Archiving is the step most easily mistaken for a delete.",
    preconditions: "A client whose offboarding is complete.",
    steps:
      "1. Attempt to archive before offboarding exists.\n2. Attempt while offboarding is unfinished.\n3. Attempt as a seat without clients.delete.\n4. Complete offboarding, then archive.\n5. Count related records before and after.\n6. Archive again.\n7. Read the client by id, and check the active scope.\n8. Restore it.",
    expectedResult:
      "Refused out of order and without permission; archives only after offboarding completes; every related record survives; a second archive changes and logs nothing; the client leaves the active scope but is still readable by id; restoring works.",
    severity: "P1",
  },
];

async function main() {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  const actor = await loadAuthContext(admin.id);

  if (!actor) throw new Error("no actor");

  const existing = new Set(
    (await prisma.uatTestCase.findMany({ select: { name: true, module: true } })).map(
      (row) => `${row.module}::${row.name}`,
    ),
  );

  let created = 0;
  let skipped = 0;

  for (const seed of CASES) {
    if (existing.has(`${seed.module}::${seed.name}`)) {
      skipped += 1;
      continue;
    }

    const result = await createUatCase({ actor, ...seed });

    if (!result.ok) {
      console.error(`  failed: ${seed.module} / ${seed.name} - ${result.message}`);
      continue;
    }

    created += 1;
  }

  console.log(`UAT catalogue: ${created} created, ${skipped} already present.`);
  console.log(`Total cases now: ${await prisma.uatTestCase.count()}`);
  console.log("All seeded as Not Tested. Nothing is passed until somebody runs it.");
}

main().finally(() => prisma.$disconnect());
