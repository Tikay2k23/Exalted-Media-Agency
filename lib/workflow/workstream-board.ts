import type { TeamRole, WorkstreamStage } from "@prisma/client";

/**
 * The shape of a role's own pipeline.
 *
 * Every seat gets the same column set. That is deliberate: five bespoke
 * pipelines would be five sets of near-identical code to keep in step, and the
 * shape of the work really is the same - it arrives, it waits on something, it
 * gets built, somebody checks it, it ships.
 *
 * What differs per seat is the wording, because "waiting on assets" means
 * something concrete to a designer and nothing to an ads specialist.
 */

export interface BoardColumn {
  stage: WorkstreamStage;
  label: string;
  /** Why work sits here, in the words of the person doing it. */
  hint: string;
  /** Columns where the hold-up is outside the agency. */
  waiting?: boolean;
}

const BASE_COLUMNS: BoardColumn[] = [
  { stage: "ASSIGNED", label: "Assigned", hint: "Yours, not started." },
  {
    stage: "WAITING_ON_ACCESS",
    label: "Waiting on access",
    hint: "Blocked until the client lets us in.",
    waiting: true,
  },
  {
    stage: "WAITING_ON_ASSETS",
    label: "Waiting on assets",
    hint: "Blocked until the client sends something.",
    waiting: true,
  },
  { stage: "READY", label: "Ready to start", hint: "Nothing in the way." },
  { stage: "IN_PROGRESS", label: "Building", hint: "In your hands now." },
  { stage: "SELF_REVIEW", label: "Checking my own work", hint: "Before anyone else sees it." },
  {
    stage: "INTERNAL_REVIEW",
    label: "With a reviewer",
    hint: "Someone who did not build it is looking.",
  },
  { stage: "QA_CORRECTIONS", label: "Fixing what QA found", hint: "Back with you." },
  { stage: "READY_TO_SHIP", label: "Ready to ship", hint: "Waiting on the launch." },
  { stage: "LIVE", label: "Live", hint: "Out in the world." },
  { stage: "COMPLETE", label: "Done", hint: "Nothing left on this account." },
];

/** Per-seat wording where the generic label would be vague. */
const SEAT_WORDING: Partial<Record<TeamRole, Partial<Record<WorkstreamStage, Partial<BoardColumn>>>>> = {
  AUTOMATION_SPECIALIST: {
    WAITING_ON_ACCESS: { hint: "No GoHighLevel or integration access yet." },
    IN_PROGRESS: { label: "Building workflows", hint: "Pipelines, forms, automation." },
    SELF_REVIEW: { label: "Testing it myself", hint: "Fire every workflow before review." },
  },
  CREATIVE_SPECIALIST: {
    WAITING_ON_ASSETS: { hint: "No logo, photos or copy yet." },
    IN_PROGRESS: { label: "Designing and building", hint: "Pages, copy, creative." },
    SELF_REVIEW: { label: "Checking on every screen", hint: "Desktop, tablet, mobile." },
  },
  ADS_SPECIALIST: {
    WAITING_ON_ACCESS: { hint: "No ad account or pixel access yet." },
    IN_PROGRESS: { label: "Building campaigns", hint: "Tracking, audiences, creative." },
    READY_TO_SHIP: { label: "Built, paused", hint: "Campaigns stay paused until launch." },
  },
  PROJECT_MANAGER: {
    ASSIGNED: { label: "New", hint: "Just handed over." },
    IN_PROGRESS: { label: "Running it", hint: "Onboarding, coordination, client." },
    SELF_REVIEW: { label: "Checking scope", hint: "Does this match what was sold?" },
    INTERNAL_REVIEW: { label: "With the client", hint: "Waiting on their review." },
  },
  SALES_REP: {
    ASSIGNED: { label: "Handed over", hint: "Sold, now with delivery." },
    COMPLETE: { label: "Closed", hint: "Nothing more from sales." },
  },
};

/** The board for one seat, in the order work moves through it. */
export function columnsForRole(role: TeamRole): BoardColumn[] {
  const overrides = SEAT_WORDING[role] ?? {};

  return BASE_COLUMNS.map((column) => ({
    ...column,
    ...(overrides[column.stage] ?? {}),
  }));
}

/** Stages where the agency is waiting on the client rather than on itself. */
export function isWaitingOnClient(stage: WorkstreamStage) {
  return stage === "WAITING_ON_ACCESS" || stage === "WAITING_ON_ASSETS";
}

/** Stages that mean this seat has finished building. */
const PRODUCTION_DONE: readonly WorkstreamStage[] = [
  "SELF_REVIEW",
  "INTERNAL_REVIEW",
  "QA_CORRECTIONS",
  "READY_TO_SHIP",
  "LIVE",
  "COMPLETE",
];

export function hasFinishedBuilding(stage: WorkstreamStage) {
  return PRODUCTION_DONE.includes(stage);
}

export function isLive(stage: WorkstreamStage) {
  return stage === "LIVE" || stage === "COMPLETE";
}

export interface SyncCandidate {
  /** The master journey stage this set of workstreams now justifies. */
  stageKey: string;
  reason: string;
}

/**
 * What the master journey should move to, given where the specialist work is.
 *
 * Only two rules, and both are conservative. Everything finished building means
 * the account belongs in QA; everything live means it belongs in Live/Active.
 *
 * Crucially this only ever *proposes*. The move itself goes through
 * moveClientStage, which enforces the stage gate - so a board drag can never
 * push an account past a requirement that the journey says must hold. That is
 * the whole reason the gates exist, and a convenience that quietly bypassed
 * them would be worse than no automation at all.
 */
export function deriveSyncCandidate(
  currentStageKey: string | null,
  streams: { role: TeamRole; stage: WorkstreamStage; isRequired: boolean }[],
): SyncCandidate | null {
  const specialists = streams.filter(
    (stream) =>
      stream.isRequired
      && stream.stage !== "NOT_REQUIRED"
      && stream.role !== "SALES_REP"
      && stream.role !== "PROJECT_MANAGER",
  );

  // Nothing to infer from an account with no specialist work.
  if (specialists.length === 0) {
    return null;
  }

  if (currentStageKey === "in_production" && specialists.every((s) => hasFinishedBuilding(s.stage))) {
    return {
      stageKey: "internal_quality_assurance",
      reason: "Every specialist has finished building.",
    };
  }

  if (currentStageKey === "ready_for_launch" && specialists.every((s) => isLive(s.stage))) {
    return {
      stageKey: "live_active",
      reason: "Every specialist reports their part is live.",
    };
  }

  return null;
}
