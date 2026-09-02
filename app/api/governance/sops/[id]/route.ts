import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  SOP_FAILURE_STATUS,
  activateSop,
  recordSopReview,
} from "@/lib/governance/sop-service";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sopActionSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * One SOP, with the text of its current version.
 *
 * Content is fetched here rather than sent with the governance page: ten
 * procedures of prose on every load, for a panel most visits never open, is
 * weight nobody asked for.
 *
 * Readable by anyone who can open governance. Reading a procedure you are held
 * to is not a privilege - the specialist seats carry governance.view for
 * exactly this reason.
 */
export async function GET(
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

    if (!actor || !can(actor, "governance.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sop = await prisma.sop.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        title: true,
        summary: true,
        status: true,
        currentVersion: true,
        owner: { select: { name: true } },
        approvedBy: { select: { name: true } },
        versions: {
          orderBy: { publishedAt: "desc" },
          take: 1,
          select: {
            version: true,
            content: true,
            changeNote: true,
            publishedAt: true,
            author: { select: { name: true } },
          },
        },
      },
    });

    if (!sop) {
      return NextResponse.json({ error: "SOP not found." }, { status: 404 });
    }

    const latest = sop.versions[0];

    return NextResponse.json({
      id: sop.id,
      reference: sop.reference,
      title: sop.title,
      summary: sop.summary,
      status: sop.status,
      currentVersion: sop.currentVersion,
      ownerName: sop.owner?.name ?? null,
      approvedByName: sop.approvedBy?.name ?? null,
      content: latest?.content ?? "",
      changeNote: latest?.changeNote ?? null,
      publishedAt: latest?.publishedAt?.toISOString() ?? null,
      authorName: latest?.author?.name ?? null,
    });
  } catch (error) {
    console.error("[api/governance/sops/:id] Failed to load SOP.", error);
    return NextResponse.json({ error: "Unable to load that SOP right now." }, { status: 500 });
  }
}

/**
 * Activates an SOP, or records that it has been reviewed.
 *
 * Separate from the write endpoint: activation is what makes a document the
 * rule everybody follows, and it is refused for the author of the version.
 */
export async function POST(
  request: Request,
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

    const parsed = sopActionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result =
      parsed.data.action === "activate"
        ? await activateSop({ actor, sopId: id })
        : await recordSopReview({ actor, sopId: id });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: SOP_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, status: result.sop.status });
  } catch (error) {
    console.error("[api/governance/sops/:id] Failed to update SOP.", error);
    return NextResponse.json({ error: "Unable to update the SOP right now." }, { status: 500 });
  }
}
