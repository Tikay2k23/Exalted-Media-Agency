/**
 * Shared reading of a client's Overview.
 *
 * Dates in words, and the way the page groups a client's work. The six figures
 * across the top live in client-overview-metrics; the Needs Attention rows live
 * in client-overview-attention.
 */

const DAY = 86_400_000;

function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

/**
 * How far off a date is, in words.
 *
 * Exported so the milestone panel and anything else quoting a target say the
 * same thing. milestoneDayLabel, which the rest of the workspace uses, returns
 * a formatted date for anything beyond a day either side - fine beside a label,
 * but printed next to the date itself it reads "Aug 15, 2026 (Aug 15)".
 */
export function relativeDayLabel(value: string | Date, now: Date) {
  const days = daysBetween(now, new Date(value));

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";

  return days < 0 ? `${Math.abs(days)} days overdue` : `in ${days} days`;
}

/**
 * When something happened, the way the activity feed prints it.
 *
 * "Today at 2:15 PM" rather than "3 hours ago": the feed is read as a record of
 * what happened and in what order, and a list of elapsed times makes the reader
 * do arithmetic to work out whether two entries were minutes or days apart.
 */
export function activityStamp(value: string | Date, now: Date) {
  const at = new Date(value);
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((midnight.getTime() - at.getTime()) / DAY);

  if (at.getTime() >= midnight.getTime()) return `Today at ${time}`;
  if (days === 0) return `Yesterday at ${time}`;

  const date = at.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${date} at ${time}`;
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
  { key: "inProgress", label: "In Progress", color: "bg-sky-500" },
  { key: "blocked", label: "Blocked", color: "bg-rose-500" },
  { key: "review", label: "Needs Review", color: "bg-amber-500" },
  { key: "todo", label: "To Do", color: "bg-slate-300" },
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
