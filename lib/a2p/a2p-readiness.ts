import type { ServiceType } from "@prisma/client";

/**
 * How ready an A2P registration is to be prepared for submission.
 *
 * One thing this file will not do is imply an outcome. Readiness counts the
 * information the agency has collected; whether a carrier accepts a
 * registration is a separate event that happens later and can be no. So a full
 * score reads "ready for internal submission review" and never "approved",
 * "compliant" or anything else that sounds like a promise somebody else has to
 * keep.
 *
 * The second rule is that conditional items only count when they apply. A
 * business that will never send marketing SMS should not be marked down for
 * having no marketing sample, and a business whose customers opt in on paper
 * should not be marked down for having no website consent checkbox.
 */

export type A2PSectionKey =
  | "BUSINESS_IDENTITY"
  | "REPRESENTATIVE"
  | "CAMPAIGN"
  | "CONSENT"
  | "WEBSITE_POLICIES"
  | "SAMPLE_MESSAGES"
  | "PHONE_SETUP"
  | "DOCUMENTS";

export const A2P_SECTION_LABELS: Record<A2PSectionKey, string> = {
  BUSINESS_IDENTITY: "Business identity",
  REPRESENTATIVE: "Authorised representative",
  CAMPAIGN: "Campaign information",
  CONSENT: "Consent & opt-in",
  WEBSITE_POLICIES: "Website & policies",
  SAMPLE_MESSAGES: "Sample messages",
  PHONE_SETUP: "Phone setup",
  DOCUMENTS: "Supporting documents",
};

/**
 * Whether the intake form should ask about text messaging at all.
 *
 * Every client, including ones added from now on. This used to be decided by
 * service type - CRM, email marketing and retainers - which covered four
 * accounts of twelve and missed the obvious cases: a roofer on paid ads who
 * wants missed-call text back, a dental practice sending appointment
 * reminders. Which of ten labels sits on a record turned out to be a poor
 * proxy for whether a business will ever text a customer.
 *
 * So everybody is asked one question, and their answer decides the rest. The
 * argument is kept so the decision has somewhere to live if it ever needs
 * narrowing again.
 */
export function a2pApplies(services: ServiceType[]) {
  // Every service, for now. The parameter stays so the decision has a
  // home if it ever needs narrowing again.
  return services.length >= 0;
}

/**
 * Whether the client said they want text messaging.
 *
 * The gate question on the intake form, and the only thing that opens the
 * twenty questions behind it. A client who has not answered yet has not said
 * yes, so nothing appears until they do.
 */
export function a2pRequested(answers: Record<string, unknown> | null | undefined) {
  return answers?.a2pWantsSms === "yes";
}

/**
 * Whether the agency should be looking at an A2P registration for this client.
 *
 * The client asking for it, or a profile that already exists - somebody may
 * have started one before the form came back, and it should not vanish because
 * the answer is still blank.
 */
export function a2pInPlay(
  answers: Record<string, unknown> | null | undefined,
  hasProfile: boolean,
) {
  return a2pRequested(answers) || hasProfile;
}

/** The shape the readiness calculation reads. Everything is optional. */
export interface A2PProfileShape {
  legalName?: string | null;
  entityType?: string | null;
  countryOfRegistration?: string | null;
  taxId?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  websiteUrl?: string | null;

  representativeName?: string | null;
  representativeEmail?: string | null;
  representativePhone?: string | null;
  authorisationConfirmedAt?: Date | string | null;

  useCases?: string[];
  clientCampaignDescription?: string | null;
  reviewedCampaignDescription?: string | null;

  optInMethods?: string[];
  consentLanguage?: string | null;
  checkboxIsOptional?: boolean | null;
  checkboxUncheckedByDefault?: boolean | null;
  optInPageUrl?: string | null;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;

  messagesContainLinks?: boolean | null;
  monthlyVolume?: string | null;
  businessHours?: string | null;
  repliesHandledBy?: string | null;
  primarySmsResponder?: string | null;

  samples?: { category: string; body: string }[];
  /** Asset types already received for this client. */
  documents?: string[];
}

export interface ReadinessItem {
  section: A2PSectionKey;
  label: string;
  complete: boolean;
}

export interface A2PReadiness {
  /** 0-100 over applicable items only. */
  percent: number;
  complete: number;
  total: number;
  /** What is still outstanding, in the order the profile asks for it. */
  missing: ReadinessItem[];
  bySection: {
    section: A2PSectionKey;
    label: string;
    complete: number;
    total: number;
  }[];
  /**
   * Deliberately not "approved" or "compliant". Full means the agency has what
   * it needs to prepare a submission - a carrier has still said nothing.
   */
  headline: string;
}

const filled = (value: unknown) =>
  typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;

/**
 * The applicable checklist for one profile.
 *
 * Built rather than declared, because which items apply depends on the answers:
 * website consent fields only matter if somebody opts in on a website, and a
 * marketing sample only matters if the client says they will send marketing.
 */
export function a2pChecklist(profile: A2PProfileShape): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const add = (section: A2PSectionKey, label: string, complete: boolean) =>
    items.push({ section, label, complete });

  const useCases = profile.useCases ?? [];
  const optInMethods = profile.optInMethods ?? [];
  const samples = profile.samples ?? [];
  const documents = profile.documents ?? [];

  // Business identity
  add("BUSINESS_IDENTITY", "Legal business name", filled(profile.legalName));
  add("BUSINESS_IDENTITY", "Entity type", filled(profile.entityType));
  add("BUSINESS_IDENTITY", "Country of registration", filled(profile.countryOfRegistration));
  add("BUSINESS_IDENTITY", "Tax ID or registration number", filled(profile.taxId));
  add(
    "BUSINESS_IDENTITY",
    "Business address",
    filled(profile.addressLine1) && filled(profile.city) && filled(profile.postalCode),
  );
  add("BUSINESS_IDENTITY", "Business phone", filled(profile.businessPhone));
  add("BUSINESS_IDENTITY", "Business email", filled(profile.businessEmail));
  add("BUSINESS_IDENTITY", "Website", filled(profile.websiteUrl));

  // Authorised representative
  add("REPRESENTATIVE", "Representative name", filled(profile.representativeName));
  add("REPRESENTATIVE", "Representative email", filled(profile.representativeEmail));
  add("REPRESENTATIVE", "Representative phone", filled(profile.representativePhone));
  add(
    "REPRESENTATIVE",
    "Authorisation confirmed",
    filled(profile.authorisationConfirmedAt),
  );

  // Campaign
  add("CAMPAIGN", "What the messages are for", useCases.length > 0);
  add(
    "CAMPAIGN",
    "Campaign description from the client",
    filled(profile.clientCampaignDescription),
  );
  add(
    "CAMPAIGN",
    "Reviewed campaign description",
    filled(profile.reviewedCampaignDescription),
  );
  add("CAMPAIGN", "Expected monthly volume", filled(profile.monthlyVolume));
  add("CAMPAIGN", "Whether messages contain links", profile.messagesContainLinks !== null && profile.messagesContainLinks !== undefined);

  // Consent
  add("CONSENT", "How customers opt in", optInMethods.length > 0);
  add("CONSENT", "The consent wording shown to customers", filled(profile.consentLanguage));

  /*
   * Only asked of clients whose customers opt in through something on the web.
   * A business collecting consent on paper has no checkbox to describe, and
   * counting one against them would hold their readiness below full forever.
   */
  const webOptIn = optInMethods.some((method) =>
    ["WEBSITE_FORM", "CONTACT_FORM", "LANDING_PAGE", "BOOKING_FORM", "CHECKOUT"].includes(
      method,
    ),
  );

  if (webOptIn) {
    add("WEBSITE_POLICIES", "Opt-in page URL", filled(profile.optInPageUrl));
    add(
      "WEBSITE_POLICIES",
      "Consent checkbox is optional",
      profile.checkboxIsOptional === true,
    );
    add(
      "WEBSITE_POLICIES",
      "Consent checkbox is unticked by default",
      profile.checkboxUncheckedByDefault === true,
    );
    add(
      "WEBSITE_POLICIES",
      "Opt-in screenshot",
      documents.includes("OPT_IN_SCREENSHOT"),
    );
  }

  add("WEBSITE_POLICIES", "Privacy policy URL", filled(profile.privacyPolicyUrl));
  add("WEBSITE_POLICIES", "Terms URL", filled(profile.termsUrl));

  // Sample messages
  const hasSample = (category: string) =>
    samples.some((sample) => sample.category === category && sample.body.trim().length > 0);

  add("SAMPLE_MESSAGES", "A transactional example", hasSample("TRANSACTIONAL"));

  if (useCases.includes("LEAD_FOLLOW_UP") || useCases.includes("QUOTE_FOLLOW_UP")) {
    add("SAMPLE_MESSAGES", "A lead follow-up example", hasSample("LEAD_FOLLOW_UP"));
  }

  // Only when they actually intend to send marketing.
  if (useCases.includes("MARKETING_PROMOTION") || useCases.includes("REACTIVATION")) {
    add("SAMPLE_MESSAGES", "A marketing example", hasSample("MARKETING"));
  }

  // Phone setup
  add("PHONE_SETUP", "Who answers replies", filled(profile.repliesHandledBy) || filled(profile.primarySmsResponder));
  add("PHONE_SETUP", "Business hours", filled(profile.businessHours));

  // Documents
  add(
    "DOCUMENTS",
    "Business registration or EIN document",
    documents.includes("BUSINESS_REGISTRATION") || documents.includes("EIN_CONFIRMATION"),
  );

  return items;
}

export function a2pReadiness(profile: A2PProfileShape): A2PReadiness {
  const items = a2pChecklist(profile);
  const complete = items.filter((item) => item.complete).length;
  const total = items.length;
  const percent = total === 0 ? 0 : Math.round((complete / total) * 100);

  const order: A2PSectionKey[] = [
    "BUSINESS_IDENTITY",
    "REPRESENTATIVE",
    "CAMPAIGN",
    "CONSENT",
    "WEBSITE_POLICIES",
    "SAMPLE_MESSAGES",
    "PHONE_SETUP",
    "DOCUMENTS",
  ];

  const bySection = order
    .map((section) => {
      const inSection = items.filter((item) => item.section === section);

      return {
        section,
        label: A2P_SECTION_LABELS[section],
        complete: inSection.filter((item) => item.complete).length,
        total: inSection.length,
      };
    })
    .filter((section) => section.total > 0);

  return {
    percent,
    complete,
    total,
    missing: items.filter((item) => !item.complete),
    bySection,
    headline:
      percent === 100
        ? "Ready for internal submission review"
        : percent >= 70
          ? "Nearly there"
          : "Information still needed",
  };
}

/**
 * Warnings a reviewer should look at before submitting.
 *
 * Flags, not verdicts. Each one is a thing worth a human glance - none of them
 * means a registration will be refused, and a clean list does not mean it will
 * be accepted.
 */
export function sampleMessageWarnings(
  profile: A2PProfileShape,
): { sample: string; warning: string }[] {
  const warnings: { sample: string; warning: string }[] = [];
  const brand = (profile.legalName ?? "").trim().toLowerCase();
  const useCases = profile.useCases ?? [];
  const marketing = useCases.includes("MARKETING_PROMOTION") || useCases.includes("REACTIVATION");

  for (const sample of profile.samples ?? []) {
    const body = sample.body.trim();

    if (body.length === 0) continue;

    const preview = body.length > 40 ? `${body.slice(0, 37)}...` : body;

    if (brand.length > 2 && !body.toLowerCase().includes(brand.split(" ")[0])) {
      warnings.push({
        sample: preview,
        warning: "The business name does not appear in this message",
      });
    }

    if (marketing && sample.category === "MARKETING" && !/stop/i.test(body)) {
      warnings.push({
        sample: preview,
        warning: "A marketing message usually carries opt-out wording",
      });
    }

    if (body.length > 320) {
      warnings.push({ sample: preview, warning: "This is longer than two segments" });
    }
  }

  return warnings;
}

/**
 * What the status should be, given how complete the profile is.
 *
 * Only ever suggests the internal states. Anything from SUBMITTED onwards
 * describes what a provider is doing and is set by whoever submits and by what
 * comes back - never inferred from a checklist.
 */
export function suggestedStatus(
  readiness: A2PReadiness,
  current: string,
): string {
  const externallyOwned = [
    "SUBMITTED",
    "IN_REVIEW",
    "APPROVED",
    "REJECTED",
    "NEEDS_RESUBMISSION",
    "NOT_REQUIRED",
  ];

  if (externallyOwned.includes(current)) return current;

  if (readiness.percent === 100) return "READY_TO_SUBMIT";
  if (readiness.percent >= 70) return "UNDER_INTERNAL_REVIEW";

  return "INFORMATION_NEEDED";
}
