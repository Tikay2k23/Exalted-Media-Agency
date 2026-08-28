/**
 * Sorting one client's history into the kinds of thing that happened to it.
 *
 * The activity log records what a person did as a sentence, which is what
 * makes it readable and what makes it hard to filter. There is no category
 * column and adding one would only categorise what happens next, leaving every
 * row already written uncategorised for good.
 *
 * So this reads the row instead. The entity type settles most of it and cannot
 * be wrong; the rest is matched against the verbs this codebase actually
 * writes, taken from its own logActivity calls rather than guessed at. Nothing
 * matched is "Other", never a guess - a filter that quietly mislabels rows is
 * worse than one that admits it does not know.
 */

export type ActivityCategory =
  | "note"
  | "journey"
  | "work"
  | "communication"
  | "approval"
  | "report"
  | "billing"
  | "integration"
  | "system"
  | "other";

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  note: "Notes",
  journey: "Journey",
  work: "Work",
  communication: "Communications",
  approval: "Approvals",
  report: "Reports",
  billing: "Billing",
  integration: "Integrations",
  system: "System",
  other: "Other",
};

/** The order the filter row offers them, most-used first. */
export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "note",
  "journey",
  "work",
  "communication",
  "approval",
  "report",
  "billing",
  "integration",
  "system",
  "other",
];

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  actorName: string | null;
  createdAt: string;
  fieldName?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
}

/**
 * Phrases, in the order they are tested.
 *
 * Order matters where a sentence could belong to two categories: "Approved the
 * strategy brief" is an approval before it is a strategy edit, and "Recorded a
 * payment" is billing before it is a recording.
 */
const RULES: { category: ActivityCategory; match: RegExp }[] = [
  { category: "note", match: /^added a note\b/i },

  {
    category: "approval",
    match: /\bapprov(ed|al)\b|\bwithdrew .*approval\b|\bsubmitted ".*" for review\b|\bdefect\b|\bqa plan\b|\braised .*defect\b|\blaunch\b/i,
  },

  {
    category: "billing",
    match: /\binvoice\b|\bpayment\b|\bpaid\b|\bcontract\b|\brenewal\b|\bis won and awaiting payment\b/i,
  },

  {
    category: "report",
    match: /\breport\b|\backnowledged their report\b|\bassessed .* as (green|yellow|red)\b|\boptimization\b|\bbusiness goals\b/i,
  },

  {
    category: "communication",
    match: /\bfollowed up\b|\blogged (a )?call\b|\bsent the intake\b|\bre-sent the intake\b|\bclient response\b|\bcomplaint\b|\bemail\b|\bsms\b|\bmessage\b/i,
  },

  /*
   * Before journey, because "Created client X and started onboarding" is the
   * account being created, not the account moving through onboarding.
   */
  {
    category: "system",
    match: /\bcreated (client|user)\b|\bdeleted\b|\brenamed\b|\bimported\b|\bconverted lead\b|\bpermanently deleted\b|\barchived\b/i,
  },

  {
    category: "journey",
    match: /\bmoved .* (from|into|to) \b|\bstage\b|\bcleared\b|\bhandoff\b|\bblocked\b|\bwaiting\b|\bonboarding\b|\baccess\b|\brecovery plan\b/i,
  },

  {
    category: "work",
    match: /\btask\b|\bproject\b|\bmilestone\b|\bassigned\b|\beod\b|\bcommented on\b/i,
  },

  {
    category: "integration",
    match: /\ba2p\b|\bsync(ed|ing)?\b|\bintegration\b|\bconnected\b|\bdisconnected\b/i,
  },

];

/** The entity types that settle a row on their own. */
const BY_ENTITY: Record<string, ActivityCategory> = {
  EMPLOYEE_TASK: "work",
  PROJECT: "work",
  MILESTONE: "work",
  REPORT: "report",
  CONTRACT: "billing",
  USER: "system",
};

export function activityCategory(entry: ActivityEntry): ActivityCategory {
  /*
   * A note is a note whatever it says, and the entity type cannot tell you -
   * notes are logged against the client like everything else.
   */
  if (/^added a note\b/i.test(entry.action)) return "note";

  const byEntity = BY_ENTITY[entry.entityType];

  if (byEntity) return byEntity;

  for (const rule of RULES) {
    if (rule.match.test(entry.action)) return rule.category;
  }

  return "other";
}

/**
 * The rows a filter should show, and what somebody typed to narrow them.
 *
 * Search covers the sentence, the person and the field that changed, because
 * those are the three things somebody remembers about an event they are trying
 * to find again.
 */
export function filterActivity(
  entries: ActivityEntry[],
  filter: ActivityCategory | "all",
  query: string,
): ActivityEntry[] {
  const needle = query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filter !== "all" && activityCategory(entry) !== filter) return false;

    if (!needle) return true;

    return [entry.action, entry.actorName, entry.fieldName, entry.newValue, entry.previousValue]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(needle));
  });
}

/** How many of each category are present, for the filter row's counts. */
export function activityCounts(entries: ActivityEntry[]): Map<ActivityCategory, number> {
  const counts = new Map<ActivityCategory, number>();

  for (const entry of entries) {
    const category = activityCategory(entry);

    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return counts;
}
