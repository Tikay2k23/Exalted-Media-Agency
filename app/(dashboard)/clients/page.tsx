import type { TeamRole } from "@prisma/client";
import { redirect } from "next/navigation";

import { AddClientButton } from "@/components/clients/add-client-wizard";
import { ClientsDashboard } from "@/components/clients/clients-dashboard";
import { loadAuthContext } from "@/lib/authz";
import { getClientsDashboard } from "@/lib/data/clients-dashboard-query";
import { canAny, teamRoleLabels } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { SERVICE_BLUEPRINTS } from "@/lib/workflow/service-blueprints";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Clients Dashboard",
};

/**
 * The Clients dashboard.
 *
 * One read feeds every number on the page, so the summary cards, the attention
 * list, the chips and the directory are four views of the same rows rather than
 * four counts that can disagree.
 *
 * The delivery pipeline is deliberately not pictured here. Journey owns that,
 * and this page shows each account's current stage as a column instead.
 */
export default async function ClientsPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  if (!canAny(actor, ["clients.view.all", "clients.view.assigned"])) {
    redirect("/dashboard");
  }

  const data = await getClientsDashboard(actor);

  // Built here rather than in the component so the wizard shows exactly which
  // seats each service brings in - the same blueprint the workstreams use.
  const serviceOptions = (
    Object.keys(SERVICE_BLUEPRINTS) as (keyof typeof SERVICE_BLUEPRINTS)[]
  ).map((value) => ({
    value,
    label: SERVICE_BLUEPRINTS[value].label,
    summary: SERVICE_BLUEPRINTS[value].summary,
    specialists: SERVICE_BLUEPRINTS[value].specialists.map((role) => ({
      role,
      label: teamRoleLabels[role],
    })),
  }));

  return (
    <ClientsDashboard
      clients={data.clients}
      stages={data.stages}
      owners={data.owners}
      services={data.services}
      canManage={data.canManage}
      serverNow={new Date().toISOString()}
      addClientAction={
        data.canCreate ? (
          <AddClientButton
            services={serviceOptions}
            team={data.owners.map((member) => ({
              id: member.id,
              name: member.name,
              teamRole: member.teamRole as TeamRole,
            }))}
          />
        ) : null
      }
    />
  );
}
