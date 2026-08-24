import type { SummaryKey } from "@/lib/journey/journey-board";

/**
 * How the Overview draws the Journey board's six summary cards.
 *
 * Presentation only. The numbers and the words are the board's - it owns what
 * "At Risk" means, and the Overview showing the same six labels with its own
 * definitions is how the two pages came to contradict each other. Everything
 * here is colour, icon and destination.
 */

export type MetricTone = "violet" | "emerald" | "amber" | "rose" | "sky" | "indigo";

export const METRIC_TONE: Record<SummaryKey, MetricTone> = {
  active: "violet",
  "on-track": "emerald",
  waiting: "amber",
  "at-risk": "rose",
  "launching-soon": "sky",
  "renewals-due": "indigo",
};

/**
 * Where a card goes, when it goes anywhere.
 *
 * Only the first one links. The Clients list holds its filter in component
 * state rather than in the URL, so a card claiming to filter it would land on
 * an unfiltered list - a link that lies is worse than a figure that reports.
 */
export function metricHref(key: SummaryKey): string | null {
  return key === "active" ? "/clients" : null;
}

/* -------------------------------------------------------------------------- */
/* Account health                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The score dial, in words.
 *
 * Only ever called with a score that was actually recorded. An assessment can
 * be saved without one, and the page draws an empty dial in that case rather
 * than inventing a number - a made-up 72 would be the most confident wrong
 * thing on the page.
 */
export function healthScoreLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";

  return "Poor";
}

export function healthScoreColor(score: number) {
  if (score >= 70) return "#10b981";
  if (score >= 50) return "#f59e0b";

  return "#f43f5e";
}
