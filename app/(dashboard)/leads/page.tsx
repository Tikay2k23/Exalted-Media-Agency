import { redirect } from "next/navigation";

import { SalesWorkspace } from "@/components/sales/sales-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { loadAuthContext } from "@/lib/authz";
import { getSalesWorkspaceData } from "@/lib/data/sales-queries";
import { canAny } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Leads and Sales",
};

export default async function LeadsPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  if (!canAny(actor, ["leads.view.all", "leads.view.assigned"])) {
    redirect("/dashboard");
  }

  const data = await getSalesWorkspaceData(actor);
  const { metrics } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Leads and Sales
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {data.canAssign
            ? "Every lead in the agency, with the most urgent follow-ups first."
            : "Your leads, with the most urgent follow-ups first."}
        </p>
      </div>

      {data.isDegraded ? (
        <Card>
          <CardContent className="px-6 py-5">
            <p className="text-sm text-amber-800">
              This page could not load its data. Refresh, and tell an administrator if it
              keeps happening.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* One line of plain English replaces eight metric tiles. It says what to
          do, not just what is true. */}
      {metrics.overdueFollowUps > 0 || metrics.unassigned > 0 ? (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="px-6 py-5">
            <p className="text-sm leading-6 text-amber-900">
              {metrics.overdueFollowUps > 0 ? (
                <>
                  <span className="font-semibold">
                    {metrics.overdueFollowUps} follow-up
                    {metrics.overdueFollowUps === 1 ? " is" : "s are"} overdue.
                  </span>{" "}
                  Use the <span className="font-medium">Follow-up due</span> filter below.
                </>
              ) : null}
              {metrics.overdueFollowUps > 0 && metrics.unassigned > 0 ? " " : null}
              {metrics.unassigned > 0 ? (
                <>
                  <span className="font-semibold">
                    {metrics.unassigned} lead{metrics.unassigned === 1 ? " has" : "s have"}{" "}
                    nobody working {metrics.unassigned === 1 ? "it" : "them"}.
                  </span>{" "}
                  Open the lead and set an assigned representative.
                </>
              ) : null}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <SalesWorkspace
        leads={data.leads}
        assignableUsers={data.assignableUsers}
        canCreate={data.canCreate}
        canEdit={data.canEdit}
        canConvert={data.canConvert}
        canAssign={data.canAssign}
      />
    </div>
  );
}
