import { randomBytes } from "node:crypto";

import { IntakeStatus } from "@prisma/client";
import { addDays } from "date-fns";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import {
  deriveIntakeProgress,
  questionsForService,
} from "@/lib/intake/question-catalogue";
import { applyIntakeToA2P } from "@/lib/a2p/intake-mapping";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { archivedBlock } from "@/lib/success/archive-service";
import { checkForCredential } from "@/lib/security/credential-guard";

/**
 * The client intake form.
 *
 * The only part of this system a person outside the agency ever touches, which
 * changes what matters. Three things carry the weight:
 *
 * - The link is the whole authentication. It is 32 random bytes, it expires,
 *   and it is replaced every time the form is re-sent, so a link forwarded to
 *   the wrong person stops working the moment somebody resends it.
 * - The public route never reveals anything the client did not already give us.
 *   A wrong token is not found - never "that client exists but this link is
 *   stale", which would confirm the client to whoever guessed.
 * - Nothing here accepts a password. Every answer is screened by the same
 *   credential guard the access tracker uses, because the surest way to end up
 *   storing plain-text credentials is to let a well-meaning client paste one
 *   into a text box.
 */

export type IntakeFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "EXPIRED"
  | "ALREADY_SUBMITTED"
  | "NOT_SUBMITTED"
  | "CREDENTIAL_SUBMITTED";

export interface IntakeFailure {
  ok: false;
  code: IntakeFailureCode;
  message: string;
  fields?: string[];
}

function failure(
  code: IntakeFailureCode,
  message: string,
  fields?: string[],
): IntakeFailure {
  return { ok: false, code, message, fields };
}

export const INTAKE_FAILURE_STATUS: Record<IntakeFailureCode, number> = {
  FORBIDDEN: 403,
  // Deliberately the same as a bad token: existence is not confirmed.
  NOT_FOUND: 404,
  INVALID: 400,
  EXPIRED: 410,
  ALREADY_SUBMITTED: 409,
  // Also a state conflict: there is nothing there to reopen.
  NOT_SUBMITTED: 409,
  CREDENTIAL_SUBMITTED: 422,
};

/** How long a link stays usable. Long enough to be useful, short enough to matter. */
export const INTAKE_LINK_DAYS = 30;

function newToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Creates or re-sends the intake form.
 *
 * Re-sending rotates the token on purpose: the usual reason to resend is that
 * the first link went astray, and leaving it working would defeat the point.
 */
export async function sendIntakeForm(input: { actor: AuthContext; clientId: string }) {
  /* Onboarding an account that has already been closed down. */
  const archivedReason = await archivedBlock(input.clientId);

  if (archivedReason) {
    return { ok: false as const, code: "INVALID" as const, message: archivedReason };
  }

  const { actor, clientId } = input;

  if (!can(actor, "clients.edit")) {
    return failure("FORBIDDEN", "You do not have permission to send the intake form.");
  }

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, contactEmail: true, assignedUserId: true },
  });

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const existing = await prisma.intakeForm.findUnique({
    where: { clientId: client.id },
    select: { id: true, status: true, submittedAt: true },
  });

  if (existing?.submittedAt) {
    return failure(
      "ALREADY_SUBMITTED",
      "This client has already submitted their intake. Review it rather than sending a new one.",
    );
  }

  const token = newToken();
  const expiresAt = addDays(new Date(), INTAKE_LINK_DAYS);
  const now = new Date();

  const form = existing
    ? await prisma.intakeForm.update({
        where: { id: existing.id },
        data: {
          token,
          expiresAt,
          status: IntakeStatus.SENT,
          sentAt: now,
          sentById: actor.id,
          // A resent link has not been opened yet, whatever the old one was.
          viewedAt: null,
        },
      })
    : await prisma.intakeForm.create({
        data: {
          clientId: client.id,
          token,
          expiresAt,
          status: IntakeStatus.SENT,
          sentAt: now,
          sentById: actor.id,
        },
      });

  await logActivity({
    actorId: actor.id,
    action: existing
      ? `Re-sent the intake form to ${client.companyName}`
      : `Sent the intake form to ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { intakeFormId: form.id, expiresAt: expiresAt.toISOString() },
  });

  return { ok: true as const, form };
}

/**
 * Opens a submitted intake back up, because the questions moved on.
 *
 * A submitted form is closed on purpose: it is the record of what a client
 * told us, and letting it drift afterwards would make it worthless. But the
 * catalogue grows - a question added today leaves every client who answered
 * last month permanently short of it, with no way to ask them short of
 * retyping their answers on their behalf.
 *
 * So the record and the working document are separated. Each submission is
 * kept as its own version, and reopening hands the client back the form they
 * already filled in, with whatever is new on the end. What they sent before is
 * not touched by anything they do now.
 *
 * They can change earlier answers, which is deliberate. A business that has
 * moved since they filled this in should be able to say so, and the previous
 * version still records what was true when they sent it.
 */
export async function reopenIntakeForm(input: { actor: AuthContext; clientId: string }) {
  const { actor, clientId } = input;

  if (!can(actor, "clients.edit")) {
    return failure("FORBIDDEN", "You do not have permission to reopen the intake form.");
  }

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true },
  });

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const existing = await prisma.intakeForm.findUnique({
    where: { clientId: client.id },
    select: { id: true, submittedAt: true },
  });

  if (!existing?.submittedAt) {
    return failure(
      "NOT_SUBMITTED",
      "There is nothing to reopen - this client has not submitted their intake yet.",
    );
  }

  const token = newToken();
  const expiresAt = addDays(new Date(), INTAKE_LINK_DAYS);
  const now = new Date();

  const form = await prisma.intakeForm.update({
    where: { id: existing.id },
    data: {
      // A fresh link, so the old one stops working the moment this is done.
      token,
      expiresAt,
      status: IntakeStatus.REOPENED,
      /*
       * Clearing this is what actually lets the client back in: both the send
       * guard and the save guard key on it. The submission it refers to is
       * already kept as its own version, so nothing is lost by letting go of it
       * here.
       */
      submittedAt: null,
      viewedAt: null,
      sentAt: now,
      sentById: actor.id,
      reopenedAt: now,
      reopenedById: actor.id,
      /*
       * A review describes the submission it was written against, and there is
       * about to be a newer one. Left set, the reviewer would never be asked to
       * look at what comes back. The notes themselves are somebody's writing and
       * are kept.
       */
      reviewedAt: null,
      reviewedById: null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Reopened the intake form for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { intakeFormId: form.id, expiresAt: expiresAt.toISOString() },
  });

  return { ok: true as const, form };
}

/**
 * Loads a form by its public token.
 *
 * Returns only what the client needs to fill it in: their own business name
 * and their own answers. No owner, no stage, no internal anything.
 */
export async function loadIntakeByToken(token: string) {
  if (!token || token.length < 20) {
    return null;
  }

  const form = await prisma.intakeForm.findUnique({
    where: { token },
    select: {
      id: true,
      status: true,
      answers: true,
      expiresAt: true,
      submittedAt: true,
      viewedAt: true,
      client: { select: { companyName: true, serviceType: true } },
    },
  });

  if (!form) {
    return null;
  }

  // Expiry is decided here rather than in the page. Reading the clock during a
  // render makes that component impure, and the service is where the rule
  // already lives.
  return {
    ...form,
    expired: form.expiresAt !== null && form.expiresAt.getTime() < Date.now(),
  };
}

/** Records that the client opened the link. Best effort, never blocking. */
export async function markIntakeViewed(token: string) {
  await prisma.intakeForm
    .updateMany({
      where: { token, viewedAt: null, submittedAt: null },
      data: { viewedAt: new Date(), status: IntakeStatus.VIEWED },
    })
    .catch(() => undefined);
}

export interface SaveIntakeResult {
  ok: true;
  submitted: boolean;
  percent: number;
  missingRequired: string[];
}

/**
 * Saves the client's answers, and submits when they say they are done.
 *
 * Partial saves are first-class. An intake form that only accepts a complete
 * submission is one people abandon halfway and start again, which is how they
 * end up never finishing.
 */
export async function saveIntakeAnswers(input: {
  token: string;
  answers: Record<string, string>;
  submit: boolean;
}): Promise<SaveIntakeResult | IntakeFailure> {
  const { token, answers, submit } = input;

  const form = await prisma.intakeForm.findUnique({
    where: { token },
    select: {
      id: true,
      answers: true,
      expiresAt: true,
      submittedAt: true,
      client: {
        select: {
          id: true,
          companyName: true,
          serviceType: true,
          assignedUserId: true,
        },
      },
    },
  });

  if (!form) {
    return failure("NOT_FOUND", "This link is not valid.");
  }

  if (form.submittedAt) {
    return failure(
      "ALREADY_SUBMITTED",
      "This form has already been submitted. Contact your account manager if something needs changing.",
    );
  }

  if (form.expiresAt && form.expiresAt.getTime() < Date.now()) {
    return failure(
      "EXPIRED",
      "This link has expired. Ask your account manager to send a fresh one.",
    );
  }

  // Only questions this client was actually asked. An unexpected key is either
  // a stale form or somebody poking at the endpoint; either way it is not
  // stored.
  const allowed = new Set(questionsForService(form.client.serviceType).map((q) => q.id));
  const cleaned: Record<string, string> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (!allowed.has(key) || typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim().slice(0, 4000);

    if (trimmed) {
      cleaned[key] = trimmed;
    }
  }

  // The guard that keeps credentials out of the database, on the one route
  // where somebody outside the agency is typing.
  const withCredentials = Object.entries(cleaned)
    .filter(([, value]) => checkForCredential(value).flagged)
    .map(([key]) => key);

  if (withCredentials.length) {
    return failure(
      "CREDENTIAL_SUBMITTED",
      "It looks like a password or key was pasted in. Please remove it - we never need your passwords, and we will invite ourselves to your accounts instead.",
      withCredentials,
    );
  }

  const merged = {
    ...((form.answers as Record<string, string> | null) ?? {}),
    ...cleaned,
  };

  const progress = deriveIntakeProgress(form.client.serviceType, merged);

  if (submit && !progress.complete) {
    return failure(
      "INVALID",
      "Some required answers are still missing.",
      progress.missingRequired,
    );
  }

  const now = new Date();

  /*
   * The form and the A2P profile move together.
   *
   * A submission that saved the answers but failed to carry them into the
   * registration profile would leave somebody looking at an empty A2P page
   * beside a completed intake, with nothing to say which was right - so both
   * happen inside one transaction or neither does.
   */
  const mapping = await prisma.$transaction(async (tx) => {
    await tx.intakeForm.update({
      where: { id: form.id },
      data: {
        answers: merged,
        lastSavedAt: now,
        ...(submit
          ? { status: IntakeStatus.SUBMITTED, submittedAt: now }
          : { status: IntakeStatus.PARTIALLY_COMPLETED }),
      },
    });

    /*
     * The submitted answers, kept as a row of their own.
     *
     * The form starts being edited again the moment it is reopened, so it
     * cannot also be the record of what was sent. Each submission is a new
     * version rather than a replacement, and nothing here is ever updated.
     */
    if (submit) {
      const previous = await tx.intakeSubmission.count({ where: { formId: form.id } });

      await tx.intakeSubmission.create({
        data: {
          formId: form.id,
          version: previous + 1,
          answers: merged,
          submittedAt: now,
        },
      });
    }

    /*
     * Only on submit, and never for a client who said they do not want text
     * messaging.
     *
     * That last part matters because answers outlive the questions that asked
     * them: somebody who filled in the A2P section and then changed their mind
     * still has those answers stored, and creating a registration profile from
     * them would hand the agency a client who has explicitly declined. The gate
     * answer wins over anything left behind.
     *
     * The intake row itself is never rewritten either way: it stays the record
     * of exactly what was sent.
     */
    if (!submit || merged.a2pWantsSms === "no") return null;
    if (!("a2pLegalName" in merged || "a2pUseCases" in merged)) return null;

    return applyIntakeToA2P(tx, form.client.id, merged as Record<string, string>);
  });

  if (mapping && (mapping.fieldsFilled.length > 0 || mapping.samplesAdded > 0)) {
    await logActivity({
      actorId: null,
      action: `${form.client.companyName} supplied A2P registration information with their intake`,
      entityType: "CLIENT",
      entityId: form.client.id,
      metadataJson: {
        fields: mapping.fieldsFilled,
        samples: mapping.samplesAdded,
        profileCreated: mapping.created,
      },
    });
  }

  if (submit) {
    // Empty actor: this was the client, not a team member, so there is nobody
    // on staff to exclude from their own notification.
    await createNotifications(
      resolveRecipients([form.client.assignedUserId], "").map((recipientId) => ({
        recipientId,
        type: "CLIENT_WAITING" as const,
        urgency: "HIGH" as const,
        title: `${form.client.companyName} submitted their intake`,
        body: "Review it and confirm the scope.",
        entityType: "CLIENT" as const,
        entityId: form.client.id,
        href: `/clients/${form.client.id}`,
      })),
    );
  }

  return {
    ok: true,
    submitted: submit,
    percent: progress.percent,
    missingRequired: progress.missingRequired,
  };
}

/** The project manager confirms they have read it. */
export async function reviewIntake(input: {
  actor: AuthContext;
  clientId: string;
  notes?: string | null;
}) {
  const { actor, clientId } = input;

  if (!can(actor, "clients.edit")) {
    return failure("FORBIDDEN", "You do not have permission to review the intake.");
  }

  const form = await prisma.intakeForm.findUnique({
    where: { clientId },
    select: { id: true, submittedAt: true, client: { select: { companyName: true } } },
  });

  if (!form) {
    return failure("NOT_FOUND", "No intake form has been sent for this client.");
  }

  if (!form.submittedAt) {
    return failure("INVALID", "The client has not submitted this yet.");
  }

  const reviewed = await prisma.intakeForm.update({
    where: { id: form.id },
    data: {
      status: IntakeStatus.REVIEWED,
      reviewedAt: new Date(),
      reviewedById: actor.id,
      reviewNotes: input.notes?.trim() || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Reviewed the intake submission from ${form.client.companyName}`,
    entityType: "CLIENT",
    entityId: clientId,
    metadataJson: { intakeFormId: form.id },
  });

  return { ok: true as const, form: reviewed };
}
