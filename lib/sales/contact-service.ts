import { LeadStatus, type LeadSource, type Prisma, type ServiceType } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  companyKeyOf,
  defaultOpportunityName,
  emailKeyOf,
  isStrongMatch,
  matchContacts,
  phoneKeyOf,
  type ContactMatch,
  type MatchCandidate,
} from "@/lib/sales/contact-matching";
import { scoreLead } from "@/lib/sales/lead-scoring";
import { SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * Contacts, and the opportunities that hang off them.
 *
 * A Contact is who the deal is with; a Lead row is the deal. One contact may
 * carry several - automation this quarter, advertising the next - and this
 * module is the only place allowed to create either, so there is exactly one
 * answer to "is this person already in the system".
 *
 * On the duplicated columns: Lead still has its own contactName, businessName,
 * email and phone, and the whole application still reads them. They are kept in
 * step by writeContactIdentity below, which is the single writer. That is a
 * deliberate compromise - the alternative was rewriting seventy-odd call sites
 * in one change - and the rule that makes it safe is that nothing outside this
 * file may write those four columns on a Lead.
 */

export type ContactFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "DUPLICATE_CONTACT"
  | "STAGE_NOT_FOUND";

export interface ContactFailure {
  ok: false;
  code: ContactFailureCode;
  message: string;
  /** Present on DUPLICATE_CONTACT, so the caller can offer the alternatives. */
  matches?: ContactMatch[];
}

export const CONTACT_FAILURE_STATUS: Record<ContactFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  DUPLICATE_CONTACT: 409,
  STAGE_NOT_FOUND: 422,
};

function failure(
  code: ContactFailureCode,
  message: string,
  matches?: ContactMatch[],
): ContactFailure {
  return { ok: false, code, message, ...(matches ? { matches } : {}) };
}

function toDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The contacts that could be this person.
 *
 * Narrowed in the database by the three indexed match keys and then ranked in
 * memory, rather than pulling every contact and comparing. The company key is
 * included in the query even though it is the weakest rule, because the caller
 * needs to be able to show "three other people at this firm" - that is useful
 * context even when it is not a duplicate.
 */
export async function findContactMatches(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  businessName?: string | null;
  /** Never offer the contact we are already editing as its own duplicate. */
  excludeContactId?: string | null;
}): Promise<ContactMatch[]> {
  const emailKey = emailKeyOf(input.email);
  const phoneKey = phoneKeyOf(input.phone);
  const companyKey = companyKeyOf(input.businessName);

  const or: Prisma.ContactWhereInput[] = [];

  if (emailKey) or.push({ emailKey });
  if (phoneKey) or.push({ phoneKey });
  if (companyKey) or.push({ companyKey });

  if (or.length === 0) return [];

  const candidates = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      OR: or,
      ...(input.excludeContactId ? { id: { not: input.excludeContactId } } : {}),
    },
    take: 20,
    select: {
      id: true,
      name: true,
      businessName: true,
      email: true,
      phone: true,
      _count: { select: { opportunities: true } },
    },
  });

  const rows: MatchCandidate[] = candidates.map((contact) => ({
    id: contact.id,
    name: contact.name,
    businessName: contact.businessName,
    email: contact.email,
    phone: contact.phone,
    opportunityCount: contact._count.opportunities,
  }));

  return matchContacts(
    { email: input.email, phone: input.phone, businessName: input.businessName },
    rows,
  );
}

/**
 * Writes contact identity, in one place, to both records that hold it.
 *
 * Every opportunity against the contact gets the same four columns, because
 * they are copies and a copy that is not updated is a lie. Called inside a
 * transaction by its callers so a contact can never be renamed while its
 * opportunities keep the old name.
 */
async function writeContactIdentity(
  tx: Prisma.TransactionClient,
  contactId: string,
  identity: { name: string; businessName: string; email: string | null; phone: string | null },
) {
  const contact = await tx.contact.update({
    where: { id: contactId },
    data: {
      name: identity.name,
      businessName: identity.businessName,
      email: identity.email,
      phone: identity.phone,
      emailKey: emailKeyOf(identity.email),
      phoneKey: phoneKeyOf(identity.phone),
      companyKey: companyKeyOf(identity.businessName),
    },
  });

  await tx.lead.updateMany({
    where: { contactId },
    data: {
      contactName: identity.name,
      businessName: identity.businessName,
      email: identity.email,
      phone: identity.phone,
    },
  });

  return contact;
}

export interface OpportunityInput {
  opportunityName?: string | null;
  source: LeadSource;
  serviceInterest?: ServiceType | null;
  opportunityValue?: number | null;
  budgetRange?: string | null;
  budgetAmount?: number | null;
  timeline?: string | null;
  isDecisionMaker?: boolean | null;
  mainProblem?: string | null;
  goal?: string | null;
  currentSolution?: string | null;
  qualificationNotes?: string | null;
  assignedToId?: string | null;
  stageId?: string | null;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
  expectedCloseAt?: string | null;
  campaign?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referralSource?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}

export interface ContactInput {
  contactName: string;
  businessName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * The stage a brand-new opportunity opens at.
 *
 * "New Lead" by key first, so the default does not silently move if somebody
 * marks a different stage as default in the pipeline settings; the flagged
 * default is the fallback for a workspace configured differently.
 */
async function resolveEntryStage(stageId?: string | null) {
  if (stageId) {
    const chosen = await prisma.pipelineStage.findFirst({
      where: { id: stageId, pipelineId: SALES_PIPELINE_ID },
      select: { id: true, name: true, stageKey: true },
    });

    if (chosen) return chosen;
  }

  return (
    (await prisma.pipelineStage.findFirst({
      where: { pipelineId: SALES_PIPELINE_ID, stageKey: "new_website_lead" },
      select: { id: true, name: true, stageKey: true },
    }))
    ?? (await prisma.pipelineStage.findFirst({
      where: { pipelineId: SALES_PIPELINE_ID, isDefault: true },
      select: { id: true, name: true, stageKey: true },
    }))
  );
}

/** Only clean, de-duplicated, non-empty tags reach the column. */
function cleanTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];

  const seen = new Set<string>();

  for (const tag of tags) {
    const trimmed = tag.trim().slice(0, 40);
    // Stage tags are derived from the stage, so one typed by hand would be a
    // second source of truth for where the deal is. Dropped rather than saved.
    if (!trimmed || trimmed.toLowerCase().startsWith("stage_")) continue;
    seen.add(trimmed);
  }

  return [...seen].slice(0, 20);
}

function opportunityData(
  input: OpportunityInput,
  identity: ContactInput,
  ownerId: string | null,
  actorId: string,
  stageId: string,
) {
  const businessName = identity.businessName?.trim() || identity.contactName.trim();

  return {
    contactName: identity.contactName.trim(),
    businessName,
    email: emailKeyOf(identity.email),
    phone: identity.phone?.trim() || null,
    opportunityName:
      input.opportunityName?.trim()
      || defaultOpportunityName({
        serviceInterest: input.serviceInterest,
        businessName,
        contactName: identity.contactName,
      }),
    source: input.source,
    serviceInterest: input.serviceInterest ?? null,
    opportunityValue: input.opportunityValue ?? null,
    budgetRange: input.budgetRange?.trim() || null,
    budgetAmount: input.budgetAmount ?? null,
    timeline: input.timeline?.trim() || null,
    isDecisionMaker: input.isDecisionMaker ?? null,
    mainProblem: input.mainProblem?.trim() || null,
    goal: input.goal?.trim() || null,
    currentSolution: input.currentSolution?.trim() || null,
    qualificationNotes: input.qualificationNotes?.trim() || null,
    campaign: input.campaign?.trim() || null,
    utmSource: input.utmSource?.trim() || null,
    utmMedium: input.utmMedium?.trim() || null,
    utmCampaign: input.utmCampaign?.trim() || null,
    referralSource: input.referralSource?.trim() || null,
    tags: cleanTags(input.tags),
    notes: input.notes?.trim() || null,
    nextAction: input.nextAction?.trim() || null,
    nextFollowUpAt: toDate(input.nextFollowUpAt),
    expectedCloseAt: toDate(input.expectedCloseAt),
    assignedToId: ownerId,
    createdById: actorId,
    stageId,
    status: LeadStatus.NEW,
    score: scoreLead({
      budgetAmount: input.budgetAmount ?? input.opportunityValue ?? null,
      timeline: input.timeline ?? null,
      isDecisionMaker: input.isDecisionMaker ?? null,
      mainProblem: input.mainProblem ?? null,
      goal: input.goal ?? null,
      source: input.source,
      email: identity.email ?? null,
      phone: identity.phone ?? null,
    }).total,
  };
}

/** Who may own this opportunity: a rep cannot hand one to somebody else. */
function resolveOwner(actor: AuthContext, requested: string | null | undefined) {
  return can(actor, "leads.view.all") ? requested || null : actor.id;
}

async function announceAssignment(
  actor: AuthContext,
  lead: { id: string; businessName: string; assignedToId: string | null },
  verb: string,
) {
  if (!lead.assignedToId) return;

  await createNotifications(
    resolveRecipients([lead.assignedToId], actor.id).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "HIGH" as const,
      title: `${verb}: ${lead.businessName}`,
      body: `${actor.name} assigned you this opportunity.`,
      entityType: "LEAD" as const,
      entityId: lead.id,
      href: `/leads?opportunity=${lead.id}`,
    })),
  );
}

export interface CreateLeadResult {
  ok: true;
  leadId: string;
  contactId: string;
  /** True when the contact already existed and a second deal was added to it. */
  usedExistingContact: boolean;
  stageName: string;
  contactName: string;
}

/**
 * Add Lead: the contact and their first opportunity, in one step.
 *
 * This is the primary sales action, and it deliberately does two things at
 * once. Asking a salesperson to create a person and then create a deal against
 * them is asking them to do the database's filing; every lead has a deal
 * attached by definition, or it would not be a lead.
 *
 * Refuses on a strong duplicate unless the caller has decided what to do about
 * it - either by naming the contact to attach to, or by explicitly forcing a
 * new one. Silently creating the second record is the one outcome that is
 * always wrong.
 */
export async function createLeadWithOpportunity(input: {
  actor: AuthContext;
  contact: ContactInput;
  opportunity: OpportunityInput;
  /** Attach to this existing contact instead of creating one. */
  contactId?: string | null;
  /** Create a new contact even though one matched. */
  allowDuplicate?: boolean;
}): Promise<CreateLeadResult | ContactFailure> {
  const { actor } = input;

  if (!can(actor, "leads.create")) {
    return failure("FORBIDDEN", "You do not have permission to create leads.");
  }

  const contactName = input.contact.contactName?.trim() ?? "";

  if (!contactName) return failure("INVALID", "A lead needs a contact name.");

  const email = emailKeyOf(input.contact.email);
  const phone = input.contact.phone?.trim() || null;

  // One way to reach them, or the lead is a name on a list.
  if (!email && !phone) {
    return failure("INVALID", "Add an email address or a phone number.");
  }

  const businessName = input.contact.businessName?.trim() || contactName;
  const stage = await resolveEntryStage(input.opportunity.stageId);

  if (!stage) {
    return failure("STAGE_NOT_FOUND", "The sales pipeline has no stages configured.");
  }

  const contactId = input.contactId ?? null;

  if (contactId) {
    const exists = await prisma.contact.findFirst({
      where: { id: contactId, deletedAt: null },
      select: { id: true },
    });

    if (!exists) return failure("NOT_FOUND", "That contact could not be found.");
  } else {
    const matches = await findContactMatches({ email, phone, businessName });
    const strong = matches.filter(isStrongMatch);

    if (strong.length > 0 && !input.allowDuplicate) {
      return failure(
        "DUPLICATE_CONTACT",
        "This contact may already exist.",
        matches,
      );
    }
  }

  const ownerId = resolveOwner(actor, input.opportunity.assignedToId);

  const created = await prisma.$transaction(async (tx) => {
    const contact = contactId
      ? await tx.contact.findUniqueOrThrow({ where: { id: contactId } })
      : await tx.contact.create({
          data: {
            name: contactName,
            businessName,
            email,
            phone,
            emailKey: email,
            phoneKey: phoneKeyOf(phone),
            companyKey: companyKeyOf(businessName),
            ownerId,
            createdById: actor.id,
          },
        });

    const lead = await tx.lead.create({
      data: {
        ...opportunityData(
          input.opportunity,
          // The stored contact wins over what was typed, so a second deal
          // against a known account cannot quietly rename them.
          {
            contactName: contact.name,
            businessName: contact.businessName,
            email: contact.email,
            phone: contact.phone,
          },
          ownerId,
          actor.id,
          stage.id,
        ),
        contactId: contact.id,
      },
      select: { id: true, businessName: true, assignedToId: true, contactName: true },
    });

    return { contact, lead };
  });

  await logActivity({
    actorId: actor.id,
    action: contactId
      ? `Added an opportunity for ${created.contact.name}`
      : `Created lead ${created.contact.businessName}`,
    entityType: "LEAD",
    entityId: created.lead.id,
    metadataJson: {
      contactId: created.contact.id,
      usedExistingContact: Boolean(contactId),
      stage: stage.stageKey,
      source: input.opportunity.source,
    },
  });

  await announceAssignment(actor, created.lead, "New opportunity assigned");

  return {
    ok: true,
    leadId: created.lead.id,
    contactId: created.contact.id,
    usedExistingContact: Boolean(contactId),
    stageName: stage.name,
    contactName: created.contact.name,
  };
}

/**
 * A second deal against somebody the agency already knows.
 *
 * The secondary path, reached from a contact, a client or an opportunity rather
 * than from the Add Lead button. It creates no contact at all - that is the
 * entire point of it existing.
 */
export async function createOpportunityForContact(input: {
  actor: AuthContext;
  contactId: string;
  opportunity: OpportunityInput;
}): Promise<CreateLeadResult | ContactFailure> {
  const { actor } = input;

  if (!can(actor, "leads.create")) {
    return failure("FORBIDDEN", "You do not have permission to create opportunities.");
  }

  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, deletedAt: null },
    select: { id: true, name: true, businessName: true, email: true, phone: true },
  });

  if (!contact) return failure("NOT_FOUND", "That contact could not be found.");

  const stage = await resolveEntryStage(input.opportunity.stageId);

  if (!stage) {
    return failure("STAGE_NOT_FOUND", "The sales pipeline has no stages configured.");
  }

  const ownerId = resolveOwner(actor, input.opportunity.assignedToId);

  const lead = await prisma.lead.create({
    data: {
      ...opportunityData(
        input.opportunity,
        {
          contactName: contact.name,
          businessName: contact.businessName,
          email: contact.email,
          phone: contact.phone,
        },
        ownerId,
        actor.id,
        stage.id,
      ),
      contactId: contact.id,
    },
    select: { id: true, businessName: true, assignedToId: true },
  });

  await logActivity({
    actorId: actor.id,
    action: `Added an opportunity for ${contact.name}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: {
      contactId: contact.id,
      usedExistingContact: true,
      stage: stage.stageKey,
      opportunityName: input.opportunity.opportunityName ?? null,
    },
  });

  await announceAssignment(actor, lead, "New opportunity assigned");

  return {
    ok: true,
    leadId: lead.id,
    contactId: contact.id,
    usedExistingContact: true,
    stageName: stage.name,
    contactName: contact.name,
  };
}

/**
 * Contacts for a batch of imported rows, resolved in two queries.
 *
 * The importer cannot stop and ask about every duplicate, so it only ever
 * matches on email and phone - the two rules that are facts. A shared company
 * name is left alone: merging "Sarah at Ironclad" into "Mike at Ironclad"
 * because a spreadsheet had both would be the importer inventing a decision
 * nobody made.
 *
 * Contact ids are derived from the match key rather than generated, which is
 * what lets the whole batch be inserted at once and re-run without producing a
 * second copy of anything.
 */
export async function resolveImportContacts(
  actorId: string,
  ownerId: string | null,
  rows: { contactName: string; businessName: string; email: string | null; phone: string | null }[],
): Promise<Map<number, string>> {
  const { createHash } = await import("node:crypto");
  const idFor = (key: string) => `ct_${createHash("md5").update(key).digest("hex")}`;

  /** The same precedence the backfill used: email, then phone, then company. */
  const keyFor = (row: { email: string | null; phone: string | null; businessName: string; contactName: string }) =>
    emailKeyOf(row.email)
    ?? phoneKeyOf(row.phone)
    ?? `${companyKeyOf(row.businessName)}|${row.contactName.trim().toLowerCase()}`;

  const keys = rows.map(keyFor);
  const emailKeys = [...new Set(rows.map((row) => emailKeyOf(row.email)).filter(Boolean))] as string[];
  const phoneKeys = [...new Set(rows.map((row) => phoneKeyOf(row.phone)).filter(Boolean))] as string[];

  const existing =
    emailKeys.length || phoneKeys.length
      ? await prisma.contact.findMany({
          where: {
            deletedAt: null,
            OR: [
              ...(emailKeys.length ? [{ emailKey: { in: emailKeys } }] : []),
              ...(phoneKeys.length ? [{ phoneKey: { in: phoneKeys } }] : []),
            ],
          },
          select: { id: true, emailKey: true, phoneKey: true },
        })
      : [];

  const byKey = new Map<string, string>();

  for (const contact of existing) {
    if (contact.emailKey) byKey.set(contact.emailKey, contact.id);
    if (contact.phoneKey) byKey.set(contact.phoneKey, contact.id);
  }

  const toCreate = new Map<
    string,
    { id: string; name: string; businessName: string; email: string | null; phone: string | null }
  >();

  rows.forEach((row, index) => {
    const key = keys[index]!;

    if (byKey.has(key) || toCreate.has(key)) return;

    toCreate.set(key, {
      id: idFor(key),
      name: row.contactName,
      businessName: row.businessName,
      email: emailKeyOf(row.email),
      phone: row.phone,
    });
  });

  if (toCreate.size) {
    await prisma.contact.createMany({
      data: [...toCreate.values()].map((contact) => ({
        id: contact.id,
        name: contact.name,
        businessName: contact.businessName,
        email: contact.email,
        phone: contact.phone,
        emailKey: emailKeyOf(contact.email),
        phoneKey: phoneKeyOf(contact.phone),
        companyKey: companyKeyOf(contact.businessName),
        ownerId,
        createdById: actorId,
      })),
      skipDuplicates: true,
    });

    for (const [key, contact] of toCreate) byKey.set(key, contact.id);
  }

  return new Map(rows.map((_, index) => [index, byKey.get(keys[index]!)!]));
}

/**
 * Editing who the contact is.
 *
 * Goes through writeContactIdentity so every opportunity against them follows.
 * Nothing else in the codebase may write these four columns on a Lead.
 */
export async function updateContactIdentity(input: {
  actor: AuthContext;
  contactId: string;
  data: { name?: string; businessName?: string; email?: string | null; phone?: string | null };
}): Promise<{ ok: true; contactId: string } | ContactFailure> {
  const { actor } = input;

  if (!can(actor, "leads.edit")) {
    return failure("FORBIDDEN", "You do not have permission to edit contacts.");
  }

  const existing = await prisma.contact.findFirst({
    where: { id: input.contactId, deletedAt: null },
    select: { id: true, name: true, businessName: true, email: true, phone: true },
  });

  if (!existing) return failure("NOT_FOUND", "That contact could not be found.");

  const name = (input.data.name ?? existing.name).trim();
  const businessName = (input.data.businessName ?? existing.businessName).trim();

  if (!name || !businessName) {
    return failure("INVALID", "A contact needs a name and a business name.");
  }

  const email =
    input.data.email === undefined ? existing.email : emailKeyOf(input.data.email);
  const phone =
    input.data.phone === undefined ? existing.phone : input.data.phone?.trim() || null;

  if (!email && !phone) {
    return failure("INVALID", "Keep at least an email address or a phone number.");
  }

  await prisma.$transaction((tx) =>
    writeContactIdentity(tx, existing.id, { name, businessName, email, phone }),
  );

  await logActivity({
    actorId: actor.id,
    action: `Updated contact ${name}`,
    entityType: "LEAD",
    entityId: existing.id,
    metadataJson: { contactId: existing.id },
  });

  return { ok: true, contactId: existing.id };
}
