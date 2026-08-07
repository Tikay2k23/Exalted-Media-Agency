import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clientContactSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Adds a contact to an account.
 *
 * Two stage requirements depend on this existing: a primary contact before
 * onboarding completes, and an authorised approver before work can be sent for
 * client review.
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

    if (!can(actor, "clients.edit")) {
      return NextResponse.json(
        { error: "You do not have permission to edit this account." },
        { status: 403 },
      );
    }

    const client = await prisma.client.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
      },
      select: { id: true, companyName: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const payload = await request.json();
    const parsed = clientContactSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid contact details" }, { status: 400 });
    }

    const contact = await prisma.$transaction(async (transaction) => {
      // Exactly one primary contact per account: a second one just creates an
      // argument about who to actually call.
      if (parsed.data.isPrimary) {
        await transaction.clientContact.updateMany({
          where: { clientId: client.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return transaction.clientContact.create({
        data: {
          clientId: client.id,
          name: parsed.data.name,
          email: parsed.data.email?.toLowerCase() || null,
          phone: parsed.data.phone || null,
          role: parsed.data.role || null,
          isPrimary: parsed.data.isPrimary,
          isDecisionMaker: parsed.data.isDecisionMaker,
          isApprover: parsed.data.isApprover,
          communicationPreference: parsed.data.communicationPreference || null,
          notes: parsed.data.notes || null,
        },
      });
    });

    await logActivity({
      actorId: actor.id,
      action: `Added contact ${contact.name} to ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      metadataJson: {
        isPrimary: contact.isPrimary,
        isApprover: contact.isApprover,
      },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/contacts] Failed to add contact.", error);
    return NextResponse.json(
      { error: "Unable to add this contact right now." },
      { status: 500 },
    );
  }
}
