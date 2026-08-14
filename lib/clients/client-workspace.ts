/**
 * What the Clients pages need to know, derived from records that already exist.
 *
 * Nothing here queries and nothing here is stored. The attention reasons, the
 * milestone feed, the "waiting on client" state and every counter on the
 * dashboard are computed from the same array of clients the directory renders,
 * so a summary card reading four always filters to four.
 *
 * The one distinction this module exists to protect: health, stage and
 * operational state are three different facts. "At Risk" is a judgement about
 * the account, "Waiting on Access" is where it sits in delivery, and "waiting
 * on the client" is what is blocking it today. Collapsing any two of them - as
 * a health field containing "Waiting on Client" would - makes all three
 * unusable for the thing they are each for.
 */

/**
 * Intake states that mean the ball is in the client's court.
 *
 * NOT_SENT is deliberately absent: nobody has asked them yet, so that is the
 * agency waiting on itself. It still counts as something to attend to, which
 * is a different question and answered separately.
 */
const INTAKE_WITH_CLIENT = ["SENT", "VIEWED", "PARTIALLY_COMPLETED"];

/** Intake states that mean the form is done. */
const INTAKE_DONE = ["SUBMITTED", "REVIEWED"];

/** The four values client health may take. Nothing operational belongs here. */
export type ClientHealth = "ON_TRACK" | "NEEDS_ATTENTION" | "AT_RISK" | "BLOCKED";

export const HEALTH_LABELS: Record<ClientHealth, string> = {
  ON_TRACK: "On Track",
  NEEDS_ATTENTION: "Needs Attention",
  AT_RISK: "At Risk",
  BLOCKED: "Blocked",
};

export const HEALTH_TONES: Record<ClientHealth, "emerald" | "amber" | "rose" | "slate"> = {
  ON_TRACK: "emerald",
  NEEDS_ATTENTION: "amber",
  AT_RISK: "rose",
  BLOCKED: "slate",
};

/**
 * The stored HealthStatus enum, mapped onto the four the interface shows.
 *
 * GREEN/YELLOW/RED/NOT_ASSESSED is what the health assessment system already
 * records; this is a rename at the edge rather than a second column, so
 * assessments keep working and nobody has to migrate anything.
 */
export function healthFromStatus(
  status: string,
  signals: { hasBlocker: boolean } = { hasBlocker: false },
): ClientHealth {
  // A recorded blocker outranks the assessment: an account nobody can move is
  // blocked today whatever last month's review concluded.
  if (signals.hasBlocker) return "BLOCKED";

  switch (status) {
    case "RED":
      return "AT_RISK";
    case "YELLOW":
      return "NEEDS_ATTENTION";
    case "GREEN":
      return "ON_TRACK";
    default:
      // Never assessed is not the same as fine, but it is not a risk either.
      return "NEEDS_ATTENTION";
  }
}

/** Where an attention item sends you when you click it. */
export type ClientTab =
  | "overview"
  | "contacts"
  | "services"
  | "tasks"
  | "journey"
  | "quality"
  | "reports"
  | "files"
  | "activity"
  | "integrations";

export type AttentionKey =
  | "overdue-work"
  | "missing-access"
  | "intake-incomplete"
  | "approval-overdue"
  | "blocker"
  | "no-activity"
  | "report-overdue"
  | "open-defect"
  | "renewal-approaching"
  | "no-next-action";

export interface AttentionReason {
  key: AttentionKey;
  /** What is wrong, in words somebody can act on. */
  label: string;
  detail: string;
  /** The tab that can actually fix it. */
  tab: ClientTab;
  /** Higher sorts first. Work that is late outranks work that is merely due. */
  weight: number;
}

/** How long an account may go quiet before somebody should notice. */
export const QUIET_DAYS = 7;

/** How far ahead a renewal starts mattering. */
export const RENEWAL_HORIZON_DAYS = 45;

export interface ClientRow {
  id: string;
  companyName: string;
  clientName: string;
  contactEmail: string;
  contactPhone: string | null;
  status: string;
  /** The stored HealthStatus enum value. */
  healthStatus: string;
  stageId: string;
  stageName: string;
  stageKey: string | null;
  ownerId: string | null;
  ownerName: string | null;
  serviceType: string;
  /** Every service the account actually has, from its workstreams. */
  services: string[];
  monthlyValue: number | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  renewalDate: string | null;
  currentBlocker: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  lastClientUpdateAt: string | null;
  dateAdded: string;
  updatedAt: string;
  openTaskCount: number;
  overdueTaskCount: number;
  /** Open tasks parked on the client rather than on the agency. */
  waitingTaskCount: number;
  criticalAccessMissing: number;
  intakeStatus: string | null;
  openDefectCount: number;
  /**
   * Review rounds sitting with the client. Approval records only exist once
   * somebody has approved, so an outstanding sign-off is a review waiting for
   * feedback - not a missing Approval row.
   */
  awaitingReviewCount: number;
  overdueReportCount: number;
  lastActivityAt: string | null;
  lastActivityLabel: string | null;
  milestones: ClientMilestone[];
}

export interface ClientMilestone {
  id: string;
  clientId: string;
  clientName: string;
  /** What it is: "Strategy Call", "Monthly Report", "Renewal". */
  name: string;
  /** Where the date came from, so a click can open the right thing. */
  source:
    | "project-milestone"
    | "launch"
    | "report"
    | "review"
    | "renewal"
    | "contract-end"
    | "next-action";
  dueAt: string;
  /** True when the record carries a time rather than only a date. */
  hasTime: boolean;
  tab: ClientTab;
  status: string | null;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/**
 * Is somebody waiting on the client right now?
 *
 * An operational state, deliberately not a health value and not a stage. A
 * healthy account on schedule can still be waiting on a login, and an account
 * nobody is waiting on can still be at risk.
 */
export function isWaitingOnClient(client: ClientRow): boolean {
  return (
    client.waitingTaskCount > 0
    || client.criticalAccessMissing > 0
    || (client.intakeStatus !== null && INTAKE_WITH_CLIENT.includes(client.intakeStatus))
  );
}

export function isRenewalDueSoon(client: ClientRow, now: Date): boolean {
  const date = client.renewalDate ?? client.contractEndDate;

  if (!date) return false;

  const days = daysBetween(now, new Date(date));

  // Already past counts too: a renewal date that has gone by without a decision
  // is more urgent than one coming up, not less.
  return days <= RENEWAL_HORIZON_DAYS;
}

export function isActive(client: ClientRow): boolean {
  return client.status === "ACTIVE" || client.status === "AT_RISK";
}

/**
 * Everything wrong with one account, worst first.
 *
 * Each reason carries the tab that can fix it, so the dashboard row and the
 * client's own Needs Attention panel send you to the same place. Nothing is
 * invented: every entry is a record that exists with a date that has passed or
 * a state that is incomplete.
 */
export function attentionReasons(client: ClientRow, now: Date): AttentionReason[] {
  const reasons: AttentionReason[] = [];

  if (client.currentBlocker?.trim()) {
    reasons.push({
      key: "blocker",
      label: "Blocked",
      detail: client.currentBlocker.trim(),
      tab: "tasks",
      weight: 100,
    });
  }

  if (client.overdueTaskCount > 0) {
    reasons.push({
      key: "overdue-work",
      label: `${client.overdueTaskCount} overdue task${client.overdueTaskCount === 1 ? "" : "s"}`,
      detail: "Past its due date",
      tab: "tasks",
      weight: 90,
    });
  }

  if (client.criticalAccessMissing > 0) {
    reasons.push({
      key: "missing-access",
      label:
        client.criticalAccessMissing === 1
          ? "Platform access is missing"
          : `${client.criticalAccessMissing} platform accesses missing`,
      detail: "Waiting on the client",
      tab: "files",
      weight: 80,
    });
  }

  if (client.intakeStatus && !INTAKE_DONE.includes(client.intakeStatus)) {
    reasons.push({
      key: "intake-incomplete",
      label: "Client intake not completed",
      // Whose move it is depends on whether it has been sent yet, and saying so
      // is the difference between chasing them and chasing ourselves.
      detail: INTAKE_WITH_CLIENT.includes(client.intakeStatus)
        ? "Waiting on the client"
        : "Not sent yet",
      tab: "services",
      weight: 70,
    });
  }

  if (client.awaitingReviewCount > 0) {
    reasons.push({
      key: "approval-overdue",
      label: "Client approval outstanding",
      detail: `${client.awaitingReviewCount} review${client.awaitingReviewCount === 1 ? "" : "s"} waiting`,
      tab: "quality",
      weight: 65,
    });
  }

  if (client.openDefectCount > 0) {
    reasons.push({
      key: "open-defect",
      label: `${client.openDefectCount} open defect${client.openDefectCount === 1 ? "" : "s"}`,
      detail: "Quality issue outstanding",
      tab: "quality",
      weight: 60,
    });
  }

  if (client.overdueReportCount > 0) {
    reasons.push({
      key: "report-overdue",
      label: "Report overdue",
      detail: `${client.overdueReportCount} past its date`,
      tab: "reports",
      weight: 55,
    });
  }

  if (isRenewalDueSoon(client, now)) {
    const date = client.renewalDate ?? client.contractEndDate;
    const days = date ? daysBetween(now, new Date(date)) : 0;

    reasons.push({
      key: "renewal-approaching",
      label: days < 0 ? "Renewal date has passed" : "Renewal approaching",
      detail: days < 0 ? `${Math.abs(days)} days ago` : `In ${days} days`,
      tab: "reports",
      weight: 50,
    });
  }

  if (client.lastActivityAt) {
    const quiet = daysBetween(new Date(client.lastActivityAt), now);

    if (quiet >= QUIET_DAYS) {
      reasons.push({
        key: "no-activity",
        label: "No recent activity",
        detail: `Nothing for ${quiet} days`,
        tab: "activity",
        weight: 40,
      });
    }
  }

  if (!client.nextAction?.trim() && isActive(client)) {
    reasons.push({
      key: "no-next-action",
      label: "No next action set",
      detail: "Nobody has said what happens next",
      tab: "overview",
      weight: 30,
    });
  }

  return reasons.sort((a, b) => b.weight - a.weight);
}

export function needsAttention(client: ClientRow, now: Date): boolean {
  return attentionReasons(client, now).length > 0;
}

/**
 * The next thing that has to happen on this account, whatever kind of record
 * it lives on.
 *
 * A "milestone" is not its own table - it is any dated commitment the agency
 * has already recorded. Reading them together is what makes a single calendar
 * possible without a second system to keep in step.
 */
export function nextMilestone(client: ClientRow, now: Date): ClientMilestone | null {
  const upcoming = client.milestones
    .filter((milestone) => new Date(milestone.dueAt) >= startOfDay(now))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  // Nothing ahead falls back to the most recent one behind us, because "Client
  // Review, three days ago" is more useful than an empty cell.
  if (upcoming.length > 0) return upcoming[0]!;

  const past = [...client.milestones].sort(
    (a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime(),
  );

  return past[0] ?? null;
}

/** Every client's milestones in one list, soonest first. */
export function milestoneFeed(
  clients: ClientRow[],
  now: Date,
  limit = 8,
): ClientMilestone[] {
  return clients
    .flatMap((client) => client.milestones)
    .filter((milestone) => new Date(milestone.dueAt) >= startOfDay(now))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, limit);
}

export type SummaryKey =
  | "active"
  | "needs-attention"
  | "waiting-on-client"
  | "renewals-soon"
  | "open-work";

export interface SummaryCard {
  key: SummaryKey;
  label: string;
  value: number;
  hint: string;
}

/**
 * Whether a client belongs under a summary card.
 *
 * The card's count and the filter it applies come from this one predicate, so a
 * card reading six can never open a list of five.
 */
export function matchesSummary(client: ClientRow, key: SummaryKey, now: Date): boolean {
  switch (key) {
    case "active":
      return isActive(client);
    case "needs-attention":
      return needsAttention(client, now);
    case "waiting-on-client":
      return isWaitingOnClient(client);
    case "renewals-soon":
      return isRenewalDueSoon(client, now);
    case "open-work":
      return client.openTaskCount > 0;
  }
}

export function summaryCards(clients: ClientRow[], now: Date): SummaryCard[] {
  const count = (key: SummaryKey) =>
    clients.filter((client) => matchesSummary(client, key, now)).length;

  return [
    { key: "active", label: "Active Clients", value: count("active"), hint: "Live accounts" },
    {
      key: "needs-attention",
      label: "Needs Attention",
      value: count("needs-attention"),
      hint: "Something is wrong",
    },
    {
      key: "waiting-on-client",
      label: "Waiting on Client",
      value: count("waiting-on-client"),
      hint: "Blocked on them, not us",
    },
    {
      key: "renewals-soon",
      label: "Renewals Due Soon",
      value: count("renewals-soon"),
      hint: `Within ${RENEWAL_HORIZON_DAYS} days`,
    },
    {
      key: "open-work",
      label: "Open Work",
      // The number of tasks, not of clients - "18 open work" is a workload.
      value: clients.reduce((sum, client) => sum + client.openTaskCount, 0),
      hint: "Across every account",
    },
  ];
}

export type QuickFilterKey =
  | "all"
  | "needs-attention"
  | "waiting-on-client"
  | "at-risk"
  | "renewals-soon"
  | "overdue-work";

export function matchesQuickFilter(
  client: ClientRow,
  key: QuickFilterKey,
  now: Date,
): boolean {
  switch (key) {
    case "all":
      return true;
    case "needs-attention":
      return needsAttention(client, now);
    case "waiting-on-client":
      return isWaitingOnClient(client);
    case "at-risk":
      return healthFromStatus(client.healthStatus, {
        hasBlocker: Boolean(client.currentBlocker?.trim()),
      }) === "AT_RISK";
    case "renewals-soon":
      return isRenewalDueSoon(client, now);
    case "overdue-work":
      return client.overdueTaskCount > 0;
  }
}

export interface QuickFilterChip {
  key: QuickFilterKey;
  label: string;
  count: number;
}

const QUICK_FILTER_LABELS: Record<QuickFilterKey, string> = {
  all: "All Clients",
  "needs-attention": "Needs Attention",
  "waiting-on-client": "Waiting on Client",
  "at-risk": "At Risk",
  "renewals-soon": "Renewals Soon",
  "overdue-work": "Overdue Work",
};

export function quickFilterChips(clients: ClientRow[], now: Date): QuickFilterChip[] {
  return (Object.keys(QUICK_FILTER_LABELS) as QuickFilterKey[]).map((key) => ({
    key,
    label: QUICK_FILTER_LABELS[key],
    count: clients.filter((client) => matchesQuickFilter(client, key, now)).length,
  }));
}

export type ClientSort =
  | "most-urgent"
  | "recently-updated"
  | "least-recently-updated"
  | "milestone-soonest"
  | "most-overdue"
  | "renewal-soonest"
  | "name-asc"
  | "name-desc";

export const CLIENT_SORTS: { value: ClientSort; label: string }[] = [
  { value: "most-urgent", label: "Most Urgent" },
  { value: "recently-updated", label: "Recently Updated" },
  { value: "least-recently-updated", label: "Least Recently Updated" },
  { value: "milestone-soonest", label: "Next Milestone Soonest" },
  { value: "most-overdue", label: "Most Overdue Work" },
  { value: "renewal-soonest", label: "Renewal Soonest" },
  { value: "name-asc", label: "Client Name A to Z" },
  { value: "name-desc", label: "Client Name Z to A" },
];

export interface ClientFilters {
  search: string;
  quick: QuickFilterKey;
  ownerId: string;
  stageId: string;
  health: string;
  service: string;
  status: string;
  waiting: "" | "yes" | "no";
  renewal: "" | "soon" | "later";
  work: "" | "open" | "overdue" | "none";
  sort: ClientSort;
}

export const EMPTY_CLIENT_FILTERS: ClientFilters = {
  search: "",
  quick: "all",
  ownerId: "",
  stageId: "",
  health: "",
  service: "",
  status: "",
  waiting: "",
  renewal: "",
  work: "",
  sort: "most-urgent",
};

/** The filters behind the Filter control, counted for its badge. */
export function advancedFilterCount(filters: ClientFilters) {
  return [
    filters.ownerId,
    filters.stageId,
    filters.health,
    filters.service,
    filters.status,
    filters.waiting,
    filters.renewal,
    filters.work,
  ].filter(Boolean).length;
}

export function hasActiveFilters(filters: ClientFilters) {
  return (
    Boolean(filters.search.trim())
    || filters.quick !== "all"
    || advancedFilterCount(filters) > 0
    || filters.sort !== "most-urgent"
  );
}

export function matchesSearch(client: ClientRow, term: string) {
  const needle = term.trim().toLowerCase();

  if (!needle) return true;

  const haystack = [
    client.companyName,
    client.clientName,
    client.contactEmail,
    client.contactPhone,
    client.ownerName,
    client.serviceType.replaceAll("_", " "),
    ...client.services.map((service) => service.replaceAll("_", " ")),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * How much this account is shouting, for the default sort.
 *
 * The sum of what is wrong rather than the worst single thing, so an account
 * with four small problems outranks one with a single late report - which is
 * how somebody triaging a Monday morning actually wants the list ordered.
 */
export function urgencyScore(client: ClientRow, now: Date): number {
  return attentionReasons(client, now).reduce((sum, reason) => sum + reason.weight, 0);
}

export function applyClientFilters(
  clients: ClientRow[],
  filters: ClientFilters,
  now: Date,
): ClientRow[] {
  const filtered = clients.filter((client) => {
    if (!matchesQuickFilter(client, filters.quick, now)) return false;
    if (filters.ownerId) {
      const key = client.ownerId ?? "unassigned";
      if (key !== filters.ownerId) return false;
    }
    if (filters.stageId && client.stageId !== filters.stageId) return false;
    if (filters.status && client.status !== filters.status) return false;

    if (filters.health) {
      const health = healthFromStatus(client.healthStatus, {
        hasBlocker: Boolean(client.currentBlocker?.trim()),
      });

      if (health !== filters.health) return false;
    }

    if (filters.service) {
      const services = client.services.length ? client.services : [client.serviceType];
      if (!services.includes(filters.service)) return false;
    }

    if (filters.waiting) {
      const waiting = isWaitingOnClient(client);
      if (filters.waiting === "yes" && !waiting) return false;
      if (filters.waiting === "no" && waiting) return false;
    }

    if (filters.renewal) {
      const soon = isRenewalDueSoon(client, now);
      if (filters.renewal === "soon" && !soon) return false;
      if (filters.renewal === "later" && soon) return false;
    }

    if (filters.work === "open" && client.openTaskCount === 0) return false;
    if (filters.work === "overdue" && client.overdueTaskCount === 0) return false;
    if (filters.work === "none" && client.openTaskCount > 0) return false;

    if (!matchesSearch(client, filters.search)) return false;

    return true;
  });

  return sortClients(filtered, filters.sort, now);
}

export function sortClients(
  clients: ClientRow[],
  sort: ClientSort,
  now: Date,
): ClientRow[] {
  const copy = [...clients];

  // An account with no milestone is not "due first" - it goes to the end of the
  // soonest-first orders rather than the top of them.
  const milestoneTime = (client: ClientRow) => {
    const next = nextMilestone(client, now);
    return next ? new Date(next.dueAt).getTime() : Number.POSITIVE_INFINITY;
  };

  const renewalTime = (client: ClientRow) => {
    const date = client.renewalDate ?? client.contractEndDate;
    return date ? new Date(date).getTime() : Number.POSITIVE_INFINITY;
  };

  copy.sort((a, b) => {
    switch (sort) {
      case "most-urgent":
        return (
          urgencyScore(b, now) - urgencyScore(a, now)
          || b.overdueTaskCount - a.overdueTaskCount
          || a.companyName.localeCompare(b.companyName)
        );
      case "recently-updated":
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "least-recently-updated":
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      case "milestone-soonest":
        return milestoneTime(a) - milestoneTime(b);
      case "most-overdue":
        return b.overdueTaskCount - a.overdueTaskCount;
      case "renewal-soonest":
        return renewalTime(a) - renewalTime(b);
      case "name-asc":
        return a.companyName.localeCompare(b.companyName);
      case "name-desc":
        return b.companyName.localeCompare(a.companyName);
    }
  });

  return copy;
}

/** "2 hours ago", "Yesterday", "3 days ago", "Never". */
export function relativeTime(value: string | null, now: Date): string {
  if (!value) return "Never";

  const then = new Date(value);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = daysBetween(then, now);

  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;

  return then.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "Today", "Tomorrow", "Aug 18", with the year once it stops being obvious. */
export function milestoneDayLabel(value: string, now: Date): string {
  const at = new Date(value);
  const days = daysBetween(now, at);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  return at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** The service to show in one column when an account has several. */
export function serviceLabel(client: ClientRow): string {
  const services = client.services.length ? client.services : [client.serviceType];

  if (services.length === 1) {
    return services[0]!
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // Naming three services in a table cell is unreadable; the count is honest
  // and the drawer lists them properly.
  return `${services.length} Services`;
}
