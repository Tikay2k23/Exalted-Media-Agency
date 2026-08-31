import { ClientStatus, OffboardingStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Archiving a client.
 *
 * The last step of the lifecycle, and the one most likely to be mistaken for a
 * delete. It is not one. Nothing is removed: contacts, tasks, journey history,
 * approvals, reports, invoices, payments, files, activity, renewals and the
 * offboarding record all stay exactly where they are and remain readable to
 * anybody entitled to read them. Archiving only takes the account out of the
 * views that are about work in progress.
 *
 * The order matters and is enforced here rather than trusted:
 *
 *   start offboarding -> complete every blocking step -> complete offboarding
 *   -> archive
 *
 * Archiving an account whose offboarding is unfinished would file away an
 * unpaid final invoice or an access handover nobody did.
 */

export type ArchiveFailureCode = "FORBIDDEN" | "NOT_FOUND" | "OUT_OF_ORDER";

export const ARCHIVE_FAILURE_STATUS: Record<ArchiveFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  OUT_OF_ORDER: 409,
};

function failure(code: ArchiveFailureCode, message: string) {
  return { ok: false as const, code, message };
}

export async function archiveClient(input: {
  actor: AuthContext;
  clientId: string;
  now?: Date;
}) {
  const { actor, clientId } = input;

  /*
   * Deliberately the delete permission rather than the edit one. Filing an
   * account away is the closest thing this application has to removing it
   * from the working set, and it should sit with whoever may remove things.
   */
  if (!can(actor, "clients.delete")) {
    return failure("FORBIDDEN", "You do not have permission to archive a client.");
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      id: true,
      companyName: true,
      status: true,
      archivedAt: true,
      archivedById: true,
      offboarding: { select: { status: true } },
    },
  });

  if (!client) return failure("NOT_FOUND", "Client not found.");

  /*
   * Already archived is a success, not an error.
   *
   * A double click, a retried request and a second tab all end in the state
   * the caller asked for, and answering with a conflict would have somebody
   * "fixing" an account that is already correct. Nothing is written and
   * nothing is logged the second time.
   */
  if (client.archivedAt) {
    return {
      ok: true as const,
      client,
      alreadyArchived: true as const,
    };
  }

  if (!client.offboarding) {
    return failure(
      "OUT_OF_ORDER",
      "Start offboarding first. Archiving an account nobody has closed down leaves the final "
        + "invoice, the file handover and the access removal undone.",
    );
  }

  if (client.offboarding.status !== OffboardingStatus.COMPLETE) {
    return failure(
      "OUT_OF_ORDER",
      "Offboarding is not finished. Complete every outstanding step before archiving, or the "
        + "account is filed away with work still owed on it.",
    );
  }

  const now = input.now ?? new Date();

  /*
   * Conditional on still being unarchived, so two requests arriving together
   * cannot both write - the loser reads zero and is told the truth, which is
   * that the account is archived.
   */
  const updated = await prisma.client.updateMany({
    where: { id: client.id, archivedAt: null },
    data: {
      archivedAt: now,
      archivedById: actor.id,
      /*
       * COMPLETED already, in every normal path - completing offboarding sets
       * it. Set again here so an account archived through any other route
       * cannot be left reading Active.
       */
      status: ClientStatus.COMPLETED,
    },
  });

  if (updated.count === 0) {
    return { ok: true as const, client, alreadyArchived: true as const };
  }

  await logActivity({
    actorId: actor.id,
    action: `Archived ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    fieldName: "archivedAt",
    previousValue: null,
    newValue: now.toISOString(),
    metadataJson: { previousStatus: client.status },
  });

  return { ok: true as const, client, alreadyArchived: false as const };
}

/**
 * Bringing one back.
 *
 * Archiving is reversible on purpose. A client who returns, or one filed by
 * mistake, should not need a database console - and knowing it can be undone
 * is what makes archiving safe to use.
 */
export async function unarchiveClient(input: {
  actor: AuthContext;
  clientId: string;
  status?: ClientStatus;
}) {
  const { actor, clientId } = input;

  if (!can(actor, "clients.delete")) {
    return failure("FORBIDDEN", "You do not have permission to restore a client.");
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, companyName: true, archivedAt: true },
  });

  if (!client) return failure("NOT_FOUND", "Client not found.");

  if (!client.archivedAt) {
    return { ok: true as const, client, alreadyActive: true as const };
  }

  const updated = await prisma.client.updateMany({
    where: { id: client.id, archivedAt: { not: null } },
    data: {
      archivedAt: null,
      archivedById: null,
      status: input.status ?? ClientStatus.ACTIVE,
    },
  });

  if (updated.count === 0) {
    return { ok: true as const, client, alreadyActive: true as const };
  }

  await logActivity({
    actorId: actor.id,
    action: `Restored ${client.companyName} from the archive`,
    entityType: "CLIENT",
    entityId: client.id,
    fieldName: "archivedAt",
    previousValue: client.archivedAt.toISOString(),
    newValue: null,
  });

  return { ok: true as const, client, alreadyActive: false as const };
}

/**
 * What "still being worked on" means in a query.
 *
 * One definition, so a client cannot be missing from the directory and present
 * in the portfolio counts. Spread into a where clause.
 */
export const ACTIVE_CLIENT_SCOPE = { deletedAt: null, archivedAt: null } as const;
