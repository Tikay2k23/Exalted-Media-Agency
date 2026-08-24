import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { clientInternalNoteSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * The one persistent note pinned to the account.
 *
 * Deliberately not the same thing as Add Note in the header. That writes a
 * dated entry to the activity timeline and is never edited; this is a single
 * standing fact about how to deal with the client - "prefers email, 8 to 5
 * Eastern" - which is rewritten as it changes. Merging them would either turn
 * the timeline into something people edit, or turn the standing note into a
 * thing you have to scroll a history to find.
 *
 * The previous text goes into the activity entry, so the note itself can be
 * overwritten without losing what it used to say.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientInternalNoteSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "That note is too long. Keep it under 2000 characters." },
        { status: 400 },
      );
    }

    const before = await prisma.client.findUniqueOrThrow({
      where: { id: guard.client.id },
      select: { notes: true },
    });

    const notes = parsed.data.notes.trim() || null;

    if (before.notes === notes) {
      return NextResponse.json({ ok: true, changed: false });
    }

    await prisma.client.update({
      where: { id: guard.client.id },
      data: { notes },
    });

    await logActivity({
      actorId: guard.actor.id,
      action: notes
        ? `Updated the internal account note on ${guard.client.companyName}`
        : `Cleared the internal account note on ${guard.client.companyName}`,
      entityType: "CLIENT",
      entityId: guard.client.id,
      // The old text, so overwriting the note never loses what it said.
      metadataJson: { previous: before.notes, updated: notes },
    });

    return NextResponse.json({ ok: true, changed: true });
  } catch (error) {
    return serverFailure("api/clients/:id/internal-note", error);
  }
}
