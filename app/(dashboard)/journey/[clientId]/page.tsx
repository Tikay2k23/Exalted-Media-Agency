import { notFound, redirect } from "next/navigation";

import { ClientJourneyView } from "@/components/journey/client/client-journey-view";
import { loadAuthContext } from "@/lib/authz";
import { getJourneyClientDetail } from "@/lib/data/journey-client-query";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Client Journey",
};

/**
 * One client's delivery journey.
 *
 * `now` is stamped here and passed down rather than read again in the browser,
 * so the header, the stage clock and the milestone rail cannot disagree about
 * what day it is.
 */
export default async function ClientJourneyPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  if (!can(actor, "journey.view")) {
    redirect("/dashboard");
  }

  const { clientId } = await params;
  const { detail } = await getJourneyClientDetail(actor, clientId);

  if (!detail) {
    notFound();
  }

  return <ClientJourneyView detail={detail} nowIso={new Date().toISOString()} />;
}
