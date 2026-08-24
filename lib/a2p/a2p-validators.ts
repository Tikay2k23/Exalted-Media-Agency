import { z } from "zod";

/**
 * What may be written to an A2P profile.
 *
 * Every field is optional and the route spreads only what arrived, so a form
 * that edits one section cannot blank another. That is the read-modify-write
 * shape - the opposite of the whole-record submit that used to revert a moved
 * stage on the client record.
 */

const text = (max: number) => z.string().trim().max(max).optional();
const flag = z.boolean().nullable().optional();

export const a2pProfileSchema = z.object({
  // business identity
  legalName: text(200),
  dbaName: text(200),
  entityType: z
    .enum([
      "SOLE_PROPRIETOR",
      "LLC",
      "CORPORATION",
      "PARTNERSHIP",
      "NONPROFIT",
      "GOVERNMENT",
      "OTHER",
    ])
    .nullable()
    .optional(),
  countryOfRegistration: text(80),
  taxId: text(40),
  addressLine1: text(160),
  addressLine2: text(160),
  city: text(80),
  stateRegion: text(80),
  postalCode: text(24),
  country: text(80),
  businessPhone: text(40),
  businessEmail: z.string().trim().email().max(160).or(z.literal("")).optional(),
  websiteUrl: text(300),
  socialUrls: z.array(z.string().trim().max(300)).max(10).optional(),

  // authorised representative
  representativeContactId: z.string().cuid().nullable().optional(),
  representativeName: text(160),
  representativeTitle: text(120),
  representativeEmail: z.string().trim().email().max(160).or(z.literal("")).optional(),
  representativePhone: text(40),
  representativeRelation: text(120),
  /**
   * A confirmation rather than a value: the request says whether somebody has
   * confirmed, and the route stamps the time. A client cannot backdate it.
   */
  authorisationConfirmed: z.boolean().optional(),

  // campaign
  useCases: z
    .array(
      z.enum([
        "APPOINTMENT_CONFIRMATION",
        "APPOINTMENT_REMINDER",
        "LEAD_FOLLOW_UP",
        "QUOTE_FOLLOW_UP",
        "CUSTOMER_SUPPORT",
        "SERVICE_NOTIFICATION",
        "ORDER_STATUS",
        "ACCOUNT_NOTIFICATION",
        "MARKETING_PROMOTION",
        "REACTIVATION",
        "TWO_FACTOR",
        "MISSED_CALL_TEXT_BACK",
        "OTHER",
      ]),
    )
    .max(13)
    .optional(),
  useCaseOther: text(200),
  internalUseCase: text(120),
  clientCampaignDescription: text(2000),
  reviewedCampaignDescription: text(2000),

  // consent
  optInMethods: z
    .array(
      z.enum([
        "WEBSITE_FORM",
        "CONTACT_FORM",
        "LANDING_PAGE",
        "BOOKING_FORM",
        "CHECKOUT",
        "PAPER_FORM",
        "IN_PERSON",
        "VERBAL",
        "TEXT_TO_JOIN",
        "EXISTING_CUSTOMER",
        "OTHER",
      ]),
    )
    .max(11)
    .optional(),
  optInMethodOther: text(200),
  optInPageUrl: text(300),
  optInFormUrl: text(300),
  optInCheckboxText: text(1000),
  consentLanguage: text(1000),
  checkboxIsOptional: flag,
  checkboxUncheckedByDefault: flag,
  privacyPolicyUrl: text(300),
  termsUrl: text(300),
  smsTermsUrl: text(300),

  // keywords
  optInKeywords: text(200),
  optOutKeywords: text(200),
  helpKeywords: text(200),
  optInConfirmation: text(500),
  optOutConfirmation: text(500),
  helpResponse: text(500),

  // message content
  messagesContainLinks: flag,
  linkDomains: text(300),
  messagesContainPhoneNumbers: flag,

  // expected usage
  monthlyVolume: text(40),
  monthlyLeads: text(40),
  trafficMix: text(120),
  isTwoWay: flag,
  businessHours: text(200),
  repliesHandledBy: text(200),
  needsMissedCallTextBack: flag,
  needsAppointmentReminders: flag,
  needsLeadNurture: flag,
  needsReactivation: flag,

  // phone setup
  existingPhoneNumber: text(40),
  keepExistingNumber: flag,
  needsNewNumber: flag,
  preferredAreaCode: text(10),
  forwardingNumber: text(40),
  inboundCallRecipient: text(160),
  voicemailRequired: flag,
  smsInboxUsers: text(300),
  primarySmsResponder: text(160),
  afterHoursBehaviour: text(300),

  // internal review
  identityReview: z
    .enum(["NOT_REVIEWED", "NEEDS_CHANGES", "READY_FOR_REVIEW", "APPROVED_INTERNALLY"])
    .optional(),
  consentReview: z
    .enum(["NOT_REVIEWED", "NEEDS_CHANGES", "READY_FOR_REVIEW", "APPROVED_INTERNALLY"])
    .optional(),
  campaignReview: z
    .enum(["NOT_REVIEWED", "NEEDS_CHANGES", "READY_FOR_REVIEW", "APPROVED_INTERNALLY"])
    .optional(),
  internalNotes: text(4000),
});

/**
 * The sample messages, replaced as a list.
 *
 * Same shape as the strategy goals and safe for the same reason: the editor
 * shows every message at once, so nothing is written back that the person
 * could not see.
 */
export const a2pSamplesSchema = z.object({
  samples: z
    .array(
      z.object({
        id: z.string().cuid().nullable(),
        category: z.enum(["TRANSACTIONAL", "LEAD_FOLLOW_UP", "MARKETING", "OTHER"]),
        body: z.string().trim().min(5).max(1000),
        reviewNote: text(500),
      }),
    )
    .max(10),
});

/**
 * A status change.
 *
 * The states a provider owns need a submission record to go with them, because
 * "submitted" with nothing recorded is a claim nobody can check later.
 */
export const a2pStatusSchema = z.object({
  status: z.enum([
    "NOT_REQUIRED",
    "INFORMATION_NEEDED",
    "UNDER_INTERNAL_REVIEW",
    "NEEDS_CLIENT_CHANGES",
    "READY_TO_SUBMIT",
    "SUBMITTED",
    "IN_REVIEW",
    "APPROVED",
    "REJECTED",
    "NEEDS_RESUBMISSION",
  ]),
  note: text(1000),
  submission: z
    .object({
      provider: z.string().trim().min(2).max(80),
      brandId: text(120),
      campaignId: text(120),
      providerStatus: text(80),
      response: text(2000),
      rejectedReason: text(2000),
    })
    .optional(),
});
