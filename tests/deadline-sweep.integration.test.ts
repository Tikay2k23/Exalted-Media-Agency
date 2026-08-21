import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { runDeadlineSweep } from "@/lib/tasks/deadline-sweep";

/**
 * The nightly deadline sweep.
 *
 * The behaviour worth pinning down is not "does it notify" - it is "does it
 * stop notifying". A sweep that announces the same overdue task every night
 * for a fortnight is worse than one that never runs, because it teaches people
 * to ignore the bell.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const TEST_PREFIX = "zz-sweep-test";

let assigneeId = "";
let overdueTaskId = "";
let dueSoonTaskId = "";
let farFutureTaskId = "";

const day = 24 * 60 * 60 * 1000;

async function cleanup() {
  const tasks = await prisma.employeeTask.findMany({
    where: { title: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const taskIds = tasks.map((task) => task.id);

  // Notifications reference the task, and they go to the assignee - who is a
  // fixture user here, but delete by reference anyway so this keeps working if
  // the sweep ever notifies somebody else as well.
  if (taskIds.length) {
    await prisma.notification.deleteMany({ where: { entityId: { in: taskIds } } });
  }

  await prisma.employeeTask.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("the deadline sweep (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const assignee = await prisma.user.create({
      data: {
        name: "Sweep Assignee",
        email: `${TEST_PREFIX}-assignee@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.TEAM_MEMBER,
        teamRole: TeamRole.CREATIVE_SPECIALIST,
      },
      select: { id: true },
    });

    assigneeId = assignee.id;

    const make = (title: string, dueDate: Date) =>
      prisma.employeeTask.create({
        data: {
          title: `${TEST_PREFIX} ${title}`,
          assignedToId: assignee.id,
          dueDate,
          weekStartDate: dueDate,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      });

    const [overdue, dueSoon, farFuture] = await Promise.all([
      make("overdue work", new Date(Date.now() - 3 * day)),
      make("due soon work", new Date(Date.now() + 2 * day)),
      make("distant work", new Date(Date.now() + 40 * day)),
    ]);

    overdueTaskId = overdue.id;
    dueSoonTaskId = dueSoon.id;
    farFutureTaskId = farFuture.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function noticesFor(taskId: string) {
    return prisma.notification.findMany({
      where: { entityId: taskId, recipientId: assigneeId },
      select: { type: true, title: true, createdAt: true },
    });
  }

  it("tells the assignee about overdue and imminent work", async () => {
    await runDeadlineSweep();

    const overdue = await noticesFor(overdueTaskId);
    const soon = await noticesFor(dueSoonTaskId);

    assert.equal(overdue.length, 1, "the overdue task was not reported");
    assert.equal(overdue[0].type, "TASK_OVERDUE");
    assert.match(overdue[0].title, /^Overdue: /);

    assert.equal(soon.length, 1, "the task due in two days was not reported");
    assert.equal(soon[0].type, "TASK_DUE_SOON");
  });

  it("leaves work that is not due for weeks alone", async () => {
    assert.equal((await noticesFor(farFutureTaskId)).length, 0);
  });

  it("says it once, not every night", async () => {
    // Reading it is what breaks the unread-only dedup, so this is the case
    // that matters: a conscientious person should not be told again tomorrow.
    await prisma.notification.updateMany({
      where: { entityId: overdueTaskId },
      data: { readAt: new Date() },
    });

    const second = await runDeadlineSweep();
    const third = await runDeadlineSweep();

    assert.equal((await noticesFor(overdueTaskId)).length, 1, "re-announced a read notification");
    assert.ok(second.skippedAlreadyTold > 0, "the sweep did not report skipping anything");
    assert.equal(third.notificationsCreated, 0, "a third run still created rows");
  });

  it("says nothing when the date is merely corrected", async () => {
    // Still the same lapsed deadline, just a tidier date on it. Announcing it
    // again would be noise.
    await prisma.employeeTask.update({
      where: { id: overdueTaskId },
      data: { dueDate: new Date(Date.now() - 1 * day) },
    });

    await runDeadlineSweep();

    assert.equal((await noticesFor(overdueTaskId)).length, 1);
  });

  it("speaks up again when a new deadline lapses", async () => {
    // The case that genuinely deserves a second word: the work was given more
    // time, and then ran out of it again. The existing notice now predates the
    // deadline it would be about, which is exactly how the sweep tells the
    // difference from the correction above.
    const extended = new Date(Date.now() + 1 * day);

    await prisma.employeeTask.update({
      where: { id: overdueTaskId },
      data: { dueDate: extended },
    });

    await runDeadlineSweep(new Date(Date.now() + 2 * day));

    const notices = await noticesFor(overdueTaskId);

    assert.equal(notices.length, 2, "a task that ran out of time twice said it once");
  });

  it("ignores work that is finished", async () => {
    await prisma.employeeTask.update({
      where: { id: dueSoonTaskId },
      data: { status: "DONE" },
    });

    const before = (await noticesFor(dueSoonTaskId)).length;

    await prisma.notification.deleteMany({ where: { entityId: dueSoonTaskId } });
    await runDeadlineSweep();

    assert.equal(
      (await noticesFor(dueSoonTaskId)).length,
      0,
      "a completed task was still reported as due",
    );
    assert.ok(before > 0, "the fixture never produced a notification to begin with");
  });
});
