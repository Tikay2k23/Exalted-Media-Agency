import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { clientNoteSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * A dated note against a client.
 *
 * The application had nowhere to put one - LeadNote belongs to the sales side,
 * and Client.notes is the single standing note the Account tab edits. This is
 * the chronological kind: written once, never rewritten, and categorised so the
 * Strategy card can show strategy notes without becoming a second activity feed.
 *
 * Each note also writes an activity entry, so it appears in the timeline
 * alongside everything else that happened to the account rather than being
 * visible only on the tab that created it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientNoteSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "A note needs a couple of words, and under 4000 characters." },
        { status: 400 },
      );
    }

    const note = await prisma.clientNote.create({
      data: {
        clientId: guard.client.id,
        category: parsed.data.category,
        body: parsed.data.body,
        authorId: guard.actor.id,
      },
      include: { author: { select: { name: true } } },
    });

    const preview =
      note.body.length > 120 ? `${note.body.slice(0, 117)}...` : note.body;

    await logActivity({
      actorId: guard.actor.id,
      action:
        parsed.data.category === "STRATEGY"
          ? `Strategy note on ${guard.client.companyName}: ${preview}`
          : `Note on ${guard.client.companyName}: ${preview}`,
      entityType: "CLIENT",
      entityId: guard.client.id,
      metadataJson: { noteId: note.id, category: note.category },
    });

    return NextResponse.json(
      {
        id: note.id,
        body: note.body,
        category: note.category,
        authorName: note.author?.name ?? null,
        createdAt: note.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return serverFailure("api/clients/:id/notes", error);
  }
}

/**
 * Removes a note.
 *
 * Soft, because the activity entry it wrote stays either way - a note that
 * vanishes from one list while its timeline entry remains would read as a
 * discrepancy rather than a deletion. Only the author or somebody who manages
 * clients may remove one.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const noteId = new URL(request.url).searchParams.get("noteId");

    if (!noteId) {
      return NextResponse.json({ error: "Which note?" }, { status: 400 });
    }

    const { count } = await prisma.clientNote.updateMany({
      where: { id: noteId, clientId: guard.client.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (count === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverFailure("api/clients/:id/notes", error);
  }
}
