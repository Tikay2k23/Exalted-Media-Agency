import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { a2pProfileSchema, a2pSamplesSchema } from "@/lib/a2p/a2p-validators";
import { a2pReadiness } from "@/lib/a2p/a2p-readiness";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * The A2P registration profile.
 *
 * A partial patch: only the fields that arrive are written, so the form for one
 * section cannot blank another. Everything else on the profile is left exactly
 * as it was, which is the read-modify-write shape rather than the whole-record
 * submit that used to revert a moved stage on the client record.
 *
 * Readiness comes back with the response so the caller can show the new figure
 * without a second round trip, and it is recalculated here rather than trusted
 * from the client - a percentage the browser asserts is not a measurement.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const payload = await request.json();
    const parsed = a2pProfileSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the details and try again." },
        { status: 400 },
      );
    }

    const { authorisationConfirmed, ...fields } = parsed.data;

    /*
     * Only what actually arrived. An absent key means "leave it alone"; an
     * empty string means "clear it", which is a different instruction.
     */
    const data: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;

      data[key] = typeof value === "string" && value.trim() === "" ? null : value;
    }

    if (authorisationConfirmed !== undefined) {
      // Stamped here rather than taken from the request: a confirmation is
      // when somebody said it, not when a form claims they did.
      data.authorisationConfirmedAt = authorisationConfirmed ? new Date() : null;
    }

    const profile = await prisma.a2PProfile.upsert({
      where: { clientId: guard.client.id },
      create: { clientId: guard.client.id, ...data },
      update: data,
      include: { samples: { orderBy: { position: "asc" } } },
    });

    const documents = await prisma.assetRecord.findMany({
      where: {
        clientId: guard.client.id,
        status: { in: ["RECEIVED", "APPROVED"] },
      },
      select: { type: true },
    });

    const readiness = a2pReadiness({
      ...profile,
      samples: profile.samples.map((sample) => ({
        category: sample.category,
        body: sample.body,
      })),
      documents: documents.map((document) => document.type),
    });

    const touched = Object.keys(data);

    if (touched.length > 0) {
      await logActivity({
        actorId: guard.actor.id,
        action: `Updated the A2P registration information for ${guard.client.companyName}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { fields: touched, readiness: readiness.percent },
      });
    }

    return NextResponse.json({ ok: true, readiness });
  } catch (error) {
    return serverFailure("api/clients/:id/a2p", error);
  }
}

/**
 * The sample messages, replaced as a list.
 *
 * PUT rather than PATCH because it is a replacement: the editor shows every
 * message, and one missing from the payload is one somebody deleted.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = a2pSamplesSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the messages and try again." },
        { status: 400 },
      );
    }

    const profile = await prisma.a2PProfile.upsert({
      where: { clientId: guard.client.id },
      create: { clientId: guard.client.id },
      update: {},
      select: { id: true },
    });

    const incoming = parsed.data.samples;
    const existing = await prisma.a2PSampleMessage.findMany({
      where: { profileId: profile.id },
      select: { id: true },
    });
    const kept = new Set(
      incoming.map((sample) => sample.id).filter((value): value is string => Boolean(value)),
    );

    await prisma.$transaction(async (tx) => {
      const removed = existing.filter((sample) => !kept.has(sample.id));

      if (removed.length > 0) {
        await tx.a2PSampleMessage.deleteMany({
          where: { id: { in: removed.map((sample) => sample.id) } },
        });
      }

      for (const [position, sample] of incoming.entries()) {
        const data = {
          category: sample.category,
          body: sample.body,
          reviewNote: sample.reviewNote?.trim() || null,
          position,
        };

        if (sample.id) {
          // Scoped to this profile, so an id from another client's profile
          // cannot be steered into this one.
          await tx.a2PSampleMessage.updateMany({
            where: { id: sample.id, profileId: profile.id },
            data,
          });
        } else {
          await tx.a2PSampleMessage.create({ data: { ...data, profileId: profile.id } });
        }
      }
    });

    await logActivity({
      actorId: guard.actor.id,
      action: `Updated the A2P sample messages for ${guard.client.companyName}`,
      entityType: "CLIENT",
      entityId: guard.client.id,
      metadataJson: { samples: incoming.length },
    });

    return NextResponse.json({ ok: true, samples: incoming.length });
  } catch (error) {
    return serverFailure("api/clients/:id/a2p", error);
  }
}
