import { NextResponse } from "next/server";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { leadVisibilityWhere } from "@/lib/sales/lead-service";

export const runtime = "nodejs";

const noteSchema = z.object({ body: z.string().trim().min(1).max(4000) });

/** The lead, if this person is allowed to see it at all. */
async function visibleLead(userId: string, leadId: string) {
  const actor = await loadAuthContext(userId);

  if (!actor) return { actor: null, lead: null };

  const scope = leadVisibilityWhere(actor);

  if (!scope) return { actor, lead: null };

  const lead = await prisma.lead.findFirst({
    where: { ...scope, id: leadId, deletedAt: null },
    select: { id: true, businessName: true, assignedToId: true },
  });

  return { actor, lead };
}

/**
 * Everything the drawer's tabs need, in one request.
 *
 * The timeline, the notes and the follow-up history are three tabs of one
 * panel, so they arrive together - three round trips would only buy three
 * spinners on something somebody opens as a single thing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { actor, lead } = await visibleLead(session.user.id, id);

  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Not found rather than forbidden: confirming a lead exists on somebody
  // else's book is itself a leak.
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [activity, notes, calls] = await Promise.all([
    prisma.activityLog.findMany({
      where: { entityType: "LEAD", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
      },
    }),
    prisma.leadNote.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, teamRole: true } },
      },
    }),
    /*
     * Call logs are the follow-up history the system actually has. Contact by
     * other channels is recorded on the timeline instead, so the tab says where
     * each kind lives rather than pretending to one complete record.
     */
    prisma.leadCallLog.findMany({
      where: { leadId: id },
      orderBy: { occurredAt: "desc" },
      take: 40,
      select: {
        id: true,
        outcome: true,
        notes: true,
        durationMinutes: true,
        occurredAt: true,
        loggedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt.toISOString(),
      actorName: row.actor?.name ?? null,
    })),
    notes: notes.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      authorName: row.author.name,
      authorRole: row.author.teamRole,
    })),
    calls: calls.map((row) => ({
      id: row.id,
      outcome: row.outcome,
      notes: row.notes,
      durationMinutes: row.durationMinutes,
      occurredAt: row.occurredAt.toISOString(),
      loggedByName: row.loggedBy?.name ?? null,
    })),
  });
}

/** Adding an internal note. Anybody who can see the lead can write one. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { actor, lead } = await visibleLead(session.user.id, id);

  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const parsed = noteSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "A note needs something in it." }, { status: 400 });
  }

  const note = await prisma.leadNote.create({
    data: { leadId: id, authorId: actor.id, body: parsed.data.body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true, teamRole: true } },
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Added a note on ${lead.businessName}`,
    entityType: "LEAD",
    entityId: id,
  });

  return NextResponse.json(
    {
      ok: true,
      note: {
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        authorName: note.author.name,
        authorRole: note.author.teamRole,
      },
    },
    { status: 201 },
  );
}
