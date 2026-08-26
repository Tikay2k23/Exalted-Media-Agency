/**
 * How the journey for one account is actually going.
 *
 * A score on its own is decoration: nobody can act on "63", and nobody trusts a
 * number they cannot take apart. So the score is assembled from named factors
 * that each say what they measured and what they cost, and the page shows the
 * reasons beside the figure. If a factor cannot be measured for this account it
 * is left out of the weighting rather than scored zero - an account with no
 * milestone is not an account with a failing milestone.
 *
 * Nothing here queries. It reads the same requirement gate, flags and tasks the
 * rest of the journey reads, so the score cannot disagree with the cards above
 * it about what is wrong.
 */

import type { JourneyFlag } from "@/lib/journey/client-detail";
import type { JourneyRequirement } from "@/lib/journey/journey-board";

export type JourneyHealthStatus = "ON_TRACK" | "WAITING" | "AT_RISK" | "BLOCKED";

export const JOURNEY_HEALTH_LABELS: Record<JourneyHealthStatus, string> = {
  ON_TRACK: "On Track",
  WAITING: "Waiting",
  AT_RISK: "At Risk",
  BLOCKED: "Blocked",
};

export interface HealthFactor {
  key: "stageTiming" | "requirements" | "workDelivery" | "clientResponsiveness" | "blockers";
  label: string;
  /** 0-100 for this factor alone. */
  score: number;
  /** How much it counts towards the total. */
  weight: number;
  /** What this factor actually looked at, in a sentence. */
  detail: string;
}

export interface JourneyHealth {
  score: number;
  status: JourneyHealthStatus;
  label: string;
  factors: HealthFactor[];
  /** The two or three things a person should read first. */
  reasons: { tone: "good" | "warn" | "bad"; text: string }[];
}

export interface HealthInput {
  requirements: JourneyRequirement[];
  flags: JourneyFlag[];
  /** Priority is optional: not every caller carries it, and it only sharpens
   * the penalty rather than deciding it. */
  tasks: { status: string; dueDate: string; priority?: string }[];
  /** Days into the stage, and the target if the stage has one. */
  dayInStage: number;
  targetDays: number | null;
  /** How long the oldest open wait on the client has been running. */
  waitingDays: number | null;
  now: Date;
}

const OPEN_TASK_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "NEEDS_REVIEW",
  "REVISION_REQUIRED",
];

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Stage timing.
 *
 * Full marks inside the target, falling away once it is passed rather than
 * dropping off a cliff on the first late day - a stage one day over is not the
 * same problem as one three weeks over, and a score that cannot tell them apart
 * stops being worth reading.
 */
function stageTiming(input: HealthInput): HealthFactor | null {
  if (input.targetDays === null || input.targetDays <= 0) return null;

  const over = input.dayInStage - input.targetDays;
  const score = over <= 0 ? 100 : clamp(100 - (over / input.targetDays) * 60);

  return {
    key: "stageTiming",
    label: "Stage timing",
    score,
    weight: 25,
    detail:
      over <= 0
        ? `Day ${input.dayInStage} of ${input.targetDays}, inside the target.`
        : `Day ${input.dayInStage} of ${input.targetDays}, ${over} day${over === 1 ? "" : "s"} over.`,
  };
}

/** How much of what actually holds the stage shut has been done. */
function requirements(input: HealthInput): HealthFactor | null {
  const blocking = input.requirements.filter((requirement) => requirement.isBlocking);

  if (blocking.length === 0) return null;

  const met = blocking.filter((requirement) => requirement.satisfied).length;

  return {
    key: "requirements",
    label: "Requirements",
    score: clamp((met / blocking.length) * 100),
    weight: 25,
    detail: `${met} of ${blocking.length} required exit items complete.`,
  };
}

/** Whether the work attached to this stage is moving or slipping. */
function workDelivery(input: HealthInput): HealthFactor | null {
  const open = input.tasks.filter((task) => OPEN_TASK_STATUSES.includes(task.status));

  if (open.length === 0) return null;

  const overdue = open.filter((task) => new Date(task.dueDate) < input.now);
  const critical = overdue.filter(
    (task) => task.priority === "HIGH" || task.priority === "URGENT",
  );

  // Each late task costs, and a late important one costs more.
  const penalty = overdue.length * 15 + critical.length * 15;

  return {
    key: "workDelivery",
    label: "Work delivery",
    score: clamp(100 - penalty),
    weight: 20,
    detail:
      overdue.length === 0
        ? `${open.length} open task${open.length === 1 ? "" : "s"}, none overdue.`
        : `${overdue.length} of ${open.length} open task${open.length === 1 ? "" : "s"} overdue.`,
  };
}

/**
 * How long the client has been sat on something.
 *
 * Only scored when the agency is actually waiting. An account nobody is waiting
 * on should not be marked down for a responsiveness we never tested.
 */
function clientResponsiveness(input: HealthInput): HealthFactor | null {
  const waiting = input.flags.filter((flag) => flag.kind === "WAITING_ON_CLIENT");

  if (waiting.length === 0 || input.waitingDays === null) return null;

  return {
    key: "clientResponsiveness",
    label: "Client responsiveness",
    // A couple of days is normal; a fortnight is not.
    score: clamp(100 - input.waitingDays * 12),
    weight: 15,
    detail: `Waiting on the client for ${input.waitingDays} day${input.waitingDays === 1 ? "" : "s"}.`,
  };
}

/** Anything the agency has formally recorded as stopping the work. */
function blockers(input: HealthInput): HealthFactor | null {
  const active = input.flags.filter((flag) => flag.kind === "BLOCKED");

  if (active.length === 0) return null;

  return {
    key: "blockers",
    label: "Blockers",
    score: clamp(100 - active.length * 50),
    weight: 15,
    detail: `${active.length} active blocker${active.length === 1 ? "" : "s"}.`,
  };
}

/**
 * The status, which is a judgement rather than a band of the score.
 *
 * A blocked account is blocked at any score, and one waiting on the client is
 * waiting even while everything else is healthy - those are facts about what is
 * happening, not summaries of arithmetic.
 */
function statusFor(input: HealthInput, score: number): JourneyHealthStatus {
  if (input.flags.some((flag) => flag.kind === "BLOCKED")) return "BLOCKED";

  const overTarget =
    input.targetDays !== null && input.targetDays > 0 && input.dayInStage > input.targetDays;

  if (overTarget || score < 60) return "AT_RISK";

  if (input.flags.some((flag) => flag.kind === "WAITING_ON_CLIENT")) return "WAITING";

  return "ON_TRACK";
}

export function journeyHealth(input: HealthInput): JourneyHealth {
  const factors = [
    stageTiming(input),
    requirements(input),
    workDelivery(input),
    clientResponsiveness(input),
    blockers(input),
  ].filter((factor): factor is HealthFactor => factor !== null);

  /*
   * Weighted over the factors that applied, not over every factor that exists.
   * Otherwise an account with nothing wrong and nothing measurable scores badly
   * for having no problems to report.
   */
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score =
    totalWeight === 0
      ? 100
      : clamp(
          factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight,
        );

  const status = statusFor(input, score);

  /* The worst factors first: the reasons are what somebody acts on. */
  const reasons = [...factors]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((factor) => ({
      tone: factor.score >= 80 ? ("good" as const) : factor.score >= 55 ? ("warn" as const) : ("bad" as const),
      text: factor.detail,
    }));

  return {
    score,
    status,
    label: JOURNEY_HEALTH_LABELS[status],
    factors,
    reasons,
  };
}
