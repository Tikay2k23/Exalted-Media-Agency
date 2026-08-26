import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { getAutomationRuns } from "@/lib/journey/automation-runs";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * What a client's stage transitions actually did.
 *
 * Fetched when somebody opens the log rather than loaded with the page: most
 * visits never ask, and a query nobody reads is a query worth not running.
 *
 * Read-only, and scoped the same way the journey itself is - a specialist who
 * cannot see an account cannot read what its transitions did either.
 */
export async function GET(
  _request: Request,
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

    /*
     * The same visibility rule the journey uses, applied server-side rather
     * than trusted from the caller: an id in the URL is not permission to read
     * the account it names.
     */
    const client = await prisma.client.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
      },
      select: { id: true },
    });

    if (!client) {
      // Deliberately the same as a missing client: existence is not confirmed.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ runs: await getAutomationRuns(client.id) });
  } catch (error) {
    console.error("[api/clients/:id/automation-runs] Failed to load.", error);

    return NextResponse.json(
      { error: "Unable to load the automation log right now." },
      { status: 500 },
    );
  }
}
