import { NextResponse } from "next/server";

import { FINANCE_FAILURE_STATUS } from "@/app/api/clients/[id]/invoices/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { recordPayment } from "@/lib/finance/invoice-service";
import { paymentSchema } from "@/lib/validators";

export const runtime = "nodejs";

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

    const payload = await request.json();
    const parsed = paymentSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid payment details",
        },
        { status: 400 },
      );
    }

    const result = await recordPayment({ actor, invoiceId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: FINANCE_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, invoiceStatus: result.invoiceStatus },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/invoices/:id/payments] Failed to record payment.", error);
    return NextResponse.json(
      { error: "Unable to record this payment right now." },
      { status: 500 },
    );
  }
}
