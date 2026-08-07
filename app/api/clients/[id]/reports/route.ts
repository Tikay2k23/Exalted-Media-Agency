import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { REPORT_FAILURE_STATUS, saveReport } from "@/lib/success/report-service";
import { clientReportSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** Creates a report draft, or updates one when reportId is supplied. */
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

    const parsed = clientReportSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid report details" }, { status: 400 });
    }

    const periodStart = new Date(parsed.data.periodStart);
    const periodEnd = new Date(parsed.data.periodEnd);
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;

    for (const value of [periodStart, periodEnd, dueAt]) {
      if (value && Number.isNaN(value.getTime())) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
    }

    const result = await saveReport({
      actor,
      clientId: id,
      reportId: parsed.data.reportId,
      type: parsed.data.type,
      periodStart,
      periodEnd,
      dueAt,
      dataSources: parsed.data.dataSources,
      knownLimitations: parsed.data.knownLimitations,
      recommendedActions: parsed.data.recommendedActions,
      documentUrl: parsed.data.documentUrl,
      dataValidated: parsed.data.dataValidated,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: REPORT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, reportId: result.report.id }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/reports] Failed to save report.", error);
    return NextResponse.json(
      { error: "Unable to save the report right now." },
      { status: 500 },
    );
  }
}
