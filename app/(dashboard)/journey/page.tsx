import { redirect } from "next/navigation";

import { JourneyWorkspace } from "@/components/journey/journey-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { loadAuthContext } from "@/lib/authz";
import { getJourneyWorkspaceData } from "@/lib/data/journey-queries";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Client Journey",
};

export default async function JourneyPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  if (!can(actor, "journey.view")) {
    redirect("/dashboard");
  }

  const data = await getJourneyWorkspaceData(actor);

  const needsAttention = data.accounts.filter(
    (account) => account.isOverSla || !account.ownerName || account.currentBlocker,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Client Journey
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Where every client sits, and what needs doing next. Use{" "}
          <span className="font-medium text-slate-700">Move</span> on an account to see
          exactly what is needed before it can go forward.
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

      {needsAttention.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="px-6 py-5">
            <p className="text-sm font-semibold text-amber-900">
              {needsAttention.length} account{needsAttention.length === 1 ? "" : "s"} need
              attention
            </p>
            <ul className="mt-2 space-y-1">
              {needsAttention.slice(0, 5).map((account) => (
                <li key={account.id} className="text-sm leading-6 text-amber-800">
                  <span className="font-medium">{account.companyName}</span>
                  {" — "}
                  {!account.ownerName
                    ? "nobody owns this account"
                    : account.currentBlocker
                      ? account.currentBlocker
                      : `${account.daysInStage} days in ${account.stageName}, past the ${account.slaDays}-day target`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <JourneyWorkspace
        accounts={data.accounts}
        stages={data.stages}
        canMove={data.canMove}
        canOverride={data.canOverride}
      />
    </div>
  );
}
