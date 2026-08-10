import type { ServiceType, TeamRole } from "@prisma/client";

import { specialistsForService } from "@/lib/workflow/service-blueprints";

/**
 * The questions the intake form asks.
 *
 * Two rules shape this list.
 *
 * Nobody is asked something that does not apply to them. A client who bought a
 * website should never be asked for their Meta Business Manager, and a form
 * that asks forty irrelevant questions is one that comes back half finished -
 * which is how intake stalls and the whole journey stalls behind it.
 *
 * Nobody is asked for a password. The questions here ask where an account
 * lives and who administers it, never how to get into it. Access is granted by
 * invitation through the access tracker, which has no password field and must
 * never gain one. The submit endpoint enforces this with the same credential
 * guard the tracker uses.
 */

export type QuestionKind = "short" | "long" | "email" | "phone" | "url" | "money";

export interface IntakeQuestion {
  id: string;
  label: string;
  kind: QuestionKind;
  help?: string;
  required?: boolean;
}

export interface IntakeSection {
  id: string;
  title: string;
  description: string;
  questions: IntakeQuestion[];
  /** Absent means everybody sees it. */
  onlyForSeat?: TeamRole;
}

/** Asked of every client, whatever they bought. */
const GENERAL: IntakeSection[] = [
  {
    id: "business",
    title: "Your business",
    description: "The basics we need on everything we produce for you.",
    questions: [
      { id: "legalName", label: "Legal business name", kind: "short", required: true },
      { id: "address", label: "Business address", kind: "long", required: true },
      { id: "publicPhone", label: "Phone number customers should use", kind: "phone", required: true },
      { id: "publicEmail", label: "Email customers should use", kind: "email", required: true },
      { id: "website", label: "Current website", kind: "url" },
      { id: "hours", label: "Opening hours", kind: "long", required: true },
      { id: "serviceArea", label: "Where do you serve?", kind: "long", required: true },
    ],
  },
  {
    id: "brand",
    title: "Your brand",
    description: "Send files separately - here just tell us what exists.",
    questions: [
      { id: "logoLocation", label: "Where is your logo?", kind: "short", help: "A link, or tell us you will email it." },
      { id: "colours", label: "Brand colours", kind: "short" },
      { id: "fonts", label: "Brand fonts", kind: "short" },
      { id: "photos", label: "Do you have photos we can use?", kind: "long" },
      { id: "brandGuidelines", label: "Any brand guidelines?", kind: "short" },
    ],
  },
  {
    id: "offer",
    title: "What you sell",
    description: "This is what everything we write will be about.",
    questions: [
      { id: "services", label: "What do you sell?", kind: "long", required: true },
      { id: "pricing", label: "Roughly what does it cost?", kind: "long" },
      { id: "mainOffer", label: "Your main offer right now", kind: "long", required: true },
      { id: "differentiator", label: "Why do customers pick you over the alternative?", kind: "long", required: true },
      { id: "promotions", label: "Any current promotions?", kind: "long" },
    ],
  },
  {
    id: "customers",
    title: "Your customers",
    description: "Who we are talking to.",
    questions: [
      { id: "audience", label: "Who is your ideal customer?", kind: "long", required: true },
      { id: "problems", label: "What problem are they trying to solve?", kind: "long", required: true },
      { id: "objections", label: "What makes them hesitate?", kind: "long" },
      { id: "desiredAction", label: "What should they do - call, book, buy?", kind: "short", required: true },
    ],
  },
  {
    id: "sales",
    title: "What happens when a lead comes in",
    description: "So leads do not arrive somewhere nobody is looking.",
    questions: [
      { id: "respondent", label: "Who responds to new enquiries?", kind: "short", required: true },
      { id: "responseTime", label: "How quickly, realistically?", kind: "short", required: true },
      { id: "salesProcess", label: "What happens after that?", kind: "long" },
      { id: "currentCrm", label: "What do you use to track them today?", kind: "short" },
    ],
  },
];

/**
 * Extra sections, shown only when the client bought something that needs them.
 *
 * Keyed by the specialist seat rather than by service, so a new service that
 * uses an existing seat inherits the right questions without another map.
 */
const BY_SEAT: Record<TeamRole, IntakeSection | null> = {
  AUTOMATION_SPECIALIST: {
    id: "crm",
    title: "Your CRM and automation",
    description: "Where things live today, so we build on it rather than beside it.",
    onlyForSeat: "AUTOMATION_SPECIALIST",
    questions: [
      { id: "crmName", label: "What CRM do you use now?", kind: "short" },
      { id: "crmPipelines", label: "What stages does a lead go through?", kind: "long" },
      { id: "crmUsers", label: "Who needs a login?", kind: "long" },
      { id: "crmCalendars", label: "What needs to be bookable?", kind: "long" },
      { id: "leadSources", label: "Where do leads come from today?", kind: "long" },
      { id: "contactList", label: "Do you have a contact list to import?", kind: "long" },
      { id: "integrations", label: "Anything that must connect to it?", kind: "long" },
    ],
  },
  CREATIVE_SPECIALIST: {
    id: "website",
    title: "Your website and pages",
    description: "What exists, what you want, and who controls the domain.",
    onlyForSeat: "CREATIVE_SPECIALIST",
    questions: [
      { id: "domain", label: "What domain will this use?", kind: "short" },
      { id: "domainRegistrar", label: "Who controls the domain?", kind: "short", help: "The company, not the password." },
      { id: "hosting", label: "Where is the current site hosted?", kind: "short" },
      { id: "pagesNeeded", label: "What pages do you need?", kind: "long" },
      { id: "designReferences", label: "Any sites you like the look of?", kind: "long" },
      { id: "existingCopy", label: "Do you have copy already written?", kind: "long" },
      { id: "formsNeeded", label: "What should the forms collect?", kind: "long" },
    ],
  },
  ADS_SPECIALIST: {
    id: "advertising",
    title: "Your advertising",
    description: "Which accounts exist. We will ask to be invited, never for a password.",
    onlyForSeat: "ADS_SPECIALIST",
    questions: [
      { id: "metaBusinessManager", label: "Do you have a Meta Business Manager?", kind: "short" },
      { id: "metaAdAccount", label: "Meta ad account name or ID", kind: "short" },
      { id: "facebookPage", label: "Facebook page", kind: "url" },
      { id: "instagram", label: "Instagram account", kind: "short" },
      { id: "googleAds", label: "Google Ads account ID", kind: "short" },
      { id: "analytics", label: "Do you have Google Analytics?", kind: "short" },
      { id: "monthlyBudget", label: "Monthly advertising budget", kind: "money", required: true },
      { id: "targetLocations", label: "Where should ads run?", kind: "long", required: true },
      { id: "pastCampaigns", label: "What have you tried before?", kind: "long" },
    ],
  },
  // Seats that never ask the client anything directly.
  PROJECT_MANAGER: null,
  SALES_REP: null,
  AGENCY_OWNER: null,
};

/** The sections this client should actually see. */
export function sectionsForService(service: ServiceType): IntakeSection[] {
  const extra = specialistsForService(service)
    .map((seat) => BY_SEAT[seat])
    .filter((section): section is IntakeSection => section !== null);

  return [...GENERAL, ...extra];
}

export function questionsForService(service: ServiceType): IntakeQuestion[] {
  return sectionsForService(service).flatMap((section) => section.questions);
}

export interface IntakeProgress {
  answered: number;
  total: number;
  percent: number;
  missingRequired: string[];
  complete: boolean;
}

/**
 * How far through the form the client is.
 *
 * Counts only the required questions towards completeness. Optional ones still
 * count towards the percentage so progress feels honest while filling it in,
 * but nobody is blocked on a question that was never essential.
 */
export function deriveIntakeProgress(
  service: ServiceType,
  answers: Record<string, unknown> | null,
): IntakeProgress {
  const questions = questionsForService(service);
  const given = (id: string) => {
    const value = answers?.[id];
    return typeof value === "string" && value.trim().length > 0;
  };

  const answered = questions.filter((question) => given(question.id)).length;
  const missingRequired = questions
    .filter((question) => question.required && !given(question.id))
    .map((question) => question.label);

  return {
    answered,
    total: questions.length,
    percent: questions.length === 0 ? 0 : Math.round((answered / questions.length) * 100),
    missingRequired,
    complete: missingRequired.length === 0,
  };
}
