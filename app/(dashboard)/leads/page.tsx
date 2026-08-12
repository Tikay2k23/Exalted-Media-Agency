import { redirect } from "next/navigation";

import { SalesBoard } from "@/components/sales/sales-board";
import { loadAuthContext } from "@/lib/authz";
import { getSalesWorkspace } from "@/lib/data/sales-workspace-query";
import { canAny } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Leads and Sales",
};

/**
 * Leads and Sales.
 *
 * The workspace for moving prospects toward paying, rather than a general
 * dashboard. Everything a salesperson opens it to ask - who needs chasing,
 * which proposals have gone quiet, what happens next on each opportunity - is
 * derived in the browser from one read, so the counters and the list are always
 * the same set of leads.
 */
export default async function LeadsPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  if (!canAny(actor, ["leads.view.all", "leads.view.assigned"])) {
    redirect("/dashboard");
  }

  const data = await getSalesWorkspace(actor);

  return (
    <SalesBoard
      stages={data.stages}
      leads={data.leads}
      owners={data.owners}
      sources={data.sources}
      proposalAgingDays={data.proposalAgingDays}
      canSeeTeam={data.canSeeTeam}
      canCreate={data.canCreate}
      canEdit={data.canEdit}
      canConvert={data.canConvert}
      canAssign={data.canAssign}
      serverNow={new Date().toISOString()}
    />
  );
}
