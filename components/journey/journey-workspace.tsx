"use client";

import { CircleAlert, Clock, MoveRight, Route } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StageMoveDialog, type StageOption } from "@/components/journey/stage-move-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JourneyAccountRow } from "@/lib/data/journey-queries";
import { cn, formatDate, formatEnumLabel } from "@/lib/utils";

function healthTone(status: string) {
  switch (status) {
    case "GREEN":
      return "emerald" as const;
    case "YELLOW":
      return "amber" as const;
    case "RED":
      return "rose" as const;
    default:
      return "slate" as const;
  }
}

function healthLabel(status: string) {
  return status === "NOT_ASSESSED" ? "Not assessed" : formatEnumLabel(status);
}

function TimeInStage({ account }: { account: JourneyAccountRow }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm",
        account.isOverSla ? "font-semibold text-rose-700" : "text-slate-600",
      )}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {account.daysInStage} day{account.daysInStage === 1 ? "" : "s"}
      {account.slaDays !== null ? (
        <span className="text-slate-400">/ {account.slaDays}</span>
      ) : null}
      {/* Text, not just colour, carries the over-target state. */}
      {account.isOverSla ? <span className="text-rose-700">over target</span> : null}
    </span>
  );
}

export function JourneyWorkspace({
  accounts,
  stages,
  canMove,
  canOverride,
}: {
  accounts: JourneyAccountRow[];
  stages: StageOption[];
  canMove: boolean;
  canOverride: boolean;
}) {
  const [movingAccount, setMovingAccount] = useState<JourneyAccountRow | null>(null);

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-16 text-center">
          <Route className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-4 text-base font-semibold text-slate-900">
            No accounts are in the client journey yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Accounts appear here once they are created. Each one moves through the
            journey under the same stage requirements.
          </p>
          <Link href="/clients" className="mt-6 inline-block">
            <Button variant="secondary">Go to accounts</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Accounts in the journey</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Wide layout: a scrollable table. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr className="text-left">
                  <th className="px-6 py-3 font-semibold text-slate-600">Account</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Stage</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Time in stage</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Owner</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Health</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Next action</th>
                  {canMove ? <th className="px-6 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((account) => (
                  <tr key={account.id} className="align-top">
                    <td className="px-6 py-4">
                      <Link
                        href={`/clients/${account.id}`}
                        className="font-semibold text-slate-950 hover:text-sky-700"
                      >
                        {account.companyName}
                      </Link>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                        {account.clientName}
                      </p>
                      {account.currentBlocker ? (
                        <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-rose-700">
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          {account.currentBlocker}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: account.stageColor }}
                          aria-hidden
                        />
                        <span className="font-medium text-slate-800">
                          {account.stageName}
                        </span>
                      </span>
                      {account.isStageDeprecated ? (
                        <Badge tone="amber" className="mt-2 block w-fit">
                          Retired stage
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <TimeInStage account={account} />
                      <p className="mt-1 text-xs text-slate-400">
                        Since {formatDate(account.stageEnteredAt)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {account.ownerName ?? (
                        <span className="text-amber-700">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge tone={healthTone(account.healthStatus)}>
                        {healthLabel(account.healthStatus)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {account.nextAction ?? <span className="text-slate-400">—</span>}
                      {account.nextActionDueAt ? (
                        <p className="mt-1 text-xs text-slate-400">
                          Due {formatDate(account.nextActionDueAt)}
                        </p>
                      ) : null}
                    </td>
                    {canMove ? (
                      <td className="px-6 py-4 text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setMovingAccount(account)}
                        >
                          <MoveRight className="h-3.5 w-3.5" />
                          Move
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow layout: the same data as cards, so nothing scrolls sideways. */}
          <ul className="divide-y divide-slate-100 lg:hidden">
            {accounts.map((account) => (
              <li key={account.id} className="space-y-3 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/clients/${account.id}`}
                      className="font-semibold text-slate-950 hover:text-sky-700"
                    >
                      {account.companyName}
                    </Link>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                      {account.clientName}
                    </p>
                  </div>
                  <Badge tone={healthTone(account.healthStatus)}>
                    {healthLabel(account.healthStatus)}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: account.stageColor }}
                      aria-hidden
                    />
                    <span className="text-sm font-medium text-slate-800">
                      {account.stageName}
                    </span>
                  </span>
                  <TimeInStage account={account} />
                </div>

                <p className="text-sm text-slate-600">
                  Owner: {account.ownerName ?? "Unassigned"}
                </p>

                {account.currentBlocker ? (
                  <p className="inline-flex items-start gap-1.5 text-sm text-rose-700">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {account.currentBlocker}
                  </p>
                ) : null}

                {canMove ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => setMovingAccount(account)}
                  >
                    <MoveRight className="h-3.5 w-3.5" />
                    Move stage
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {movingAccount ? (
        <StageMoveDialog
          clientId={movingAccount.id}
          companyName={movingAccount.companyName}
          currentStageId={movingAccount.stageId}
          stages={stages}
          canOverride={canOverride}
          onClose={() => setMovingAccount(null)}
        />
      ) : null}
    </>
  );
}
