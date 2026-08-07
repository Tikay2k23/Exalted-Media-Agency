import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  REPORT_FAILURE_STATUS,
  deliverReport,
  reviewReport,
  submitReportForReview,
} from "@/lib/success/report-service";
import { reportReviewSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Moves a report along its path: submit, approve, request changes, send,
 * acknowledge.
 *
 * Separate from the draft endpoint for the same reason closing a defect is
 * separate from updating one - these transitions decide what the client sees,
 * so they should not be reachable by anything that merely edits fields.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = reportReviewSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await (() => {
      switch (parsed.data.action) {
        case "submit":
          return submitReportForReview({ actor, reportId: id });
        case "approve":
          return reviewReport({ actor, reportId: id, approve: true });
        case "requestChanges":
          return reviewReport({
            actor,
            reportId: id,
            approve: false,
            note: parsed.data.note,
          });
        case "send":
          return deliverReport({ actor, reportId: id });
        case "acknowledge":
          return deliverReport({ actor, reportId: id, acknowledged: true });
      }
    })();

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: REPORT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, status: result.report.status });
  } catch (error) {
    console.error("[api/reports/:id/review] Failed to move report.", error);
    return NextResponse.json(
      { error: "Unable to update the report right now." },
      { status: 500 },
    );
  }
}
