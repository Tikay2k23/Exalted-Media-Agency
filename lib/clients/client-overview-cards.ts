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

/**
 * How far off a date is, in words.
 *
 * Exported so the milestone card and the milestone panel say the same thing.
 * milestoneDayLabel, which the rest of the page uses, returns a formatted date
 * for anything beyond a day either side - fine beside a label, but printed
 * next to the date itself it reads "Aug 15, 2026 (Aug 15)".
 */
export function relativeDayLabel(value: string | Date, now: Date) {
  const days = daysBetween(now, new Date(value));

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";

  return days < 0
    ? `${Math.abs(days)} days overdue`
    : `in ${days} days`;
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
      days <= 0
        ? relativeDayLabel(milestone.dueAt, now)
        : `${shortDate(milestone.dueAt)} · ${relativeDayLabel(milestone.dueAt, now)}`,
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

/* -------------------------------------------------------------------------- */
/* Active work                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The client's work, grouped the way the overview reports it.
 *
 * Buckets rather than raw statuses: ten statuses is the right vocabulary for a
 * task board and the wrong one for a summary, where the question is only
 * "how much is done, moving, stuck, or waiting on a person".
 *
 * Cancelled work is left out of the total entirely. Counting it would make the
 * denominator disagree with every other count of this client's work on the
 * page, and "8 tasks, 3 of them cancelled" is not what anybody means by eight
 * tasks.
 */
export interface WorkBucket {
  key: "completed" | "inProgress" | "review" | "blocked" | "todo";
  label: string;
  count: number;
  /** Tailwind background for the legend dot and the ring segment. */
  color: string;
}

export interface WorkBreakdown {
  total: number;
  overdue: number;
  buckets: WorkBucket[];
}

const BUCKET_OF: Record<string, WorkBucket["key"] | "excluded"> = {
  DONE: "completed",
  APPROVED: "completed",
  IN_PROGRESS: "inProgress",
  NEEDS_REVIEW: "review",
  REVISION_REQUIRED: "review",
  BLOCKED: "blocked",
  WAITING_CLIENT: "blocked",
  TODO: "todo",
  BACKLOG: "todo",
  CANCELLED: "excluded",
};

const BUCKET_META: { key: WorkBucket["key"]; label: string; color: string }[] = [
  { key: "completed", label: "Completed", color: "bg-emerald-500" },
  { key: "inProgress", label: "In progress", color: "bg-sky-500" },
  { key: "review", label: "Needs review", color: "bg-violet-500" },
  { key: "blocked", label: "Blocked or waiting", color: "bg-amber-500" },
  { key: "todo", label: "To do", color: "bg-slate-300" },
];

export function workBreakdown(
  tasks: { status: string; dueDate: Date | string | null }[],
  now: Date,
): WorkBreakdown {
  const counts = new Map<WorkBucket["key"], number>();
  let total = 0;
  let overdue = 0;

  for (const task of tasks) {
    const bucket = BUCKET_OF[task.status];

    if (!bucket || bucket === "excluded") continue;

    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    total += 1;

    // Overdue is about work still to do: finished work that was late is a
    // fact about the past, not something to act on today.
    if (
      bucket !== "completed"
      && task.dueDate
      && new Date(task.dueDate).getTime() < now.getTime()
    ) {
      overdue += 1;
    }
  }

  return {
    total,
    overdue,
    buckets: BUCKET_META.map((meta) => ({ ...meta, count: counts.get(meta.key) ?? 0 }))
      .filter((bucket) => bucket.count > 0),
  };
}
