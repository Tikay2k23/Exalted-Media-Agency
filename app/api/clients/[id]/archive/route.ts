import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  ARCHIVE_FAILURE_STATUS,
  archiveClient,
  unarchiveClient,
} from "@/lib/success/archive-service";

export const runtime = "nodejs";

/** Files a closed engagement away. Never deletes anything. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await archiveClient({ actor, clientId: id });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: ARCHIVE_FAILURE_STATUS[result.code] },
      );
    }

    /* Idempotent: archiving twice is a success, and says which it was. */
    return NextResponse.json({ ok: true, alreadyArchived: result.alreadyArchived });
  } catch (error) {
    console.error("[api/clients/:id/archive] Failed to archive.", error);
    return NextResponse.json({ error: "Unable to archive right now." }, { status: 500 });
  }
}

/** Brings one back, because filing something by mistake should be undoable. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await unarchiveClient({ actor, clientId: id });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: ARCHIVE_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, alreadyActive: result.alreadyActive });
  } catch (error) {
    console.error("[api/clients/:id/archive] Failed to restore.", error);
    return NextResponse.json({ error: "Unable to restore right now." }, { status: 500 });
  }
}
