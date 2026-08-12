import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { getTaskEodHistory, submitEod } from "@/lib/eod/eod-service";
import {
  ensureReport,
  reportingDeadline,
  reviewWeeklyReport,
  saveReportDraft,
  submitWeeklyReport,
} from "@/lib/eod/weekly-report-service";
import { startOfWeek } from "@/lib/eod/weekly-view";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-eod-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let pmId = "";
let adaId = "";
let samId = "";
let taskId = "";
const week = startOfWeek(new Date());

async function cleanup() {
  const tasks = await prisma.employeeTask.findMany({
    where: { title: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const taskIds = tasks.map((task) => task.id);

  const users = await prisma.user.findMany({
    where: { email: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  await prisma.employeeTaskEodEntry.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.employeeTask.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.weeklyReport.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { recipientId: { in: userIds } } });
  await prisma.activityLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.client.deleteMany({ where: { companyName: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe("end-of-day and the weekly report (integration)", { skip: !hasDatabase }, () => {
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

    const [pm, ada, sam] = await Promise.all([
      makeUser("EOD PM", "pm", TeamRole.PROJECT_MANAGER, Role.MANAGER),
      makeUser("EOD Ada", "ada", TeamRole.AUTOMATION_SPECIALIST, Role.TEAM_MEMBER),
      makeUser("EOD Sam", "sam", TeamRole.CREATIVE_SPECIALIST, Role.TEAM_MEMBER),
    ]);

    pmId = pm.id;
    adaId = ada.id;
    samId = sam.id;

    const task = await prisma.employeeTask.create({
      data: {
        title: `${TEST_PREFIX} Build the lead routing`,
        assignedToId: adaId,
        createdById: pmId,
        dueDate: new Date(Date.now() + 3 * 86_400_000),
        weekStartDate: week,
        category: "CRM_AND_AUTOMATION",
        status: "IN_PROGRESS",
        estimatedHours: 4,
      },
      select: { id: true },
    });

    taskId = task.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("lets the assignee file today's entry", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await submitEod({
      actor,
      taskId,
      entry: {
        summary: "Wired the lead routing and the SMS trigger.",
        nextSteps: "Run the end to end test.",
        progressPercent: 55,
        hoursSpent: 2.5,
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.revised, false);
    assert.equal(result.entry.progressPercent, 55);
    // Half hours survive, which the old integer column could not express.
    assert.equal(result.entry.hoursSpent, 2.5);
  });

  it("refuses to let a manager write somebody else's entry", async () => {
    // The whole value of a daily entry is that it is first-hand. A manager who
    // can file it for you is just recording their own opinion under your name.
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const result = await submitEod({
      actor,
      taskId,
      entry: { summary: "Looks fine to me.", nextSteps: "Carry on." },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("treats a second submission the same day as an edit, not a duplicate", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await submitEod({
      actor,
      taskId,
      entry: {
        summary: "Finished the routing and tested it end to end.",
        nextSteps: "Hand over for review.",
        progressPercent: 75,
        hoursSpent: 3,
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.revised, true);

    const entries = await getTaskEodHistory(taskId);

    assert.equal(entries.length, 1, "one entry per person per task per day");
    assert.equal(entries[0].progressPercent, 75);
    // Created stays put while updated moves, so the revision is still on record.
    assert.ok(entries[0].updatedAt.getTime() > entries[0].createdAt.getTime());
  });

  it("refuses an entry with nothing in it", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const noSummary = await submitEod({
      actor,
      taskId,
      entry: { summary: "   ", nextSteps: "Something" },
    });

    assert.equal(noSummary.ok, false);

    const noNext = await submitEod({
      actor,
      taskId,
      entry: { summary: "Something", nextSteps: "  " },
    });

    assert.equal(noNext.ok, false);
  });

  it("refuses to park work as blocked without saying what for", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await submitEod({
      actor,
      taskId,
      entry: {
        summary: "Could not continue.",
        nextSteps: "Chase access.",
        taskStatus: "BLOCKED",
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("moves the task to the status the person reported", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await submitEod({
      actor,
      taskId,
      entry: {
        summary: "Stuck on the GoHighLevel account.",
        nextSteps: "Chase the client for access.",
        taskStatus: "BLOCKED",
        blockers: "No GoHighLevel access yet.",
      },
    });

    assert.equal(result.ok, true);

    const task = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true, blocker: true },
    });

    assert.equal(task.status, "BLOCKED");
    assert.match(task.blocker ?? "", /GoHighLevel/);
  });

  it("will not let an entry reach done, past the review step", async () => {
    // Finishing goes through review. A status dropdown inside an EOD form must
    // not become a way around it.
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    await submitEod({
      actor,
      taskId,
      entry: {
        summary: "All finished.",
        nextSteps: "Nothing.",
        taskStatus: "DONE" as never,
        blockers: "n/a",
      },
    });

    const task = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { status: true },
    });

    assert.notEqual(task.status, "DONE");
  });

  it("refuses to file an entry for a day that has not happened", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await submitEod({
      actor,
      taskId,
      entry: {
        summary: "Tomorrow's work.",
        nextSteps: "More of it.",
        entryDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("starts a week as not started, and saving makes it a draft", async () => {
    const report = await ensureReport(adaId, week);
    assert.equal(report.status, "NOT_STARTED");

    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const saved = await saveReportDraft({
      actor,
      weekStart: week,
      summary: "Quiet week, mostly automation.",
    });

    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.report.status, "DRAFT");
  });

  it("submits the week, and tells the reviewers", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await submitWeeklyReport({ actor, weekStart: week });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.report.status, "SUBMITTED");

    const notified = await prisma.notification.findMany({
      where: { recipientId: pmId, entityId: result.report.id },
      select: { title: true },
    });

    assert.ok(notified.some((item) => /weekly report/i.test(item.title)));
  });

  it("refuses to let somebody approve their own week, permission or not", async () => {
    // The project manager holds every review permission there is. It does not
    // exempt them from this: a week signed off by the person who wrote it is
    // not reviewed.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const ownWeek = await ensureReport(pmId, week);

    await prisma.weeklyReport.update({
      where: { id: ownWeek.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    const own = await reviewWeeklyReport({
      actor: pm,
      reportId: ownWeek.id,
      decision: "APPROVE",
    });

    assert.equal(own.ok, false);
    if (own.ok) return;
    assert.equal(own.code, "SELF_APPROVAL");

    // And the same refusal for somebody with no review standing at all.
    const ada = await loadAuthContext(adaId);
    assert.ok(ada);

    const theirs = await ensureReport(adaId, week);
    const asAuthor = await reviewWeeklyReport({
      actor: ada,
      reportId: theirs.id,
      decision: "APPROVE",
    });

    assert.equal(asAuthor.ok, false);
    if (asAuthor.ok) return;
    assert.equal(asAuthor.code, "SELF_APPROVAL");
  });

  it("refuses a review from somebody who does not run delivery", async () => {
    const actor = await loadAuthContext(samId);
    assert.ok(actor);

    const report = await ensureReport(adaId, week);

    const result = await reviewWeeklyReport({
      actor,
      reportId: report.id,
      decision: "APPROVE",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("refuses to send a week back without saying why", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const report = await ensureReport(adaId, week);

    const result = await reviewWeeklyReport({
      actor,
      reportId: report.id,
      decision: "REQUEST_CHANGES",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NOTE_REQUIRED");
  });

  it("sends it back with a note that does not touch the employee's words", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const report = await ensureReport(adaId, week);

    const result = await reviewWeeklyReport({
      actor,
      reportId: report.id,
      decision: "REQUEST_CHANGES",
      note: "Add the hours against the tracking work.",
    });

    assert.equal(result.ok, true);

    const stored = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: report.id },
      select: { status: true, managerNote: true, summary: true },
    });

    assert.equal(stored.status, "NEEDS_CHANGES");
    assert.match(stored.managerNote ?? "", /Add the hours/);
    // The reviewer's note lives apart. Their opinion never overwrites the
    // employee's own account.
    assert.equal(stored.summary, "Quiet week, mostly automation.");
  });

  it("lets the employee resubmit, which clears the note", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await submitWeeklyReport({
      actor,
      weekStart: week,
      summary: "Quiet week. Hours added against tracking.",
    });

    assert.equal(result.ok, true);

    const stored = await prisma.weeklyReport.findUniqueOrThrow({
      where: { userId_weekStartDate: { userId: adaId, weekStartDate: week } },
      select: { status: true, managerNote: true, summary: true },
    });

    assert.equal(stored.status, "SUBMITTED");
    assert.equal(stored.managerNote, null);
    assert.match(stored.summary ?? "", /Hours added/);
  });

  it("approves it, recording who and when", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const report = await ensureReport(adaId, week);

    const result = await reviewWeeklyReport({
      actor,
      reportId: report.id,
      decision: "APPROVE",
    });

    assert.equal(result.ok, true);

    const stored = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: report.id },
      select: { status: true, approvedById: true, approvedAt: true },
    });

    assert.equal(stored.status, "APPROVED");
    assert.equal(stored.approvedById, pmId);
    assert.ok(stored.approvedAt);
  });

  it("closes an approved week to further edits", async () => {
    const actor = await loadAuthContext(adaId);
    assert.ok(actor);

    const result = await saveReportDraft({
      actor,
      weekStart: week,
      summary: "Actually, let me rewrite that.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("reads the deadline from configuration rather than a constant", async () => {
    const deadline = await reportingDeadline(week);

    // Friday at five is the seeded default, not a hard-coded rule - the rows can
    // be edited without a deploy.
    assert.equal(deadline.getDay(), 5);
    assert.equal(deadline.getHours(), 17);

    await prisma.workspaceSetting.update({
      where: { key: "weeklyReport.dueWeekday" },
      data: { value: "4" },
    });

    const moved = await reportingDeadline(week);
    assert.equal(moved.getDay(), 4, "changing the setting moves the deadline");

    await prisma.workspaceSetting.update({
      where: { key: "weeklyReport.dueWeekday" },
      data: { value: "5" },
    });
  });
});
