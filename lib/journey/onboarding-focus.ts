/**
 * What the project manager should do next about onboarding.
 *
 * This exists because the focus card used to be keyed on the journey stage
 * alone, so a client whose form had been sent, answered, submitted and read
 * was still being told to get the intake form in front of the client and get
 * it back completed. The stage had not moved, so the advice had not moved, and
 * advice that is wrong once is advice people stop reading.
 *
 * Two derivations live here, and the split matters:
 *
 *   - where the intake itself has got to, from its own timestamps
 *   - what the card should therefore say, which is not the same thing
 *
 * The second is not a relabelling of the first. A reviewed intake with three
 * unanswered access requests behind it is not finished; the next useful action
 * is chasing the client, not admiring the review. So readiness overrides
 * status once the form is read, and the card changes heading accordingly.
 *
 * Everything is derived from records that already exist. No status column is
 * added for either of these: a stored focus state would be a second copy of a
 * fact assembled from six other tables, and it would be wrong within a day.
 */

/* -------------------------------------------------------------------------- */
/* Where the intake has got to                                                */
/* -------------------------------------------------------------------------- */

/**
 * The seven states the form moves through.
 *
 * Opened and In Progress are split because they call for different chasing: a
 * client who opened the link a week ago and typed nothing has a different
 * problem from one who is four answers from the end.
 */
export type IntakeState =
  | "NOT_SENT"
  | "SENT"
  | "OPENED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "REVIEWED"
  | "COMPLETE";

export const INTAKE_STATE_LABELS: Record<IntakeState, string> = {
  NOT_SENT: "Not Sent",
  SENT: "Sent",
  OPENED: "Opened",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
  COMPLETE: "Complete",
};

/** One required question the client has not answered. */
export interface MissingAnswer {
  questionId: string;
  label: string;
  sectionId: string;
  sectionTitle: string;
}

/**
 * The intake, as the focus card needs to read it.
 *
 * Timestamps rather than the status column, because the status column is
 * maintained by the send and save paths and the timestamps are what those
 * paths actually set. Where the two ever disagree the timestamps are right.
 */
export interface IntakeSnapshot {
  exists: boolean;
  /** The stored IntakeStatus, kept for the one thing timestamps cannot say. */
  status: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  lastSavedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reopenedAt: string | null;
  reviewedByName: string | null;
  reviewNotes: string | null;
  expiresAt: string | null;
  /** Answered over asked, counting only the questions this client is shown. */
  percent: number;
  answered: number;
  total: number;
  missingRequired: MissingAnswer[];
  recipientEmail: string | null;
}

export const EMPTY_INTAKE: IntakeSnapshot = {
  exists: false,
  status: null,
  sentAt: null,
  viewedAt: null,
  lastSavedAt: null,
  submittedAt: null,
  reviewedAt: null,
  reopenedAt: null,
  reviewedByName: null,
  reviewNotes: null,
  expiresAt: null,
  percent: 0,
  answered: 0,
  total: 0,
  missingRequired: [],
  recipientEmail: null,
};

/**
 * Which of the seven states the form is in.
 *
 * Read newest event first. A reopened form has had its submittedAt cleared on
 * purpose - that is what lets the client back in - so it falls through to the
 * in-progress arm and is chased like the half-finished form it now is.
 */
export function intakeStateOf(intake: IntakeSnapshot): IntakeState {
  if (!intake.exists || !intake.sentAt) return "NOT_SENT";
  if (intake.reviewedAt) return "REVIEWED";
  if (intake.submittedAt) return "SUBMITTED";

  // Something typed beats something merely opened, whichever happened first.
  if (intake.lastSavedAt || intake.answered > 0) return "IN_PROGRESS";
  if (intake.viewedAt) return "OPENED";

  return "SENT";
}

/* -------------------------------------------------------------------------- */
/* What is still outstanding                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where an outstanding item came from.
 *
 * The category is what sorts the chase list, and it is also what tells the
 * interface which record to open - each one has exactly one home already, and
 * none of them is a new table.
 */
export type OutstandingCategory =
  | "requirement"
  | "dependency"
  | "approval"
  | "access"
  | "asset"
  | "intake"
  | "a2p";

export const CATEGORY_LABELS: Record<OutstandingCategory, string> = {
  requirement: "Journey requirement",
  dependency: "Client dependency",
  approval: "Approval",
  access: "Platform access",
  asset: "Brand asset",
  intake: "Intake answer",
  a2p: "A2P registration",
};

export interface OutstandingItem {
  /** Stable within a client, so React keys and de-duplication both work. */
  key: string;
  label: string;
  category: OutstandingCategory;
  /** Whether this holds the stage shut, as opposed to merely being open. */
  blocking: boolean;
  /** Whether the client owes it, as opposed to the agency owing it. */
  clientOwned: boolean;
  dueAt: string | null;
  overdue: boolean;
  /** Which client contact owes it, where that is known. */
  contactId: string | null;
  /** The record to act on, where one exists. Journey flags use this. */
  recordId: string | null;
  /** First asked, for the ageing columns. */
  requestedAt: string | null;
  lastFollowUpAt: string | null;
  followUpCount: number;
  /** True once the client has answered but nobody has checked the answer. */
  received: boolean;
}

/**
 * Chase order.
 *
 * Lower sorts first. Overdue and blocking beat everything because they are the
 * two properties that cost the agency a date; after that it is the order the
 * work actually stops in - a missing login stops delivery sooner than a
 * missing logo, which stops it sooner than an optional answer.
 */
const CATEGORY_RANK: Record<OutstandingCategory, number> = {
  requirement: 0,
  dependency: 1,
  approval: 2,
  access: 3,
  asset: 4,
  intake: 5,
  a2p: 6,
};

export function outstandingPriority(item: OutstandingItem): number {
  const overdue = item.overdue ? 0 : 1;
  const blocking = item.blocking ? 0 : 1;

  // Overdue-and-blocking first, then overdue, then blocking, then by kind.
  return overdue * 100 + blocking * 20 + CATEGORY_RANK[item.category];
}

export function sortOutstanding(items: OutstandingItem[]): OutstandingItem[] {
  return [...items].sort((left, right) => {
    const byPriority = outstandingPriority(left) - outstandingPriority(right);

    if (byPriority !== 0) return byPriority;

    /*
     * Then by the date it was due, earliest first.
     *
     * Priority treats overdue as a yes or no, so a thing nine days late and a
     * thing one day late scored the same and fell through to whichever was
     * asked for first - which, for anything raised in the same sitting, is no
     * order at all. Equal priority means both are overdue or neither is, so
     * one rule covers both readings: the most overdue first, and after them
     * the one whose deadline is nearest.
     *
     * An item with a date beats one without, because a date is the only thing
     * either of them can be judged on.
     */
    const due = (item: OutstandingItem) =>
      item.dueAt ? Date.parse(item.dueAt) : Number.MAX_SAFE_INTEGER;

    if (due(left) !== due(right)) return due(left) - due(right);

    // Then oldest first: the thing asked for three weeks ago goes above the
    // thing asked for yesterday, which is the order somebody would chase in.
    const leftAge = left.requestedAt ? Date.parse(left.requestedAt) : Number.MAX_SAFE_INTEGER;
    const rightAge = right.requestedAt ? Date.parse(right.requestedAt) : Number.MAX_SAFE_INTEGER;

    if (leftAge !== rightAge) return leftAge - rightAge;

    return left.label.localeCompare(right.label);
  });
}

/** Counts by category, for the summary lines on the reviewed state. */
export function summariseOutstanding(items: OutstandingItem[]) {
  const byCategory = {} as Record<OutstandingCategory, number>;

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
  }

  return {
    total: items.length,
    blocking: items.filter((item) => item.blocking).length,
    overdue: items.filter((item) => item.overdue).length,
    clientOwned: items.filter((item) => item.clientOwned).length,
    byCategory,
  };
}

/* -------------------------------------------------------------------------- */
/* What the card says                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The five headings the card can carry.
 *
 * Fewer than the seven intake states on purpose. Sent, Opened and In Progress
 * all call for the same thing - chase the client - so they share a heading and
 * differ only in the numbers underneath it.
 */
export type FocusKey =
  | "SEND_INTAKE"
  | "INTAKE_COMPLETION"
  | "INTAKE_REVIEW"
  | "ONBOARDING_READINESS"
  | "NEXT_MILESTONE";

/**
 * Every button the card can offer.
 *
 * A closed set rather than free-form strings, so the component that renders
 * them and the dispatcher that acts on them cannot drift apart: adding a
 * heading without wiring its button stops compiling.
 */
export type FocusActionKey =
  | "go-to-strategy"
  | "preview-intake"
  | "open-onboarding-form"
  | "review-intake"
  | "view-missing-information"
  | "contacts-to-chase"
  | "view-requirements"
  | "view-journey";

export interface FocusAction {
  key: FocusActionKey;
  label: string;
  primary: boolean;
}

export type FactTone = "good" | "warn" | "bad" | "neutral";

export interface FocusFact {
  label: string;
  value: string;
  tone: FactTone;
}

export interface OnboardingFocus {
  focus: FocusKey;
  intakeState: IntakeState;
  /** The card heading, already prefixed. */
  title: string;
  /** The status line, which is about the intake rather than the card. */
  statusLabel: string;
  statusTone: FactTone;
  description: string;
  facts: FocusFact[];
  actions: FocusAction[];
}

/** Whole days between two instants, floor, ignoring the time of day. */
function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;

  const then = new Date(iso);
  const startOf = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  return Math.round((startOf(now).getTime() - startOf(then).getTime()) / 86_400_000);
}

function dayLabel(days: number | null): string {
  if (days === null) return "Not recorded";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";

  return `${days} days ago`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export interface FocusInput {
  intake: IntakeSnapshot;
  outstanding: OutstandingItem[];
  /** Null when this client has no A2P registration in play. */
  a2p: { percent: number; complete: number; total: number; headline: string } | null;
  /** For the completed state, which stops talking about the intake. */
  stageName: string;
  nextStageName: string | null;
  nextMilestone: { name: string; dueAt: string; owner: string | null } | null;
  now: Date;
}

/**
 * The whole decision, in one place.
 *
 * Intake status drives it, but does not decide it alone: a reviewed form with
 * work still owed by the client is a readiness problem, not a review problem,
 * and saying so is the difference between a card that directs somebody and a
 * card that congratulates them.
 */
export function onboardingFocus(input: FocusInput): OnboardingFocus {
  const { intake, outstanding, a2p, now } = input;
  const state = intakeStateOf(intake);
  const summary = summariseOutstanding(outstanding);
  const missing = intake.missingRequired.length;

  if (state === "NOT_SENT") {
    return {
      focus: "SEND_INTAKE",
      intakeState: state,
      title: "Focus: Send Intake",
      statusLabel: "Intake Form - Not Sent",
      statusTone: "bad",
      description:
        "The client intake form has not been sent yet. Open Strategy to begin the intake and onboarding process.",
      facts: [
        {
          label: "Recipient on file",
          value: intake.recipientEmail ?? "No email recorded",
          tone: intake.recipientEmail ? "neutral" : "bad",
        },
      ],
      /*
       * Deliberately not a send button. Sending lives in Strategy and there is
       * one send path in the application; a second entry point here would be a
       * second thing to keep in step with the template, the recipient rules
       * and the token rotation.
       */
      actions: [
        { key: "go-to-strategy", label: "Go to Strategy", primary: true },
        { key: "preview-intake", label: "Preview Intake Form", primary: false },
      ],
    };
  }

  if (state === "SENT" || state === "OPENED" || state === "IN_PROGRESS") {
    const sentDays = daysSince(intake.sentAt, now);
    const activity = intake.lastSavedAt ?? intake.viewedAt;
    const started = state !== "SENT";

    return {
      focus: "INTAKE_COMPLETION",
      intakeState: state,
      title: "Focus: Intake Completion",
      statusLabel: `Intake Form - ${INTAKE_STATE_LABELS[state]}`,
      statusTone: state === "SENT" && (sentDays ?? 0) > 5 ? "bad" : "warn",
      description: started
        ? "The client has started the intake form. Follow up on the remaining required information."
        : "The intake form has been sent. Monitor completion and follow up on anything the client still needs to provide.",
      facts: [
        {
          label: "Sent",
          value: dayLabel(sentDays),
          tone: (sentDays ?? 0) > 5 ? "warn" : "neutral",
        },
        {
          label: "Opened",
          value: intake.viewedAt ? dayLabel(daysSince(intake.viewedAt, now)) : "Not yet opened",
          tone: intake.viewedAt ? "neutral" : "warn",
        },
        {
          label: "Completion",
          value: `${intake.percent}%`,
          tone: intake.percent >= 80 ? "good" : intake.percent > 0 ? "warn" : "bad",
        },
        {
          label: "Required answers missing",
          value: missing === 0 ? "None" : String(missing),
          tone: missing === 0 ? "good" : "warn",
        },
        {
          label: "Last activity",
          value: activity ? dayLabel(daysSince(activity, now)) : "No activity yet",
          tone: activity ? "neutral" : "warn",
        },
        {
          label: "Last chased",
          value: lastChaseLabel(outstanding, now),
          tone: "neutral",
        },
      ],
      actions: [
        { key: "open-onboarding-form", label: "Open Onboarding Form", primary: true },
        { key: "contacts-to-chase", label: "Contacts to Chase", primary: false },
      ],
    };
  }

  if (state === "SUBMITTED") {
    return {
      focus: "INTAKE_REVIEW",
      intakeState: state,
      title: "Focus: Intake Review",
      statusLabel: "Intake Form - Submitted",
      statusTone: "good",
      description:
        "The client has submitted the intake form. Review the responses and identify anything missing or conflicting.",
      facts: [
        {
          label: "Submitted",
          value: dayLabel(daysSince(intake.submittedAt, now)),
          tone: (daysSince(intake.submittedAt, now) ?? 0) > 3 ? "warn" : "neutral",
        },
        {
          label: "Completion",
          value: `${intake.percent}%`,
          tone: intake.percent >= 100 ? "good" : "warn",
        },
        {
          label: "Required fields missing",
          value: missing === 0 ? "None" : String(missing),
          tone: missing === 0 ? "good" : "warn",
        },
        ...(a2p
          ? [
              {
                label: "A2P information",
                value: `${a2p.complete} of ${a2p.total} items`,
                tone: (a2p.percent >= 100 ? "good" : "warn") as FactTone,
              },
            ]
          : []),
      ],
      actions: [
        { key: "review-intake", label: "Review Intake", primary: true },
        ...(missing > 0
          ? [
              {
                key: "view-missing-information" as const,
                label: "View Missing Information",
                primary: false,
              },
            ]
          : []),
      ],
    };
  }

  /*
   * Reviewed. What the card says now depends on what is left, not on the
   * intake - which is the whole point of this module. The form being read is
   * not the same as the client being ready, and a card that cannot tell the
   * difference is the one that shipped the contradiction.
   */
  if (summary.total > 0) {
    return {
      focus: "ONBOARDING_READINESS",
      intakeState: state,
      title: "Focus: Onboarding Readiness",
      statusLabel: "Intake Reviewed",
      statusTone: "good",
      description:
        "The intake review is complete. Resolve any remaining access, assets, technical setup, approvals, or client dependencies before onboarding can be completed.",
      facts: readinessFacts(summary, a2p),
      actions: [
        { key: "view-requirements", label: "View Requirements", primary: true },
        ...(summary.clientOwned > 0
          ? [{ key: "contacts-to-chase" as const, label: "Contacts to Chase", primary: false }]
          : []),
      ],
    };
  }

  return {
    focus: "NEXT_MILESTONE",
    intakeState: "COMPLETE",
    title: "Focus: Next Milestone",
    statusLabel: "Onboarding Complete",
    statusTone: "good",
    description:
      "All required onboarding information has been collected and reviewed. Prepare the client for the next Journey milestone.",
    facts: [
      { label: "Current stage", value: input.stageName, tone: "neutral" },
      {
        label: "Next stage",
        value: input.nextStageName ?? "Final stage",
        tone: "neutral",
      },
      {
        label: "Next milestone",
        value: input.nextMilestone?.name ?? "Nothing scheduled",
        tone: input.nextMilestone ? "neutral" : "warn",
      },
      {
        label: "Owner",
        value: input.nextMilestone?.owner ?? "Not assigned",
        tone: input.nextMilestone?.owner ? "neutral" : "warn",
      },
    ],
    actions: [{ key: "view-journey", label: "View Journey", primary: true }],
  };
}

/** The outstanding summary, as lines somebody can act on. */
function readinessFacts(
  summary: ReturnType<typeof summariseOutstanding>,
  a2p: FocusInput["a2p"],
): FocusFact[] {
  const facts: FocusFact[] = [];
  const counted: [OutstandingCategory, string, string][] = [
    ["requirement", "Remaining requirements", "requirement"],
    ["dependency", "Client dependencies", "dependency"],
    ["access", "Missing access", "platform"],
    ["asset", "Missing assets", "asset"],
    ["approval", "Awaiting approval", "approval"],
  ];

  for (const [category, label, noun] of counted) {
    const count = summary.byCategory[category] ?? 0;

    if (count === 0) continue;

    facts.push({
      label,
      value: plural(count, noun, `${noun}s`),
      tone: "warn",
    });
  }

  if (summary.overdue > 0) {
    facts.unshift({
      label: "Overdue",
      value: plural(summary.overdue, "item", "items"),
      tone: "bad",
    });
  }

  if (a2p && a2p.percent < 100) {
    facts.push({
      label: "A2P readiness",
      value: `${a2p.complete} of ${a2p.total} items`,
      tone: "warn",
    });
  }

  return facts;
}

/** When anything on this account was last chased, across every open request. */
function lastChaseLabel(outstanding: OutstandingItem[], now: Date): string {
  const chased = outstanding
    .map((item) => item.lastFollowUpAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);

  return chased ? dayLabel(daysSince(chased, now)) : "Not chased yet";
}
