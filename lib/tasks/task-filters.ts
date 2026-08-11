import type { EmployeeTaskStatus } from "@prisma/client";

/**
 * Turning a pile of tasks into the answer to "what am I doing today".
 *
 * Everything here is a pure function of the rows and the filter state, so the
 * screen can run it on every keystroke without asking the server, and the tests
 * can run it without a browser. The counts on the summary cards come from the
 * same functions the tabs use - a card that disagrees with the list under it is
 * worse than no card.
 */

/** The minimum a row needs to expose to be filtered, sorted and bucketed. */
export interface FilterableTask {
  id: string;
  title: string;
  status: EmployeeTaskStatus;
  priority: string;
  category: string;
  dueDate: string;
  createdAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  estimatedHours: number;
  note: string | null;
  objective: string | null;
  completionCriteria: string | null;
  client: { id: string; companyName: string } | null;
  project: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  reviewer: { id: string; name: string } | null;
}

export const ACTIVE_STATUSES: EmployeeTaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
];

export const COMPLETED_STATUSES: EmployeeTaskStatus[] = ["APPROVED", "DONE"];

export type TaskTab = "all" | "active" | "review" | "revision" | "completed" | "archived";

export const TASK_TABS: { value: TaskTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "review", label: "Needs Review" },
  { value: "revision", label: "Revision Required" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export type SortKey =
  | "due-asc"
  | "due-desc"
  | "assigned-desc"
  | "assigned-asc"
  | "priority-desc"
  | "priority-asc"
  | "client"
  | "status"
  | "hours";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "due-asc", label: "Due Date (Earliest)" },
  { value: "due-desc", label: "Due Date (Latest)" },
  { value: "assigned-desc", label: "Newest Assigned" },
  { value: "assigned-asc", label: "Oldest Assigned" },
  { value: "priority-desc", label: "Highest Priority" },
  { value: "priority-asc", label: "Lowest Priority" },
  { value: "client", label: "Client" },
  { value: "status", label: "Status" },
  { value: "hours", label: "Estimated Hours" },
];

export type DatePreset =
  | "any"
  | "today"
  | "this-week"
  | "next-7"
  | "this-month"
  | "last-month"
  | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "any", label: "Any due date" },
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "next-7", label: "Next 7 Days" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "custom", label: "Custom Range" },
];

/** Urgent sorts above high sorts above medium. Critical predates the six-seat set. */
const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 5,
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/** Roughly the order work moves in, for sorting by status. */
const STATUS_RANK: Record<string, number> = {
  BLOCKED: 0,
  REVISION_REQUIRED: 1,
  IN_PROGRESS: 2,
  TODO: 3,
  BACKLOG: 4,
  WAITING_CLIENT: 5,
  NEEDS_REVIEW: 6,
  APPROVED: 7,
  DONE: 8,
  CANCELLED: 9,
};

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * The window a preset means, resolved against a given "now".
 *
 * Now is passed in rather than read here so the same call gives the same answer
 * twice, and so a test can ask what "this week" meant on a Sunday.
 */
export function resolveDateRange(
  preset: DatePreset,
  now: Date,
  custom?: { from?: string | null; to?: string | null },
): { from: Date; to: Date } | null {
  const today = startOfDay(now);

  switch (preset) {
    case "today":
      return { from: today, to: endOfDay(now) };

    case "this-week": {
      // Monday to Sunday. The agency's week starts on Monday everywhere else
      // in this codebase, and a filter that disagreed would quietly shift
      // every count by a day.
      const weekday = (today.getDay() + 6) % 7;
      const monday = addDays(today, -weekday);
      return { from: monday, to: endOfDay(addDays(monday, 6)) };
    }

    case "next-7":
      return { from: today, to: endOfDay(addDays(today, 7)) };

    case "this-month":
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };

    case "last-month":
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)),
      };

    case "custom": {
      if (!custom?.from && !custom?.to) return null;

      const from = custom.from ? startOfDay(new Date(custom.from)) : new Date(-8_640_000_000_000);
      const to = custom.to ? endOfDay(new Date(custom.to)) : new Date(8_640_000_000_000);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

      return { from, to };
    }

    default:
      return null;
  }
}

/** Which tab a task belongs in. Archived wins over everything: it is off the board. */
export function tabFor(task: FilterableTask): Exclude<TaskTab, "all"> {
  if (task.archivedAt) return "archived";
  if (task.status === "NEEDS_REVIEW") return "review";
  if (task.status === "REVISION_REQUIRED") return "revision";
  if (COMPLETED_STATUSES.includes(task.status)) return "completed";
  if (ACTIVE_STATUSES.includes(task.status)) return "active";
  // Cancelled work is over. It is not active, and it was never approved.
  return "completed";
}

export function matchesTab(task: FilterableTask, tab: TaskTab) {
  // "All" means everything still on the board. Archived has its own tab, and
  // showing archived rows under All would undo the point of archiving.
  if (tab === "all") return !task.archivedAt;
  return tabFor(task) === tab;
}

export function countByTab(tasks: FilterableTask[]): Record<TaskTab, number> {
  const counts: Record<TaskTab, number> = {
    all: 0,
    active: 0,
    review: 0,
    revision: 0,
    completed: 0,
    archived: 0,
  };

  for (const task of tasks) {
    const bucket = tabFor(task);
    counts[bucket] += 1;
    if (!task.archivedAt) counts.all += 1;
  }

  return counts;
}

/**
 * Whether a task matches what somebody typed.
 *
 * Deliberately wide: people search for the client, the campaign, whoever
 * assigned it, or half a word from the title, and having to guess which field
 * the box looks at makes the box useless.
 */
export function matchesSearch(task: FilterableTask, term: string) {
  const needle = term.trim().toLowerCase();

  if (!needle) return true;

  const haystack = [
    task.title,
    task.client?.companyName ?? "Internal task",
    task.project?.name,
    task.category.replaceAll("_", " "),
    task.note,
    task.objective,
    task.completionCriteria,
    task.assignedTo?.name,
    task.createdBy?.name,
    task.reviewer?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Every word has to appear somewhere, so "meta best life" narrows rather
  // than widening the way an OR would.
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export interface TaskFilterState {
  tab: TaskTab;
  search: string;
  status: string;
  priority: string;
  category: string;
  clientId: string;
  datePreset: DatePreset;
  customFrom: string;
  customTo: string;
  sort: SortKey;
  /** Overdue, due today, in progress or sent back - one person's day. */
  todayOnly: boolean;
}

export const EMPTY_FILTERS: TaskFilterState = {
  tab: "all",
  search: "",
  status: "",
  priority: "",
  category: "",
  clientId: "",
  datePreset: "any",
  customFrom: "",
  customTo: "",
  sort: "due-asc",
  todayOnly: false,
};

/** Whether anything is narrowing the list, so the clear button knows to appear. */
export function hasActiveFilters(filters: TaskFilterState) {
  return (
    Boolean(filters.search.trim())
    || Boolean(filters.status)
    || Boolean(filters.priority)
    || Boolean(filters.category)
    || Boolean(filters.clientId)
    || filters.datePreset !== "any"
    || filters.todayOnly
    || filters.sort !== "due-asc"
    || filters.tab !== "all"
  );
}

/**
 * The daily focus view.
 *
 * Overdue, due today, already started, or sent back for changes. Everything a
 * person should look at before picking up anything new.
 */
export function isTodayFocus(task: FilterableTask, now: Date) {
  if (task.archivedAt) return false;
  if (COMPLETED_STATUSES.includes(task.status) || task.status === "CANCELLED") return false;

  const due = new Date(task.dueDate);
  const endOfToday = endOfDay(now);

  return (
    due <= endOfToday
    || task.status === "IN_PROGRESS"
    || task.status === "REVISION_REQUIRED"
  );
}

export function applyFilters<T extends FilterableTask>(
  tasks: T[],
  filters: TaskFilterState,
  now: Date,
): T[] {
  const range = resolveDateRange(filters.datePreset, now, {
    from: filters.customFrom,
    to: filters.customTo,
  });

  const filtered = tasks.filter((task) => {
    if (!matchesTab(task, filters.tab)) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.category && task.category !== filters.category) return false;

    if (filters.clientId) {
      const key = task.client?.id ?? "internal";
      if (key !== filters.clientId) return false;
    }

    if (range) {
      const due = new Date(task.dueDate);
      if (due < range.from || due > range.to) return false;
    }

    if (filters.todayOnly && !isTodayFocus(task, now)) return false;
    if (!matchesSearch(task, filters.search)) return false;

    return true;
  });

  return sortTasks(filtered, filters.sort);
}

export function sortTasks<T extends FilterableTask>(tasks: T[], sort: SortKey): T[] {
  const copy = [...tasks];

  const byDueAsc = (a: FilterableTask, b: FilterableTask) =>
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();

  copy.sort((a, b) => {
    switch (sort) {
      case "due-asc":
        return byDueAsc(a, b);
      case "due-desc":
        return byDueAsc(b, a);
      case "assigned-desc":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "assigned-asc":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "priority-desc":
        return (
          (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
          || byDueAsc(a, b)
        );
      case "priority-asc":
        return (
          (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0)
          || byDueAsc(a, b)
        );
      case "client":
        return (
          (a.client?.companyName ?? "Internal task").localeCompare(
            b.client?.companyName ?? "Internal task",
          ) || byDueAsc(a, b)
        );
      case "status":
        return (
          (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99) || byDueAsc(a, b)
        );
      case "hours":
        return b.estimatedHours - a.estimatedHours || byDueAsc(a, b);
      default:
        return byDueAsc(a, b);
    }
  });

  return copy;
}

export interface TaskSummary {
  active: number;
  dueSoon: number;
  overdue: number;
  needsReview: number;
  completedThisMonth: number;
}

/**
 * The five numbers across the top.
 *
 * Counted over everything the person can see rather than over the filtered
 * list, because these answer "how am I doing" and a filter would make them
 * answer "how is this filter doing".
 */
export function summarise(tasks: FilterableTask[], now: Date): TaskSummary {
  const today = startOfDay(now);
  const soonLimit = endOfDay(addDays(today, 3));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let active = 0;
  let dueSoon = 0;
  let overdue = 0;
  let needsReview = 0;
  let completedThisMonth = 0;

  for (const task of tasks) {
    const finished =
      COMPLETED_STATUSES.includes(task.status) || task.status === "CANCELLED";

    if (task.completedAt && COMPLETED_STATUSES.includes(task.status)) {
      const completed = new Date(task.completedAt);
      if (completed >= monthStart && completed <= now) completedThisMonth += 1;
    }

    // Archived work is history. It should not be counted as anything anybody
    // still has to do.
    if (task.archivedAt) continue;

    if (ACTIVE_STATUSES.includes(task.status)) active += 1;
    if (task.status === "NEEDS_REVIEW") needsReview += 1;

    if (!finished) {
      // Overdue and due soon are exclusive. A task counted in both would make
      // the two cards add up to more work than exists.
      const due = new Date(task.dueDate);
      if (due < today) overdue += 1;
      else if (due <= soonLimit) dueSoon += 1;
    }
  }

  return { active, dueSoon, overdue, needsReview, completedThisMonth };
}

/**
 * "Tomorrow", "3 days left", "2 days overdue".
 *
 * Whole days apart rather than hours, because somebody reading a list wants to
 * know which day, not that something is due in 26 hours.
 */
export function relativeDue(
  dueDate: string | Date,
  now: Date,
): { label: string; tone: "overdue" | "today" | "soon" | "later" } {
  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(now);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) {
    const overdueBy = Math.abs(days);
    return {
      label: overdueBy === 1 ? "1 day overdue" : `${overdueBy} days overdue`,
      tone: "overdue",
    };
  }

  if (days === 0) return { label: "Today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "soon" };
  if (days <= 3) return { label: `${days} days left`, tone: "soon" };

  return { label: `${days} days left`, tone: "later" };
}

export interface TaskAsset {
  label: string;
  url: string | null;
  kind: "drive" | "canva" | "document" | "image" | "website" | "ghl" | "other";
}

const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i;
const DOCUMENT_PATTERN = /\.(docx?|pdf|pptx?|xlsx?|csv|txt)(\?|#|$)/i;

/**
 * The assets tab, read out of the text field somebody typed.
 *
 * There is no file table and no upload: the agency keeps its work in Drive,
 * Canva and GoHighLevel, and a second copy in this database would be the one
 * that goes stale. So this reads what was written on the task and works out
 * what each line points at.
 */
export function parseTaskAssets(
  requiredAssets: string | null,
  evidenceUrl?: string | null,
): TaskAsset[] {
  const lines = [
    ...(requiredAssets ?? "").split(/[\r\n,]+/),
    ...(evidenceUrl ? [evidenceUrl] : []),
  ]
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const assets: TaskAsset[] = [];

  for (const line of lines) {
    // A line can be "Brand kit — https://…" or just a bare URL.
    const match = line.match(/https?:\/\/\S+/);
    const url = match?.[0] ?? null;
    const label = url ? line.replace(url, "").replace(/[\s—–:-]+$/, "").trim() || url : line;
    const key = url ?? label;

    if (seen.has(key)) continue;
    seen.add(key);

    assets.push({ label, url, kind: assetKind(url, label) });
  }

  return assets;
}

function assetKind(url: string | null, label: string): TaskAsset["kind"] {
  const subject = (url ?? label).toLowerCase();

  if (subject.includes("drive.google") || subject.includes("docs.google")) return "drive";
  if (subject.includes("canva.")) return "canva";
  if (subject.includes("gohighlevel") || subject.includes("leadconnector")) return "ghl";
  if (IMAGE_PATTERN.test(subject)) return "image";
  if (DOCUMENT_PATTERN.test(subject)) return "document";
  if (url) return "website";

  return "other";
}
