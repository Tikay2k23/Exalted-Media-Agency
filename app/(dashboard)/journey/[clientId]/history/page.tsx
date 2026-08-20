import { ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { loadAuthContext } from "@/lib/authz";
import { getJourneyClientDetail } from "@/lib/data/journey-client-query";
import { activityStamp, formatDay } from "@/lib/journey/client-detail";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Journey History",
};

/**
 * The complete stage history, overrides included.
 *
 * Split from the overview deliberately: the overview answers what to do next,
 * and a full audit trail underneath it would bury that. This is the page for
 * "what happened and who decided it", which is a different question asked at a
 * different time.
 */
export default async function JourneyHistoryPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) redirect("/login");
  if (!can(actor, "journey.view")) redirect("/dashboard");

  const { clientId } = await params;
  const { detail } = await getJourneyClientDetail(actor, clientId);

  if (!detail) notFound();

  const { account } = detail;
  const now = new Date();

  return (
    <div className="space-y-4">
      <Link
        href={`/journey/${clientId}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to {account.companyName}
      </Link>

      <header className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">
          Journey History
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every stage this account has moved through, and every override recorded
          against it.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Stage changes
        </h2>

        {account.history.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No stage changes recorded yet.
          </p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {account.history.map((entry) => (
              <li key={entry.id} className="flex gap-3 px-5 py-3.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    entry.wasOverridden ? "bg-rose-500" : "bg-slate-300"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-800">
                    {entry.fromStageName ? (
                      <>
                        <span className="text-slate-500">{entry.fromStageName}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />
                      </>
                    ) : null}
                    <span className="font-semibold text-slate-950">
                      {entry.toStageName}
                    </span>
                    {entry.wasOverridden ? (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                        <ShieldAlert className="h-3 w-3" aria-hidden />
                        Override
                      </span>
                    ) : null}
                  </p>

                  <p className="mt-0.5 text-xs text-slate-400">
                    {entry.changedByName ?? "System"} &middot;{" "}
                    {activityStamp(entry.changedAt, now)}
                  </p>

                  {entry.overrideReason ? (
                    <p className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs leading-4 text-rose-800">
                      <span className="font-semibold">Override reason: </span>
                      {entry.overrideReason}
                    </p>
                  ) : entry.note ? (
                    <p className="mt-1 text-xs leading-4 text-slate-500">{entry.note}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Account activity
        </h2>

        {detail.activity.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No Journey activity yet.
          </p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {detail.activity.map((entry) => (
              <li key={entry.id} className="px-5 py-3">
                <p className="text-xs text-slate-400">
                  {activityStamp(entry.createdAt, now)}
                </p>
                <p className="mt-0.5 text-sm text-slate-700">{entry.action}</p>
                {entry.actorName ? (
                  <p className="mt-0.5 text-xs text-slate-400">by {entry.actorName}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="px-1 text-xs text-slate-400">
        Client since {formatDay(account.stageEnteredAt)}.
      </p>
    </div>
  );
}
