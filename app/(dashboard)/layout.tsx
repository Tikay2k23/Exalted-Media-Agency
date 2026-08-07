import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { loadAuthContext } from "@/lib/authz";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { resolvePermissions, teamRoleLabels } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  // Permissions are resolved from the database rather than the session token so
  // a revoked capability disappears from the interface immediately.
  const context = await loadAuthContext(user.id);

  if (!context) {
    redirect("/login");
  }

  const permissions = [...resolvePermissions(context)];
  const unreadCount = await getUnreadNotificationCount(context.id);

  // The seat is what the person actually is here. Job title and access tier are
  // both secondary to it.
  const identityLabel = teamRoleLabels[context.teamRole];

  return (
    <div className="min-h-screen px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 xl:flex-row">
        <div className="xl:sticky xl:top-8 xl:h-fit">
          <Sidebar roleLabel={identityLabel} permissions={permissions} />
        </div>
        <div className="min-w-0 flex-1 space-y-6">
          <Topbar
            name={context.name}
            email={context.email}
            roleLabel={identityLabel}
            avatarUrl={user.image}
            unreadCount={unreadCount}
          />
          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
