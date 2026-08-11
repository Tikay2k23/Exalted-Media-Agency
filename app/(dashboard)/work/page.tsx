import type { TeamRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssignedTasks } from "@/components/work/assigned-tasks";
import type { TaskRow } from "@/components/work/task-types";
import { RoleBoard } from "@/components/work/role-board";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthContext } from "@/lib/authz";
import { getRoleBoard } from "@/lib/data/work-queries";
import { can, teamRoleLabels } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getAssignedTasks } from "@/lib/tasks/task-queries";
import { formatEnumLabel } from "@/lib/utils";
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

  const [board, work] = await Promise.all([
    getRoleBoard(seat, scopeToSelf ? actor.id : null),
    getAssignedTasks(actor),
  ]);

  /*
   * Dates become strings on the way to the browser, and the client component
   * expects them that way. Serialising here rather than trusting Next to do
   * something sensible with a Date keeps the contract explicit - and this is
   * the same narrowing that stops a Prisma Decimal reaching a client component,
   * which has broken this app before.
   */
  const tasks: TaskRow[] = work.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    category: task.category,
    platform: task.platform,
    recurrence: task.recurrence,
    dueDate: task.dueDate.toISOString(),
    startDate: task.startDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    submittedAt: task.submittedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    approvedAt: task.approvedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours,
    requiresApproval: task.requiresApproval,
    objective: task.objective,
    completionCriteria: task.completionCriteria,
    note: task.note,
    kpi: task.kpi,
    blocker: task.blocker,
    requiredAssets: task.requiredAssets,
    revisionNote: task.revisionNote,
    evidenceUrl: task.evidenceUrl,
    client: task.client,
    project: task.project,
    assignedTo: task.assignedTo,
    createdBy: task.createdBy,
    reviewer: task.reviewer,
    approvedBy: task.approvedBy,
    commentCount: task._count.comments,
  }));

  // What the interface may offer. Every one of these is checked again in the
  // service before anything is written; this only decides what gets drawn.
  const viewer = {
    id: actor.id,
    canEdit: can(actor, "workItems.edit"),
    canReviewAny: can(actor, "workItems.review"),
    canArchive: can(actor, "workItems.archive"),
    canDelete: can(actor, "workItems.delete"),
    canAssign: can(actor, "workItems.assign"),
  };

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

      {/* Everything assigned to this person, before the board of accounts. */}
      <AssignedTasks
        tasks={tasks}
        clients={work.clients}
        viewer={viewer}
        capped={work.capped}
        serverNow={new Date().toISOString()}
      />

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
