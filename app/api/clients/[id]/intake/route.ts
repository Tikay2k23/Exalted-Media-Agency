import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  INTAKE_FAILURE_STATUS,
  reviewIntake,
  sendIntakeForm,
} from "@/lib/intake/intake-service";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }),
  z.object({
    action: z.literal("review"),
    notes: z.string().max(4000).optional().or(z.literal("")),
  }),
]);

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

    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result =
      parsed.data.action === "send"
        ? await sendIntakeForm({ actor, clientId: id })
        : await reviewIntake({ actor, clientId: id, notes: parsed.data.notes });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: INTAKE_FAILURE_STATUS[result.code] },
      );
    }

    // The link is returned so the project manager can copy it into whatever
    // they actually email from. The system deliberately does not send mail
    // itself - client-facing communication stays an explicit human action.
    return NextResponse.json({
      ok: true,
      token: "token" in result.form ? result.form.token : undefined,
    });
  } catch (error) {
    console.error("[api/clients/:id/intake] Failed.", error);
    return NextResponse.json(
      { error: "Unable to update the intake form right now." },
      { status: 500 },
    );
  }
}
