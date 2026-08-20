/**
 * The journey taxonomy: four phases, twelve stages, and the map from the
 * stages the database actually stores onto them.
 *
 * There are three tiers here on purpose.
 *
 * The database holds eighteen fulfilment stages (plus six retired ones) and
 * those are the operational truth - "Revisions Required" and "Client Review"
 * are genuinely different states with different gates, and collapsing them
 * would throw away the distinction the delivery process depends on. But
 * eighteen columns is not a board anybody can read, and reporting on eighteen
 * buckets with one or two accounts in each says nothing.
 *
 * So the stored stage stays exactly as it is and is what every card, table row
 * and drawer names. This module adds two reporting tiers above it: twelve
 * canonical stages for the progression rail and progress maths, and four
 * phases for the board columns.
 *
 * Nothing here is stored. Change a mapping and every derived view follows,
 * with no migration and no risk of the two disagreeing.
 */

export type PhaseKey = "STARTUP" | "PRODUCTION" | "LAUNCH" | "RETENTION";

export type JourneyStageKey =
  | "payment_received"
  | "onboarding"
  | "access_assets"
  | "strategy_planning"
  | "build_implementation"
  | "internal_qa"
  | "client_review"
  | "ready_to_launch"
  | "live_optimization"
  | "ongoing_management"
  | "renewal_upsell"
  | "offboarding_completed";

export interface JourneyPhase {
  key: PhaseKey;
  label: string;
  /** The stage span, shown under the column heading. */
  blurb: string;
  /** Tailwind classes for the column header band. */
  headerClass: string;
  accentClass: string;
}

export const JOURNEY_PHASES: JourneyPhase[] = [
  {
    key: "STARTUP",
    label: "Startup",
    blurb: "Payment -> Onboarding -> Access",
    headerClass: "bg-sky-50/80 border-sky-100",
    accentClass: "bg-sky-500",
  },
  {
    key: "PRODUCTION",
    label: "Production",
    blurb: "Strategy -> Build -> QA",
    headerClass: "bg-violet-50/80 border-violet-100",
    accentClass: "bg-violet-500",
  },
  {
    key: "LAUNCH",
    label: "Launch",
    blurb: "Review -> Launch -> Live",
    headerClass: "bg-emerald-50/80 border-emerald-100",
    accentClass: "bg-emerald-500",
  },
  {
    key: "RETENTION",
    label: "Retention",
    blurb: "Live -> Management -> Renewal",
    headerClass: "bg-amber-50/80 border-amber-100",
    accentClass: "bg-amber-500",
  },
];

export interface JourneyStage {
  key: JourneyStageKey;
  label: string;
  phase: PhaseKey;
  /** 1-based position in the twelve-stage progression. */
  position: number;
  /**
   * Expected days in this stage, used only when the stored stage has no
   * slaDays of its own. The stored value always wins: operations tune it in
   * the database without a deploy.
   */
  fallbackTargetDays: number | null;
}

export const JOURNEY_STAGES: JourneyStage[] = [
  { key: "payment_received", label: "Payment Received", phase: "STARTUP", position: 1, fallbackTargetDays: 1 },
  { key: "onboarding", label: "Onboarding", phase: "STARTUP", position: 2, fallbackTargetDays: 7 },
  { key: "access_assets", label: "Access & Assets", phase: "STARTUP", position: 3, fallbackTargetDays: 7 },
  { key: "strategy_planning", label: "Strategy & Planning", phase: "PRODUCTION", position: 4, fallbackTargetDays: 5 },
  { key: "build_implementation", label: "Build / Implementation", phase: "PRODUCTION", position: 5, fallbackTargetDays: 21 },
  { key: "internal_qa", label: "Internal QA", phase: "PRODUCTION", position: 6, fallbackTargetDays: 3 },
  { key: "client_review", label: "Client Review", phase: "LAUNCH", position: 7, fallbackTargetDays: 5 },
  { key: "ready_to_launch", label: "Ready to Launch", phase: "LAUNCH", position: 8, fallbackTargetDays: 3 },
  { key: "live_optimization", label: "Live / Optimization", phase: "LAUNCH", position: 9, fallbackTargetDays: 7 },
  { key: "ongoing_management", label: "Ongoing Management", phase: "RETENTION", position: 10, fallbackTargetDays: null },
  { key: "renewal_upsell", label: "Renewal / Upsell", phase: "RETENTION", position: 11, fallbackTargetDays: 30 },
  { key: "offboarding_completed", label: "Offboarding / Completed", phase: "RETENTION", position: 12, fallbackTargetDays: 30 },
];

export const TOTAL_JOURNEY_STAGES = JOURNEY_STAGES.length;

const stagesByKey = new Map(JOURNEY_STAGES.map((stage) => [stage.key, stage]));

/**
 * Stored stageKey -> canonical stage.
 *
 * Several stored stages deliberately share a canonical stage. "Onboarding Form
 * Sent" and "Waiting for Client Information" are both onboarding as far as the
 * board is concerned, while remaining distinct where the distinction earns its
 * keep - the card, the gate, and the history all still name the stored stage.
 *
 * The six retired slugs are mapped too. An account parked on a legacy stage
 * still has to appear somewhere, and dropping it off the board because nobody
 * migrated it is how accounts get forgotten.
 */
export const STORED_STAGE_TO_JOURNEY_STAGE: Record<string, JourneyStageKey> = {
  payment_received: "payment_received",
  onboarding_form_sent: "onboarding",
  waiting_for_client_information: "onboarding",
  access_collection: "access_assets",
  onboarding_complete: "access_assets",
  strategy_and_planning: "strategy_planning",
  in_production: "build_implementation",
  internal_quality_assurance: "internal_qa",
  client_review: "client_review",
  revisions_required: "client_review",
  client_approved: "ready_to_launch",
  ready_for_launch: "ready_to_launch",
  live_active: "live_optimization",
  ongoing_management: "ongoing_management",
  renewal_discussion: "renewal_upsell",
  offboarding: "offboarding_completed",
  project_completed: "offboarding_completed",
  archived: "offboarding_completed",

  // Retired pre-SOP stages, kept mapped so nothing falls off the board.
  "new-client": "payment_received",
  onboarding: "onboarding",
  "in-progress": "build_implementation",
  "waiting-on-client": "client_review",
  review: "client_review",
  completed: "offboarding_completed",
};

export function journeyStageByKey(key: JourneyStageKey): JourneyStage {
  const stage = stagesByKey.get(key);

  if (!stage) {
    throw new Error(`Unknown journey stage "${key}".`);
  }

  return stage;
}

/**
 * Resolves a stored stage onto the canonical twelve.
 *
 * Falls back to position rather than returning nothing: a stage added to the
 * database later, before anybody updates the map above, should still land in a
 * sensible column instead of vanishing. The account being visible in roughly
 * the right place beats it being invisible in exactly the right one.
 */
export function journeyStageForStoredStage(
  stageKey: string | null,
  storedPosition: number,
): JourneyStage {
  if (stageKey) {
    const mapped = STORED_STAGE_TO_JOURNEY_STAGE[stageKey];

    if (mapped) {
      return journeyStageByKey(mapped);
    }
  }

  const approximate = Math.min(
    TOTAL_JOURNEY_STAGES,
    Math.max(1, Math.ceil((storedPosition / 18) * TOTAL_JOURNEY_STAGES)),
  );

  return JOURNEY_STAGES[approximate - 1];
}

export function phaseByKey(key: PhaseKey): JourneyPhase {
  const phase = JOURNEY_PHASES.find((candidate) => candidate.key === key);

  if (!phase) {
    throw new Error(`Unknown journey phase "${key}".`);
  }

  return phase;
}

export function stagesInPhase(phase: PhaseKey): JourneyStage[] {
  return JOURNEY_STAGES.filter((stage) => stage.phase === phase);
}
