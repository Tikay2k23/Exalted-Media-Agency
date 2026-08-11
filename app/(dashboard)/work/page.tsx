import type { TeamRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RoleBoard } from "@/components/work/role-board";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthContext } from "@/lib/authz";
import { getMyWork, getRoleBoard } from "@/lib/data/work-queries";
import { can, teamRoleLabels } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatDate, formatEnumLabel } from "@/lib/utils";
import { SERVICE_BLUEPRINTS } from "@/lib/workflow/service-blueprints";
import { columnsForRole } from "@/lib/workflow/workstream-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BOARD_ROLES: TeamRole[] = [
  "PROJECT_MANAGER",
  "AUTOMATION_SPECIALIST",
  "CREATIVE_SPECIALIST",
  "ADS_SPECIALIST",
  "SALES_REP",
];

/**
 * My Work.
 *
 * Opens on the signed-in person's own seat, because the first question anybody
 * has is "what am I doing today", not "how is the agency". Someone who can
 * manage projects can switch to another seat to rebalance it; everybody else
 * sees only their own, which is all they can act on anyway.
 */
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    notFound();
  }

  const params = await searchParams;
  const canSeeOtherSeats = can(actor, "workItems.view.all");
  const requested = typeof params.seat === "string" ? (params.seat as TeamRole) : null;

  const seat =
    requested && canSeeOtherSeats && BOARD_ROLES.includes(requested)
      ? requested
      : actor.teamRole;

  // A specialist sees their own cards. Anyone rebalancing a seat sees all of it.
  const scopeToSelf = !canSeeOtherSeats;

  const [board, mine] = await Promise.all([
    getRoleBoard(seat, scopeToSelf ? actor.id : null),
    getMyWork(actor.id),
  ]);

  const attention = [...mine.overdue, ...mine.blocked];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.32em] text-sky-600">My work</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          {teamRoleLabels[seat]}
        </h1>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          Everything on your plate, and where each account sits in your own part of the
          process.
        </p>
      </div>

      {/* What needs a decision today, before the board. */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Needs attention", value: attention.length, tone: "rose" as const },
          { label: "Due in 3 days", value: mine.dueSoon.length, tone: "amber" as const },
          {
            label: "Waiting on clients",
            value: mine.waitingOnClient.length,
            tone: "slate" as const,
          },
          { label: "Accounts on my board", value: mine.workstreams.length, tone: "sky" as const },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                {tile.label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-950">{tile.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {attention.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>Overdue or blocked. Everything else can wait.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.slice(0, 8).map((task) => (
              <div
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{task.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {task.client ? (
                      <Link
                        href={`/clients/${task.client.id}`}
                        className="underline underline-offset-2"
                      >
                        {task.client.companyName}
                      </Link>
                    ) : (
                      "Internal"
                    )}
                    {" · due "}
                    {formatDate(task.dueDate)}
                  </p>
                </div>
                <Badge tone={task.status === "BLOCKED" ? "rose" : "amber"}>
                  {formatEnumLabel(task.status)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{teamRoleLabels[seat]} board</CardTitle>
            <CardDescription>
              {scopeToSelf
                ? "Your accounts, at the stage your part of the work has reached."
                : "Every account this seat is working on. Moving a card can advance the account."}
            </CardDescription>
          </div>

          {canSeeOtherSeats ? (
            <nav className="flex flex-wrap gap-1.5">
              {BOARD_ROLES.map((role) => (
                <Link
                  key={role}
                  href={`/work?seat=${role}`}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                    role === seat
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {teamRoleLabels[role]}
                </Link>
              ))}
            </nav>
          ) : null}
        </CardHeader>
        <CardContent>
          <RoleBoard
            canAssign={can(actor, "workItems.assign")}
            columns={columnsForRole(seat)}
            seatHolders={board.seatHolders}
            cards={board.workstreams.map((stream) => ({
              id: stream.id,
              stage: stream.stage,
              blockedReason: stream.blockedReason,
              ownerId: stream.ownerId,
              ownerName: stream.owner?.name ?? null,
              clientId: stream.client.id,
              companyName: stream.client.companyName,
              serviceLabel:
                SERVICE_BLUEPRINTS[stream.client.serviceType]?.label
                ?? formatEnumLabel(stream.client.serviceType),
              journeyStage: stream.client.currentStage.name,
              health: stream.client.healthStatus,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
