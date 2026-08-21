import {
  HEALTH_LABELS,
  type ClientMilestone,
  type ClientRow,
  healthFromStatus,
  nextMilestone,
} from "@/lib/clients/client-workspace";
import { JOURNEY_OWNERSHIP, journeyPosition } from "@/lib/workflow/handoff-engine";

/**
 * The five numbers at the top of a client's Overview.
 *
 * The reference design shows the agency-wide row from the Clients list here -
 * active clients, on track, at risk. Inside one account those answer a question
 * nobody is asking: you opened Cedar Ridge to find out about Cedar Ridge. So
 * the row keeps its shape and changes its content, which is what the brief
 * asks for over the picture.
 *
 * Every figure comes from data the page already loads, and every card points at
 * the tab that owns it. Journey progress in particular reuses journeyPosition -
 * the same helper the Journey tab renders - so the two cannot disagree, which
 * they would within a week if this recomputed it its own way.
 */

export type CardTone = "neutral" | "good" | "warn" | "bad";

export interface OverviewCard {
  key: "journey" | "health" | "work" | "milestone" | "renewal";
  label: string;
  value: string;
  detail: string;
  tone: CardTone;
  /** The tab that owns this, for the card link. */
  tab: "journey" | "tasks" | "reports";
}

const DAY = 86_400_000;

function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

function shortDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function journeyCard(client: ClientRow): OverviewCard {
  const position = journeyPosition(client.stageKey);
  const total = JOURNEY_OWNERSHIP.length;
  const completed = position === null ? 0 : position;
  const percent = position === null ? 0 : Math.round(((position + 1) / total) * 100);

  return {
    key: "journey",
    label: "Journey Progress",
    value: `${percent}%`,
    detail:
      position === null
        ? client.stageName
        : `${client.stageName} · ${completed} of ${total} stages done`,
    tone: "neutral",
    tab: "journey",
  };
}

function healthCard(client: ClientRow): OverviewCard {
  /*
   * The same mapping the clients list uses, blocker signal included - an
   * account nobody can move reads as Blocked here too rather than repeating
   * last month's assessment.
   */
  const health = healthFromStatus(client.healthStatus, {
    hasBlocker: Boolean(client.currentBlocker),
  });

  return {
    key: "health",
    label: "Client Health",
    value: HEALTH_LABELS[health],
    detail:
      health === "ON_TRACK"
        ? "No open risks on this account"
        : health === "NEEDS_ATTENTION"
          ? "Worth keeping an eye on"
          : health === "AT_RISK"
            ? "Needs attention now"
            : "Nothing can move until this clears",
    tone:
      health === "ON_TRACK" ? "good"
        : health === "NEEDS_ATTENTION" ? "warn"
          : "bad",
    tab: "reports",
  };
}

function workCard(client: ClientRow): OverviewCard {
  const parts = [`${client.openTaskCount} open`];

  if (client.overdueTaskCount > 0) parts.push(`${client.overdueTaskCount} overdue`);
  if (client.waitingTaskCount > 0) parts.push(`${client.waitingTaskCount} waiting`);

  return {
    key: "work",
    label: "Active Work",
    value: client.openTaskCount === 0 ? "Clear" : String(client.openTaskCount),
    detail: client.openTaskCount === 0 ? "No open work for this client" : parts.join(" · "),
    tone: client.overdueTaskCount > 0 ? "bad" : client.openTaskCount > 0 ? "neutral" : "good",
    tab: "tasks",
  };
}

function milestoneCard(milestone: ClientMilestone | null, now: Date): OverviewCard {
  if (!milestone) {
    return {
      key: "milestone",
      label: "Next Milestone",
      value: "None",
      detail: "No upcoming milestone",
      tone: "neutral",
      tab: "journey",
    };
  }

  const days = daysBetween(now, new Date(milestone.dueAt));

  return {
    key: "milestone",
    label: "Next Milestone",
    value: milestone.name,
    detail:
      days < 0
        ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
        : days === 0
          ? "Due today"
          : `${shortDate(milestone.dueAt)} · ${days} day${days === 1 ? "" : "s"} left`,
    tone: days < 0 ? "bad" : days <= 3 ? "warn" : "neutral",
    tab: "journey",
  };
}

function renewalCard(client: ClientRow, now: Date): OverviewCard {
  if (!client.renewalDate) {
    return {
      key: "renewal",
      label: "Renewal",
      value: "Not set",
      detail: "No renewal date configured",
      tone: "neutral",
      tab: "reports",
    };
  }

  const days = daysBetween(now, new Date(client.renewalDate));

  return {
    key: "renewal",
    label: "Renewal",
    value: shortDate(client.renewalDate),
    detail:
      days < 0
        ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past`
        : `${days} day${days === 1 ? "" : "s"} left`,
    // 45 days is the horizon the clients list already treats as "due soon", so
    // the card and the list agree about what counts as approaching.
    tone: days < 0 ? "bad" : days <= 45 ? "warn" : "neutral",
    tab: "reports",
  };
}

export function overviewCards(client: ClientRow, now: Date): OverviewCard[] {
  return [
    journeyCard(client),
    healthCard(client),
    workCard(client),
    milestoneCard(nextMilestone(client, now), now),
    renewalCard(client, now),
  ];
}

/** Where a card sends you. Always a tab that exists on this client. */
export function overviewCardHref(card: OverviewCard, clientId: string) {
  return `/clients/${clientId}?tab=${card.tab}`;
}
