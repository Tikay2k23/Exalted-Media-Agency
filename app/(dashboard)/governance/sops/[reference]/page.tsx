import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SopDetailView } from "@/components/governance/sop-detail-view";
import { loadAuthContext } from "@/lib/authz";
import { getSopDetail } from "@/lib/data/sop-detail";
import type { SopTab } from "@/lib/governance/sop-document";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAB_KEYS: SopTab[] = [
  "overview",
  "procedure",
  "system",
  "quality",
  "roles",
  "resources",
  "history",
];

/** `?tab=` is user input; anything unrecognised opens the Overview. */
function readTab(value: string | string[] | undefined): SopTab {
  const key = Array.isArray(value) ? value[0] : value;

  return TAB_KEYS.includes(key as SopTab) ? (key as SopTab) : "overview";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reference: string }>;
}): Promise<Metadata> {
  const { reference } = await params;

  return { title: `${decodeURIComponent(reference)} · SOP library` };
}

export default async function SopDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    notFound();
  }

  /*
   * The same check the governance page makes. Arriving by a pasted link is
   * not a way around it - reading a procedure is open to every seat that
   * carries governance.view, and closed to everyone else.
   */
  if (!can(actor, "governance.view")) {
    notFound();
  }

  const { reference } = await params;
  const sop = await getSopDetail(decodeURIComponent(reference));

  if (!sop) {
    notFound();
  }

  const tab = readTab((await searchParams).tab);

  return (
    <SopDetailView
      sop={sop}
      tab={tab}
      /* Hiding a control is tidiness; the API checks this again on every write. */
      canManage={can(actor, "sop.manage")}
      viewerId={actor.id}
    />
  );
}
