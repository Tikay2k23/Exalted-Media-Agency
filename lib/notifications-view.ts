/**
 * What a notification is, and what to do about it.
 *
 * Every decision the popup makes - which tab a row belongs in, which button it
 * offers, what order the list comes in, whether several rows collapse into one
 * - is derived here from the type and urgency already stored. None of it is a
 * column, so re-categorising something is a change in one place rather than a
 * migration over three hundred rows.
 *
 * Kept free of React and Prisma so both the API and the interface can use it,
 * and so the rules can be tested without either.
 */

export type NotificationCategory = "CRITICAL" | "ACTION" | "UPDATE";

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  CRITICAL: "Critical",
  ACTION: "Action Required",
  UPDATE: "Update",
};

/**
 * Types that need somebody to do something.
 *
 * Exported because the unread badge counts these in SQL, and a second list in
 * a where clause would drift from this one the first time either changed.
 */
export const ACTION_TYPES = [
  "TASK_ASSIGNED",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "CLIENT_WAITING",
  "MISSING_ACCESS",
  "MISSING_PAYMENT",
  "QA_DEFECT",
  "REVISION_REQUEST",
  "APPROVAL_REQUIRED",
  "REPORT_DUE",
  "RENEWAL_APPROACHING",
  "CORRECTIVE_ACTION_OVERDUE",
  "CERTIFICATION_EXPIRING",
  "AUDIT_FINDING",
  "PAYMENT_FAILED",
  "LAUNCH_INCIDENT",
] as const;

/** Types that report something that happened. Nothing is owed in return. */
export const UPDATE_TYPES = [
  "APPROVAL_RECEIVED",
  "LAUNCH_SCHEDULED",
  "CLIENT_HEALTH_CHANGE",
  "STAGE_OVERRIDE",
] as const;

const ACTION_SET: ReadonlySet<string> = new Set(ACTION_TYPES);

/**
 * Which tab a notification belongs in.
 *
 * Urgency wins outright. Callers set CRITICAL deliberately - a launch incident
 * at two in the morning, an access record pulled before a client admin
 * existed - and the type alone cannot know that. Everything else is decided by
 * what the type means: something owed, or something reported.
 */
export function categoryOf(type: string, urgency: string): NotificationCategory {
  if (urgency === "CRITICAL") return "CRITICAL";
  if (ACTION_SET.has(type)) return "ACTION";

  return "UPDATE";
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The one button a notification offers.
 *
 * Only a label: the destination is the href the notification was created with,
 * so this cannot send anybody somewhere the original event did not intend. A
 * type with no obvious verb gets null and the row is simply clickable.
 */
export function actionLabelFor(type: string): string | null {
  switch (type) {
    case "TASK_ASSIGNED":
    case "TASK_DUE_SOON":
    case "TASK_OVERDUE":
      return "Open Task";
    case "MISSING_ACCESS":
      return "Review Access";
    case "MISSING_PAYMENT":
    case "PAYMENT_FAILED":
      return "Review Payment";
    case "REPORT_DUE":
      return "Review Report";
    case "APPROVAL_REQUIRED":
      return "Review Request";
    case "REVISION_REQUEST":
      return "View Feedback";
    case "CLIENT_WAITING":
      return "Send Follow-Up";
    case "QA_DEFECT":
      return "View Defect";
    case "LAUNCH_INCIDENT":
      return "View Blocker";
    case "RENEWAL_APPROACHING":
      return "Open Renewal";
    case "AUDIT_FINDING":
      return "Open Finding";
    case "CORRECTIVE_ACTION_OVERDUE":
      return "Open Action";
    case "CERTIFICATION_EXPIRING":
      return "Open Training";
    case "STAGE_OVERRIDE":
      return "View Override";
    default:
      return null;
  }
}

/** Which icon the row shows. Resolved to a component in the interface. */
export function iconKeyFor(type: string, category: NotificationCategory): string {
  if (category === "CRITICAL") return "alert";

  switch (type) {
    case "TASK_ASSIGNED":
    case "TASK_DUE_SOON":
    case "TASK_OVERDUE":
      return "task";
    case "REPORT_DUE":
      return "report";
    case "MISSING_ACCESS":
      return "key";
    case "MISSING_PAYMENT":
    case "PAYMENT_FAILED":
      return "payment";
    case "CLIENT_WAITING":
      return "person";
    case "REVISION_REQUEST":
    case "QA_DEFECT":
      return "revision";
    case "APPROVAL_REQUIRED":
    case "APPROVAL_RECEIVED":
      return "approval";
    case "RENEWAL_APPROACHING":
      return "renewal";
    case "LAUNCH_SCHEDULED":
    case "LAUNCH_INCIDENT":
      return "launch";
    case "CLIENT_HEALTH_CHANGE":
      return "health";
    case "STAGE_OVERRIDE":
      return "override";
    default:
      return "bell";
  }
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * "2 min ago", "1 hr ago", "Yesterday", "Aug 18".
 *
 * Deliberately not the relativeTime the journey board uses: that one is built
 * for a dense activity column and stops at "3d ago", where a notification list
 * wants a date once something is older than a couple of days.
 */
export function relativeTimeLabel(value: string | Date, now: Date): string {
  const when = new Date(value);
  const seconds = Math.round((now.getTime() - when.getTime()) / 1000);

  if (seconds < 60) return "Just now";

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes} min ago`;

  /*
   * Days are counted on the calendar, not in elapsed hours.
   *
   * Measuring "yesterday" as more than twenty-four hours means something sent
   * at ten last night is still "14 hrs ago" at lunchtime, which is not how
   * anybody reads a date. Crossing midnight is what makes it yesterday.
   */
  const startOfToday = new Date(now);

  startOfToday.setHours(0, 0, 0, 0);

  if (when >= startOfToday) {
    const hours = Math.round(minutes / 60);

    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }

  const startOfYesterday = new Date(startOfToday);

  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (when >= startOfYesterday) return "Yesterday";

  return when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

export interface NotificationRow {
  id: string;
  type: string;
  urgency: string;
  title: string;
  body: string | null;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
  /** The client, task or report this is about, when it could be resolved. */
  subject?: string | null;
}

export type TabKey = "all" | "action" | "critical" | "updates";

export const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "action", label: "Action Required" },
  { key: "critical", label: "Critical" },
  { key: "updates", label: "Updates" },
];

export function matchesTab(row: NotificationRow, tab: TabKey): boolean {
  if (tab === "all") return true;

  const category = categoryOf(row.type, row.urgency);

  if (tab === "critical") return category === "CRITICAL";
  if (tab === "action") return category === "ACTION";

  return category === "UPDATE";
}

export function tabCounts(rows: NotificationRow[]): Record<TabKey, number> {
  return {
    all: rows.length,
    action: rows.filter((row) => matchesTab(row, "action")).length,
    critical: rows.filter((row) => matchesTab(row, "critical")).length,
    updates: rows.filter((row) => matchesTab(row, "updates")).length,
  };
}

/**
 * Worst and newest first.
 *
 * Unread outranks read outright, then critical before action before update.
 * Somebody opening the bell is asking "what needs me", and a read update from
 * yesterday is never the answer.
 */
export function sortNotifications(rows: NotificationRow[]): NotificationRow[] {
  const rank = (row: NotificationRow) => {
    const unread = !row.readAt;
    const category = categoryOf(row.type, row.urgency);

    if (unread && category === "CRITICAL") return 0;
    if (unread && category === "ACTION") return 1;
    if (unread) return 2;
    if (category === "CRITICAL") return 3;

    return 4;
  };

  return [...rows].sort(
    (a, b) =>
      rank(a) - rank(b)
      || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

export interface NotificationGroup {
  /** Stable across renders: the newest member's id. */
  id: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  subject: string | null;
  createdAt: string;
  unread: boolean;
  actionLabel: string | null;
  iconKey: string;
  /** Every notification folded into this row, newest first. */
  members: NotificationRow[];
  count: number;
}

/** "Ada + 2 others" from the subjects of the folded rows. */
function describeMembers(rows: NotificationRow[]): string | null {
  const names = Array.from(
    new Set(
      rows
        .map((row) => row.subject?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;

  return `${names[0]} + ${names.length - 1} others`;
}

/**
 * What a folded row is called.
 *
 * Named from the type rather than pluralised from one member's title. Adding
 * an "s" to a sentence produces "31 Weekly report from EOD Adas", which is
 * both wrong and the first thing anybody would notice. The type already knows
 * what the notification is about, so it can say so properly.
 */
export function groupTitleFor(type: string, count: number): string {
  const noun = (singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

  switch (type) {
    case "TASK_ASSIGNED":
      return noun("task assigned", "tasks assigned");
    case "TASK_DUE_SOON":
      return noun("task due soon", "tasks due soon");
    case "TASK_OVERDUE":
      return noun("overdue task", "overdue tasks");
    case "REPORT_DUE":
      return noun("report to review", "reports to review");
    case "APPROVAL_REQUIRED":
      return noun("approval request", "approval requests");
    case "APPROVAL_RECEIVED":
      return noun("approval received", "approvals received");
    case "REVISION_REQUEST":
      return noun("revision request", "revision requests");
    case "MISSING_ACCESS":
      return noun("access record outstanding", "access records outstanding");
    case "MISSING_PAYMENT":
      return noun("outstanding payment", "outstanding payments");
    case "PAYMENT_FAILED":
      return noun("failed payment", "failed payments");
    case "CLIENT_WAITING":
      return noun("client waiting", "clients waiting");
    case "QA_DEFECT":
      return noun("open defect", "open defects");
    case "AUDIT_FINDING":
      return noun("audit finding", "audit findings");
    case "CORRECTIVE_ACTION_OVERDUE":
      return noun("overdue corrective action", "overdue corrective actions");
    case "CERTIFICATION_EXPIRING":
      return noun("expiring certification", "expiring certifications");
    case "RENEWAL_APPROACHING":
      return noun("renewal approaching", "renewals approaching");
    case "LAUNCH_SCHEDULED":
      return noun("scheduled launch", "scheduled launches");
    case "LAUNCH_INCIDENT":
      return noun("launch incident", "launch incidents");
    case "CLIENT_HEALTH_CHANGE":
      return noun("client health change", "client health changes");
    case "STAGE_OVERRIDE":
      return noun("stage override", "stage overrides");
    default:
      return noun("notification", "notifications");
  }
}

/**
 * Folds repeats of the same thing into one row.
 *
 * Two hundred separate "Approval required" lines is not a list anybody reads;
 * it is a wall that teaches people to ignore the bell. Rows only ever fold
 * with others of the same type and read state, so an unread critical alert can
 * never be hidden inside a stack of read updates.
 *
 * A group of one is left exactly as it was, so nothing is reworded unless
 * folding actually happened.
 */
export function groupNotifications(rows: NotificationRow[]): NotificationGroup[] {
  const buckets = new Map<string, NotificationRow[]>();

  for (const row of sortNotifications(rows)) {
    const unread = row.readAt ? "read" : "unread";
    const key = `${row.type}::${unread}`;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }

  const groups: NotificationGroup[] = [];

  for (const members of buckets.values()) {
    const [newest] = members;
    const category = categoryOf(newest.type, newest.urgency);
    const count = members.length;
    const subject = describeMembers(members);

    groups.push({
      id: newest.id,
      category,
      type: newest.type,
      title: count === 1 ? newest.title : groupTitleFor(newest.type, count),
      body:
        count === 1
          ? newest.body
          : (subject ?? `${count} notifications of this kind are waiting.`),
      href: newest.href,
      subject: count === 1 ? (newest.subject ?? null) : null,
      createdAt: newest.createdAt,
      unread: !newest.readAt,
      actionLabel: actionLabelFor(newest.type),
      iconKey: iconKeyFor(newest.type, category),
      members,
      count,
    });
  }

  // The buckets came from a sorted list, so the newest member of each already
  // carries its rank; re-sorting by that member restores the intended order.
  return groups.sort((a, b) => {
    const rankOf = (group: NotificationGroup) => {
      if (group.unread && group.category === "CRITICAL") return 0;
      if (group.unread && group.category === "ACTION") return 1;
      if (group.unread) return 2;
      if (group.category === "CRITICAL") return 3;

      return 4;
    };

    return (
      rankOf(a) - rankOf(b)
      || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
}
