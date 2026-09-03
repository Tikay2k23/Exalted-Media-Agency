import { type AuthContext, loadAuthContext } from "@/lib/authz";
import { getServerAuthSession } from "@/lib/auth";
import { can } from "@/lib/permissions";

/**
 * The signed-in actor for a resource endpoint, or a reason they cannot act.
 *
 * Every resource route begins the same way - who is this, and may they read
 * governance at all - so it lives here rather than being retyped six times, each
 * a chance to forget the check.
 */
export async function resourceActor(): Promise<
  { ok: true; actor: AuthContext } | { ok: false; status: number; error: string }
> {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor || !can(actor, "governance.view")) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, actor };
}
