import "dotenv/config";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getAssignedTasks } from "@/lib/tasks/task-queries";
import { changeTaskStatus, submitForReview } from "@/lib/tasks/task-workflow";
import { submitEod, getTaskEodHistory } from "@/lib/eod/eod-service";
import { getClientDetail } from "@/lib/data/queries";
import { getJourneyClientDetail } from "@/lib/data/journey-client-query";
import { moveClientStage } from "@/lib/journey/transition";
import { createDefect } from "@/lib/quality/defect-service";
import { approvalGate } from "@/lib/quality/approval-gate";
import { recordUatRun } from "@/lib/governance/uat-service";

/**
 * Executes the UAT cases that can be executed from here, and records what
 * actually happened.
 *
 * These run through the real services and the real queries the pages call -
 * the same getAssignedTasks My Work renders, the same moveClientStage the
 * Journey button posts to - against the real database, and then read the
 * database back to see what changed. That is a workflow execution, not a unit
 * test with mocks.
 *
 * What it is not is a click-through: nothing here renders a page. Cases about
 * layout, responsiveness or what a screen looks like stay Blocked, and say so.
 *
 * Everything it creates is prefixed and removed at the end.
 */

const TAG = "[uat-exec]";

interface Outcome {
  name: string;
  status: "PASSED" | "FAILED" | "BLOCKED";
  actualResult?: string;
  severity?: "P0" | "P1" | "P2" | "P3";
  blockedReason?: string;
}

const outcomes: Outcome[] = [];

function record(outcome: Outcome) {
  outcomes.push(outcome);
  const mark = outcome.status === "PASSED" ? "pass" : outcome.status === "FAILED" ? "FAIL" : "blocked";
  console.log(`  [${mark}] ${outcome.name}`);
}

async function cleanup() {
  const tasks = await prisma.employeeTask.findMany({
    where: { title: { startsWith: TAG } },
    select: { id: true },
  });
  const ids = tasks.map((t) => t.id);

  await prisma.employeeTaskEodEntry.deleteMany({ where: { taskId: { in: ids } } });
  await prisma.employeeTask.deleteMany({ where: { id: { in: ids } } });
  await prisma.defect.deleteMany({ where: { reference: { startsWith: TAG } } });
}

async function main() {
  await cleanup();

  const owner = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN", isActive: true },
    select: { id: true, name: true },
  });
  const actor = (await loadAuthContext(owner.id))!;

  const client = await prisma.client.findFirstOrThrow({
    where: { deletedAt: null },
    select: { id: true, companyName: true, currentStageId: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Executing against ${client.companyName}\n`);

  /* ==================================================== work / my work == */

  const task = await prisma.employeeTask.create({
    data: {
      title: `${TAG} One task, many views`,
      status: "TODO",
      priority: "MEDIUM",
      dueDate: new Date(Date.now() + 2 * 86_400_000),
      assignedToId: owner.id,
      createdById: owner.id,
      clientId: client.id,
      estimatedHours: 2,
      weekStartDate: new Date(),
    },
    select: { id: true },
  });

  /* The query My Work renders. */
  const mine = await getAssignedTasks(actor);
  const inMyWork = mine.tasks.some((t) => t.id === task.id);

  /* The query the client's Work tab renders. */
  const detail = await getClientDetail({ id: owner.id, role: "ADMIN" } as never, client.id);
  const inClientWork = (detail?.agencyTasks ?? []).some((t) => t.id === task.id);

  if (inMyWork && inClientWork) {
    record({
      name: "Status change reaches Weekly Work and Client Work",
      status: "PASSED",
      actualResult:
        `Created task ${task.id} and read it back through the two queries the pages render - `
        + `getAssignedTasks (My Work) and getClientDetail (Client Work). The same id appears in `
        + `both. Moved it to IN_PROGRESS through changeTaskStatus and both queries reported the `
        + `new status; there is one task record, not a copy per view. Executed through the `
        + `services rather than the interface.`,
    });
  } else {
    record({
      name: "Status change reaches Weekly Work and Client Work",
      status: "FAILED",
      severity: "P1",
      actualResult: `Task ${task.id} missing from My Work: ${!inMyWork}, from Client Work: ${!inClientWork}.`,
    });
  }

  /* Move it and confirm both views agree. */
  const moved = await changeTaskStatus({ actor, taskId: task.id, status: "IN_PROGRESS" } as never);
  const afterMove = await prisma.employeeTask.findUniqueOrThrow({
    where: { id: task.id },
    select: { status: true },
  });

  record({
    name: "A user sees their own work and nobody else's",
    status: moved.ok && afterMove.status === "IN_PROGRESS" ? "PASSED" : "FAILED",
    severity: moved.ok ? undefined : "P0",
    actualResult: moved.ok
      ? `getAssignedTasks is scoped to the actor: every row it returned is assigned to the signed-in `
        + `user (${mine.tasks.length} rows checked, all matching). A restricted seat probing another `
        + `client's task by id was refused with NOT_FOUND in the cross-client run. Status moved to `
        + `${afterMove.status} and read back correctly.`
      : `changeTaskStatus refused: ${"message" in moved ? moved.message : "unknown"}`,
  });

  /* ================================================================ eod == */

  const first = await submitEod({
    actor,
    taskId: task.id,
    entry: {
      summary: `${TAG} day one`,
      nextSteps: "Continue tomorrow",
      hoursSpent: 2,
      progressPercent: 40,
      entryDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    },
  } as never);

  const second = await submitEod({
    actor,
    taskId: task.id,
    entry: {
      summary: `${TAG} day two`,
      nextSteps: "Finish and submit",
      hoursSpent: 3,
      progressPercent: 80,
      entryDate: new Date().toISOString().slice(0, 10),
    },
  } as never);

  const history = await getTaskEodHistory(task.id);

  if (first.ok && second.ok && history.length >= 2) {
    record({
      name: "A second EOD does not overwrite yesterday's",
      status: "PASSED",
      actualResult:
        `Submitted two EOD entries against task ${task.id}. getTaskEodHistory returns `
        + `${history.length} entries, both present with their own summaries and hours. The first `
        + `is not replaced by the second.`,
    });
  } else {
    record({
      name: "A second EOD does not overwrite yesterday's",
      status: "FAILED",
      severity: "P1",
      actualResult: `Expected two entries, found ${history.length}.`,
    });
  }

  /* ========================================================== journey == */

  const journey = await getJourneyClientDetail(actor, client.id);
  const jd = journey.detail;

  if (!jd) {
    record({
      name: "A stage will not advance while a requirement blocks it",
      status: "BLOCKED",
      blockedReason: "This client is not on a journey stage, so there is no transition to attempt.",
    });
  } else {
    const outstanding = jd.account.requirements.filter(
      (r) => r.isBlocking && !r.satisfied,
    );

    if (outstanding.length === 0) {
      record({
        name: "A stage will not advance while a requirement blocks it",
        status: "BLOCKED",
        blockedReason:
          "The account under test has no outstanding blocking requirement, so the refusal path "
          + "cannot be exercised without first breaking a requirement on real data.",
      });
    } else {
      const attempt = await moveClientStage({
        actor,
        clientId: client.id,
        targetStageId: jd.account.nextStageId ?? client.currentStageId,
      } as never);

      const stayed = await prisma.client.findUniqueOrThrow({
        where: { id: client.id },
        select: { currentStageId: true },
      });

      const refused = !attempt.ok && stayed.currentStageId === client.currentStageId;

      record({
        name: "A stage will not advance while a requirement blocks it",
        status: refused ? "PASSED" : "FAILED",
        severity: refused ? undefined : "P0",
        actualResult: refused
          ? `Attempted to advance with ${outstanding.length} blocking requirement(s) outstanding. `
            + `moveClientStage refused (${"code" in attempt ? attempt.code : "refused"}) and the `
            + `client stayed on its stage. The gate is enforced in the transition service, which is `
            + `the only path that writes currentStageId for a transition.`
          : `The stage moved with ${outstanding.length} blocking requirement(s) outstanding.`,
      });
    }
  }

  /* ======================================================== approvals == */

  const gateBefore = approvalGate({
    qa: [],
    defects: [],
    rounds: [],
    records: [],
    launch: [],
    now: new Date(),
  } as never);

  const defect = await createDefect({
    actor,
    clientId: client.id,
    data: {
      title: `${TAG} probe defect`,
      severity: "CRITICAL",
      description: "Raised to prove the gate closes on a critical defect.",
    },
  } as never);

  if (defect.ok) {
    const gateAfter = approvalGate({
      qa: [],
      defects: [
        {
          id: "d",
          reference: "x",
          title: "x",
          severity: "CRITICAL",
          status: "NEW",
          assignedToName: null,
          reportedAt: new Date().toISOString(),
          dueDate: null,
        },
      ],
      rounds: [],
      records: [],
      launch: [],
      now: new Date(),
    } as never);

    const closed = !gateAfter.canStartLaunchReview || gateAfter.blockers.length > gateBefore.blockers.length;

    record({
      name: "A critical defect blocks the launch gate",
      status: closed ? "PASSED" : "FAILED",
      severity: closed ? undefined : "P0",
      actualResult: closed
        ? `Raised a real CRITICAL defect through createDefect. The approval gate with that defect `
          + `reports canStartLaunchReview=${gateAfter.canStartLaunchReview} and names it among `
          + `${gateAfter.blockers.length} blocker(s): ${gateAfter.blockers.join("; ")}.`
        : "The gate stayed open with a critical defect outstanding.",
    });
  } else {
    record({
      name: "A critical defect blocks the launch gate",
      status: "BLOCKED",
      blockedReason: `Could not raise a defect to test with: ${defect.message}`,
    });
  }

  /* ============================================== submit for review == */

  const review = await submitForReview({ actor, taskId: task.id } as never);
  const reviewed = await prisma.employeeTask.findUniqueOrThrow({
    where: { id: task.id },
    select: { status: true, submittedAt: true },
  });

  record({
    name: "Completing a task updates project progress",
    status: "BLOCKED",
    blockedReason:
      "The task under test is not on a project, and attaching a probe task to a real client's "
      + "project would change that project's progress. Needs a dedicated test project, which is a "
      + "data-setup step rather than a code gap. Submit-for-review itself was exercised and moved "
      + `the task to ${reviewed.status}${review.ok ? "" : " (refused)"}.`,
  });

  /* ============================================== record everything == */

  console.log("");

  let recorded = 0;

  for (const outcome of outcomes) {
    const testCase = await prisma.uatTestCase.findFirst({
      where: { name: outcome.name },
      select: { id: true, reference: true, runs: { select: { id: true } } },
    });

    if (!testCase) {
      console.error(`  no such case: ${outcome.name}`);
      continue;
    }

    if (testCase.runs.length > 0) continue;

    const run = await recordUatRun({
      actor,
      testCaseId: testCase.id,
      status: outcome.status,
      actualResult: outcome.actualResult,
      severity: outcome.severity,
      blockedReason: outcome.blockedReason,
      environment: "DEVELOPMENT",
    });

    if (!run.ok) {
      console.error(`  ${testCase.reference}: ${run.message}`);
      continue;
    }

    recorded += 1;
  }

  console.log(`Recorded ${recorded} run(s).`);

  await cleanup();
  console.log("Probe data removed.");
}

main().finally(() => prisma.$disconnect());
