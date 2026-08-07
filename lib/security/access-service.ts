import {
  type AccessMethod,
  type AccessPlatform,
  AccessStatus,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkFieldsForCredentials } from "@/lib/security/credential-guard";

/**
 * Platform access tracking.
 *
 * Records whether the agency can reach a client platform, at what permission
 * level, and where the credential is held. It never records the credential.
 */

export type AccessFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CREDENTIAL_REJECTED";

export interface AccessFailure {
  ok: false;
  code: AccessFailureCode;
  message: string;
  field?: string;
}

function failure(code: AccessFailureCode, message: string, field?: string): AccessFailure {
  return { ok: false, code, message, field };
}

/** Statuses that mean the agency can actually get in. */
const USABLE: AccessStatus[] = [AccessStatus.GRANTED, AccessStatus.TESTED];

export function isUsableAccess(status: AccessStatus) {
  return USABLE.includes(status);
}

export interface AccessRecordInput {
  platform: AccessPlatform;
  platformLabel?: string | null;
  accountName?: string | null;
  status: AccessStatus;
  method?: AccessMethod | null;
  permissionLevel?: string | null;
  isCritical: boolean;
  twoFactorEnabled?: boolean | null;
  credentialLocation?: string | null;
  missingPermissions?: string | null;
  assignedToId?: string | null;
  notes?: string | null;
}

/**
 * Rejects anything that looks like a secret before it reaches the database.
 * Applied to every free-text field on the record.
 */
function guardFreeText(data: AccessRecordInput) {
  return checkFieldsForCredentials({
    accountName: data.accountName,
    permissionLevel: data.permissionLevel,
    credentialLocation: data.credentialLocation,
    missingPermissions: data.missingPermissions,
    notes: data.notes,
    platformLabel: data.platformLabel,
  });
}

async function loadClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true },
  });
}

export async function createAccessRecord(input: {
  actor: AuthContext;
  clientId: string;
  data: AccessRecordInput;
}) {
  const { actor, clientId, data } = input;

  if (!can(actor, "security.manageAccess")) {
    return failure("FORBIDDEN", "You do not have permission to manage platform access.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const credential = guardFreeText(data);

  if (credential) {
    return failure("CREDENTIAL_REJECTED", credential.reason, credential.field);
  }

  const existing = await prisma.accessRecord.findFirst({
    where: {
      clientId: client.id,
      platform: data.platform,
      platformLabel: data.platformLabel || null,
    },
    select: { id: true },
  });

  if (existing) {
    return failure(
      "INVALID",
      "That platform is already tracked on this account. Update the existing record instead.",
    );
  }

  const now = new Date();

  const record = await prisma.accessRecord.create({
    data: {
      clientId: client.id,
      platform: data.platform,
      platformLabel: data.platformLabel || null,
      accountName: data.accountName || null,
      status: data.status,
      method: data.method ?? null,
      permissionLevel: data.permissionLevel || null,
      isCritical: data.isCritical,
      twoFactorEnabled: data.twoFactorEnabled ?? null,
      credentialLocation: data.credentialLocation || null,
      missingPermissions: data.missingPermissions || null,
      assignedToId: data.assignedToId || null,
      notes: data.notes || null,
      requestedAt: data.status === AccessStatus.NOT_REQUESTED ? null : now,
      grantedAt: isUsableAccess(data.status) ? now : null,
      testedAt: data.status === AccessStatus.TESTED ? now : null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Tracked ${data.platform.toLowerCase().replaceAll("_", " ")} access for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { accessRecordId: record.id, isCritical: data.isCritical },
  });

  return { ok: true as const, record };
}

export async function updateAccessRecord(input: {
  actor: AuthContext;
  recordId: string;
  data: Partial<AccessRecordInput>;
}) {
  const { actor, recordId, data } = input;

  if (!can(actor, "security.manageAccess")) {
    return failure("FORBIDDEN", "You do not have permission to manage platform access.");
  }

  const existing = await prisma.accessRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      status: true,
      platform: true,
      grantedAt: true,
      client: { select: { id: true, companyName: true } },
    },
  });

  if (!existing) {
    return failure("NOT_FOUND", "Access record not found.");
  }

  const credential = checkFieldsForCredentials({
    accountName: data.accountName,
    permissionLevel: data.permissionLevel,
    credentialLocation: data.credentialLocation,
    missingPermissions: data.missingPermissions,
    notes: data.notes,
  });

  if (credential) {
    return failure("CREDENTIAL_REJECTED", credential.reason, credential.field);
  }

  const now = new Date();
  const nextStatus = data.status ?? existing.status;

  const record = await prisma.accessRecord.update({
    where: { id: recordId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.accountName !== undefined ? { accountName: data.accountName || null } : {}),
      ...(data.method !== undefined ? { method: data.method } : {}),
      ...(data.permissionLevel !== undefined
        ? { permissionLevel: data.permissionLevel || null }
        : {}),
      ...(data.isCritical !== undefined ? { isCritical: data.isCritical } : {}),
      ...(data.twoFactorEnabled !== undefined
        ? { twoFactorEnabled: data.twoFactorEnabled }
        : {}),
      ...(data.credentialLocation !== undefined
        ? { credentialLocation: data.credentialLocation || null }
        : {}),
      ...(data.missingPermissions !== undefined
        ? { missingPermissions: data.missingPermissions || null }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.assignedToId !== undefined
        ? {
            assignedTo: data.assignedToId
              ? { connect: { id: data.assignedToId } }
              : { disconnect: true },
          }
        : {}),
      // Timestamps follow the status rather than being set by hand, so the
      // history cannot disagree with the state.
      ...(data.status !== undefined
        ? {
            grantedAt: isUsableAccess(nextStatus) ? (existing.grantedAt ?? now) : null,
            testedAt: nextStatus === AccessStatus.TESTED ? now : null,
            removedAt: nextStatus === AccessStatus.REVOKED ? now : null,
          }
        : {}),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Updated ${existing.platform.toLowerCase().replaceAll("_", " ")} access for ${existing.client.companyName}`,
    entityType: "CLIENT",
    entityId: existing.client.id,
    ...(data.status !== undefined && data.status !== existing.status
      ? { fieldName: "accessStatus", previousValue: existing.status, newValue: record.status }
      : {}),
  });

  return { ok: true as const, record };
}
