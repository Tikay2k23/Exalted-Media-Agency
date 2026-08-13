import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  CONTACT_FAILURE_STATUS,
  createLeadWithOpportunity,
} from "@/lib/sales/contact-service";
import { opportunityFormSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Add Lead.
 *
 * One request creates the contact and their first opportunity, because a lead
 * with no deal against it is not a lead. When the contact already exists this
 * answers 409 with the candidates rather than creating a second record - the
 * caller then either names the contact to attach to, or says to create a new
 * one anyway. Both of those come back through this same endpoint.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = opportunityFormSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid lead payload" },
        { status: 400 },
      );
    }

    const { contactName, businessName, email, phone, contactId, allowDuplicate, ...opportunity } =
      parsed.data;

    const result = await createLeadWithOpportunity({
      actor,
      contact: { contactName, businessName, email, phone },
      opportunity,
      contactId: contactId || null,
      allowDuplicate,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, matches: result.matches ?? [] },
        { status: CONTACT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[api/leads] Failed to create lead.", error);
    return NextResponse.json(
      { error: "Unable to create this lead right now." },
      { status: 500 },
    );
  }
}
