import type { ServiceType } from "@prisma/client";

/**
 * Which parts of a strategy this client actually needs.
 *
 * The progress figure on the Strategy tab is only honest if the denominator is
 * honest. A website-support account has no paid media strategy to write, and
 * counting one against them would leave every such client stuck below full
 * forever - so each section declares the services that make it required, and
 * anything that does not apply is not counted at all.
 *
 * Six sections apply to everybody, because they are what "strategy" means
 * regardless of what was bought: what the client wants, who they are talking
 * to, what they sell, why anybody should choose them, how they will be found,
 * and what happens next.
 */

export type StrategySectionKey =
  | "BUSINESS_GOALS"
  | "TARGET_AUDIENCE"
  | "OFFER"
  | "VALUE_PROPOSITION"
  | "COMPETITIVE_POSITIONING"
  | "BRAND_FOUNDATION"
  | "ACQUISITION_STRATEGY"
  | "CHANNEL_STRATEGY"
  | "FUNNEL_STRATEGY"
  | "TRACKING_MEASUREMENT"
  | "EXECUTION_ROADMAP";

export type SectionStatus =
  | "NOT_REQUIRED"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "READY_FOR_REVIEW"
  | "APPROVED";

export interface SectionDefinition {
  key: StrategySectionKey;
  label: string;
  description: string;
  /**
   * "always", or the services that make this section required. A client whose
   * services do not intersect this list gets NOT_REQUIRED.
   */
  appliesTo: "always" | ServiceType[];
}

const PAID: ServiceType[] = ["PAID_ADVERTISING", "FULL_SERVICE_RETAINER"];
const FUNNEL: ServiceType[] = [
  "FUNNEL_BUILD",
  "WEBSITE_SUPPORT",
  "CRM_AUTOMATION",
  "FULL_SERVICE_RETAINER",
];
const BRAND: ServiceType[] = [
  "BRAND_STRATEGY",
  "CONTENT_PRODUCTION",
  "SOCIAL_MEDIA_MANAGEMENT",
  "FULL_SERVICE_RETAINER",
];

export const STRATEGY_SECTIONS: SectionDefinition[] = [
  {
    key: "BUSINESS_GOALS",
    label: "Business Goals",
    description: "What the client is trying to achieve, with numbers and dates.",
    appliesTo: "always",
  },
  {
    key: "TARGET_AUDIENCE",
    label: "Target Audience",
    description: "Who the work is aimed at, and what moves them.",
    appliesTo: "always",
  },
  {
    key: "OFFER",
    label: "Offer",
    description: "What the client sells and how it is packaged.",
    appliesTo: "always",
  },
  {
    key: "VALUE_PROPOSITION",
    label: "Value Proposition",
    description: "Why somebody chooses them over the alternative.",
    appliesTo: "always",
  },
  {
    key: "COMPETITIVE_POSITIONING",
    label: "Competitive Positioning",
    description: "Where they sit against the others in the market.",
    appliesTo: "always",
  },
  {
    key: "BRAND_FOUNDATION",
    label: "Brand Foundation",
    description: "Voice, look and the assets everything is built from.",
    appliesTo: BRAND,
  },
  {
    key: "ACQUISITION_STRATEGY",
    label: "Acquisition Strategy",
    description: "How new customers are going to be found.",
    appliesTo: "always",
  },
  {
    key: "CHANNEL_STRATEGY",
    label: "Channel Strategy",
    description: "Which channels get the budget and the effort.",
    appliesTo: PAID,
  },
  {
    key: "FUNNEL_STRATEGY",
    label: "Funnel & Conversion",
    description: "What happens between a click and a customer.",
    appliesTo: FUNNEL,
  },
  {
    key: "TRACKING_MEASUREMENT",
    label: "Tracking & Measurement",
    description: "How anybody will know whether it worked.",
    appliesTo: "always",
  },
  {
    key: "EXECUTION_ROADMAP",
    label: "Execution Roadmap",
    description: "The order the work happens in, and by when.",
    appliesTo: "always",
  },
];

export const SECTION_BY_KEY = new Map(
  STRATEGY_SECTIONS.map((section) => [section.key, section]),
);

/** Does this section apply to a client who bought these services? */
export function sectionApplies(section: SectionDefinition, services: ServiceType[]) {
  if (section.appliesTo === "always") return true;

  return section.appliesTo.some((service) => services.includes(service));
}

export function requiredSectionKeys(services: ServiceType[]): StrategySectionKey[] {
  return STRATEGY_SECTIONS.filter((section) => sectionApplies(section, services)).map(
    (section) => section.key,
  );
}

/**
 * A section counts as done once its content is written and handed on.
 *
 * READY_FOR_REVIEW as well as APPROVED, because the card says "7 of 11
 * sections completed" and a section waiting on somebody else's signature is
 * completed work. Whether it has been approved is tracked separately and shown
 * per section, so nothing is hidden by counting it here.
 */
export const DONE_STATUSES: SectionStatus[] = ["READY_FOR_REVIEW", "APPROVED"];

export interface StrategyProgress {
  /** 0-100, rounded. */
  percent: number;
  completed: number;
  /** Required sections only - anything not applicable is excluded. */
  total: number;
  approved: number;
  awaitingReview: number;
  /** Required sections nobody has started, worst-first for the missing list. */
  notStarted: StrategySectionKey[];
}

export function strategyProgress(
  sections: { key: StrategySectionKey; status: SectionStatus }[],
  services: ServiceType[],
): StrategyProgress {
  const required = new Set(requiredSectionKeys(services));
  const byKey = new Map(sections.map((section) => [section.key, section.status]));

  let completed = 0;
  let approved = 0;
  let awaitingReview = 0;
  const notStarted: StrategySectionKey[] = [];

  for (const key of required) {
    // A section with no row yet has not been started - the same answer as an
    // explicit NOT_STARTED, and one fewer state for the page to reason about.
    const status = byKey.get(key) ?? "NOT_STARTED";

    if (status === "APPROVED") approved += 1;
    if (status === "READY_FOR_REVIEW") awaitingReview += 1;
    if (DONE_STATUSES.includes(status)) completed += 1;
    if (status === "NOT_STARTED") notStarted.push(key);
  }

  const total = required.size;

  return {
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    completed,
    total,
    approved,
    awaitingReview,
    notStarted,
  };
}

/* -------------------------------------------------------------------------- */
/* Roadmap                                                                    */
/* -------------------------------------------------------------------------- */

export type RoadmapPhaseKey =
  | "DISCOVERY"
  | "RESEARCH_ANALYSIS"
  | "STRATEGY_DEVELOPMENT"
  | "PLANNING_EXECUTION"
  | "REVIEW_OPTIMIZATION";

export type RoadmapStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED";

export interface RoadmapPhaseDefinition {
  key: RoadmapPhaseKey;
  label: string;
  /** What has to be true before this phase can be called complete. */
  requires: StrategySectionKey[];
  /** Set when the phase also depends on the client having sent their intake. */
  needsIntake?: boolean;
}

export const ROADMAP_PHASES: RoadmapPhaseDefinition[] = [
  { key: "DISCOVERY", label: "Discovery", requires: ["BUSINESS_GOALS"], needsIntake: true },
  {
    key: "RESEARCH_ANALYSIS",
    label: "Research & Analysis",
    requires: ["TARGET_AUDIENCE", "COMPETITIVE_POSITIONING"],
  },
  {
    key: "STRATEGY_DEVELOPMENT",
    label: "Strategy Development",
    requires: ["VALUE_PROPOSITION", "OFFER", "ACQUISITION_STRATEGY"],
  },
  {
    key: "PLANNING_EXECUTION",
    label: "Planning & Execution",
    requires: ["EXECUTION_ROADMAP", "TRACKING_MEASUREMENT"],
  },
  { key: "REVIEW_OPTIMIZATION", label: "Review & Optimization", requires: [] },
];

/**
 * What is stopping a phase being marked complete.
 *
 * Returns the human-readable reasons rather than a boolean, because refusing
 * without saying why is the most annoying kind of refusal. Sections that do not
 * apply to this client are not blockers.
 */
export function phaseBlockers(
  phase: RoadmapPhaseDefinition,
  sections: { key: StrategySectionKey; status: SectionStatus }[],
  services: ServiceType[],
  intakeSubmitted: boolean,
): string[] {
  const required = new Set(requiredSectionKeys(services));
  const byKey = new Map(sections.map((section) => [section.key, section.status]));
  const blockers: string[] = [];

  if (phase.needsIntake && !intakeSubmitted) {
    blockers.push("The client has not submitted their intake form");
  }

  for (const key of phase.requires) {
    if (!required.has(key)) continue;

    const status = byKey.get(key) ?? "NOT_STARTED";

    if (!DONE_STATUSES.includes(status)) {
      blockers.push(`${SECTION_BY_KEY.get(key)?.label ?? key} is not ready`);
    }
  }

  return blockers;
}
