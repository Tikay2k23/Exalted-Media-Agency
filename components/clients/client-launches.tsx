"use client";

import {
  Check,
  LoaderCircle,
  Rocket,
  ShieldAlert,
  Snowflake,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDate, formatEnumLabel } from "@/lib/utils";

export interface ChecklistRow {
  id: string;
  label: string;
  status: string;
  isRequired: boolean;
}

export interface MonitoringRow {
  id: string;
  window: string;
  result: string;
  dueAt: string | null;
  observations: string | null;
}

export interface LaunchRow {
  id: string;
  name: string;
  status: string;
  scheduledFor: string | null;
  ownerName: string | null;
  backupVerified: boolean;
  rollbackPlan: string | null;
  isFrozen: boolean;
  freezeReason: string | null;
  checklistItems: ChecklistRow[];
  monitoringChecks: MonitoringRow[];
  readinessBlockers: string[];
  isReady: boolean;
  completedRequired: number;
  totalRequired: number;
}

const WINDOW_LABEL: Record<string, string> = {
  FIRST_TWO_HOURS: "First 2 hours",
  FIRST_24_HOURS: "First 24 hours",
  FIRST_72_HOURS: "First 72 hours",
  FIRST_7_DAYS: "First 7 days",
};

function statusTone(status: string) {
  switch (status) {
    case "MONITORING":
    case "COMPLETE":
      return "emerald" as const;
    case "READY":
      return "sky" as const;
    case "BLOCKED":
    case "ROLLED_BACK":
      return "rose" as const;
    default:
      return "slate" as const;
  }
}

export function ClientLaunches({
  clientId,
  launches,
  owners,
  canSchedule,
  canActivate,
}: {
  clientId: string;
  launches: LaunchRow[];
  owners: { id: string; name: string }[];
  canSchedule: boolean;
  canActivate: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function send(url: string, method: "POST" | "PATCH", body: unknown, onDone?: () => void) {
    setError(null);
    setBlockers([]);

    startTransition(async () => {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string; blockers?: string[] }
          | null;
        setError(data?.error ?? "That could not be saved.");
        setBlockers(data?.blockers ?? []);
        return;
      }

      onDone?.();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Launches</CardTitle>
          <CardDescription>
            A launch cannot go live without a verified backup, a written rollback plan,
            and a named owner.
          </CardDescription>
        </div>
        {canSchedule && !creating ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setCreating(true)}
          >
            <Rocket className="h-3.5 w-3.5" />
            Schedule launch
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {launches.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            No launch scheduled. Creating one sets up the standard 16-point checklist.
          </p>
        ) : (
          launches.map((launch) => (
            <div key={launch.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{launch.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {launch.ownerName ? `Owner ${launch.ownerName}` : (
                      <span className="text-amber-700">No owner named</span>
                    )}
                    {launch.scheduledFor ? ` · ${formatDate(launch.scheduledFor)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {launch.isFrozen ? (
                    <Badge tone="amber">
                      <Snowflake className="mr-1 inline h-3 w-3" />
                      Frozen
                    </Badge>
                  ) : null}
                  <Badge tone={statusTone(launch.status)}>
                    {formatEnumLabel(launch.status)}
                  </Badge>
                </div>
              </div>

              {launch.isFrozen && launch.freezeReason ? (
                <p className="mt-2 text-sm text-amber-800">{launch.freezeReason}</p>
              ) : null}

              {/* The two things that make a bad launch survivable. */}
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={launch.backupVerified}
                    disabled={!canSchedule || isPending}
                    onChange={(event) =>
                      send(`/api/launches/${launch.id}`, "PATCH", {
                        backupVerified: event.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">
                    Backup taken and restore verified
                  </span>
                </label>

                <form
                  action={(formData) =>
                    send(`/api/launches/${launch.id}`, "PATCH", {
                      rollbackPlan: String(formData.get("rollbackPlan") ?? "").trim(),
                    })
                  }
                  className="flex gap-2"
                >
                  <Input
                    name="rollbackPlan"
                    defaultValue={launch.rollbackPlan ?? ""}
                    placeholder="Rollback plan"
                    disabled={!canSchedule}
                  />
                  <Button type="submit" size="sm" variant="secondary" disabled={!canSchedule || isPending}>
                    Save
                  </Button>
                </form>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700">
                  Checklist — {launch.completedRequired} of {launch.totalRequired} done
                </p>
                <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-2">
                  {launch.checklistItems.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5">
                      <button
                        type="button"
                        disabled={!canSchedule || isPending}
                        onClick={() =>
                          send(`/api/launch-checklist/${item.id}`, "PATCH", {
                            status: item.status === "COMPLETE" ? "PENDING" : "COMPLETE",
                          })
                        }
                        aria-label={
                          item.status === "COMPLETE"
                            ? `Reopen ${item.label}`
                            : `Complete ${item.label}`
                        }
                        className={cn(
                          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                          item.status === "COMPLETE"
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : item.status === "FAILED"
                              ? "border-rose-500 bg-rose-500 text-white"
                              : "border-slate-300 hover:border-slate-400",
                        )}
                      >
                        {item.status === "COMPLETE" ? <Check className="h-3 w-3" /> : null}
                      </button>
                      <span
                        className={cn(
                          "text-sm",
                          item.status === "COMPLETE"
                            ? "text-slate-400 line-through"
                            : item.status === "FAILED"
                              ? "font-medium text-rose-700"
                              : "text-slate-700",
                        )}
                      >
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {launch.monitoringChecks.length > 0 ? (
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-700">Post-launch monitoring</p>
                  <ul className="mt-2 space-y-1.5">
                    {launch.monitoringChecks.map((check) => (
                      <li key={check.id} className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-slate-700">
                          {WINDOW_LABEL[check.window] ?? formatEnumLabel(check.window)}
                        </span>
                        <Badge
                          tone={
                            check.result === "HEALTHY"
                              ? "emerald"
                              : check.result === "FAILED"
                                ? "rose"
                                : check.result === "DEGRADED"
                                  ? "amber"
                                  : "slate"
                          }
                        >
                          {formatEnumLabel(check.result)}
                        </Badge>
                        {check.dueAt ? (
                          <span className="text-xs text-slate-400">
                            due {formatDate(check.dueAt)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {launch.status !== "MONITORING" && launch.status !== "COMPLETE" ? (
                <div className="mt-4">
                  {launch.isReady ? (
                    <Button
                      type="button"
                      disabled={!canActivate || isPending}
                      onClick={() => send(`/api/launches/${launch.id}/activate`, "POST", undefined)}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                    >
                      {isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="h-4 w-4" />
                      )}
                      Take it live
                    </Button>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                        <ShieldAlert className="h-4 w-4" aria-hidden />
                        Not ready to go live
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {launch.readinessBlockers.map((blocker) => (
                          <li key={blocker} className="text-sm leading-6 text-amber-800">
                            {blocker}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!canActivate && launch.isReady ? (
                    <p className="mt-2 text-sm text-slate-500">
                      You do not have permission to activate a launch.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}

        {creating ? (
          <form
            action={(formData) =>
              send(
                `/api/clients/${clientId}/launches`,
                "POST",
                {
                  name: String(formData.get("name") ?? "").trim(),
                  scheduledFor: String(formData.get("scheduledFor") ?? ""),
                  ownerId: String(formData.get("ownerId") ?? ""),
                },
                () => setCreating(false),
              )
            }
            className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
          >
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Launch name</span>
              <Input name="name" placeholder="e.g. Website and funnel go-live" required />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Launch owner</span>
              <select
                name="ownerId"
                defaultValue=""
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Nobody yet</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Scheduled for</span>
              <Input name="scheduledFor" type="date" />
            </label>
            <div className="flex items-end gap-3">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Schedule launch
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm text-rose-700">{error}</p>
            {blockers.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {blockers.map((blocker) => (
                  <li key={blocker} className="text-sm leading-6 text-rose-700">
                    {blocker}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
