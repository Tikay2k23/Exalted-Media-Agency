import type { ServiceType, TeamRole } from "@prisma/client";

import { a2pApplies } from "@/lib/a2p/a2p-readiness";
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

export type QuestionKind =
  | "short"
  | "long"
  | "email"
  | "phone"
  | "url"
  | "money"
  /** One of a list. Stored as the option value. */
  | "choice"
  /** Several of a list. Stored as the values joined by a comma. */
  | "multi"
  /** Yes or no. Stored as "yes" or "no" - an empty string is unanswered. */
  | "boolean";

export interface IntakeQuestion {
  id: string;
  label: string;
  kind: QuestionKind;
  help?: string;
  required?: boolean;
  /** For choice and multi. Value is what gets stored; label is what is asked. */
  options?: { value: string; label: string }[];
  /**
   * Only shown when every condition holds.
   *
   * A list rather than one rule because most of these have two: the client has
   * to have asked for text messaging at all, and then their own earlier answer
   * has to make the question relevant. A business that takes consent on paper
   * is never asked to describe a website checkbox it does not have.
   */
  showWhen?: { questionId: string; hasAnyOf: string[] }[];
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
      /*
       * The address is asked in parts rather than as one box.
       *
       * A carrier registration keeps the street, the city and the postal code
       * apart, and the A2P readiness checklist looks for all three. Collected as
       * one free-text box, somebody had to split it by hand afterwards, and a
       * parser guessing where to divide it would put invented values on a
       * registration - worse than an empty field, because an invented one looks
       * answered and nobody checks it again.
       *
       * The street keeps the original question id. Forms already sent out have an
       * address stored under it, and the review page renders from this catalogue,
       * so renaming it would leave what those clients wrote with nowhere to show.
       */
      { id: "address", label: "Street address", kind: "short", required: true },
      { id: "addressLine2", label: "Suite, unit or floor", kind: "short" },
      { id: "city", label: "City or town", kind: "short", required: true },
      { id: "stateRegion", label: "State or region", kind: "short" },
      { id: "postalCode", label: "Postal code", kind: "short", required: true },
      { id: "country", label: "Country", kind: "short", required: true },
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

/**
 * A2P registration, asked only of clients who will actually send SMS.
 *
 * Written in the client's language rather than a carrier's. Nobody outside
 * this industry knows what a campaign use-case is, and asking them to pick one
 * produces a worse answer than asking what they will use texting for. The
 * mapping to carrier vocabulary happens internally, on the A2P profile.
 *
 * Nothing here asks for a password. Platform access is requested and tracked in
 * Files & Access, which is the only place credentials are ever handled.
 */
const A2P_QUESTIONS: IntakeSection = {
  id: "a2p",
  title: "Text messaging",
  description:
    "If you want to text your customers, a phone carrier has to approve your business first. Tell us whether you want that and we will ask for what they need.",
  questions: [
    {
      id: "a2pWantsSms",
      label: "Do you want to send text messages to your customers?",
      kind: "boolean",
      required: true,
      help: "Appointment reminders, follow-ups, replies to missed calls - anything that arrives on a customer's phone. Answer no and the rest of this section disappears.",
    },
    {
      id: "a2pLegalName",
      label: "Your registered legal business name",
      kind: "short",
      required: true,
      help: "Exactly as it appears on your registration paperwork - this often differs from your trading name.",
    },
    {
      id: "a2pEntityType",
      label: "What kind of business is it?",
      kind: "choice",
      required: true,
      options: [
        { value: "SOLE_PROPRIETOR", label: "Sole proprietor" },
        { value: "LLC", label: "LLC" },
        { value: "CORPORATION", label: "Corporation" },
        { value: "PARTNERSHIP", label: "Partnership" },
        { value: "NONPROFIT", label: "Nonprofit" },
        { value: "GOVERNMENT", label: "Government" },
        { value: "OTHER", label: "Something else" },
      ],
    },
    {
      /*
       * Asked rather than inferred from the trading address.
       *
       * A business can trade in one country and be registered in another, and the
       * registration is the one a carrier checks. Reading it off the address in
       * the general section would be right most of the time, which is the wrong
       * standard for a field somebody submits to a carrier on the client's behalf.
       *
       * It sits above the tax ID because that question asks for the equivalent
       * number wherever they are, which only makes sense once this is answered.
       */
      id: "a2pCountryOfRegistration",
      label: "Which country is the business registered in?",
      kind: "short",
      required: true,
      help: "Where the paperwork was filed, which is not always where you trade from.",
    },
    {
      id: "a2pTaxId",
      label: "Business tax ID or registration number",
      kind: "short",
      required: true,
      help: "EIN in the US, or the equivalent registration number where you are.",
    },
    {
      id: "a2pRepName",
      label: "Who can we name as the authorised contact?",
      kind: "short",
      required: true,
      help: "Somebody able to confirm this business is yours.",
    },
    { id: "a2pRepTitle", label: "Their job title", kind: "short", required: true },
    { id: "a2pRepEmail", label: "Their email", kind: "email", required: true },
    { id: "a2pRepPhone", label: "Their phone number", kind: "phone", required: true },
    {
      id: "a2pUseCases",
      label: "What will you use text messages for?",
      kind: "multi",
      required: true,
      options: [
        { value: "APPOINTMENT_CONFIRMATION", label: "Confirming appointments" },
        { value: "APPOINTMENT_REMINDER", label: "Reminding people about appointments" },
        { value: "LEAD_FOLLOW_UP", label: "Following up on enquiries" },
        { value: "QUOTE_FOLLOW_UP", label: "Following up on quotes or estimates" },
        { value: "CUSTOMER_SUPPORT", label: "Answering customer questions" },
        { value: "SERVICE_NOTIFICATION", label: "Telling customers about their job or service" },
        { value: "ORDER_STATUS", label: "Order or delivery updates" },
        { value: "ACCOUNT_NOTIFICATION", label: "Account notifications" },
        { value: "MARKETING_PROMOTION", label: "Offers and promotions" },
        { value: "REACTIVATION", label: "Getting back in touch with past customers" },
        { value: "MISSED_CALL_TEXT_BACK", label: "Texting back when we miss a call" },
        { value: "OTHER", label: "Something else" },
      ],
    },
    {
      id: "a2pCampaignDescription",
      label: "Describe the texts you will send",
      kind: "long",
      required: true,
      help: "Who sends them, who receives them, why those people are getting them, and what the messages are for. A few sentences is plenty.",
    },
    {
      id: "a2pOptInMethods",
      label: "How do customers agree to be texted?",
      kind: "multi",
      required: true,
      options: [
        { value: "WEBSITE_FORM", label: "A form on our website" },
        { value: "CONTACT_FORM", label: "Our contact form" },
        { value: "LANDING_PAGE", label: "A landing page" },
        { value: "BOOKING_FORM", label: "When they book" },
        { value: "CHECKOUT", label: "At checkout" },
        { value: "PAPER_FORM", label: "On a paper form" },
        { value: "IN_PERSON", label: "In person" },
        { value: "VERBAL", label: "They tell us verbally" },
        { value: "TEXT_TO_JOIN", label: "They text a keyword to join" },
        { value: "EXISTING_CUSTOMER", label: "They are already a customer" },
        { value: "OTHER", label: "Some other way" },
      ],
    },
    {
      id: "a2pConsentLanguage",
      label: "What wording do customers see when they agree?",
      kind: "long",
      required: true,
      help: "Copy it across exactly as it appears, even if it is short.",
    },
    {
      id: "a2pOptInPageUrl",
      label: "Where is that form?",
      kind: "url",
      showWhen: [
        {
          questionId: "a2pOptInMethods",
          hasAnyOf: ["WEBSITE_FORM", "CONTACT_FORM", "LANDING_PAGE", "BOOKING_FORM", "CHECKOUT"],
        },
      ],
      help: "A link to the page with the form on it.",
    },
    {
      id: "a2pCheckboxOptional",
      label: "Is ticking the text-message box optional?",
      kind: "boolean",
      showWhen: [
        {
          questionId: "a2pOptInMethods",
          hasAnyOf: ["WEBSITE_FORM", "CONTACT_FORM", "LANDING_PAGE", "BOOKING_FORM", "CHECKOUT"],
        },
      ],
      help: "Customers should be able to submit the form without agreeing to texts.",
    },
    {
      id: "a2pCheckboxUnticked",
      label: "Is that box unticked when the page loads?",
      kind: "boolean",
      showWhen: [
        {
          questionId: "a2pOptInMethods",
          hasAnyOf: ["WEBSITE_FORM", "CONTACT_FORM", "LANDING_PAGE", "BOOKING_FORM", "CHECKOUT"],
        },
      ],
    },
    {
      id: "a2pPrivacyPolicyUrl",
      label: "Link to your privacy policy",
      kind: "url",
      required: true,
    },
    { id: "a2pTermsUrl", label: "Link to your terms and conditions", kind: "url" },
    {
      id: "a2pSampleTransactional",
      label: "Write an example of a routine text you would send",
      kind: "long",
      required: true,
      help: "An appointment reminder or a job update, for instance. Include your business name in it.",
    },
    {
      /*
       * Asked on exactly the condition the readiness checklist uses. It wanted a
       * follow-up example from anybody chasing enquiries or quotes, while the form
       * only ever collected a routine message and a promotional one, so the client
       * was never given the chance to write the one thing that was missing.
       */
      id: "a2pSampleLeadFollowUp",
      label: "Write an example of a follow-up text",
      kind: "long",
      showWhen: [
        { questionId: "a2pUseCases", hasAnyOf: ["LEAD_FOLLOW_UP", "QUOTE_FOLLOW_UP"] },
      ],
      help: "What you would send somebody who enquired or asked for a quote. Include your business name in it.",
    },
    {
      id: "a2pSampleMarketing",
      label: "Write an example of a promotional text",
      kind: "long",
      showWhen: [
        { questionId: "a2pUseCases", hasAnyOf: ["MARKETING_PROMOTION", "REACTIVATION"] },
      ],
      help: "Only needed because you said you would send offers.",
    },
    {
      id: "a2pMessagesContainLinks",
      label: "Will your texts contain links?",
      kind: "boolean",
      required: true,
    },
    {
      id: "a2pMonthlyVolume",
      label: "Roughly how many texts a month?",
      kind: "short",
      required: true,
      help: "An estimate is fine.",
    },
    {
      id: "a2pExistingNumber",
      label: "What number do customers call you on now?",
      kind: "phone",
    },
    {
      id: "a2pRepliesHandledBy",
      label: "Who will read and answer replies?",
      kind: "short",
      required: true,
    },
    {
      id: "a2pBusinessHours",
      label: "What hours should we text within?",
      kind: "short",
      required: true,
    },
  ],
};

/** The answer that opens the rest of the section. */
const A2P_GATE = { questionId: "a2pWantsSms", hasAnyOf: ["yes"] };

/**
 * The A2P section, with every question after the first hanging off the gate.
 *
 * Applied here rather than written onto each question, so a question added
 * later cannot be missed and end up visible to a client who said they do not
 * want text messaging. Questions that already carry a condition keep it - both
 * have to hold.
 */
export const A2P_SECTION: IntakeSection = {
  ...A2P_QUESTIONS,
  questions: A2P_QUESTIONS.questions.map((question) =>
    question.id === "a2pWantsSms"
      ? question
      : { ...question, showWhen: [A2P_GATE, ...(question.showWhen ?? [])] },
  ),
};

/** The sections this client should actually see. */
export function sectionsForService(service: ServiceType): IntakeSection[] {
  const extra = specialistsForService(service)
    .map((seat) => BY_SEAT[seat])
    .filter((section): section is IntakeSection => section !== null);

  /*
   * The A2P questions are asked only of clients who will actually send SMS.
   * Everyone else is spared twenty carrier questions about a registration they
   * will never need - the same condition the A2P workspace uses, so the form
   * and the profile can never disagree about who it applies to.
   */
  const a2p = a2pApplies([service]) ? [A2P_SECTION] : [];

  return [...GENERAL, ...extra, ...a2p];
}

/**
 * Whether a question should be asked, given what has been answered so far.
 *
 * A question with no condition is always asked. One with a condition is asked
 * only when the answer it depends on contains one of the listed values, so a
 * business taking consent on paper is never asked to describe a web form.
 */
export function questionApplies(
  question: IntakeQuestion,
  answers: Record<string, unknown> | null,
): boolean {
  if (!question.showWhen || question.showWhen.length === 0) return true;

  /*
   * Every condition, not any. A question that needs both the gate and its own
   * parent answer must satisfy both - otherwise turning the gate off would
   * leave orphaned follow-ups on screen.
   */
  return question.showWhen.every((condition) => {
    const raw = answers?.[condition.questionId];
    const given = typeof raw === "string" ? raw.split(",").map((value) => value.trim()) : [];

    return condition.hasAnyOf.some((value) => given.includes(value));
  });
}

export function questionsForService(service: ServiceType): IntakeQuestion[] {
  return sectionsForService(service).flatMap((section) => section.questions);
}

/** One unanswered required question, with enough to go and ask for it. */
export interface MissingRequiredQuestion {
  questionId: string;
  label: string;
  sectionId: string;
  sectionTitle: string;
}

export interface IntakeProgress {
  answered: number;
  total: number;
  percent: number;
  /** Labels only. Kept because three screens already read it by that shape. */
  missingRequired: string[];
  /**
   * The same gaps, with the section they sit in.
   *
   * Labels alone were enough to count with and not enough to act on: telling
   * somebody four answers are missing without saying which part of the form
   * they are in leaves them scrolling the whole thing.
   */
  missingRequiredQuestions: MissingRequiredQuestion[];
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
  /*
   * Only the questions actually being asked. A conditional question nobody is
   * shown - the web-form consent wording for a business using paper - must not
   * sit in the denominator, or the client can never reach a hundred per cent
   * and the required list names something they were never asked.
   */
  const sections = sectionsForService(service);
  const questions = sections
    .flatMap((section) =>
      section.questions.map((question) => ({ question, section })),
    )
    .filter(({ question }) => questionApplies(question, answers));

  const given = (id: string) => {
    const value = answers?.[id];
    return typeof value === "string" && value.trim().length > 0;
  };

  const answered = questions.filter(({ question }) => given(question.id)).length;
  const missingRequiredQuestions = questions
    .filter(({ question }) => question.required && !given(question.id))
    .map(({ question, section }) => ({
      questionId: question.id,
      label: question.label,
      sectionId: section.id,
      sectionTitle: section.title,
    }));

  return {
    answered,
    total: questions.length,
    percent: questions.length === 0 ? 0 : Math.round((answered / questions.length) * 100),
    missingRequired: missingRequiredQuestions.map((entry) => entry.label),
    missingRequiredQuestions,
    complete: missingRequiredQuestions.length === 0,
  };
}
