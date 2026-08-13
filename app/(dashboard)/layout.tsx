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
    /*
     * The workspace is the browser width minus the sidebar, and nothing else.
     *
     * This used to be capped at 1600px and centred, which on a 1920 screen left
     * 160px of empty margin down each side while the tables inside were
     * scrolling sideways to fit. The cap is gone; padding does the breathing
     * room instead, 16px on a phone up to 32px on a desktop.
     */
    <div className="min-h-screen px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-8">
      <div className="flex w-full flex-col gap-6 xl:flex-row">
        {/*
          A fixed basis rather than max-width, so the sidebar cannot be squeezed
          by a wide child in the main column and the content column always knows
          exactly how much room it has.
        */}
        <div className="xl:sticky xl:top-8 xl:h-fit xl:w-[17rem] xl:shrink-0">
          <Sidebar roleLabel={identityLabel} permissions={permissions} />
        </div>
        {/*
          min-w-0 is what actually stops the page scrolling sideways: a flex
          child defaults to min-width:auto and refuses to shrink below its
          content, so one wide table pushes the whole layout out.
        */}
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
