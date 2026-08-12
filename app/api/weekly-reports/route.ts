import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  REPORT_FAILURE_STATUS,
  reviewWeeklyReport,
  saveReportDraft,
  submitWeeklyReport,
} from "@/lib/eod/weekly-report-service";

export const runtime = "nodejs";

/**
 * The weekly report's three moves, behind one door.
 *
 * Saving and submitting are the employee's - the service refuses anybody
 * else, because a week filed on somebody's behalf is not their account of it.
 * Reviewing is the manager's, and the service refuses self-approval.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    weekStart: z.string().min(1),
    summary: z.string().max(4000),
  }),
  z.object({
    action: z.literal("submit"),
    weekStart: z.string().min(1),
    summary: z.string().max(4000).nullish(),
  }),
  z.object({
    action: z.literal("review"),
    reportId: z.string().min(1),
    decision: z.enum(["APPROVE", "REQUEST_CHANGES"]),
    note: z.string().max(2000).nullish(),
  }),
]);

export async function POST(request: Request) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const body = parsed.data;

  const result = await (() => {
    switch (body.action) {
      case "save": {
        const weekStart = new Date(body.weekStart);
        return saveReportDraft({ actor, weekStart, summary: body.summary });
      }
      case "submit": {
        const weekStart = new Date(body.weekStart);
        return submitWeeklyReport({ actor, weekStart, summary: body.summary ?? null });
      }
      case "review":
        return reviewWeeklyReport({
          actor,
          reportId: body.reportId,
          decision: body.decision,
          note: body.note ?? null,
        });
    }
  })();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: REPORT_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true, report: result.report });
}
