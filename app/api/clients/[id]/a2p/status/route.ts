import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { a2pStatusSchema } from "@/lib/a2p/a2p-validators";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** States that describe what a provider is doing rather than what we have. */
const PROVIDER_OWNED = [
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "NEEDS_RESUBMISSION",
];

/**
 * Where a registration has got to.
 *
 * Two rules.
 *
 * Moving a profile into a state a provider owns needs a submission record to go
 * with it. "Submitted" with nothing recorded is a claim nobody can check a
 * month later when somebody asks which campaign id it went out under - and the
 * rejection reason on the previous attempt is the most useful thing on the page
 * when preparing a resubmission.
 *
 * And those states need a2p.submit rather than clients.edit. A project
 * manager holds clients.edit and clients.delete, so neither of those separates
 * "may prepare the information" from "may say what a carrier decided" - and
 * telling the agency a registration is approved when it is not is the kind of
 * wrong that gets found out by a carrier rather than by us.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = a2pStatusSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Unknown registration status." }, { status: 400 });
    }

    const { status, note, submission } = parsed.data;
    const external = PROVIDER_OWNED.includes(status);

    if (external && !can(guard.actor, "a2p.submit")) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to record a provider decision on this registration.",
        },
        { status: 403 },
      );
    }

    if (status === "SUBMITTED" && !submission) {
      return NextResponse.json(
        {
          error:
            "Recording a submission needs the provider it went to, so it can be traced later.",
          needsSubmission: true,
        },
        { status: 400 },
      );
    }

    const before = await prisma.a2PProfile.findUnique({
      where: { clientId: guard.client.id },
      select: { id: true, status: true },
    });

    const profile = await prisma.a2PProfile.upsert({
      where: { clientId: guard.client.id },
      create: {
        clientId: guard.client.id,
        status,
        internalNotes: note?.trim() || null,
        ...(status === "UNDER_INTERNAL_REVIEW"
          ? { reviewedById: guard.actor.id, reviewedAt: new Date() }
          : {}),
      },
      update: {
        status,
        ...(note?.trim() ? { internalNotes: note.trim() } : {}),
        ...(status === "UNDER_INTERNAL_REVIEW"
          ? { reviewedById: guard.actor.id, reviewedAt: new Date() }
          : {}),
      },
      select: { id: true, status: true },
    });

    if (submission) {
      await prisma.a2PSubmission.create({
        data: {
          profileId: profile.id,
          provider: submission.provider,
          brandId: submission.brandId?.trim() || null,
          campaignId: submission.campaignId?.trim() || null,
          providerStatus: submission.providerStatus?.trim() || null,
          response: submission.response?.trim() || null,
          rejectedReason: submission.rejectedReason?.trim() || null,
          submittedById: guard.actor.id,
          // A decision is dated when it came back; a submission is not a
          // decision, so this stays null until one does.
          decidedAt: status === "SUBMITTED" ? null : new Date(),
        },
      });
    }

    if (before?.status !== status) {
      await logActivity({
        actorId: guard.actor.id,
        action: `A2P registration for ${guard.client.companyName} is now ${status
          .replaceAll("_", " ")
          .toLowerCase()}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: {
          from: before?.status ?? "INFORMATION_NEEDED",
          to: status,
          ...(submission ? { provider: submission.provider } : {}),
        },
      });
    }

    return NextResponse.json({ ok: true, status: profile.status });
  } catch (error) {
    return serverFailure("api/clients/:id/a2p/status", error);
  }
}
