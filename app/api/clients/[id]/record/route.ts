import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { formatEnumLabel } from "@/lib/utils";
import { clientRecordSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * The five identifying fields on a client, and nothing else.
 *
 * The account editor used to submit the whole client through the create-and-
 * update endpoint, because that is the shape that endpoint takes. Doing so
 * meant sending back the owner, status, stage and note the page happened to be
 * rendered with - so a stage moved from the Journey board, or an owner changed
 * in another tab, was silently written back to its old value the moment somebody
 * saved a phone number here.
 *
 * Writing only the columns this form owns closes that window completely: there
 * is nothing stale to send, because nothing else is sent.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientRecordSchema.safeParse(await request.json());

    if (!parsed.success) {
      const issue = parsed.error.issues[0];

      return NextResponse.json(
        {
          error:
            issue?.path[0] === "contactEmail"
              ? "That does not look like an email address."
              : (issue?.message ?? "Check the details and try again."),
          field: issue?.path[0],
        },
        { status: 400 },
      );
    }

    const before = await prisma.client.findUniqueOrThrow({
      where: { id: guard.client.id },
      select: {
        clientName: true,
        companyName: true,
        contactEmail: true,
        contactPhone: true,
        serviceType: true,
      },
    });

    const data = {
      clientName: parsed.data.clientName,
      companyName: parsed.data.companyName,
      contactEmail: parsed.data.contactEmail.toLowerCase(),
      contactPhone: parsed.data.contactPhone?.trim() || null,
      serviceType: parsed.data.serviceType,
    };

    await prisma.client.update({ where: { id: guard.client.id }, data });

    /*
     * Renaming an account and changing what it buys are both worth their own
     * line - somebody looking for "Cedar Ridge" a year from now needs to find
     * the entry that says it used to be called that.
     */
    if (before.companyName !== data.companyName) {
      await logActivity({
        actorId: guard.actor.id,
        action: `Renamed ${before.companyName} to ${data.companyName}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { from: before.companyName, to: data.companyName },
      });
    }

    if (before.serviceType !== data.serviceType) {
      await logActivity({
        actorId: guard.actor.id,
        action: `${data.companyName} service type changed from ${formatEnumLabel(before.serviceType)} to ${formatEnumLabel(data.serviceType)}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { from: before.serviceType, to: data.serviceType },
      });
    }

    const contactMoved =
      before.clientName !== data.clientName
      || before.contactEmail !== data.contactEmail
      || before.contactPhone !== data.contactPhone;

    if (contactMoved) {
      await logActivity({
        actorId: guard.actor.id,
        action: `Updated the primary contact details on ${data.companyName}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: {
          from: {
            name: before.clientName,
            email: before.contactEmail,
            phone: before.contactPhone,
          },
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverFailure("api/clients/:id/record", error);
  }
}
