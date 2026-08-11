import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { buildTaskCsv } from "@/lib/tasks/task-csv";
import { TASK_LIST_SELECT, taskScopeFor } from "@/lib/tasks/task-queries";
import {
  addTaskComment,
  archiveTask,
  changeTaskStatus,
  deleteTaskPermanently,
  reviewTask,
  submitForReview,
} from "@/lib/tasks/task-workflow";
import { tabFor } from "@/lib/tasks/task-filters";

const TEST_PREFIX = "zz-taskflow-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let ownerId = "";
let pmId = "";
let specialistId = "";
let outsiderId = "";
let taskId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  const tasks = await prisma.employeeTask.findMany({
    where: { OR: [{ clientId: { in: ids } }, { title: { startsWith: TEST_PREFIX } }] },
    select: { id: true },
  });
  const taskIds = tasks.map((task) => task.id);

  await prisma.taskComment.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.employeeTask.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.clientWorkstream.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientStageHistory.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient: { email: { startsWith: TEST_PREFIX } } },
        ...(taskIds.length ? [{ entityId: { in: taskIds } }] : []),
      ],
    },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(taskIds.length ? [{ entityId: { in: taskIds } }] : []),
      ],
    },
  });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

/**
 * One task, all the way through.
 *
 * Walked in order rather than split into independent cases, because the thing
 * worth proving is that the states join up: that resubmitting after a revision
 * really does come back to the same reviewer, and that a task which has been
 * approved really does leave the active board.
 */
describe("a task from assignment to archive (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const makeUser = (name: string, suffix: string, teamRole: TeamRole, role: Role) =>
      prisma.user.create({
        data: {
          name,
          email: `${TEST_PREFIX}-${suffix}@example.test`,
          passwordHash: "not-a-real-hash",
          role,
          teamRole,
        },
        select: { id: true },
      });

    const [owner, pm, specialist, outsider] = await Promise.all([
      makeUser("Flow Owner", "owner", TeamRole.AGENCY_OWNER, Role.OWNER),
      makeUser("Flow PM", "pm", TeamRole.PROJECT_MANAGER, Role.MANAGER),
      makeUser("Flow Creative", "creative", TeamRole.CREATIVE_SPECIALIST, Role.TEAM_MEMBER),
      makeUser("Flow Outsider", "outsider", TeamRole.ADS_SPECIALIST, Role.TEAM_MEMBER),
    ]);

    ownerId = owner.id;
    pmId = pm.id;
    specialistId = specialist.id;
    outsiderId = outsider.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "in_production", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Flow Contact",
        companyName: `${TEST_PREFIX} Chiropractic`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "FUNNEL_BUILD",
        currentStageId: stage.id,
        assignedUserId: pm.id,
      },
      select: { id: true },
    });

    clientId = client.id;

    const task = await prisma.employeeTask.create({
      data: {
        title: `${TEST_PREFIX} Build the pediatric landing page`,
        assignedToId: specialistId,
        createdById: pmId,
        reviewerId: pmId,
        clientId,
        dueDate: new Date("2026-08-20T00:00:00.000Z"),
        weekStartDate: new Date("2026-08-17T00:00:00.000Z"),
        category: "FUNNELS_AND_LANDING_PAGES",
        estimatedHours: 4,
        status: "TODO",
        requiresApproval: true,
        requiredAssets: "Brand kit — https://drive.google.com/abc",
      },
      select: { id: true },
    });

    taskId = task.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("lets the assignee start it", async () => {
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const result = await changeTaskStatus({
      actor,
      taskId,
      status: "IN_PROGRESS",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.task.status, "IN_PROGRESS");
  });

  it("refuses to let the assignee close their own reviewed work", async () => {
    // The rule the whole review step exists for.
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const result = await changeTaskStatus({ actor, taskId, status: "DONE" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_APPROVAL");
  });

  it("refuses to let anybody reach approved through the status dropdown", async () => {
    // An approval with no approver against it is not an approval.
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const result = await changeTaskStatus({
      actor,
      taskId,
      status: "APPROVED" as never,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("takes the submission, with the hours actually spent", async () => {
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const result = await submitForReview({ actor, taskId, actualHours: 6 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.task.status, "NEEDS_REVIEW");
    assert.equal(result.task.actualHours, 6);

    const stored = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { submittedAt: true },
    });

    assert.ok(stored.submittedAt);
  });

  it("tells the reviewer it is waiting", async () => {
    const notified = await prisma.notification.findMany({
      where: { entityId: taskId, recipientId: pmId },
      select: { title: true },
    });

    assert.ok(notified.some((item) => /ready for review/i.test(item.title)));
  });

  it("refuses to let the person who did it sign it off", async () => {
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const result = await reviewTask({ actor, taskId, decision: "APPROVE" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_APPROVAL");
  });

  it("refuses somebody with no standing on the task", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    const result = await reviewTask({ actor, taskId, decision: "APPROVE" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    // A specialist on another seat cannot even see it, so the honest answer is
    // that there is no such task rather than that they may not touch it.
    assert.equal(result.code, "NOT_FOUND");
  });

  it("refuses a revision request with no reason", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const result = await reviewTask({ actor, taskId, decision: "REQUEST_REVISION" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NOTE_REQUIRED");
  });

  it("sends it back with the reason on the task and on the thread", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const result = await reviewTask({
      actor,
      taskId,
      decision: "REQUEST_REVISION",
      note: "The form is not wired to the CRM yet.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.task.status, "REVISION_REQUIRED");

    const stored = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { revisionNote: true, submittedAt: true },
    });

    assert.match(stored.revisionNote ?? "", /wired to the CRM/);
    // Resubmitting is a fresh hand-over, so the reviewer's clock restarts.
    assert.equal(stored.submittedAt, null);

    const comments = await prisma.taskComment.findMany({
      where: { taskId, isRevisionNote: true },
      select: { body: true },
    });

    assert.equal(comments.length, 1);
  });

  it("lets it be resubmitted after the fix", async () => {
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const result = await submitForReview({ actor, taskId, actualHours: 8 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.task.status, "NEEDS_REVIEW");

    const stored = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { revisionNote: true },
    });

    // The objection has been answered. It stays on the thread, not on the task.
    assert.equal(stored.revisionNote, null);
  });

  it("approves it, recording who and when, and finishes it in the same write", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const result = await reviewTask({ actor, taskId, decision: "APPROVE" });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const stored = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: {
        status: true,
        approvedById: true,
        approvedAt: true,
        completedAt: true,
        actualHours: true,
      },
    });

    assert.equal(stored.status, "DONE");
    assert.equal(stored.approvedById, pmId);
    assert.ok(stored.approvedAt);
    assert.ok(stored.completedAt);
    assert.equal(stored.actualHours, 8);
  });

  it("shows up in the CSV with the hours and the approver", async () => {
    const rows = await prisma.employeeTask.findMany({
      where: { id: taskId },
      select: TASK_LIST_SELECT,
    });

    const csv = buildTaskCsv(rows);
    const [header, row] = csv.split("\r\n");

    assert.match(header, /"Actual Hours"/);
    assert.match(header, /"Approved Date"/);
    assert.match(row, /pediatric landing page/);
    assert.match(row, /Flow PM/);
    assert.match(row, /"8"/);
    assert.match(row, /Client task/);
  });

  it("refuses to delete it while it is still on the board", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const result = await deleteTaskPermanently({ actor, taskId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("refuses to archive it from a seat that does not run delivery", async () => {
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const result = await archiveTask({ actor, taskId, archived: true });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("archives it, and it leaves the active board without leaving the record", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const result = await archiveTask({ actor, taskId, archived: true });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const stored = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: {
        status: true,
        archivedAt: true,
        archivedById: true,
        completedAt: true,
        approvedById: true,
      },
    });

    assert.ok(stored.archivedAt);
    assert.equal(stored.archivedById, pmId);
    // Archiving changed nothing about what happened to the work.
    assert.equal(stored.status, "DONE");
    assert.ok(stored.completedAt);
    assert.equal(stored.approvedById, pmId);

    assert.equal(
      tabFor({
        id: taskId,
        title: "",
        status: stored.status,
        priority: "MEDIUM",
        category: "FUNNELS_AND_LANDING_PAGES",
        dueDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        completedAt: stored.completedAt?.toISOString() ?? null,
        archivedAt: stored.archivedAt?.toISOString() ?? null,
        estimatedHours: 4,
        note: null,
        objective: null,
        completionCriteria: null,
        client: null,
        project: null,
        assignedTo: null,
        createdBy: null,
        reviewer: null,
      }),
      "archived",
    );
  });

  it("refuses to archive work that is still live", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const live = await prisma.employeeTask.create({
      data: {
        title: `${TEST_PREFIX} Still going`,
        assignedToId: specialistId,
        createdById: pmId,
        clientId,
        dueDate: new Date("2026-09-01T00:00:00.000Z"),
        weekStartDate: new Date("2026-08-31T00:00:00.000Z"),
        category: "COPYWRITING",
        status: "IN_PROGRESS",
      },
      select: { id: true },
    });

    const result = await archiveTask({ actor, taskId: live.id, archived: true });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("scopes a specialist to their own work, and nothing else", async () => {
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const scope = taskScopeFor(actor);

    assert.ok("OR" in scope, "a specialist must not get an unscoped read");
    assert.deepEqual(scope.OR, [
      { assignedToId: specialistId },
      { createdById: specialistId },
      { reviewerId: specialistId },
    ]);
  });

  it("lets a project manager see everything, because rebalancing needs it", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    assert.deepEqual(taskScopeFor(actor), { deletedAt: null });
  });

  it("refuses a comment on a task the person cannot see", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    const result = await addTaskComment({
      actor,
      taskId,
      body: "Should never land.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NOT_FOUND");
  });

  it("refuses a permanent delete from anybody but the owner tier", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const result = await deleteTaskPermanently({ actor, taskId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("lets the owner delete it once it is archived, and keeps the trail", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const result = await deleteTaskPermanently({ actor, taskId });

    assert.equal(result.ok, true);

    const gone = await prisma.employeeTask.findUnique({ where: { id: taskId } });
    assert.equal(gone, null);

    // The row is gone. What happened to it is not.
    const trail = await prisma.activityLog.findMany({
      where: { entityType: "EMPLOYEE_TASK", entityId: taskId },
      select: { action: true },
    });

    assert.ok(trail.some((entry) => /permanently deleted/i.test(entry.action)));
    assert.ok(trail.some((entry) => /approved/i.test(entry.action)));
  });
});
