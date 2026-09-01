import { redirect } from "next/navigation";

import { UserManagementPanel } from "@/components/admin/user-management-panel";
import { loadAuthContext } from "@/lib/authz";
import { getAdminUsersData } from "@/lib/data/queries";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Managing user accounts.
 *
 * Gated on users.manage, resolved from the seat as well as the access tier -
 * the same permission Settings uses to decide whether to show the link here.
 *
 * It used to require the ADMIN tier outright, which disagreed with that link
 * for eight combinations of tier and seat. Every OWNER-tier account was shown
 * "Manage users" and then redirected to the dashboard on arrival: the highest
 * privilege in the system could not open the page it was being invited to, and
 * an Agency Owner seated below ADMIN could not either.
 */
export default async function AdminUsersPage() {
  const sessionUser = await requireUser();
  const actor = await loadAuthContext(sessionUser.id);

  if (!actor || !can(actor, "users.manage")) {
    redirect("/dashboard");
  }

  const data = await getAdminUsersData(actor);

  return <UserManagementPanel users={data?.users ?? []} currentUserId={actor.id} />;
}
