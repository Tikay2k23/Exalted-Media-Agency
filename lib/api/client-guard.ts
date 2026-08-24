import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext, type AuthContext } from "@/lib/authz";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * The four checks every write to one account has to pass.
 *
 * Signed in, permitted, the account exists, and this person is allowed to see
 * it. The Account tab added four routes and each of them wants exactly this
 * preamble; writing it out four more times is how one of them ends up missing
 * the visibility clause and quietly lets a team member edit somebody else's
 * client.
 *
 * Returns either a Response to send straight back, or the actor and the account
 * to carry on with.
 */
export type ClientGuard =
  | { ok: false; response: NextResponse }
  | { ok: true; actor: AuthContext; client: { id: string; companyName: string } };

export async function guardClientWrite(
  clientId: string,
  permission: Permission,
): Promise<ClientGuard> {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!can(actor, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have permission to change this account." },
        { status: 403 },
      ),
    };
  }

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      // Somebody who may only see their own accounts cannot write another's.
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true },
  });

  if (!client) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Client not found" }, { status: 404 }),
    };
  }

  return { ok: true, actor, client };
}

/** The shape every one of these routes returns when something unexpected breaks. */
export function serverFailure(scope: string, error: unknown) {
  console.error(`[${scope}] Failed.`, error);

  return NextResponse.json(
    { error: "We couldn't save that right now. No changes were made." },
    { status: 500 },
  );
}
