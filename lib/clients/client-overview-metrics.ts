import {
  RENEWAL_HORIZON_DAYS,
  type ClientRow,
  healthFromStatus,
  isActive,
  isRenewalDueSoon,
  isWaitingOnClient,
} from "@/lib/clients/client-workspace";

/**
 * The six figures across the top of a client's Overview.
 *
 * These are agency-wide, not about the client whose page you are on. That is
 * deliberate and it is what the design asks for: the row is the same portfolio
 * summary the Clients list carries, so the account you have open is read
 * against the book it belongs to rather than in isolation.
 *
 * Every count runs through the predicate that already defines it elsewhere -
 * isActive, healthFromStatus, isWaitingOnClient, isRenewalDueSoon - so this row
 * and the Clients list cannot report different numbers for the same word. The
 * one figure with no existing predicate is Launching Soon, which reads the
 * launch milestones the dashboard query already assembles.
 */

/** How far ahead a launch counts as "soon". */
export const LAUNCH_HORIZON_DAYS = 14;

export type MetricKey =
  | "active"
  | "on-track"
  | "waiting"
  | "at-risk"
  | "launching"
  | "renewals";

export type MetricTone = "violet" | "emerald" | "amber" | "rose" | "sky" | "indigo";

export interface AgencyMetric {
  key: MetricKey;
  label: string;
  value: number;
  /** The small line under the number. */
  detail: string;
  tone: MetricTone;
  /**
   * Where the card goes, when it goes anywhere.
   *
   * Only the first card carries a link. The Clients list holds its filter in
   * component state rather than in the URL, so a card claiming to filter it
   * would land on an unfiltered list - a link that lies is worse than a figure
   * that simply reports.
   */
  href?: string;
}

const DAY = 86_400_000;

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function healthOf(client: ClientRow) {
  return healthFromStatus(client.healthStatus, {
    hasBlocker: Boolean(client.currentBlocker?.trim()),
  });
}

export function isOnTrack(client: ClientRow) {
  return isActive(client) && healthOf(client) === "ON_TRACK";
}

/**
 * Waiting on the client, or stopped by something recorded.
 *
 * Two states the reference prints as one card, and they belong together: from
 * the agency's side both mean the account is not moving and the next move is
 * not ours to make.
 */
export function isWaitingOrBlocked(client: ClientRow) {
  return (
    isActive(client)
    && (isWaitingOnClient(client) || Boolean(client.currentBlocker?.trim()))
  );
}

export function isAtRisk(client: ClientRow) {
  return isActive(client) && healthOf(client) === "AT_RISK";
}

/** A launch date already on the account, inside the horizon. */
export function isLaunchingSoon(client: ClientRow, now: Date) {
  const from = startOfDay(now).getTime();
  const until = from + LAUNCH_HORIZON_DAYS * DAY;

  return client.milestones.some((milestone) => {
    if (milestone.source !== "launch") return false;

    const at = new Date(milestone.dueAt).getTime();

    return at >= from && at <= until;
  });
}

export function agencyMetrics(clients: ClientRow[], now: Date): AgencyMetric[] {
  const active = clients.filter(isActive).length;

  /*
   * Percentages are of the active book, not of every row ever created. An
   * agency with 28 live accounts and 200 archived ones would otherwise read as
   * "6% on track" and look like a business in trouble.
   */
  const share = (count: number) =>
    active === 0 ? "No active clients" : `${Math.round((count / active) * 100)}% of clients`;

  const onTrack = clients.filter(isOnTrack).length;
  const waiting = clients.filter(isWaitingOrBlocked).length;
  const atRisk = clients.filter(isAtRisk).length;
  const launching = clients.filter((client) => isLaunchingSoon(client, now)).length;
  const renewals = clients.filter(
    (client) => isActive(client) && isRenewalDueSoon(client, now),
  ).length;

  return [
    {
      key: "active",
      label: "Active Clients",
      value: active,
      detail: "View all",
      tone: "violet",
      href: "/clients",
    },
    { key: "on-track", label: "On Track", value: onTrack, detail: share(onTrack), tone: "emerald" },
    {
      key: "waiting",
      label: "Waiting / Blocked",
      value: waiting,
      detail: share(waiting),
      tone: "amber",
    },
    { key: "at-risk", label: "At Risk", value: atRisk, detail: share(atRisk), tone: "rose" },
    {
      key: "launching",
      label: "Launching Soon",
      value: launching,
      detail: `Next ${LAUNCH_HORIZON_DAYS} days`,
      tone: "sky",
    },
    {
      key: "renewals",
      label: "Renewals Due",
      value: renewals,
      // The horizon the rest of the application already treats as "due soon",
      // rather than a second number that disagrees with the Clients list.
      detail: `Next ${RENEWAL_HORIZON_DAYS} days`,
      tone: "indigo",
    },
  ];
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
