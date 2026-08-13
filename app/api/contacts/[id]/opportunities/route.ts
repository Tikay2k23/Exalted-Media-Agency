import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  CONTACT_FAILURE_STATUS,
  createOpportunityForContact,
} from "@/lib/sales/contact-service";
import { opportunityFormSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * A second deal against a contact the agency already has.
 *
 * Separate from POST /api/leads on purpose: that route may create a contact,
 * this one never can. Routing both through one endpoint would mean one flag
 * standing between "add a deal to Best Life Chiropractic" and "create a second
 * Best Life Chiropractic", and that flag would eventually be sent wrong.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = opportunityFormSchema
    // The contact is the URL. Nothing in the body may contradict it.
    .omit({ contactName: true, businessName: true, email: true, phone: true, contactId: true })
    .safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid opportunity payload" },
      { status: 400 },
    );
  }

  const result = await createOpportunityForContact({
    actor,
    contactId: id,
    opportunity: parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: CONTACT_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json(result, { status: 201 });
}
