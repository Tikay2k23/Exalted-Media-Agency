import { SopStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * The SOP library.
 *
 * The point of keeping procedures in the system rather than in a folder is
 * that an audit has to be judged against the rules that applied at the time,
 * not against whatever the document says today. So versions are immutable:
 * publishing never edits a SopVersion, it writes a new one and supersedes the
 * last. Nothing in this module updates a published version, and there is no
 * endpoint that can.
 *
 * Activation is the owner's call. A procedure everybody must follow, approved
 * by whoever happened to write it, is just an opinion with formatting.
 */

export type SopFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "DUPLICATE"
  | "SELF_APPROVAL";

export interface SopFailure {
  ok: false;
  code: SopFailureCode;
  message: string;
}

function failure(code: SopFailureCode, message: string): SopFailure {
  return { ok: false, code, message };
}

export const SOP_FAILURE_STATUS: Record<SopFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  DUPLICATE: 409,
  SELF_APPROVAL: 409,
};

export const SOP_STATUSES = [
  { value: SopStatus.DRAFT, label: "Draft" },
  { value: SopStatus.IN_REVIEW, label: "Under review" },
  { value: SopStatus.ACTIVE, label: "Active" },
  { value: SopStatus.SUPERSEDED, label: "Superseded" },
  { value: SopStatus.RETIRED, label: "Retired" },
] as const;

/** How long an active SOP may go unreviewed before it is stale. */
export const SOP_REVIEW_INTERVAL_DAYS = 365;

export interface ReviewableSop {
  status: SopStatus;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
}

/**
 * Whether an active SOP is overdue for review.
 *
 * Derived from the date. A procedure nobody has looked at in a year is not
 * necessarily wrong, but nobody can say it is right either, and SOP 10 asks
 * for the review to be tracked rather than assumed.
 */
export function isSopReviewOverdue(sop: ReviewableSop, now = new Date()) {
  if (sop.status !== SopStatus.ACTIVE) {
    return false;
  }

  if (!sop.nextReviewAt) {
    return false;
  }

  return now.getTime() > sop.nextReviewAt.getTime();
}

/**
 * Next version number.
 *
 * Simple major.minor: a content change is a minor bump, so 1.0 becomes 1.1.
 * Kept deliberately dumb - the number is a label for humans, and inventing
 * semantic-version rules for a written procedure helps nobody.
 */
export function nextVersion(current: string) {
  const match = /^(\d+)\.(\d+)$/.exec(current.trim());

  if (!match) {
    return "1.0";
  }

  return `${match[1]}.${Number(match[2]) + 1}`;
}

export interface SaveSopInput {
  actor: AuthContext;
  sopId?: string | null;
  reference: string;
  title: string;
  summary?: string | null;
  content: string;
  changeNote?: string | null;
  ownerId?: string | null;
}

/**
 * Creates an SOP, or publishes a new version of an existing one.
 *
 * Publishing always writes a new immutable SopVersion. An SOP that was active
 * drops back to Draft, because the version somebody approved is not the
 * version now in the box.
 */
export async function saveSop(input: SaveSopInput) {
  const { actor } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage the SOP library.");
  }

  const reference = input.reference.trim();
  const title = input.title.trim();
  const content = input.content.trim();

  if (!reference || !title || !content) {
    return failure("INVALID", "An SOP needs a reference, a title, and its content.");
  }

  const existing = input.sopId
    ? await prisma.sop.findUnique({
        where: { id: input.sopId },
        select: { id: true, reference: true, currentVersion: true, status: true },
      })
    : await prisma.sop.findUnique({
        where: { reference },
        select: { id: true, reference: true, currentVersion: true, status: true },
      });

  if (input.sopId && !existing) {
    return failure("NOT_FOUND", "SOP not found.");
  }

  if (!input.sopId && existing) {
    return failure(
      "DUPLICATE",
      `${reference} already exists. Publish a new version of it rather than creating a second one.`,
    );
  }

  if (existing) {
    const latest = await prisma.sopVersion.findFirst({
      where: { sopId: existing.id },
      orderBy: { publishedAt: "desc" },
      select: { content: true },
    });

    if (latest && latest.content === content) {
      return failure("INVALID", "That content is identical to the current version.");
    }

    const version = nextVersion(existing.currentVersion);

    const [sop] = await prisma.$transaction([
      prisma.sop.update({
        where: { id: existing.id },
        data: {
          title,
          summary: input.summary?.trim() || null,
          currentVersion: version,
          // A new version has not been approved yet, whatever the old one was.
          status: SopStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
          ...(input.ownerId?.trim() ? { ownerId: input.ownerId.trim() } : {}),
        },
      }),
      prisma.sopVersion.create({
        data: {
          sopId: existing.id,
          version,
          content,
          changeNote: input.changeNote?.trim() || null,
          authorId: actor.id,
        },
      }),
    ]);

    await logActivity({
      actorId: actor.id,
      action: `Published version ${version} of ${reference}`,
      entityType: "SYSTEM",
      entityId: sop.id,
      fieldName: "sopVersion",
      previousValue: existing.currentVersion,
      newValue: version,
    });

    return { ok: true as const, sop, version };
  }

  const sop = await prisma.sop.create({
    data: {
      reference,
      title,
      summary: input.summary?.trim() || null,
      currentVersion: "1.0",
      status: SopStatus.DRAFT,
      ownerId: input.ownerId?.trim() || actor.id,
      versions: {
        create: {
          version: "1.0",
          content,
          changeNote: input.changeNote?.trim() || "First version.",
          authorId: actor.id,
        },
      },
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Added ${reference} to the SOP library`,
    entityType: "SYSTEM",
    entityId: sop.id,
  });

  return { ok: true as const, sop, version: "1.0" };
}

/**
 * Activates an SOP.
 *
 * The author of the current version cannot approve it. Same rule as the
 * strategy brief and the client report: a procedure the whole agency has to
 * follow needs somebody other than its writer to have read it.
 */
export async function activateSop(input: {
  actor: AuthContext;
  sopId: string;
  effectiveDate?: Date | null;
}) {
  const { actor, sopId } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to approve SOPs.");
  }

  const sop = await prisma.sop.findUnique({
    where: { id: sopId },
    select: {
      id: true,
      reference: true,
      status: true,
      currentVersion: true,
      versions: {
        orderBy: { publishedAt: "desc" },
        take: 1,
        select: { version: true, authorId: true },
      },
    },
  });

  if (!sop) {
    return failure("NOT_FOUND", "SOP not found.");
  }

  if (sop.status === SopStatus.ACTIVE) {
    return failure("INVALID", "This SOP is already active.");
  }

  const latest = sop.versions[0];

  if (latest?.authorId && latest.authorId === actor.id) {
    return failure(
      "SELF_APPROVAL",
      "You wrote this version, so somebody else has to approve it before it becomes the rule everyone follows.",
    );
  }

  const effectiveDate = input.effectiveDate ?? new Date();
  const nextReviewAt = new Date(
    effectiveDate.getTime() + SOP_REVIEW_INTERVAL_DAYS * 86_400_000,
  );

  const activated = await prisma.sop.update({
    where: { id: sop.id },
    data: {
      status: SopStatus.ACTIVE,
      approvedById: actor.id,
      approvedAt: new Date(),
      effectiveDate,
      lastReviewedAt: new Date(),
      nextReviewAt,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Approved ${sop.reference} version ${sop.currentVersion} as active`,
    entityType: "SYSTEM",
    entityId: sop.id,
    fieldName: "sopStatus",
    previousValue: sop.status,
    newValue: SopStatus.ACTIVE,
  });

  return { ok: true as const, sop: activated };
}

/** Records that an active SOP has been reviewed and is still correct. */
export async function recordSopReview(input: { actor: AuthContext; sopId: string }) {
  const { actor, sopId } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to review SOPs.");
  }

  const sop = await prisma.sop.findUnique({
    where: { id: sopId },
    select: { id: true, reference: true, status: true },
  });

  if (!sop) {
    return failure("NOT_FOUND", "SOP not found.");
  }

  if (sop.status !== SopStatus.ACTIVE) {
    return failure("INVALID", "Only an active SOP can be reviewed.");
  }

  const now = new Date();

  const reviewed = await prisma.sop.update({
    where: { id: sop.id },
    data: {
      lastReviewedAt: now,
      nextReviewAt: new Date(now.getTime() + SOP_REVIEW_INTERVAL_DAYS * 86_400_000),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Reviewed ${sop.reference} and confirmed it is still current`,
    entityType: "SYSTEM",
    entityId: sop.id,
  });

  return { ok: true as const, sop: reviewed };
}
