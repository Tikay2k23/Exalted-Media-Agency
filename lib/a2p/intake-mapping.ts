import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { A2P_SECTION } from "@/lib/intake/question-catalogue";

/**
 * Carrying a submitted intake into the A2P registration profile.
 *
 * Only the client-submitted side is written. The reviewed fields - the legal
 * name somebody corrected, the campaign description rewritten into the shape a
 * carrier expects - are the agency's work and are never overwritten by a later
 * submission. So a client who resends their form updates what they said, and
 * loses none of what anybody did about it.
 *
 * The same rule applies to everything else here: a field is only filled in if
 * it is currently empty. A resubmission adds what was missing rather than
 * reverting corrections, and anything genuinely changed shows up as a
 * difference between the client value and the reviewed one - which is the
 * conversation a reviewer should be having rather than a silent overwrite.
 */

type Answers = Record<string, string>;

const text = (answers: Answers, key: string) => {
  const value = answers[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

/** "yes" / "no" from the form; anything else is genuinely unanswered. */
const bool = (answers: Answers, key: string): boolean | null => {
  const value = answers[key];

  if (value === "yes") return true;
  if (value === "no") return false;

  return null;
};

/**
 * The values a given question actually offers.
 *
 * Read from the catalogue rather than repeated, so the allow-list cannot drift
 * from the options the client was shown.
 */
function optionsFor(questionId: string): Set<string> {
  const question = A2P_SECTION.questions.find((candidate) => candidate.id === questionId);

  return new Set((question?.options ?? []).map((option) => option.value));
}

/**
 * A multi-select arrives as comma-joined values.
 *
 * Filtered against what the question offers. These land in enum columns, and an
 * answer stored before a question changed - or edited by hand - would otherwise
 * take the whole submission down with it. Dropping an unrecognised value keeps
 * the rest of a client's form.
 */
const list = (answers: Answers, key: string): string[] => {
  const value = answers[key];

  if (typeof value !== "string") return [];

  const allowed = optionsFor(key);

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && allowed.has(entry));
};

/** A single choice, checked the same way. */
const choice = (answers: Answers, key: string): string | null => {
  const value = answers[key]?.trim();

  return value && optionsFor(key).has(value) ? value : null;
};

/** Which intake answer feeds which profile column. */
const FIELD_MAP: { answer: string; field: string; kind: "text" | "bool" }[] = [
  /*
   * Answers that come from the general section rather than the A2P one.
   *
   * Every client is already asked for their address, the phone number and email
   * customers should use, and their website, so the A2P section does not ask
   * again. Without these the readiness checklist reported things as missing that
   * the client had answered in the same submission, and somebody retyped them
   * into the profile by hand.
   *
   * The address arrives in parts, matching the columns it lands in, so nothing
   * has to be split by hand or guessed at afterwards.
   */
  { answer: "address", field: "addressLine1", kind: "text" },
  { answer: "addressLine2", field: "addressLine2", kind: "text" },
  { answer: "city", field: "city", kind: "text" },
  { answer: "stateRegion", field: "stateRegion", kind: "text" },
  { answer: "postalCode", field: "postalCode", kind: "text" },
  { answer: "country", field: "country", kind: "text" },
  { answer: "publicPhone", field: "businessPhone", kind: "text" },
  { answer: "publicEmail", field: "businessEmail", kind: "text" },
  { answer: "website", field: "websiteUrl", kind: "text" },

  { answer: "a2pLegalName", field: "legalName", kind: "text" },
  { answer: "a2pCountryOfRegistration", field: "countryOfRegistration", kind: "text" },
  { answer: "a2pTaxId", field: "taxId", kind: "text" },
  { answer: "a2pRepName", field: "representativeName", kind: "text" },
  { answer: "a2pRepTitle", field: "representativeTitle", kind: "text" },
  { answer: "a2pRepEmail", field: "representativeEmail", kind: "text" },
  { answer: "a2pRepPhone", field: "representativePhone", kind: "text" },
  { answer: "a2pConsentLanguage", field: "consentLanguage", kind: "text" },
  { answer: "a2pOptInPageUrl", field: "optInPageUrl", kind: "text" },
  { answer: "a2pPrivacyPolicyUrl", field: "privacyPolicyUrl", kind: "text" },
  { answer: "a2pTermsUrl", field: "termsUrl", kind: "text" },
  { answer: "a2pMonthlyVolume", field: "monthlyVolume", kind: "text" },
  { answer: "a2pExistingNumber", field: "existingPhoneNumber", kind: "text" },
  { answer: "a2pRepliesHandledBy", field: "repliesHandledBy", kind: "text" },
  { answer: "a2pBusinessHours", field: "businessHours", kind: "text" },
  { answer: "a2pCheckboxOptional", field: "checkboxIsOptional", kind: "bool" },
  { answer: "a2pCheckboxUnticked", field: "checkboxUncheckedByDefault", kind: "bool" },
  { answer: "a2pMessagesContainLinks", field: "messagesContainLinks", kind: "bool" },
];

/** One answer a client has given that disagrees with what the profile holds. */
export interface PendingChange {
  value: string;
  recordedAt: string;
}

export type PendingChanges = Record<string, PendingChange>;

/**
 * The stored map, defended against anything that is not one.
 *
 * It is a JSON column, so it can hold whatever was written into it before the
 * shape settled. A malformed entry is dropped rather than taken on trust.
 */
export function readPendingChanges(raw: unknown): PendingChanges {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: PendingChanges = {};

  for (const [field, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (
      entry
      && typeof entry === "object"
      && typeof (entry as PendingChange).value === "string"
    ) {
      out[field] = entry as PendingChange;
    }
  }

  return out;
}

export interface MappingResult {
  created: boolean;
  fieldsFilled: string[];
  samplesAdded: number;
  /** Fields the client answered differently from what is held. */
  diverged: string[];
}

/**
 * Applies a submitted intake to the client's A2P profile.
 *
 * Runs inside the caller's transaction so a submission either lands whole or
 * not at all - a profile half-populated by a failed submit would be worse than
 * one that was never touched.
 */
export async function applyIntakeToA2P(
  tx: Prisma.TransactionClient | PrismaClient,
  clientId: string,
  answers: Answers,
): Promise<MappingResult> {
  const existing = await tx.a2PProfile.findUnique({
    where: { clientId },
    include: { samples: { select: { id: true, category: true } } },
  });

  const profile =
    existing
    ?? (await tx.a2PProfile.create({
      data: { clientId },
      include: { samples: { select: { id: true, category: true } } },
    }));

  const data: Record<string, unknown> = {};
  const filled: string[] = [];

  /*
   * What the client has said that disagrees with what is held.
   *
   * Carried forward from any earlier resubmission, so a difference nobody has
   * ruled on yet is not lost by a later submission that happens to agree.
   */
  const previous = readPendingChanges(profile.pendingClientChanges);
  const pending: PendingChanges = { ...previous };
  const diverged: string[] = [];
  const recordedAt = new Date().toISOString();

  /** One field, and the three things a resubmitted answer can mean. */
  const consider = (field: string, current: unknown, value: string | boolean | null) => {
    if (value === null) {
      /*
       * Blank now, answered before. Not treated as a correction: a client
       * skipping a question they once answered is not asking for it to be
       * removed from a registration.
       */
      return;
    }

    if (current === null || current === undefined) {
      data[field] = value;
      filled.push(field);
      delete pending[field];
      return;
    }

    if (String(current) === String(value)) {
      // They agree, so anything raised earlier has been settled.
      delete pending[field];
      return;
    }

    /*
     * Different, with something already recorded. Still not overwritten - the
     * held value may be a correction somebody made on purpose, and this may be
     * a client fixing a genuine mistake. The two are indistinguishable from
     * here, so it goes in front of a reviewer instead of being guessed at.
     */
    pending[field] = { value: String(value), recordedAt };
    diverged.push(field);
  };

  for (const entry of FIELD_MAP) {
    consider(
      entry.field,
      (profile as unknown as Record<string, unknown>)[entry.field],
      entry.kind === "bool" ? bool(answers, entry.answer) : text(answers, entry.answer),
    );
  }

  consider("entityType", profile.entityType, choice(answers, "a2pEntityType"));

  const useCases = list(answers, "a2pUseCases");
  const optInMethods = list(answers, "a2pOptInMethods");

  if (useCases.length > 0 && profile.useCases.length === 0) {
    data.useCases = useCases;
    filled.push("useCases");
  }

  if (optInMethods.length > 0 && profile.optInMethods.length === 0) {
    data.optInMethods = optInMethods;
    filled.push("optInMethods");
  }

  /*
   * The client's own description always lands, even on a resubmission: it is
   * the record of what they said this time. The reviewed version beside it is
   * untouched, so a rewrite survives.
   */
  const description = text(answers, "a2pCampaignDescription");

  if (description && description !== profile.clientCampaignDescription) {
    data.clientCampaignDescription = description;
    filled.push("clientCampaignDescription");
  }

  /*
   * Written with the rest, so what was filled and what is queued for review
   * land together. DbNull rather than undefined when it empties: undefined
   * leaves a JSON column alone, which would keep a difference on screen after
   * it stopped existing.
   */
  if (JSON.stringify(pending) !== JSON.stringify(previous)) {
    data.pendingClientChanges =
      Object.keys(pending).length > 0 ? pending : Prisma.DbNull;
  }

  if (Object.keys(data).length > 0) {
    await tx.a2PProfile.update({ where: { id: profile.id }, data });
  }

  /*
   * Sample messages are added only where that category is still empty, so a
   * message somebody edited during review is not replaced by the original.
   */
  const haveCategory = new Set(profile.samples.map((sample) => sample.category));
  let samplesAdded = 0;

  const candidates: {
    answer: string;
    category: "TRANSACTIONAL" | "LEAD_FOLLOW_UP" | "MARKETING";
  }[] = [
    { answer: "a2pSampleTransactional", category: "TRANSACTIONAL" },
    { answer: "a2pSampleLeadFollowUp", category: "LEAD_FOLLOW_UP" },
    { answer: "a2pSampleMarketing", category: "MARKETING" },
  ];

  for (const candidate of candidates) {
    if (haveCategory.has(candidate.category)) continue;

    const body = text(answers, candidate.answer);

    if (!body) continue;

    await tx.a2PSampleMessage.create({
      data: {
        profileId: profile.id,
        category: candidate.category,
        body,
        position: samplesAdded,
      },
    });
    samplesAdded += 1;
  }

  return { created: !existing, fieldsFilled: filled, samplesAdded, diverged };
}
