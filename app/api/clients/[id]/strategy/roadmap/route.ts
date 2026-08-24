import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ROADMAP_PHASES, phaseBlockers } from "@/lib/strategy/strategy-sections";
import { strategyRoadmapSchema } from "@/lib/validators";

export const runtime = "nodejs";

function toDate(value: string | undefined) {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Intake states that mean the client has actually finished and sent it back. */
const INTAKE_SUBMITTED = ["SUBMITTED", "REVIEWED"];

/**
 * One phase of the strategy roadmap.
 *
 * A phase cannot be marked complete while its requirements are unmet. That is
 * the whole point of drawing the strip: a roadmap where anybody can tick the
 * last box is a picture, not a plan.
 *
 * Somebody entitled to override may still do it, and must say why. The reason
 * goes into the activity entry with their name on it, because completing a
 * phase whose requirements are unmet is a decision and a decision nobody owns
 * is how a roadmap stops meaning anything.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = strategyRoadmapSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Check the phase details." }, { status: 400 });
    }

    const { key, status, ownerId, startDate, targetDate, notes, overrideReason } = parsed.data;
    const phase = ROADMAP_PHASES.find((candidate) => candidate.key === key);

    if (!phase) {
      return NextResponse.json({ error: "Unknown roadmap phase." }, { status: 400 });
    }

    const [client, sections, intake, before] = await Promise.all([
      prisma.client.findUniqueOrThrow({
        where: { id: guard.client.id },
        select: { serviceType: true, projects: { select: { serviceType: true } } },
      }),
      prisma.strategySection.findMany({
        where: { clientId: guard.client.id },
        select: { key: true, status: true },
      }),
      prisma.intakeForm.findUnique({
        where: { clientId: guard.client.id },
        select: { status: true },
      }),
      prisma.strategyRoadmapPhase.findUnique({
        where: { clientId_key: { clientId: guard.client.id, key } },
        select: { status: true },
      }),
    ]);

    // Every service the account actually has, not only the headline one.
    const services = [
      client.serviceType,
      ...client.projects.map((project) => project.serviceType),
    ];

    const blockers =
      status === "COMPLETE"
        ? phaseBlockers(
            phase,
            sections,
            services,
            intake !== null && INTAKE_SUBMITTED.includes(intake.status),
          )
        : [];

    if (blockers.length > 0) {
      const mayOverride = can(guard.actor, "journey.override");

      if (!mayOverride) {
        return NextResponse.json(
          { error: `${phase.label} is not ready yet.`, blockers },
          { status: 409 },
        );
      }

      if (!overrideReason?.trim()) {
        return NextResponse.json(
          {
            error: "Give a reason for completing this phase with requirements outstanding.",
            blockers,
            needsReason: true,
          },
          { status: 409 },
        );
      }
    }

    const completing = status === "COMPLETE";

    await prisma.strategyRoadmapPhase.upsert({
      where: { clientId_key: { clientId: guard.client.id, key } },
      create: {
        clientId: guard.client.id,
        key,
        status,
        ownerId: ownerId ?? null,
        startDate: toDate(startDate),
        targetDate: toDate(targetDate),
        notes: notes?.trim() || null,
        ...(completing ? { completedAt: new Date() } : {}),
      },
      update: {
        status,
        ownerId: ownerId ?? null,
        startDate: toDate(startDate),
        targetDate: toDate(targetDate),
        notes: notes?.trim() || null,
        // Cleared when a phase is reopened, so a completion date never
        // outlives the completion it refers to.
        completedAt: completing ? new Date() : null,
      },
    });

    if (before?.status !== status) {
      await logActivity({
        actorId: guard.actor.id,
        action: blockers.length
          ? `Completed ${phase.label} for ${guard.client.companyName} with requirements outstanding: ${overrideReason!.trim()}`
          : `${phase.label} on ${guard.client.companyName} is now ${status.replaceAll("_", " ").toLowerCase()}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: {
          phase: key,
          from: before?.status ?? "PENDING",
          to: status,
          ...(blockers.length ? { override: overrideReason, blockers } : {}),
        },
      });
    }

    return NextResponse.json({ ok: true, overridden: blockers.length > 0 });
  } catch (error) {
    return serverFailure("api/clients/:id/strategy/roadmap", error);
  }
}
