import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { strategyGoalsSchema } from "@/lib/validators";

export const runtime = "nodejs";

function toDate(value: string | undefined) {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The client's goals, replaced as a list.
 *
 * A whole-list write rather than per-row calls, and safe here for the reason
 * the client-record editor was not: the dialog shows every goal at once, so
 * what it submits is exactly what the person was looking at. Rows missing from
 * the list are the ones they deleted, which is the only way to express a
 * deletion in a single save.
 *
 * Rows are matched by id so a goal keeps its history and its position rather
 * than being deleted and recreated on every edit.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = strategyGoalsSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the goals and try again." },
        { status: 400 },
      );
    }

    const incoming = parsed.data.goals;
    const existing = await prisma.strategyGoal.findMany({
      where: { clientId: guard.client.id },
      select: { id: true },
    });

    const keptIds = new Set(
      incoming.map((goal) => goal.id).filter((value): value is string => Boolean(value)),
    );
    const removed = existing.filter((goal) => !keptIds.has(goal.id));

    await prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.strategyGoal.deleteMany({ where: { id: { in: removed.map((g) => g.id) } } });
      }

      for (const [position, goal] of incoming.entries()) {
        const data = {
          title: goal.title,
          category: goal.category?.trim() || null,
          metric: goal.metric?.trim() || null,
          baseline: goal.baseline?.trim() || null,
          target: goal.target?.trim() || null,
          targetDate: toDate(goal.targetDate),
          priority: goal.priority,
          status: goal.status,
          ownerId: goal.ownerId ?? null,
          notes: goal.notes?.trim() || null,
          position,
        };

        if (goal.id) {
          // Scoped to this client, so an id from another account cannot be
          // steered into this one by editing the request.
          await tx.strategyGoal.updateMany({
            where: { id: goal.id, clientId: guard.client.id },
            data,
          });
        } else {
          await tx.strategyGoal.create({ data: { ...data, clientId: guard.client.id } });
        }
      }
    });

    await logActivity({
      actorId: guard.actor.id,
      action: `Updated the business goals for ${guard.client.companyName}`,
      entityType: "CLIENT",
      entityId: guard.client.id,
      metadataJson: { goals: incoming.length, removed: removed.length },
    });

    return NextResponse.json({ ok: true, goals: incoming.length });
  } catch (error) {
    return serverFailure("api/clients/:id/strategy/goals", error);
  }
}
