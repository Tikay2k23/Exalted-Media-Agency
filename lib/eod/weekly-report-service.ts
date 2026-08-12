import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { startOfWeek } from "./weekly-view";

// Re-exported so callers that want both the compilation and the database
// work have one import, while the client board can reach for the pure file.
export { compileWeek, reportProgress } from "./weekly-compile";
export type { CompiledReport, CompiledSection, ReportProgress } from "./weekly-compile";

/**
 * The weekly report.
 *
 * Compiled from the entries somebody already wrote, not typed again. Asking a
 * person to restate five days of work they have already described is how
 * weekly reports become fiction written on a Friday afternoon.
 *
 * Nothing about the work is stored on the report row. The compilation happens
 * at read time from that week's entries, so correcting a typo in Tuesday's
 * entry corrects the report too. A snapshot copied in at submission would drift
 * from its own source and leave two accounts of one week with no way to tell
 * which was true. The only prose stored is the employee's summary and the
 * reviewer's note - the two things that are opinions rather than records.
 */

export type ReportFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "SELF_APPROVAL"
  | "NOTE_REQUIRED";

export interface ReportFailure {
  ok: false;
  code: ReportFailureCode;
  message: string;
}

function failure(code: ReportFailureCode, message: string): ReportFailure {
  return { ok: false, code, message };
}

export const REPORT_FAILURE_STATUS: Record<ReportFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  SELF_APPROVAL: 409,
  NOTE_REQUIRED: 422,
};

/** Finds the report row for a person and week, creating it on first look. */
export async function ensureReport(userId: string, weekStart: Date) {
  const weekStartDate = startOfWeek(weekStart);

  return prisma.weeklyReport.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate } },
    update: {},
    create: { userId, weekStartDate, status: "NOT_STARTED" },
    select: {
      id: true,
      userId: true,
      weekStartDate: true,
      status: true,
      summary: true,
      submittedAt: true,
      approvedAt: true,
      managerNote: true,
      approvedBy: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, teamRole: true } },
    },
  });
}

/** Saving the employee's own words without submitting yet. */
export async function saveReportDraft(input: {
  actor: AuthContext;
  weekStart: Date;
  summary: string;
}) {
  const report = await ensureReport(input.actor.id, input.weekStart);

  if (report.status === "APPROVED") {
    return failure("INVALID", "This week has been approved. It is closed.");
  }

  const updated = await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      summary: input.summary.trim() || null,
      // Needs-changes stays put until it is resubmitted, so the reviewer's
      // request does not disappear the moment somebody starts typing.
      status: report.status === "NEEDS_CHANGES" ? "NEEDS_CHANGES" : "DRAFT",
    },
    select: { id: true, status: true, summary: true },
  });

  return { ok: true as const, report: updated };
}

/**
 * Handing the week in.
 *
 * The employee submits their own. A manager cannot submit on somebody's behalf:
 * a report filed by the person who will then approve it is not a report.
 */
export async function submitWeeklyReport(input: {
  actor: AuthContext;
  weekStart: Date;
  summary?: string | null;
}) {
  const report = await ensureReport(input.actor.id, input.weekStart);

  if (report.status === "SUBMITTED") {
    return failure("INVALID", "This week is already in.");
  }

  if (report.status === "APPROVED") {
    return failure("INVALID", "This week has been approved. It is closed.");
  }

  const updated = await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      summary:
        typeof input.summary === "string" ? input.summary.trim() || null : report.summary,
      // A fresh submission answers the last request for changes.
      managerNote: null,
    },
    select: { id: true, status: true, submittedAt: true, weekStartDate: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Submitted weekly report for week of ${updated.weekStartDate.toDateString()}`,
    entityType: "REPORT",
    entityId: updated.id,
  });

  // Whoever runs delivery needs to know there is something to read.
  const reviewers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      teamRole: { in: ["PROJECT_MANAGER", "AGENCY_OWNER"] },
    },
    select: { id: true },
  });

  await createNotifications(
    resolveRecipients(
      reviewers.map((reviewer) => reviewer.id),
      input.actor.id,
    ).map((recipientId) => ({
      recipientId,
      type: "APPROVAL_REQUIRED" as const,
      urgency: "NORMAL" as const,
      title: `Weekly report from ${input.actor.name}`,
      body: "Ready to review.",
      entityType: "REPORT" as const,
      entityId: updated.id,
      href: "/fulfillment",
    })),
  );

  return { ok: true as const, report: updated };
}

/**
 * The reviewer's decision.
 *
 * Sending it back requires a reason, and that reason goes in managerNote rather
 * than into the employee's summary. A reviewer who can edit the account being
 * reviewed is not reviewing it.
 */
export async function reviewWeeklyReport(input: {
  actor: AuthContext;
  reportId: string;
  decision: "APPROVE" | "REQUEST_CHANGES";
  note?: string | null;
}) {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: input.reportId },
    select: {
      id: true,
      userId: true,
      status: true,
      weekStartDate: true,
      user: { select: { id: true, name: true } },
    },
  });

  if (!report) return failure("NOT_FOUND", "That report could not be found.");

  /*
   * Self-approval is checked first, and deliberately.
   *
   * It holds whatever permissions somebody has - an owner cannot sign off their
   * own week either - and "this is your own week" is a truer answer than "you
   * are not allowed", which would imply the right permission would fix it.
   */
  if (report.userId === input.actor.id) {
    return failure(
      "SELF_APPROVAL",
      "This is your own week. Somebody else has to sign it off.",
    );
  }

  if (!can(input.actor, "workItems.review") && !can(input.actor, "team.manage")) {
    return failure("FORBIDDEN", "Reviewing weekly reports is for the seats that run delivery.");
  }

  if (report.status !== "SUBMITTED") {
    return failure("INVALID", "That week has not been submitted.");
  }

  const note = input.note?.trim() ?? "";

  if (input.decision === "REQUEST_CHANGES" && !note) {
    return failure("NOTE_REQUIRED", "Say what needs correcting, or nothing can be acted on.");
  }

  const updated = await prisma.weeklyReport.update({
    where: { id: report.id },
    data:
      input.decision === "APPROVE"
        ? {
            status: "APPROVED",
            approvedAt: new Date(),
            approvedById: input.actor.id,
            managerNote: note || null,
          }
        : { status: "NEEDS_CHANGES", managerNote: note },
    select: { id: true, status: true, approvedAt: true, managerNote: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action:
      input.decision === "APPROVE"
        ? `Approved ${report.user.name}'s weekly report`
        : `Requested changes to ${report.user.name}'s weekly report`,
    entityType: "REPORT",
    entityId: report.id,
    metadataJson: { decision: input.decision, note: note || null },
  });

  await createNotifications(
    resolveRecipients([report.userId], input.actor.id).map((recipientId) => ({
      recipientId,
      type:
        input.decision === "APPROVE"
          ? ("APPROVAL_RECEIVED" as const)
          : ("REVISION_REQUEST" as const),
      urgency: input.decision === "APPROVE" ? ("LOW" as const) : ("HIGH" as const),
      title:
        input.decision === "APPROVE"
          ? "Your weekly report was approved"
          : "Changes requested on your weekly report",
      body: note || "Nothing more needed.",
      entityType: "REPORT" as const,
      entityId: report.id,
      href: "/fulfillment",
    })),
  );

  return { ok: true as const, report: updated };
}

/**
 * When this week's reports are due.
 *
 * Read from the settings table rather than hard-coded, so the agency can move
 * it without a deploy. Falls back to Friday at five only when the rows are
 * missing entirely.
 */
export async function reportingDeadline(weekStart: Date): Promise<Date> {
  const settings = await prisma.workspaceSetting.findMany({
    where: { key: { in: ["weeklyReport.dueWeekday", "weeklyReport.dueTime"] } },
    select: { key: true, value: true },
  });

  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  const weekday = Number(byKey.get("weeklyReport.dueWeekday") ?? 5);
  const [hour, minute] = (byKey.get("weeklyReport.dueTime") ?? "17:00")
    .split(":")
    .map(Number);

  const deadline = new Date(startOfWeek(weekStart));

  // Monday is 1, so Friday is four days on.
  deadline.setDate(deadline.getDate() + (Number.isFinite(weekday) ? weekday - 1 : 4));
  deadline.setHours(
    Number.isFinite(hour) ? hour : 17,
    Number.isFinite(minute) ? minute : 0,
    0,
    0,
  );

  return deadline;
}
