import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { clientContactUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * One contact on an account.
 *
 * Two rules the account depends on are enforced here rather than in the form,
 * because a form can be bypassed and a stage gate reads these:
 *
 * - Exactly one primary contact. Promoting somebody demotes whoever held it,
 *   in the same transaction, so there is never a moment with two or none.
 * - A contact who is the only approver, or the primary, cannot be deactivated
 *   out from under the account. Client review needs an authorised approver;
 *   losing the last one silently would block the journey with no explanation.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const { id, contactId } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientContactUpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the contact details." },
        { status: 400 },
      );
    }

    const existing = await prisma.clientContact.findFirst({
      where: { id: contactId, clientId: guard.client.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const wantsInactive = parsed.data.status === "INACTIVE";

    if (wantsInactive) {
      const blockers: string[] = [];

      if (existing.isPrimary) blockers.push("the primary contact");

      if (existing.isApprover) {
        const otherApprovers = await prisma.clientContact.count({
          where: {
            clientId: guard.client.id,
            id: { not: contactId },
            isApprover: true,
            status: "ACTIVE",
          },
        });

        if (otherApprovers === 0) blockers.push("the only authorised approver");
      }

      if (blockers.length > 0) {
        return NextResponse.json(
          {
            error: `${existing.name} is ${blockers.join(" and ")} on this account. Assign a replacement first.`,
          },
          { status: 409 },
        );
      }
    }

    const contact = await prisma.$transaction(async (tx) => {
      // One primary, always. Demote the incumbent before promoting.
      if (parsed.data.isPrimary && !existing.isPrimary) {
        await tx.clientContact.updateMany({
          where: { clientId: guard.client.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      return tx.clientContact.update({
        where: { id: contactId },
        data: {
          name: parsed.data.name,
          email: parsed.data.email?.toLowerCase() || null,
          phone: parsed.data.phone || null,
          role: parsed.data.role || null,
          isPrimary: parsed.data.isPrimary,
          isDecisionMaker: parsed.data.isDecisionMaker,
          isApprover: parsed.data.isApprover,
          communicationPreference: parsed.data.communicationPreference || null,
          notes: parsed.data.notes || null,
          ...(parsed.data.status
            ? {
                status: parsed.data.status,
                deactivatedAt: wantsInactive ? new Date() : null,
                deactivatedById: wantsInactive ? guard.actor.id : null,
              }
            : {}),
        },
      });
    });

    /*
     * One entry per thing that actually changed, named. "Contact updated" is
     * the kind of audit line that tells a reader nothing; who became the
     * approver is the kind that answers a question later.
     */
    const entries: string[] = [];

    if (existing.name !== contact.name) {
      entries.push(`Renamed contact ${existing.name} to ${contact.name}`);
    }
    if (!existing.isPrimary && contact.isPrimary) {
      entries.push(`${contact.name} is now the primary contact on ${guard.client.companyName}`);
    }
    if (!existing.isApprover && contact.isApprover) {
      entries.push(`${contact.name} is now an authorised approver on ${guard.client.companyName}`);
    }
    if (existing.isApprover && !contact.isApprover) {
      entries.push(`${contact.name} is no longer an authorised approver on ${guard.client.companyName}`);
    }
    if (existing.status !== contact.status) {
      entries.push(
        contact.status === "INACTIVE"
          ? `Deactivated contact ${contact.name} on ${guard.client.companyName}`
          : `Reactivated contact ${contact.name} on ${guard.client.companyName}`,
      );
    }
    if (entries.length === 0) {
      entries.push(`Updated contact ${contact.name} on ${guard.client.companyName}`);
    }

    for (const action of entries) {
      await logActivity({
        actorId: guard.actor.id,
        action,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { contactId: contact.id },
      });
    }

    return NextResponse.json(contact);
  } catch (error) {
    return serverFailure("api/clients/:id/contacts/:contactId", error);
  }
}

/**
 * Removes a contact outright.
 *
 * Only ever for a contact nothing points at. Approvals and review cycles
 * reference these rows, and deleting one that carries history would leave a
 * signed-off approval with nobody's name on it - deactivation is the answer
 * there, and the caller is told so rather than being refused with no route
 * forward.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  try {
    const { id, contactId } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const contact = await prisma.clientContact.findFirst({
      where: { id: contactId, clientId: guard.client.id },
      select: {
        id: true,
        name: true,
        isPrimary: true,
        _count: { select: { approvals: true, reviewCycles: true } },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const history = contact._count.approvals + contact._count.reviewCycles;

    if (history > 0) {
      return NextResponse.json(
        {
          error: `${contact.name} is named on ${history} approval${history === 1 ? "" : "s"}. Deactivate them instead so that history stays intact.`,
        },
        { status: 409 },
      );
    }

    if (contact.isPrimary) {
      return NextResponse.json(
        { error: `${contact.name} is the primary contact. Name a replacement first.` },
        { status: 409 },
      );
    }

    await prisma.clientContact.delete({ where: { id: contactId } });

    await logActivity({
      actorId: guard.actor.id,
      action: `Removed contact ${contact.name} from ${guard.client.companyName}`,
      entityType: "CLIENT",
      entityId: guard.client.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverFailure("api/clients/:id/contacts/:contactId", error);
  }
}
