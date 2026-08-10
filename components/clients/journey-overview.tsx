import { ArrowRight, CircleDot, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export interface JourneyStep {
  stageKey: string;
  label: string;
  state: "done" | "current" | "future";
}

export interface WorkstreamSummary {
  role: string;
  label: string;
  ownerName: string | null;
  stage: string;
  isRequired: boolean;
}

/**
 * The card that answers the five questions without opening anything else:
 * where the client is, who has it, what they need to do, what is stopping it,
 * and who gets it next.
 *
 * A server component on purpose - every value here is derived, so there is
 * nothing to hydrate and nothing that can disagree with the database.
 */
export function JourneyOverview({
  clientId,
  stageName,
  steps,
  currentOwnerLabel,
  currentOwnerName,
  nextOwnerLabel,
  blockers,
  waitingOnClient,
  openTaskCount,
  progressPercent,
  targetLaunch,
  workstreams,
}: {
  clientId: string;
  stageName: string;
  steps: JourneyStep[];
  currentOwnerLabel: string;
  currentOwnerName: string | null;
  nextOwnerLabel: string;
  blockers: string[];
  waitingOnClient: boolean;
  openTaskCount: number;
  progressPercent: number;
  targetLaunch: Date | null;
  workstreams: WorkstreamSummary[];
}) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {/* Where it is, and who has it. */}
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Stage</p>
            <p className="mt-1.5 text-lg font-semibold text-slate-950">{stageName}</p>
            <p className="mt-1 text-sm text-slate-500">{progressPercent}% through</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              With right now
            </p>
            <p className="mt-1.5 text-lg font-semibold text-slate-950">
              {currentOwnerName ?? "Nobody"}
            </p>
            <p className="mt-1 text-sm text-slate-500">{currentOwnerLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Goes next to</p>
            <p className="mt-1.5 flex items-center gap-2 text-lg font-semibold text-slate-950">
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
              {nextOwnerLabel}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Open work</p>
            <p className="mt-1.5 text-lg font-semibold text-slate-950">{openTaskCount}</p>
            {targetLaunch ? (
              <p className="mt-1 text-sm text-slate-500">
                Launch {formatDate(targetLaunch)}
              </p>
            ) : null}
          </div>
        </div>

        {/* The journey itself, as a strip. */}
        <div className="overflow-x-auto">
          <ol className="flex min-w-max items-center gap-1.5">
            {steps.map((step) => (
              <li key={step.stageKey} className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                    step.state === "done"
                      ? "bg-emerald-100 text-emerald-800"
                      : step.state === "current"
                        ? "bg-sky-600 text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {step.state === "current" ? (
                    <CircleDot className="h-3 w-3" aria-hidden />
                  ) : null}
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* What is stopping it. */}
        {blockers.length ? (
          <div
            className={`rounded-2xl border px-4 py-3 ${
              waitingOnClient
                ? "border-amber-200 bg-amber-50"
                : "border-rose-200 bg-rose-50"
            }`}
          >
            <p
              className={`flex items-center gap-2 text-sm font-semibold ${
                waitingOnClient ? "text-amber-900" : "text-rose-900"
              }`}
            >
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              {waitingOnClient
                ? "Waiting on the client"
                : `Blocked — ${blockers.length} thing(s) to resolve`}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {blockers.slice(0, 4).map((blocker) => (
                <li
                  key={blocker}
                  className={`text-sm leading-6 ${
                    waitingOnClient ? "text-amber-800" : "text-rose-800"
                  }`}
                >
                  {blocker}
                </li>
              ))}
            </ul>
            <Link
              href={`/clients/${clientId}#readiness`}
              className="mt-2 inline-block text-sm font-semibold text-sky-700 underline underline-offset-2"
            >
              See what unblocks this
            </Link>
          </div>
        ) : (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            Nothing is blocking this account.
          </p>
        )}

        {/* Who is on it. */}
        {workstreams.length ? (
          <div className="flex flex-wrap gap-2">
            {workstreams.map((stream) => (
              <span
                key={stream.role}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
              >
                <span className="font-medium text-slate-700">{stream.label}</span>
                <span className="text-slate-500">{stream.ownerName ?? "unstaffed"}</span>
                <Badge tone={stream.stage === "COMPLETE" ? "emerald" : "slate"}>
                  {stream.stage.toLowerCase().replaceAll("_", " ")}
                </Badge>
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
