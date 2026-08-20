import { redirect } from "next/navigation";

import { JourneyWorkspace } from "@/components/journey/journey-workspace";
import { loadAuthContext } from "@/lib/authz";
import { getJourneyWorkspaceData } from "@/lib/data/journey-queries";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Client Journey",
};

/**
 * The page loads and authorises; everything else is derived in the client.
 *
 * `now` is stamped here and handed down rather than read again in the browser,
 * so a card, a table row and the drawer cannot disagree about how many days an
 * account has been sitting in its stage.
 */
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

  if (data.isDegraded) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4">
        <h1 className="text-base font-semibold text-amber-900">Client Journey</h1>
        <p className="mt-1 text-sm leading-6 text-amber-800">
          This page could not load its data. Refresh, and tell an administrator if it
          keeps happening.
        </p>
      </div>
    );
  }

  return <JourneyWorkspace data={data} nowIso={new Date().toISOString()} />;
}
