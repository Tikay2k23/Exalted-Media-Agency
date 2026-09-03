import { Prisma, ResourceSource, ResourceStatus, ResourceType } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deleteResourceFile, type StoredFile } from "@/lib/storage/resource-blob";

/**
 * SOP resources: the supporting material that helps somebody follow a procedure.
 *
 * One authoritative Resource, linked to many SOPs through ResourceSopLink. The
 * rule that shapes everything here is that removing a resource from a SOP is
 * unlinking, not deleting - the resource lives on for the other SOPs it serves.
 * A true delete is a separate, guarded operation.
 *
 * Reading needs governance.view, which every seat carries; managing needs
 * sop.manage, which the ADMIN/OWNER tier and the agency-owner seat carry. The UI
 * hides what a viewer cannot do, and every function here checks again.
 */

export type ResourceFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "DUPLICATE";

export interface ResourceFailure {
  ok: false;
  code: ResourceFailureCode;
  message: string;
}

function failure(code: ResourceFailureCode, message: string): ResourceFailure {
  return { ok: false, code, message };
}

export const RESOURCE_FAILURE_STATUS: Record<ResourceFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  DUPLICATE: 409,
};

export const RESOURCE_TYPES = [
  { value: ResourceType.HOW_TO_GUIDE, label: "How-To Guide" },
  { value: ResourceType.SCRIPT, label: "Script" },
  { value: ResourceType.TEMPLATE, label: "Template" },
  { value: ResourceType.CHECKLIST, label: "Checklist" },
  { value: ResourceType.REFERENCE_GUIDE, label: "Reference Guide" },
  { value: ResourceType.FILE, label: "File" },
  { value: ResourceType.EXTERNAL_LINK, label: "External Link" },
] as const;

export const RESOURCE_STATUSES = [
  { value: ResourceStatus.DRAFT, label: "Draft" },
  { value: ResourceStatus.ACTIVE, label: "Active" },
  { value: ResourceStatus.ARCHIVED, label: "Archived" },
] as const;

/** The types a document may be filed under: everything except the file/link markers. */
const DOCUMENT_TYPES = new Set<ResourceType>([
  ResourceType.HOW_TO_GUIDE,
  ResourceType.SCRIPT,
  ResourceType.TEMPLATE,
  ResourceType.CHECKLIST,
  ResourceType.REFERENCE_GUIDE,
]);

function logResource(actor: AuthContext, action: string, resourceId: string) {
  return logActivity({
    actorId: actor.id,
    action,
    entityType: "SYSTEM",
    entityId: resourceId,
  });
}

async function requireSop(sopId: string) {
  return prisma.sop.findUnique({ where: { id: sopId }, select: { id: true, reference: true } });
}

/* --- creating --- */

interface CreateCommon {
  actor: AuthContext;
  sopId: string;
  title: string;
  description?: string | null;
  ownerId?: string | null;
  status?: ResourceStatus;
}

/**
 * Creates a resource and links it to the SOP in one transaction, so a resource
 * never exists attached to nothing.
 */
async function create(
  common: CreateCommon,
  data: Pick<
    Prisma.ResourceCreateInput,
    "type" | "source" | "content" | "fileUrl" | "fileName" | "fileMimeType" | "fileSize" | "externalUrl"
  >,
) {
  const { actor } = common;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage resources.");
  }

  const title = common.title.trim();

  if (!title) {
    return failure("INVALID", "A resource needs a title.");
  }

  const sop = await requireSop(common.sopId);

  if (!sop) {
    return failure("NOT_FOUND", "SOP not found.");
  }

  const resource = await prisma.resource.create({
    data: {
      title,
      description: common.description?.trim() || null,
      status: common.status ?? ResourceStatus.ACTIVE,
      ownerId: common.ownerId?.trim() || null,
      createdById: actor.id,
      updatedById: actor.id,
      ...data,
      sops: {
        create: { sopId: sop.id, createdById: actor.id },
      },
    },
    select: { id: true },
  });

  await logResource(actor, `Created resource "${title}" and linked it to ${sop.reference}`, resource.id);

  return { ok: true as const, resourceId: resource.id };
}

export function createDocumentResource(
  input: CreateCommon & { type: ResourceType; content: string },
) {
  if (!DOCUMENT_TYPES.has(input.type)) {
    return Promise.resolve(
      failure("INVALID", "A written document must be a guide, script, template, checklist, or reference."),
    );
  }

  if (!input.content.trim()) {
    return Promise.resolve(failure("INVALID", "A document needs some content."));
  }

  return create(input, {
    type: input.type,
    source: ResourceSource.DOCUMENT,
    content: input.content,
  });
}

export function createLinkResource(input: CreateCommon & { externalUrl: string; type?: ResourceType }) {
  let url: URL;

  try {
    url = new URL(input.externalUrl.trim());
  } catch {
    return Promise.resolve(failure("INVALID", "That does not look like a valid URL."));
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return Promise.resolve(failure("INVALID", "A link must start with http:// or https://."));
  }

  return create(input, {
    type: input.type ?? ResourceType.EXTERNAL_LINK,
    source: ResourceSource.LINK,
    externalUrl: url.toString(),
  });
}

/**
 * Creates a file-backed resource. The bytes are already in blob storage - the
 * upload route stores them, then calls this so a storage failure never leaves a
 * record pointing at nothing.
 */
export function createFileResource(
  input: CreateCommon & { type?: ResourceType; file: StoredFile },
) {
  return create(input, {
    type: input.type ?? ResourceType.FILE,
    source: ResourceSource.FILE,
    fileUrl: input.file.url,
    fileName: input.file.fileName,
    fileMimeType: input.file.mimeType,
    fileSize: input.file.size,
  });
}

/* --- linking --- */

export async function linkResourceToSop(input: {
  actor: AuthContext;
  resourceId: string;
  sopId: string;
}) {
  const { actor } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage resources.");
  }

  const [resource, sop] = await Promise.all([
    prisma.resource.findUnique({ where: { id: input.resourceId }, select: { id: true, title: true } }),
    requireSop(input.sopId),
  ]);

  if (!resource || !sop) {
    return failure("NOT_FOUND", "Resource or SOP not found.");
  }

  const existing = await prisma.resourceSopLink.findUnique({
    where: { resourceId_sopId: { resourceId: resource.id, sopId: sop.id } },
    select: { id: true },
  });

  if (existing) {
    return failure("DUPLICATE", "That resource is already linked to this SOP.");
  }

  await prisma.resourceSopLink.create({
    data: { resourceId: resource.id, sopId: sop.id, createdById: actor.id },
  });

  await logResource(actor, `Linked resource "${resource.title}" to ${sop.reference}`, resource.id);

  return { ok: true as const };
}

/**
 * Removes one SOP link. Emphatically not a delete: the resource and its other
 * links are untouched. Deleting the last link is allowed - a resource may sit
 * unlinked in the library until it is attached again.
 */
export async function unlinkResourceFromSop(input: {
  actor: AuthContext;
  resourceId: string;
  sopId: string;
}) {
  const { actor } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage resources.");
  }

  const link = await prisma.resourceSopLink.findUnique({
    where: { resourceId_sopId: { resourceId: input.resourceId, sopId: input.sopId } },
    select: { id: true, resource: { select: { title: true } }, sop: { select: { reference: true } } },
  });

  if (!link) {
    return failure("NOT_FOUND", "That resource is not linked to this SOP.");
  }

  await prisma.resourceSopLink.delete({ where: { id: link.id } });

  await logResource(
    actor,
    `Removed resource "${link.resource.title}" from ${link.sop.reference}`,
    input.resourceId,
  );

  return { ok: true as const };
}

/* --- editing --- */

export async function updateResource(input: {
  actor: AuthContext;
  resourceId: string;
  title?: string;
  description?: string | null;
  type?: ResourceType;
  status?: ResourceStatus;
  ownerId?: string | null;
  content?: string;
  externalUrl?: string;
}) {
  const { actor } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage resources.");
  }

  const resource = await prisma.resource.findUnique({
    where: { id: input.resourceId },
    select: { id: true, title: true, source: true },
  });

  if (!resource) {
    return failure("NOT_FOUND", "Resource not found.");
  }

  const data: Prisma.ResourceUpdateInput = { updatedBy: { connect: { id: actor.id } } };

  if (input.title !== undefined) {
    if (!input.title.trim()) return failure("INVALID", "A resource needs a title.");
    data.title = input.title.trim();
  }

  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.status !== undefined) data.status = input.status;
  if (input.ownerId !== undefined) {
    data.owner = input.ownerId?.trim()
      ? { connect: { id: input.ownerId.trim() } }
      : { disconnect: true };
  }

  if (input.type !== undefined) {
    /* A document cannot become a file marker, and a file cannot become a guide
       and lose its bytes - the source decides which types are legal. */
    if (resource.source === ResourceSource.DOCUMENT && !DOCUMENT_TYPES.has(input.type)) {
      return failure("INVALID", "A written document cannot be typed as a file or link.");
    }
    data.type = input.type;
  }

  if (input.content !== undefined && resource.source === ResourceSource.DOCUMENT) {
    if (!input.content.trim()) return failure("INVALID", "A document needs some content.");
    data.content = input.content;
  }

  if (input.externalUrl !== undefined && resource.source === ResourceSource.LINK) {
    try {
      const url = new URL(input.externalUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return failure("INVALID", "A link must start with http:// or https://.");
      }
      data.externalUrl = url.toString();
    } catch {
      return failure("INVALID", "That does not look like a valid URL.");
    }
  }

  await prisma.resource.update({ where: { id: resource.id }, data });

  await logResource(actor, `Updated resource "${data.title ?? resource.title}"`, resource.id);

  return { ok: true as const };
}

/** Replaces the file behind a FILE resource, deleting the old blob. */
export async function replaceResourceFile(input: {
  actor: AuthContext;
  resourceId: string;
  file: StoredFile;
}) {
  const { actor } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage resources.");
  }

  const resource = await prisma.resource.findUnique({
    where: { id: input.resourceId },
    select: { id: true, title: true, source: true, fileUrl: true },
  });

  if (!resource) {
    return failure("NOT_FOUND", "Resource not found.");
  }

  if (resource.source !== ResourceSource.FILE) {
    return failure("INVALID", "Only a file resource has a file to replace.");
  }

  const previousUrl = resource.fileUrl;

  await prisma.resource.update({
    where: { id: resource.id },
    data: {
      fileUrl: input.file.url,
      fileName: input.file.fileName,
      fileMimeType: input.file.mimeType,
      fileSize: input.file.size,
      updatedBy: { connect: { id: actor.id } },
    },
  });

  if (previousUrl && previousUrl !== input.file.url) {
    await deleteResourceFile(previousUrl);
  }

  await logResource(actor, `Replaced the file on resource "${resource.title}"`, resource.id);

  return { ok: true as const };
}

/* --- lifecycle --- */

export async function archiveResource(input: { actor: AuthContext; resourceId: string }) {
  const { actor } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage resources.");
  }

  const resource = await prisma.resource.findUnique({
    where: { id: input.resourceId },
    select: { id: true, title: true, status: true },
  });

  if (!resource) {
    return failure("NOT_FOUND", "Resource not found.");
  }

  await prisma.resource.update({
    where: { id: resource.id },
    data: { status: ResourceStatus.ARCHIVED, archivedAt: new Date(), updatedBy: { connect: { id: actor.id } } },
  });

  await logResource(actor, `Archived resource "${resource.title}"`, resource.id);

  return { ok: true as const };
}

/**
 * Permanently deletes a resource and its blob.
 *
 * Distinct from unlinking and from archiving, and destructive: it removes the
 * resource from every SOP at once. The cascade on ResourceSopLink clears the
 * links; the blob is removed after the row so a failed delete cannot strand it.
 */
export async function deleteResource(input: { actor: AuthContext; resourceId: string }) {
  const { actor } = input;

  if (!can(actor, "sop.manage")) {
    return failure("FORBIDDEN", "You do not have permission to delete resources.");
  }

  const resource = await prisma.resource.findUnique({
    where: { id: input.resourceId },
    select: { id: true, title: true, fileUrl: true },
  });

  if (!resource) {
    return failure("NOT_FOUND", "Resource not found.");
  }

  await prisma.resource.delete({ where: { id: resource.id } });

  if (resource.fileUrl) {
    await deleteResourceFile(resource.fileUrl);
  }

  await logResource(actor, `Deleted resource "${resource.title}"`, resource.id);

  return { ok: true as const };
}

/* --- reading --- */

/** Metadata for one resource row. Never the file bytes; content only on detail. */
const LIST_SELECT = {
  id: true,
  title: true,
  type: true,
  description: true,
  status: true,
  source: true,
  fileName: true,
  fileMimeType: true,
  fileSize: true,
  externalUrl: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
} satisfies Prisma.ResourceSelect;

/**
 * The resources linked to one SOP, filtered and searched.
 *
 * Metadata only - a list of thirty resources must not drag thirty file bodies
 * or documents with it. `content` is fetched on the detail call.
 */
export async function listResourcesForSop(
  sopId: string,
  options: { query?: string; type?: ResourceType | null; includeArchived?: boolean } = {},
) {
  const where: Prisma.ResourceWhereInput = {
    sops: { some: { sopId } },
    ...(options.type ? { type: options.type } : {}),
    ...(options.includeArchived ? {} : { status: { not: ResourceStatus.ARCHIVED } }),
  };

  if (options.query?.trim()) {
    const q = options.query.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  return prisma.resource.findMany({
    where,
    orderBy: [{ type: "asc" }, { title: "asc" }],
    select: LIST_SELECT,
  });
}

export type ResourceListItem = Prisma.ResourceGetPayload<{ select: typeof LIST_SELECT }>;

/**
 * Active resources that could be linked to a SOP, minus the ones already on it.
 *
 * For the Link Existing flow: one resource serves many SOPs, so this is how the
 * same "How to submit an EOD" reaches SOP-08 without being uploaded again.
 */
export async function searchLinkableResources(input: { query?: string; excludeSopId: string }) {
  const where: Prisma.ResourceWhereInput = {
    status: { not: ResourceStatus.ARCHIVED },
    sops: { none: { sopId: input.excludeSopId } },
  };

  if (input.query?.trim()) {
    const q = input.query.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  return prisma.resource.findMany({
    where,
    orderBy: { title: "asc" },
    take: 20,
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      description: true,
      _count: { select: { sops: true } },
    },
  });
}

/** One resource in full, including its content and every SOP it is linked to. */
export async function getResourceDetail(resourceId: string) {
  return prisma.resource.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      title: true,
      type: true,
      description: true,
      status: true,
      source: true,
      content: true,
      fileUrl: true,
      fileName: true,
      fileMimeType: true,
      fileSize: true,
      externalUrl: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      sops: {
        select: { sop: { select: { id: true, reference: true, title: true } } },
        orderBy: { sop: { reference: "asc" } },
      },
    },
  });
}
