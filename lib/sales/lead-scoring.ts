import type { LeadSource } from "@prisma/client";

/**
 * Lead qualification scoring.
 *
 * A deliberately transparent 0-100 score: a rep should be able to look at a
 * lead and understand why it scored what it did, and a manager should be able
 * to change the weighting without reverse-engineering anything. Every
 * contribution is returned alongside the total for exactly that reason.
 *
 * Scoring never decides anything on its own. It orders a rep's follow-up list;
 * qualification remains a human judgement recorded in `status`.
 */

export interface ScorableLead {
  budgetAmount: number | null;
  timeline: string | null;
  isDecisionMaker: boolean | null;
  mainProblem: string | null;
  goal: string | null;
  source: LeadSource;
  email: string | null;
  phone: string | null;
}

export interface ScoreContribution {
  label: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface LeadScore {
  total: number;
  contributions: ScoreContribution[];
  band: "HOT" | "WARM" | "COOL" | "COLD";
}

/**
 * Sources ranked by how well they have historically converted. Referrals and
 * repeat clients arrive pre-trusted; cold outbound has to earn it.
 */
const SOURCE_POINTS: Record<LeadSource, number> = {
  REFERRAL: 20,
  REPEAT_CLIENT: 20,
  PARTNER: 16,
  WEBSITE_FORM: 14,
  ORGANIC_SEARCH: 14,
  EVENT: 12,
  PAID_ADS: 10,
  SOCIAL_MEDIA: 8,
  OUTBOUND: 6,
  OTHER: 6,
};

const BUDGET_TIERS: { min: number; points: number; label: string }[] = [
  { min: 10_000, points: 30, label: "10,000 or more" },
  { min: 5_000, points: 26, label: "5,000 to 9,999" },
  { min: 2_500, points: 20, label: "2,500 to 4,999" },
  { min: 1_000, points: 14, label: "1,000 to 2,499" },
  { min: 1, points: 8, label: "under 1,000" },
];

/** Phrases that indicate the prospect intends to move soon. */
const URGENT_TIMELINE = /\b(asap|immediate|urgent|this week|this month|30 days|1 month)\b/i;
const NEAR_TIMELINE = /\b(next month|60 days|90 days|quarter|2 months|3 months)\b/i;

export function scoreLead(lead: ScorableLead): LeadScore {
  const contributions: ScoreContribution[] = [];

  // Budget - the single strongest signal, so it carries the most weight.
  const budgetTier = lead.budgetAmount
    ? BUDGET_TIERS.find((tier) => lead.budgetAmount! >= tier.min)
    : undefined;

  contributions.push({
    label: "Budget",
    points: budgetTier?.points ?? 0,
    maxPoints: 30,
    reason: budgetTier
      ? `Stated budget ${budgetTier.label}.`
      : "No budget recorded.",
  });

  // Authority.
  contributions.push({
    label: "Decision maker",
    points: lead.isDecisionMaker === true ? 20 : 0,
    maxPoints: 20,
    reason:
      lead.isDecisionMaker === true
        ? "Speaking to the decision maker."
        : lead.isDecisionMaker === false
          ? "Not the decision maker."
          : "Decision-maker status unknown.",
  });

  // Timing.
  const timeline = lead.timeline ?? "";
  const timelinePoints = URGENT_TIMELINE.test(timeline)
    ? 15
    : NEAR_TIMELINE.test(timeline)
      ? 9
      : timeline.trim()
        ? 4
        : 0;

  contributions.push({
    label: "Timeline",
    points: timelinePoints,
    maxPoints: 15,
    reason: timelinePoints === 15
      ? "Ready to move immediately."
      : timelinePoints === 9
        ? "Moving within the next quarter."
        : timelinePoints === 4
          ? "Timeline recorded but not urgent."
          : "No timeline recorded.",
  });

  // Source quality.
  contributions.push({
    label: "Source",
    points: SOURCE_POINTS[lead.source] ?? 6,
    maxPoints: 20,
    reason: `Arrived via ${lead.source.toLowerCase().replaceAll("_", " ")}.`,
  });

  // Discovery depth - a lead whose problem and goal are captured has actually
  // been spoken to, which is itself a signal.
  const hasProblem = Boolean(lead.mainProblem?.trim());
  const hasGoal = Boolean(lead.goal?.trim());
  const discoveryPoints = (hasProblem ? 5 : 0) + (hasGoal ? 5 : 0);

  contributions.push({
    label: "Discovery",
    points: discoveryPoints,
    maxPoints: 10,
    reason:
      hasProblem && hasGoal
        ? "Problem and goal both captured."
        : hasProblem
          ? "Problem captured, goal missing."
          : hasGoal
            ? "Goal captured, problem missing."
            : "Neither problem nor goal captured.",
  });

  // Reachability. A lead nobody can contact cannot be worked.
  const contactPoints = (lead.email?.trim() ? 3 : 0) + (lead.phone?.trim() ? 2 : 0);

  contributions.push({
    label: "Contactable",
    points: contactPoints,
    maxPoints: 5,
    reason:
      contactPoints === 5
        ? "Email and phone on file."
        : contactPoints === 0
          ? "No email or phone on file."
          : "Only one contact method on file.",
  });

  const total = Math.min(
    100,
    contributions.reduce((sum, contribution) => sum + contribution.points, 0),
  );

  return {
    total,
    contributions,
    band: total >= 70 ? "HOT" : total >= 50 ? "WARM" : total >= 30 ? "COOL" : "COLD",
  };
}

export const scoreBandLabels = {
  HOT: "Hot",
  WARM: "Warm",
  COOL: "Cool",
  COLD: "Cold",
} as const;
