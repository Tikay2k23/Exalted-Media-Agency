import {
  LeadSource,
  ReferralStatus,
  TestimonialFormat,
  TestimonialStatus,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Testimonials and referrals.
 *
 * Both of these hand something belonging to the client to the outside world -
 * their words, their logo, their numbers, or a person they know. So both are
 * built around consent rather than around workflow:
 *
 * - a testimonial may only be published using the attributes the client
 *   actually permitted, and
 * - a referred person may not be contacted until the referring client has said
 *   the agency may.
 *
 * Getting either wrong costs the relationship that produced the goodwill in
 * the first place, which is a strange way to spend a testimonial.
 */

export type AdvocacyFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "NO_PERMISSION"
  | "ALREADY_CONVERTED";

export interface AdvocacyFailure {
  ok: false;
  code: AdvocacyFailureCode;
  message: string;
}

function failure(code: AdvocacyFailureCode, message: string): AdvocacyFailure {
  return { ok: false, code, message };
}

export const ADVOCACY_FAILURE_STATUS: Record<AdvocacyFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  NO_PERMISSION: 409,
  ALREADY_CONVERTED: 409,
};

export const TESTIMONIAL_FORMATS = [
  { value: TestimonialFormat.WRITTEN, label: "Written" },
  { value: TestimonialFormat.VIDEO, label: "Video" },
  { value: TestimonialFormat.CASE_STUDY, label: "Case study" },
  { value: TestimonialFormat.REVIEW_PLATFORM, label: "Review platform" },
] as const;

export const TESTIMONIAL_STATUSES = [
  { value: TestimonialStatus.REQUESTED, label: "Requested" },
  { value: TestimonialStatus.RECEIVED, label: "Received" },
  { value: TestimonialStatus.APPROVED, label: "Cleared to publish" },
  { value: TestimonialStatus.PUBLISHED, label: "Published" },
  { value: TestimonialStatus.DECLINED, label: "Declined" },
] as const;

/** Each thing the client can separately allow, and what it means in plain words. */
export const TESTIMONIAL_PERMISSIONS = [
  { key: "allowPersonName", label: "Their name" },
  { key: "allowBusinessName", label: "Their business name" },
  { key: "allowLogo", label: "Their logo" },
  { key: "allowPhoto", label: "Their photo" },
  { key: "allowPerformanceData", label: "Their results and numbers" },
] as const;

export interface PublishableTestimonial {
  status: TestimonialStatus;
  content: string | null;
  publishingChannels: string | null;
  allowPersonName: boolean;
  allowBusinessName: boolean;
  allowLogo: boolean;
  allowPhoto: boolean;
  allowPerformanceData: boolean;
}

/** What the client has actually agreed can be shown. */
export function grantedPermissions(testimonial: PublishableTestimonial) {
  return TESTIMONIAL_PERMISSIONS.filter(
    (permission) => testimonial[permission.key] === true,
  ).map((permission) => permission.label);
}

/**
 * Why a testimonial cannot be published yet. Empty means it can.
 *
 * Pure, and shared by the service and the screen so the button and the rule
 * cannot disagree.
 */
export function describePublishingBlockers(testimonial: PublishableTestimonial) {
  const blockers: string[] = [];

  if (testimonial.status === TestimonialStatus.DECLINED) {
    blockers.push("the client declined");
  }

  if (!testimonial.content?.trim()) {
    blockers.push("there is nothing recorded to publish");
  }

  if (grantedPermissions(testimonial).length === 0) {
    blockers.push("the client has not agreed to anything being shown");
  }

  if (!testimonial.publishingChannels?.trim()) {
    blockers.push("nobody has recorded where it will be published");
  }

  return blockers;
}

export function canPublishTestimonial(testimonial: PublishableTestimonial) {
  return describePublishingBlockers(testimonial).length === 0;
}

async function loadClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, assignedUserId: true },
  });
}

export interface SaveTestimonialInput {
  actor: AuthContext;
  clientId: string;
  testimonialId?: string | null;
  format: TestimonialFormat;
  status?: TestimonialStatus;
  trigger?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  publishingChannels?: string | null;
  allowPersonName?: boolean;
  allowBusinessName?: boolean;
  allowLogo?: boolean;
  allowPhoto?: boolean;
  allowPerformanceData?: boolean;
}

/**
 * Records or updates a testimonial.
 *
 * Moving one to Published is refused unless every consent question has an
 * answer that permits it. This is the only place in the system where getting
 * it wrong reaches people outside the agency, so the check is here rather than
 * in the interface.
 */
export async function saveTestimonial(input: SaveTestimonialInput) {
  const { actor, clientId } = input;

  if (!can(actor, "renewals.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage testimonials.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const existing = input.testimonialId
    ? await prisma.testimonial.findFirst({
        where: { id: input.testimonialId, clientId: client.id },
      })
    : null;

  if (input.testimonialId && !existing) {
    return failure("NOT_FOUND", "Testimonial not found.");
  }

  const status = input.status ?? existing?.status ?? TestimonialStatus.REQUESTED;

  const merged: PublishableTestimonial = {
    status,
    content: input.content?.trim() ?? existing?.content ?? null,
    publishingChannels:
      input.publishingChannels?.trim() ?? existing?.publishingChannels ?? null,
    allowPersonName: input.allowPersonName ?? existing?.allowPersonName ?? false,
    allowBusinessName: input.allowBusinessName ?? existing?.allowBusinessName ?? false,
    allowLogo: input.allowLogo ?? existing?.allowLogo ?? false,
    allowPhoto: input.allowPhoto ?? existing?.allowPhoto ?? false,
    allowPerformanceData:
      input.allowPerformanceData ?? existing?.allowPerformanceData ?? false,
  };

  if (status === TestimonialStatus.PUBLISHED) {
    const blockers = describePublishingBlockers(merged);

    if (blockers.length) {
      return failure(
        "NO_PERMISSION",
        `This cannot be published because ${blockers.join(", and ")}.`,
      );
    }
  }

  // A previously declined testimonial cannot be quietly revived by editing.
  if (existing?.status === TestimonialStatus.DECLINED && status !== TestimonialStatus.DECLINED) {
    return failure(
      "NO_PERMISSION",
      "This client declined. Ask again and record a new request rather than reopening the old one.",
    );
  }

  const data = {
    format: input.format,
    status,
    trigger: input.trigger?.trim() || null,
    content: merged.content,
    mediaUrl: input.mediaUrl?.trim() || null,
    publishingChannels: merged.publishingChannels,
    allowPersonName: merged.allowPersonName,
    allowBusinessName: merged.allowBusinessName,
    allowLogo: merged.allowLogo,
    allowPhoto: merged.allowPhoto,
    allowPerformanceData: merged.allowPerformanceData,
    ...(status === TestimonialStatus.RECEIVED && !existing?.receivedAt
      ? { receivedAt: new Date() }
      : {}),
    ...(status === TestimonialStatus.APPROVED || status === TestimonialStatus.PUBLISHED
      ? { approvedById: actor.id, approvedAt: existing?.approvedAt ?? new Date() }
      : {}),
  };

  const testimonial = existing
    ? await prisma.testimonial.update({ where: { id: existing.id }, data })
    : await prisma.testimonial.create({
        data: { ...data, clientId: client.id, requestedAt: new Date() },
      });

  await logActivity({
    actorId: actor.id,
    action: existing
      ? `Updated the testimonial from ${client.companyName}`
      : `Requested a testimonial from ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    ...(existing && existing.status !== status
      ? { fieldName: "testimonialStatus", previousValue: existing.status, newValue: status }
      : {}),
    metadataJson: {
      testimonialId: testimonial.id,
      permissions: grantedPermissions(merged),
    },
  });

  return { ok: true as const, testimonial };
}

export interface SaveReferralInput {
  actor: AuthContext;
  clientId: string;
  referralId?: string | null;
  contactName: string;
  businessName?: string | null;
  email?: string | null;
  phone?: string | null;
  permissionGranted?: boolean;
  status?: ReferralStatus;
  assignedToId?: string | null;
  outcome?: string | null;
  incentiveStatus?: string | null;
}

/**
 * Records a referral.
 *
 * The status cannot move past Received until the referring client has
 * confirmed the agency may make contact. Cold-calling somebody's friend on the
 * strength of a name mentioned in passing is how an agency loses both.
 */
export async function saveReferral(input: SaveReferralInput) {
  const { actor, clientId } = input;

  if (!can(actor, "renewals.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage referrals.");
  }

  const contactName = input.contactName.trim();

  if (!contactName) {
    return failure("INVALID", "A referral needs a name.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const existing = input.referralId
    ? await prisma.referral.findFirst({
        where: { id: input.referralId, referringClientId: client.id },
        select: { id: true, status: true, permissionGranted: true, leadId: true },
      })
    : null;

  if (input.referralId && !existing) {
    return failure("NOT_FOUND", "Referral not found.");
  }

  const permissionGranted = input.permissionGranted ?? existing?.permissionGranted ?? false;
  const status = input.status ?? existing?.status ?? ReferralStatus.RECEIVED;

  if (
    !permissionGranted
    && status !== ReferralStatus.RECEIVED
    && status !== ReferralStatus.DECLINED
  ) {
    return failure(
      "NO_PERMISSION",
      `${client.companyName} has not confirmed the agency may contact this person yet. Ask them first.`,
    );
  }

  const data = {
    contactName,
    businessName: input.businessName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    permissionGranted,
    status,
    assignedToId: input.assignedToId?.trim() || null,
    outcome: input.outcome?.trim() || null,
    incentiveStatus: input.incentiveStatus?.trim() || null,
  };

  const referral = existing
    ? await prisma.referral.update({ where: { id: existing.id }, data })
    : await prisma.referral.create({
        data: { ...data, referringClientId: client.id },
      });

  await logActivity({
    actorId: actor.id,
    action: existing
      ? `Updated the referral from ${client.companyName}`
      : `Recorded a referral from ${client.companyName}: ${contactName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { referralId: referral.id, permissionGranted },
  });

  return { ok: true as const, referral };
}

/**
 * Turns a referral into a lead so Sales picks it up in the normal pipeline.
 *
 * SOP 37 asks for referral leads to connect to Sales rather than sitting in a
 * separate list somebody has to remember to read. The link is one-to-one, so a
 * second attempt is refused rather than quietly creating a duplicate lead.
 */
export async function convertReferralToLead(input: {
  actor: AuthContext;
  referralId: string;
  assignedToId?: string | null;
}) {
  const { actor, referralId } = input;

  // Governed by referral management rather than lead creation. The person who
  // hears the referral is the project manager sitting in the client
  // conversation, and they hold no leads.create - requiring it would leave
  // every referral waiting on a sales rep who cannot see that client's record
  // to go looking for it. The lead this produces is assigned to Sales, not to
  // whoever pressed the button.
  if (!can(actor, "renewals.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage referrals.");
  }

  const referral = await prisma.referral.findUnique({
    where: { id: referralId },
    select: {
      id: true,
      contactName: true,
      businessName: true,
      email: true,
      phone: true,
      permissionGranted: true,
      leadId: true,
      referringClientId: true,
      referringClient: { select: { id: true, companyName: true } },
    },
  });

  if (!referral) {
    return failure("NOT_FOUND", "Referral not found.");
  }

  if (referral.leadId) {
    return failure("ALREADY_CONVERTED", "This referral is already a lead.");
  }

  if (!referral.permissionGranted) {
    return failure(
      "NO_PERMISSION",
      `${referral.referringClient.companyName} has not confirmed the agency may contact this person yet.`,
    );
  }

  let assignedToId = input.assignedToId?.trim() || null;

  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    assignedToId = assignee?.id ?? null;
  }

  const [lead, updated] = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        contactName: referral.contactName,
        // A lead must have a business name; a referral often arrives as just a
        // person. Falling back to their name keeps the record honest rather
        // than inventing a company.
        businessName: referral.businessName?.trim() || referral.contactName,
        email: referral.email,
        phone: referral.phone,
        source: LeadSource.REFERRAL,
        assignedToId,
        notes: `Referred by ${referral.referringClient.companyName}.`,
      },
    });

    const referralUpdate = await tx.referral.update({
      where: { id: referral.id },
      data: {
        leadId: created.id,
        status: ReferralStatus.CONTACTED,
        assignedToId: assignedToId ?? undefined,
      },
    });

    return [created, referralUpdate];
  });

  await logActivity({
    actorId: actor.id,
    action: `Converted a referral from ${referral.referringClient.companyName} into a lead: ${referral.contactName}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { referralId: referral.id, referringClientId: referral.referringClientId },
  });

  await createNotifications(
    resolveRecipients([assignedToId], actor.id).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "HIGH" as const,
      title: `Referred lead: ${referral.contactName}`,
      body: `Referred by ${referral.referringClient.companyName}, who has agreed to the introduction.`,
      entityType: "LEAD" as const,
      entityId: lead.id,
      href: `/leads`,
    })),
  );

  return { ok: true as const, lead, referral: updated };
}
