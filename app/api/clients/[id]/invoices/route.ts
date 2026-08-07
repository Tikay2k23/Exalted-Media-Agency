import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { createInvoice } from "@/lib/finance/invoice-service";
import { invoiceSchema } from "@/lib/validators";

export const runtime = "nodejs";

export const FINANCE_FAILURE_STATUS = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  ALREADY_SETTLED: 409,
} as const;

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
    const parsed = invoiceSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid invoice details" }, { status: 400 });
    }

    const result = await createInvoice({ actor, clientId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: FINANCE_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, invoiceNumber: result.invoice.invoiceNumber },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/clients/:id/invoices] Failed to raise invoice.", error);
    return NextResponse.json(
      { error: "Unable to raise this invoice right now." },
      { status: 500 },
    );
  }
}
