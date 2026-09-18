import { type AuthContext, loadAuthContext } from "@/lib/authz";
import { getServerAuthSession } from "@/lib/auth";

/**
 * The signed-in person for a team endpoint.
 *
 * Only establishes who is asking. What they may do is decided in
 * team-service, per department, on every call.
 */
export async function teamActor(): Promise<
  { ok: true; actor: AuthContext } | { ok: false; status: number; error: string }
> {
  const session = await getServerAuthSession();

  if (!session?.user) return { ok: false, status: 401, error: "Unauthorized" };

  const actor = await loadAuthContext(session.user.id);

  if (!actor) return { ok: false, status: 401, error: "Unauthorized" };

  return { ok: true, actor };
}
