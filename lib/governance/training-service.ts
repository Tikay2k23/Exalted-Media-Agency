import { CertificationLevel, TrainingStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Team training and certification.
 *
 * SOP 40 asks that somebody whose certification has expired should not be able
 * to do restricted high-risk work. That rule is implemented as a ratchet, the
 * same way the stage gates were: it only bites once the agency has actually
 * started certifying people.
 *
 * Concretely - if a person has no certification record at all, nothing is
 * blocked, because the agency has not adopted certification for them yet and
 * silently freezing the work of six people on an empty table would be a bug,
 * not a control. If a person HAS a certification and it has lapsed, the
 * restricted work is refused until it is renewed. Adding the first record is
 * what arms it.
 */

export type TrainingFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "SELF_CERTIFICATION";

export interface TrainingFailure {
  ok: false;
  code: TrainingFailureCode;
  message: string;
}

function failure(code: TrainingFailureCode, message: string): TrainingFailure {
  return { ok: false, code, message };
}

export const TRAINING_FAILURE_STATUS: Record<TrainingFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  SELF_CERTIFICATION: 409,
};

export const CERTIFICATION_LEVELS = [
  { value: CertificationLevel.OBSERVER, label: "Observer" },
  { value: CertificationLevel.TRAINEE, label: "Trainee" },
  { value: CertificationLevel.SUPERVISED_OPERATOR, label: "Supervised operator" },
  { value: CertificationLevel.CERTIFIED_OPERATOR, label: "Certified operator" },
  { value: CertificationLevel.SENIOR_REVIEWER, label: "Senior reviewer" },
  { value: CertificationLevel.PROCESS_OWNER, label: "Process owner" },
] as const;

/** How far ahead an expiry is worth warning about. */
export const CERTIFICATION_WARNING_DAYS = 30;

export interface CertifiableRecord {
  certificationAwarded: CertificationLevel | null;
  certificationExpiresAt: Date | null;
  status: TrainingStatus;
}

export type CertificationState = "none" | "current" | "expiring" | "expired";

/**
 * The certification position for one person, from their training records.
 *
 * "none" is deliberately distinct from "expired". The first means nobody has
 * been certified yet and nothing should be blocked; the second means somebody
 * was certified and is not any more, which is a different fact entirely.
 */
export function certificationState(
  records: CertifiableRecord[],
  now = new Date(),
): CertificationState {
  const certified = records.filter(
    (record) =>
      record.certificationAwarded !== null && record.status !== TrainingStatus.WAIVED,
  );

  if (certified.length === 0) {
    return "none";
  }

  // A record with no expiry does not lapse.
  const live = certified.filter(
    (record) =>
      record.certificationExpiresAt === null
      || record.certificationExpiresAt.getTime() > now.getTime(),
  );

  if (live.length === 0) {
    return "expired";
  }

  const soon = live.some(
    (record) =>
      record.certificationExpiresAt !== null
      && record.certificationExpiresAt.getTime()
        <= now.getTime() + CERTIFICATION_WARNING_DAYS * 86_400_000,
  );

  return soon ? "expiring" : "current";
}

/**
 * Whether restricted high-risk work should be refused.
 *
 * Only an outright lapse blocks. "None" does not, for the reason at the top of
 * this file, and "expiring" is a warning rather than a wall - locking somebody
 * out a month early would just teach people to work around it.
 */
export function certificationBlocksRestrictedWork(state: CertificationState) {
  return state === "expired";
}

/** Loads one person's certification position. */
export async function loadCertificationState(userId: string) {
  const records = await prisma.trainingRecord.findMany({
    where: { userId },
    select: {
      certificationAwarded: true,
      certificationExpiresAt: true,
      status: true,
    },
  });

  return certificationState(records);
}

export interface SaveTrainingInput {
  actor: AuthContext;
  recordId?: string | null;
  userId: string;
  courseName: string;
  sopReference?: string | null;
  status?: TrainingStatus;
  dueDate?: Date | null;
  assessmentScore?: number | null;
  certificationAwarded?: CertificationLevel | null;
  certificationExpiresAt?: Date | null;
  notes?: string | null;
}

/**
 * Assigns or updates a training record.
 *
 * Awarding somebody a certification is not something they can do for
 * themselves. Everything else about their own record - marking a course
 * started, adding notes - they can.
 */
export async function saveTrainingRecord(input: SaveTrainingInput) {
  const { actor, userId } = input;

  const isSelf = userId === actor.id;

  if (!can(actor, "team.training") && !isSelf) {
    return failure("FORBIDDEN", "You do not have permission to manage training records.");
  }

  const courseName = input.courseName.trim();

  if (!courseName) {
    return failure("INVALID", "A training record needs a course name.");
  }

  if (
    input.assessmentScore !== null
    && input.assessmentScore !== undefined
    && (input.assessmentScore < 0 || input.assessmentScore > 100)
  ) {
    return failure("INVALID", "The assessment score must be between 0 and 100.");
  }

  if (input.certificationAwarded && isSelf) {
    return failure(
      "SELF_CERTIFICATION",
      "You cannot award yourself a certification. Somebody with training oversight has to sign it off.",
    );
  }

  const subject = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!subject) {
    return failure("NOT_FOUND", "That team member could not be found.");
  }

  const status = input.status ?? TrainingStatus.ASSIGNED;

  const data = {
    courseName,
    sopReference: input.sopReference?.trim() || null,
    status,
    dueDate: input.dueDate ?? null,
    assessmentScore: input.assessmentScore ?? null,
    certificationAwarded: input.certificationAwarded ?? null,
    certificationExpiresAt: input.certificationExpiresAt ?? null,
    notes: input.notes?.trim() || null,
    trainerId: input.certificationAwarded ? actor.id : null,
    ...(status === TrainingStatus.COMPLETED ? { completedDate: new Date() } : {}),
  };

  if (input.recordId) {
    const existing = await prisma.trainingRecord.findFirst({
      where: { id: input.recordId, userId: subject.id },
      select: { id: true, certificationAwarded: true, trainerId: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Training record not found.");
    }

    const record = await prisma.trainingRecord.update({
      where: { id: existing.id },
      data: {
        ...data,
        // Do not wipe the original trainer when the record is edited without
        // touching the certification.
        trainerId: input.certificationAwarded ? actor.id : existing.trainerId,
        certificationAwarded:
          input.certificationAwarded ?? existing.certificationAwarded,
      },
    });

    await logActivity({
      actorId: actor.id,
      action: `Updated ${subject.name}'s training record for ${courseName}`,
      entityType: "TRAINING",
      entityId: record.id,
    });

    return { ok: true as const, record };
  }

  const record = await prisma.trainingRecord.create({
    data: { ...data, userId: subject.id },
  });

  await logActivity({
    actorId: actor.id,
    action: input.certificationAwarded
      ? `Certified ${subject.name} as ${input.certificationAwarded.toLowerCase().replaceAll("_", " ")} for ${courseName}`
      : `Assigned ${courseName} to ${subject.name}`,
    entityType: "TRAINING",
    entityId: record.id,
  });

  if (!isSelf) {
    await createNotifications(
      resolveRecipients([subject.id], actor.id).map((recipientId) => ({
        recipientId,
        type: "CERTIFICATION_EXPIRING" as const,
        urgency: "NORMAL" as const,
        title: input.certificationAwarded
          ? `You have been certified: ${courseName}`
          : `Training assigned: ${courseName}`,
        body: input.sopReference ? `Covers ${input.sopReference}.` : "",
        entityType: "TRAINING" as const,
        entityId: record.id,
        href: "/governance",
      })),
    );
  }

  return { ok: true as const, record };
}
