import { ActivityEntityType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canAccessAssignedRecord, canManageClients } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clientStatusUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * An account's status, and nothing else.
 *
 * This used to take the whole client as well - name, owner, status, service,
 * stage and note in one payload. Two things were wrong with that.
 *
 * It wrote every field on every save, so the editor that used it sent back
 * whatever the page had been rendered with: a stage moved from the Journey
 * board while somebody had the form open was silently reverted when they saved
 * a phone number. The fields now have narrow routes of their own - /record,
 * /company, /ownership, /commercials, /next-step, /internal-note - each writing
 * only the columns it owns.
 *
 * It also set currentStageId directly and wrote its own history row, which is a
 * way around the stage gate. Moving an account is supposed to go through the
 * dialog that evaluates the stage's requirements, refuses on blocking ones and
 * records an override reason. A second path that skips all of that is worse
 * than no path.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await prisma.client.findUnique({ where: { id } });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // The account's own people may set its status; managing every client is
    // not required for it.
    if (
      !canManageClients(session.user.role)
      && !canAccessAssignedRecord(session.user.role, session.user.id, client.assignedUserId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /*
     * Strict, so anything beyond the status is an error rather than quietly
     * dropped. A caller still sending the old whole-client payload has a bug,
     * and a 200 that silently ignored eight of its nine fields would hide it -
     * which is precisely how the reverted-stage problem went unnoticed.
     */
    const parsed = clientStatusUpdateSchema.strict().safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "This endpoint only sets the account status. The other fields have their own routes.",
        },
        { status: 400 },
      );
    }

    if (client.status === parsed.data.status) {
      return NextResponse.json({ ...client, unchanged: true });
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    await logActivity({
      actorId: session.user.id,
      action: `Updated ${updatedClient.companyName} status to ${parsed.data.status.replaceAll("_", " ")}`,
      entityType: ActivityEntityType.CLIENT,
      entityId: updatedClient.id,
    });

    return NextResponse.json(updatedClient);
  } catch (error) {
    console.error("[api/clients/:id] Failed to update client status.", error);
    return NextResponse.json(
      { error: "Unable to update this client right now." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageClients(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        companyName: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.employeeTask.updateMany({
        where: {
          clientId: id,
        },
        data: {
          clientId: null,
        },
      });

      await transaction.client.delete({
        where: { id },
      });
    });

    await logActivity({
      actorId: session.user.id,
      action: `Deleted client ${client.companyName}`,
      entityType: ActivityEntityType.CLIENT,
      entityId: client.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/clients/:id] Failed to delete client.", error);
    return NextResponse.json({ error: "Unable to delete this client right now." }, { status: 500 });
  }
}
