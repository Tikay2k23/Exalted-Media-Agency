/**
 * Turning leads into the answers a salesperson opens the page for.
 *
 * Pure functions over rows. The metric strip, the Needs Action cards, the
 * pipeline counts and the table all run this same code, so a counter can never
 * disagree with the list it filters to - which matters more here than anywhere
 * else in the app, because a card saying "3 overdue" that filters to two leads
 * is worse than no card at all.
 *
 * Nothing here touches the database, so the browser can re-run it on every
 * keystroke without a round trip.
 */

/**
 * One opportunity, as the browser sees it. Dates are strings; money is a
 * number - Decimal does not survive the trip to a client component.
 *
 * Board and list are two renderings of this same array. There is no second
 * query behind the list view and no separate lead record behind the board,
 * which is why switching between them cannot show different deals.
 */
export interface SalesLead {
  id: string;
  /** The contact this deal belongs to. Several deals may share one. */
  contactId: string | null;
  contactName: string;
  businessName: string;
  /** What this deal is for, when somebody named it. */
  opportunityName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  stageId: string | null;
  stageKey: string | null;
  stageName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextAction: string | null;
  nextFollowUpAt: string | null;
  lastContactAt: string | null;
  strategyCallAt: string | null;
  strategyCallStatus: string | null;
  proposalSentAt: string | null;
  wonAt: string | null;
  wonByName: string | null;
  lostAt: string | null;
  lostReasonCode: string | null;
  nurtureUntil: string | null;
  expectedCloseAt: string | null;
  /** What the agency expects to charge. See budgetAmount for the difference. */
  opportunityValue: number | null;
  budgetAmount: number | null;
  budgetRange: string | null;
  proposalValue: number | null;
  finalValue: number | null;
  convertedClientId: string | null;
  /**
   * Where the sales-to-delivery handoff got to, or null when this opportunity
   * has never been closed as won. Distinct from convertedClientId: a deal that
   * is won and awaiting payment has a handoff and no client yet.
   */
  handoffState: string | null;
  /** The account the handoff produced or linked, once there is one. */
  handoffClientId: string | null;
  serviceInterest: string | null;
  campaign: string | null;

  /** The qualification answers, as they were given. */
  timeline: string | null;
  isDecisionMaker: boolean | null;
  mainProblem: string | null;
  goal: string | null;
  currentSolution: string | null;
  qualificationNotes: string | null;
  score: number | null;

  /** Custom labels only. The stage tag is derived - see stageTag(). */
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  followerNames: string[];
  /**
   * What has actually happened on this deal, counted rather than guessed. The
   * card only lights an icon it has a real number for; an icon that is always
   * lit tells nobody anything.
   */
  activity: {
    calls: number;
    notes: number;
    tasks: number;
    appointments: number;
    files: number;
  };
}

/**
 * What one opportunity is worth.
 *
 * Most committed number first: what was agreed, else what was quoted, else what
 * the agency expects to charge, else what they said they could spend. Each step
 * down is a weaker claim, and summing more than one of them would count the
 * same deal twice - which is how a forecast comes to be worth nothing.
 */
export function dealValue(lead: SalesLead): number {
  return (
    lead.finalValue
    ?? lead.proposalValue
    ?? lead.opportunityValue
    ?? lead.budgetAmount
    ?? 0
  );
}

/** What to call this deal. The name somebody gave it, else the account. */
export function opportunityLabel(lead: SalesLead): string {
  return lead.opportunityName?.trim() || lead.businessName;
}

/**
 * How long a proposal may sit before it is worth chasing.
 *
 * A default, not a rule. The stage carries an SLA of five days in the seed
 * data, and the page passes that through when it has one - this is only the
 * fallback for a workspace whose stage has no SLA set.
 */
export const DEFAULT_PROPOSAL_AGING_DAYS = 5;

/** Stage keys that mean the opportunity is still live. */
export const OPEN_STAGE_KEYS = [
  "new_website_lead",
  "application_submitted",
  "attempting_contact",
  "contacted",
  "strategy_call_booked",
  "strategy_call_showed",
  "qualified",
  "proposal_sent",
  "negotiation",
] as const;

/** Terminal stages. Nurture is not one of them - it is parked, not finished. */
const CLOSED_STAGE_KEYS = ["won", "lost", "abandoned"];

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

function daysBetween(from: Date, to: Date) {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** Live work: not won, not lost, not abandoned, not deleted. */
export function isOpen(lead: SalesLead) {
  if (lead.stageKey) return !CLOSED_STAGE_KEYS.includes(lead.stageKey);
  return !["CONVERTED", "LOST", "ABANDONED", "DISQUALIFIED"].includes(lead.status);
}

/** Parked for later. Open, but deliberately not in today's chase list. */
export function isNurture(lead: SalesLead) {
  return lead.stageKey === "long_term_nurture" || lead.status === "NURTURE";
}

/**
 * Whether this lead is waiting on a follow-up that has come due.
 *
 * Nurture is excluded until its own date arrives: the whole point of parking
 * somebody is that they stop appearing in today's list, and a nurture lead that
 * kept nagging would just get marked lost to silence it.
 */
export function isFollowUpDue(lead: SalesLead, now: Date) {
  if (!isOpen(lead)) return false;

  if (isNurture(lead)) {
    if (!lead.nurtureUntil) return false;
    return new Date(lead.nurtureUntil) <= endOfDay(now);
  }

  if (!lead.nextFollowUpAt) return false;
  return new Date(lead.nextFollowUpAt) <= endOfDay(now);
}

export function isFollowUpOverdue(lead: SalesLead, now: Date) {
  if (!isOpen(lead) || !lead.nextFollowUpAt) return false;
  if (isNurture(lead)) return false;
  return new Date(lead.nextFollowUpAt) < startOfDay(now);
}

/**
 * Nobody has ever reached this person.
 *
 * Read from lastContactAt rather than from the stage, because a lead can be
 * dragged to "Contacted" without anybody having picked up a phone, and the
 * point of this counter is to catch exactly that.
 */
export function isNeverContacted(lead: SalesLead) {
  return isOpen(lead) && !lead.lastContactAt;
}

/** Open, being worked, and with nothing scheduled to happen next. */
export function hasNoNextFollowUp(lead: SalesLead) {
  if (!isOpen(lead)) return false;
  // Nurture has its own date, so it is not adrift.
  if (isNurture(lead)) return !lead.nurtureUntil;
  return !lead.nextFollowUpAt;
}

/** Open and being worked, with nobody having said what happens next. */
export function hasNoNextAction(lead: SalesLead) {
  return isOpen(lead) && !isNurture(lead) && !lead.nextAction?.trim();
}

/** How long a proposal has been sitting, in whole days. */
export function proposalAgeDays(lead: SalesLead, now: Date): number | null {
  if (lead.stageKey !== "proposal_sent" || !lead.proposalSentAt) return null;
  return daysBetween(new Date(lead.proposalSentAt), now);
}

export function isProposalAging(lead: SalesLead, now: Date, threshold: number) {
  const age = proposalAgeDays(lead, now);
  return age !== null && age >= threshold;
}

/** A strategy call booked for this day that has not already happened. */
export function isCallOn(lead: SalesLead, day: Date) {
  if (!lead.strategyCallAt) return false;
  if (lead.strategyCallStatus && ["CANCELLED", "NO_SHOW"].includes(lead.strategyCallStatus)) {
    return false;
  }

  const at = new Date(lead.strategyCallAt);
  return at >= startOfDay(day) && at <= endOfDay(day);
}

export interface DateRange {
  from: Date;
  to: Date;
}

export type RangePreset = "today" | "week" | "month" | "last30" | "custom";

/** The window a preset means, resolved against a given "now". */
export function resolveRange(
  preset: RangePreset,
  now: Date,
  custom?: { from?: string | null; to?: string | null },
): DateRange {
  const today = startOfDay(now);

  switch (preset) {
    case "today":
      return { from: today, to: endOfDay(now) };

    case "week": {
      // Monday, as everywhere else in this codebase.
      const weekday = (today.getDay() + 6) % 7;
      const monday = new Date(today);
      monday.setDate(monday.getDate() - weekday);
      return { from: monday, to: endOfDay(now) };
    }

    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: endOfDay(now) };

    case "last30": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from, to: endOfDay(now) };
    }

    case "custom": {
      const from = custom?.from ? startOfDay(new Date(custom.from)) : today;
      const to = custom?.to ? endOfDay(new Date(custom.to)) : endOfDay(now);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return { from: today, to: endOfDay(now) };
      }

      return { from, to };
    }
  }
}

function within(value: string | null, range: DateRange) {
  if (!value) return false;
  const at = new Date(value);
  return at >= range.from && at <= range.to;
}

export interface SalesMetrics {
  newLeads: number;
  followUpsDue: number;
  followUpsOverdue: number;
  callsBooked: number;
  qualified: number;
  proposalsOpen: number;
  wonThisMonth: number;
  pipelineValue: number;
  conversionRate: number | null;
}

/**
 * The metric strip.
 *
 * Pipeline value counts each open lead once, taking the most committed number
 * anybody has put on it - the proposal if one has gone out, otherwise the
 * budget. Adding both would double-count the same deal, which is how forecasts
 * come to be worth nothing.
 */
export function salesMetrics(
  leads: SalesLead[],
  range: DateRange,
  now: Date,
): SalesMetrics {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let newLeads = 0;
  let followUpsDue = 0;
  let followUpsOverdue = 0;
  let callsBooked = 0;
  let qualified = 0;
  let proposalsOpen = 0;
  let wonThisMonth = 0;
  let pipelineValue = 0;

  // The conversion denominator is leads created in the window, so the rate
  // answers "of what we brought in, how much closed" rather than mixing this
  // month's wins against last year's intake.
  let createdInRange = 0;
  let convertedFromRange = 0;

  for (const lead of leads) {
    if (within(lead.createdAt, range)) {
      newLeads += 1;
      createdInRange += 1;
      if (lead.wonAt) convertedFromRange += 1;
    }

    if (lead.wonAt) {
      const won = new Date(lead.wonAt);
      if (won >= monthStart && won <= now) wonThisMonth += 1;
    }

    if (!isOpen(lead)) continue;

    if (isFollowUpDue(lead, now)) followUpsDue += 1;
    if (isFollowUpOverdue(lead, now)) followUpsOverdue += 1;

    // Calls counted inside the selected window, and still ahead of now.
    if (
      lead.strategyCallAt
      && within(lead.strategyCallAt, { from: startOfDay(now), to: range.to })
      && !["CANCELLED", "NO_SHOW"].includes(lead.strategyCallStatus ?? "")
    ) {
      callsBooked += 1;
    }

    if (lead.stageKey === "qualified" || lead.status === "QUALIFIED") qualified += 1;
    if (lead.stageKey === "proposal_sent") proposalsOpen += 1;

    pipelineValue += dealValue(lead);
  }

  return {
    newLeads,
    followUpsDue,
    followUpsOverdue,
    callsBooked,
    qualified,
    proposalsOpen,
    wonThisMonth,
    pipelineValue,
    conversionRate:
      createdInRange === 0 ? null : Math.round((convertedFromRange / createdInRange) * 1000) / 10,
  };
}

export type ActionKey =
  | "overdue"
  | "calls-today"
  | "aging-proposals"
  | "never-contacted"
  | "no-follow-up";

export interface ActionCard {
  key: ActionKey;
  count: number;
  label: string;
  hint: string;
}

/**
 * The five things that are actually wrong.
 *
 * Every card is a filter, and the count is produced by the same predicate the
 * filter uses - so clicking a card that says three always shows three.
 */
export function matchesAction(
  lead: SalesLead,
  key: ActionKey,
  now: Date,
  agingDays: number,
): boolean {
  switch (key) {
    case "overdue":
      return isFollowUpOverdue(lead, now);
    case "calls-today":
      return isCallOn(lead, now);
    case "aging-proposals":
      return isProposalAging(lead, now, agingDays);
    case "never-contacted":
      return isNeverContacted(lead);
    case "no-follow-up":
      return hasNoNextFollowUp(lead);
  }
}

export function needsAction(
  leads: SalesLead[],
  now: Date,
  agingDays = DEFAULT_PROPOSAL_AGING_DAYS,
): ActionCard[] {
  const count = (key: ActionKey) =>
    leads.filter((lead) => matchesAction(lead, key, now, agingDays)).length;

  return [
    {
      key: "overdue",
      count: count("overdue"),
      label: "Follow ups overdue",
      hint: "Past their scheduled date",
    },
    {
      key: "calls-today",
      count: count("calls-today"),
      label: "Strategy calls today",
      hint: "Booked for today",
    },
    {
      key: "aging-proposals",
      count: count("aging-proposals"),
      label: `Proposals waiting ${agingDays}+ days`,
      hint: "Sent and still quiet",
    },
    {
      key: "never-contacted",
      count: count("never-contacted"),
      label: "Leads never contacted",
      hint: "Nobody has reached them",
    },
    {
      key: "no-follow-up",
      count: count("no-follow-up"),
      label: "No next follow up",
      hint: "Nothing scheduled",
    },
  ];
}

export interface StageCount {
  stageId: string | null;
  stageKey: string | null;
  name: string;
  count: number;
  isTerminal: boolean;
}

/** How many leads sit in each stage, in pipeline order. */
export function pipelineCounts(
  leads: SalesLead[],
  stages: { id: string; stageKey: string | null; name: string; isTerminal: boolean }[],
): StageCount[] {
  return stages.map((stage) => ({
    stageId: stage.id,
    stageKey: stage.stageKey,
    name: stage.name,
    isTerminal: stage.isTerminal,
    count: leads.filter((lead) => lead.stageId === stage.id).length,
  }));
}

/**
 * The follow-ups worth doing first.
 *
 * Overdue, then today, then soonest. Anything without a date is absent rather
 * than sorted to the end - it is not a follow-up yet, and the Needs Action
 * panel already counts it.
 */
export function followUpQueue(leads: SalesLead[], now: Date, limit = 3) {
  return leads
    .filter((lead) => isOpen(lead) && isFollowUpDue(lead, now))
    .map((lead) => {
      const due = new Date(lead.nextFollowUpAt ?? lead.nurtureUntil ?? now);
      const days = daysBetween(due, now);

      return {
        lead,
        due: due.toISOString(),
        overdueDays: days > 0 ? days : 0,
        isOverdue: days > 0,
      };
    })
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, limit);
}

export interface SourceRow {
  source: string;
  leads: number;
  qualified: number;
  converted: number;
  rate: number;
}

/**
 * Which sources are worth the money.
 *
 * Qualified counts anybody who ever got that far, not only those sitting in the
 * stage right now - a source whose leads all closed would otherwise show zero
 * qualified, which would read as the source being useless.
 */
export function sourcePerformance(leads: SalesLead[], range: DateRange): SourceRow[] {
  const groups = new Map<string, SourceRow>();

  const qualifiedOrBeyond = [
    "qualified",
    "proposal_sent",
    "negotiation",
    "won",
  ];

  for (const lead of leads) {
    if (!within(lead.createdAt, range)) continue;

    const row = groups.get(lead.source) ?? {
      source: lead.source,
      leads: 0,
      qualified: 0,
      converted: 0,
      rate: 0,
    };

    row.leads += 1;

    if (
      (lead.stageKey && qualifiedOrBeyond.includes(lead.stageKey))
      || lead.status === "QUALIFIED"
      || lead.wonAt
    ) {
      row.qualified += 1;
    }

    if (lead.wonAt) row.converted += 1;

    groups.set(lead.source, row);
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      rate: row.leads === 0 ? 0 : Math.round((row.converted / row.leads) * 1000) / 10,
    }))
    .sort((a, b) => b.leads - a.leads);
}

export interface RepRow {
  ownerId: string;
  name: string;
  leads: number;
  contacted: number;
  qualified: number;
  converted: number;
  rate: number;
  wonValue: number;
}

/** How each salesperson is doing, over the selected window. */
export function repPerformance(leads: SalesLead[], range: DateRange): RepRow[] {
  const groups = new Map<string, RepRow>();

  for (const lead of leads) {
    if (!lead.ownerId) continue;
    if (!within(lead.createdAt, range) && !within(lead.wonAt, range)) continue;

    const row = groups.get(lead.ownerId) ?? {
      ownerId: lead.ownerId,
      name: lead.ownerName ?? "Unassigned",
      leads: 0,
      contacted: 0,
      qualified: 0,
      converted: 0,
      rate: 0,
      wonValue: 0,
    };

    row.leads += 1;
    if (lead.lastContactAt) row.contacted += 1;
    if (
      ["qualified", "proposal_sent", "negotiation", "won"].includes(lead.stageKey ?? "")
      || lead.status === "QUALIFIED"
      || lead.wonAt
    ) {
      row.qualified += 1;
    }
    if (lead.wonAt) {
      row.converted += 1;
      row.wonValue += lead.finalValue ?? lead.proposalValue ?? 0;
    }

    groups.set(lead.ownerId, row);
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      rate: row.leads === 0 ? 0 : Math.round((row.converted / row.leads) * 1000) / 10,
    }))
    .sort((a, b) => b.converted - a.converted || b.leads - a.leads);
}

/** The most recent wins, newest first. */
export function recentWins(leads: SalesLead[], limit = 3) {
  return leads
    .filter((lead) => Boolean(lead.wonAt))
    .sort((a, b) => new Date(b.wonAt as string).getTime() - new Date(a.wonAt as string).getTime())
    .slice(0, limit);
}

/** "Today, 2:00 PM", "Overdue by 3 days", "Aug 16, 9:00 AM". */
export function followUpLabel(
  value: string | null,
  now: Date,
): { label: string; tone: "overdue" | "today" | "soon" | "later" | "none" } {
  if (!value) return { label: "Not scheduled", tone: "none" };

  const at = new Date(value);
  const days = daysBetween(at, now);
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (days > 0) {
    return {
      label: days === 1 ? "Overdue by 1 day" : `Overdue by ${days} days`,
      tone: "overdue",
    };
  }

  if (days === 0) return { label: `Today, ${time}`, tone: "today" };
  if (days === -1) return { label: `Tomorrow, ${time}`, tone: "soon" };

  return {
    label: `${at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`,
    tone: days >= -3 ? "soon" : "later",
  };
}

/** "Yesterday", "3 days ago", "Never". */
export function lastContactLabel(value: string | null, now: Date) {
  if (!value) return "Never";

  const days = daysBetween(new Date(value), now);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;

  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export type SalesSort =
  | "follow-up-soonest"
  | "most-overdue"
  | "newest"
  | "oldest"
  | "highest-value"
  | "lowest-value"
  | "recently-contacted"
  | "least-recently-contacted"
  | "recently-updated"
  | "expected-close";

export const SALES_SORTS: { value: SalesSort; label: string }[] = [
  { value: "follow-up-soonest", label: "Follow Up Soonest" },
  { value: "most-overdue", label: "Most Overdue" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest-value", label: "Highest Value" },
  { value: "lowest-value", label: "Lowest Value" },
  { value: "recently-contacted", label: "Recently Contacted" },
  { value: "least-recently-contacted", label: "Least Recently Contacted" },
  { value: "recently-updated", label: "Recently Updated" },
  { value: "expected-close", label: "Expected Close Date" },
];

/**
 * The chips above the list.
 *
 * Each one is a predicate, and its count comes from that same predicate - so a
 * chip reading nine always filters to nine. "All" is a chip rather than the
 * absence of one so that clearing is a click in the same row, not a hunt for a
 * Clear button.
 */
export type QuickFilterKey =
  | "all"
  | "needs-follow-up"
  | "overdue"
  | "no-next-action"
  | "strategy-calls"
  | "proposals"
  | "won";

export function matchesQuickFilter(lead: SalesLead, key: QuickFilterKey, now: Date): boolean {
  switch (key) {
    case "all":
      return true;
    case "needs-follow-up":
      return isFollowUpDue(lead, now);
    case "overdue":
      return isFollowUpOverdue(lead, now);
    case "no-next-action":
      return hasNoNextAction(lead);
    case "strategy-calls":
      // Booked and still live, whether or not the call has happened yet.
      return (
        Boolean(lead.strategyCallAt)
        && !["CANCELLED", "NO_SHOW"].includes(lead.strategyCallStatus ?? "")
      );
    case "proposals":
      return isOpen(lead) && Boolean(lead.proposalSentAt);
    case "won":
      return Boolean(lead.wonAt);
  }
}

export interface QuickFilterChip {
  key: QuickFilterKey;
  label: string;
  count: number;
}

const QUICK_FILTER_LABELS: Record<QuickFilterKey, string> = {
  all: "All",
  "needs-follow-up": "Needs Follow Up",
  overdue: "Overdue",
  "no-next-action": "No Next Action",
  "strategy-calls": "Strategy Calls",
  proposals: "Proposals",
  won: "Won",
};

export const QUICK_FILTER_KEYS = Object.keys(QUICK_FILTER_LABELS) as QuickFilterKey[];

export function quickFilterChips(leads: SalesLead[], now: Date): QuickFilterChip[] {
  return QUICK_FILTER_KEYS.map((key) => ({
    key,
    label: QUICK_FILTER_LABELS[key],
    count: leads.filter((lead) => matchesQuickFilter(lead, key, now)).length,
  }));
}

/**
 * When the next follow-up falls.
 *
 * One function, used by the filter and by the label, so a lead the filter calls
 * overdue can never be labelled "today". Buckets are calendar days, not
 * twenty-four hour windows - "tomorrow" means tomorrow, not "in a day".
 */
export type FollowUpStatus = "overdue" | "today" | "tomorrow" | "upcoming" | "none";

export function followUpStatus(lead: SalesLead, now: Date): FollowUpStatus {
  const at = lead.nextFollowUpAt ?? (isNurture(lead) ? lead.nurtureUntil : null);

  if (!at) return "none";

  const days = daysBetween(new Date(at), now);

  if (days > 0) return "overdue";
  if (days === 0) return "today";
  if (days === -1) return "tomorrow";

  return "upcoming";
}

export const FOLLOW_UP_STATUSES: { value: FollowUpStatus | ""; label: string }[] = [
  { value: "", label: "All Follow Ups" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due Today" },
  { value: "tomorrow", label: "Due Tomorrow" },
  { value: "upcoming", label: "Upcoming" },
  { value: "none", label: "No Follow Up" },
];

export interface SalesFilters {
  search: string;
  stageId: string;
  ownerId: string;
  source: string;
  status: string;
  action: ActionKey | "";
  quick: QuickFilterKey;
  followUp: FollowUpStatus | "";
  tag: string;
  campaign: string;
  minValue: string;
  maxValue: string;
  createdFrom: string;
  createdTo: string;
  closeFrom: string;
  closeTo: string;
  sort: SalesSort;
}

export const EMPTY_SALES_FILTERS: SalesFilters = {
  search: "",
  stageId: "",
  ownerId: "",
  source: "",
  status: "",
  action: "",
  quick: "all",
  followUp: "",
  tag: "",
  campaign: "",
  minValue: "",
  maxValue: "",
  createdFrom: "",
  createdTo: "",
  closeFrom: "",
  closeTo: "",
  sort: "follow-up-soonest",
};

/** The filters that live behind More Filters, counted for its badge. */
export function advancedFilterCount(filters: SalesFilters) {
  return [
    filters.tag,
    filters.campaign,
    filters.minValue,
    filters.maxValue,
    filters.createdFrom,
    filters.createdTo,
    filters.closeFrom,
    filters.closeTo,
    filters.status,
  ].filter((value) => Boolean(value)).length;
}

export function hasActiveFilters(filters: SalesFilters) {
  return (
    Boolean(filters.search.trim())
    || Boolean(filters.stageId)
    || Boolean(filters.ownerId)
    || Boolean(filters.source)
    || Boolean(filters.action)
    || Boolean(filters.followUp)
    || filters.quick !== "all"
    || advancedFilterCount(filters) > 0
    || filters.sort !== "follow-up-soonest"
  );
}

export function matchesSearch(lead: SalesLead, term: string) {
  const needle = term.trim().toLowerCase();

  if (!needle) return true;

  const haystack = [
    lead.contactName,
    lead.businessName,
    lead.opportunityName,
    lead.email,
    lead.phone,
    lead.source.replaceAll("_", " "),
    lead.ownerName,
    lead.nextAction,
    lead.notes,
    ...lead.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

function onOrAfter(value: string | null, boundary: string) {
  if (!boundary) return true;
  if (!value) return false;
  return new Date(value) >= startOfDay(new Date(boundary));
}

function onOrBefore(value: string | null, boundary: string) {
  if (!boundary) return true;
  if (!value) return false;
  return new Date(value) <= endOfDay(new Date(boundary));
}

export function applySalesFilters(
  leads: SalesLead[],
  filters: SalesFilters,
  now: Date,
  agingDays = DEFAULT_PROPOSAL_AGING_DAYS,
): SalesLead[] {
  const min = filters.minValue === "" ? null : Number(filters.minValue);
  const max = filters.maxValue === "" ? null : Number(filters.maxValue);

  const filtered = leads.filter((lead) => {
    if (filters.stageId && lead.stageId !== filters.stageId) return false;
    if (filters.ownerId) {
      const key = lead.ownerId ?? "unassigned";
      if (key !== filters.ownerId) return false;
    }
    if (filters.source && lead.source !== filters.source) return false;
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.action && !matchesAction(lead, filters.action, now, agingDays)) return false;
    if (!matchesQuickFilter(lead, filters.quick, now)) return false;
    if (filters.followUp && followUpStatus(lead, now) !== filters.followUp) return false;
    if (filters.tag && !lead.tags.includes(filters.tag)) return false;
    if (
      filters.campaign
      && (lead.campaign ?? "").toLowerCase() !== filters.campaign.toLowerCase()
    ) {
      return false;
    }

    if (min !== null && !Number.isNaN(min) && dealValue(lead) < min) return false;
    if (max !== null && !Number.isNaN(max) && dealValue(lead) > max) return false;

    if (!onOrAfter(lead.createdAt, filters.createdFrom)) return false;
    if (!onOrBefore(lead.createdAt, filters.createdTo)) return false;
    if (!onOrAfter(lead.expectedCloseAt, filters.closeFrom)) return false;
    if (!onOrBefore(lead.expectedCloseAt, filters.closeTo)) return false;

    if (!matchesSearch(lead, filters.search)) return false;

    return true;
  });

  return sortLeads(filtered, filters.sort, now);
}

export function sortLeads(leads: SalesLead[], sort: SalesSort, now: Date): SalesLead[] {
  const copy = [...leads];

  // Leads with nothing scheduled sort last rather than first. Without this an
  // absent date reads as zero and floats an unscheduled lead above one that is
  // genuinely overdue.
  const followUpTime = (lead: SalesLead) =>
    lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : Number.POSITIVE_INFINITY;

  const overdueDepth = (lead: SalesLead) =>
    isFollowUpOverdue(lead, now) ? now.getTime() - followUpTime(lead) : -1;

  // Same idea for the other "soonest" and "longest ago" orders: an absent date
  // is not a very old one, so it goes to the end of whichever list it is in.
  const closeTime = (lead: SalesLead) =>
    lead.expectedCloseAt ? new Date(lead.expectedCloseAt).getTime() : Number.POSITIVE_INFINITY;

  const contactTime = (lead: SalesLead) =>
    lead.lastContactAt ? new Date(lead.lastContactAt).getTime() : null;

  copy.sort((a, b) => {
    switch (sort) {
      case "follow-up-soonest":
        return followUpTime(a) - followUpTime(b);
      case "most-overdue":
        /*
         * Genuinely different from soonest-first, which it was not before.
         * Overdue leads come first, deepest first; everything not yet due falls
         * below them in date order, rather than a lead due in an hour
         * outranking one that has been sitting for a week.
         */
        return overdueDepth(b) - overdueDepth(a) || followUpTime(a) - followUpTime(b);
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "highest-value":
        return dealValue(b) - dealValue(a);
      case "lowest-value":
        return dealValue(a) - dealValue(b);
      case "recently-contacted": {
        const at = contactTime(a);
        const bt = contactTime(b);
        // Never contacted is not "contacted a long time ago" - it is unknown,
        // and it belongs at the bottom of both contact orders rather than the
        // top of one of them.
        if (at === null && bt === null) return 0;
        if (at === null) return 1;
        if (bt === null) return -1;
        return bt - at;
      }
      case "least-recently-contacted": {
        const at = contactTime(a);
        const bt = contactTime(b);
        if (at === null && bt === null) return 0;
        if (at === null) return 1;
        if (bt === null) return -1;
        return at - bt;
      }
      case "recently-updated":
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "expected-close":
        return closeTime(a) - closeTime(b);
      default:
        return followUpTime(a) - followUpTime(b);
    }
  });

  return copy;
}
