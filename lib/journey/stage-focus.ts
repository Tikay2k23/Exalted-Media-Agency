import type { JourneyAccount } from "@/lib/journey/journey-board";
import type { JourneyStageKey } from "@/lib/journey/phases";

/**
 * What each stage is actually about, and where that work happens.
 *
 * The journey page summarises; it does not re-implement. Every link here goes
 * to a tab on the client record that already does the job - the intake form,
 * the access register, the QA plans, the launch checklist - rather than to a
 * second copy of it built inside Journey. That is the difference between a
 * control centre and a duplicate CRM.
 *
 * Nothing here invents a capability. If the application cannot do something
 * yet, it is not listed: a button that does nothing is worse than no button,
 * because it costs somebody a click and their confidence in the page.
 */

/** The client record's tabs. Keep in step with TAB_KEYS on the client page. */
export type ClientTabKey =
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

export interface StageFocusLink {
  label: string;
  tab: ClientTabKey;
}

export interface StageFocus {
  /** What this stage exists to achieve, in one line. */
  purpose: string;
  /** What to keep an eye on while a client sits here. */
  watchFor: string[];
  /** Where the work is done. Every tab here is real. */
  links: StageFocusLink[];
}

export const STAGE_FOCUS: Record<JourneyStageKey, StageFocus> = {
  payment_received: {
    purpose:
      "Turn a won deal into an account somebody owns, with the money and the paperwork settled.",
    watchFor: [
      "Payment confirmed and the invoice raised",
      "Contract signed, with terms and dates recorded",
      "Billing schedule and monthly value set",
      "A project manager assigned to the account",
      "A named primary contact on the client side",
    ],
    links: [
      { label: "Contract & contacts", tab: "contacts" },
      { label: "Billing & invoices", tab: "reports" },
    ],
  },

  onboarding: {
    purpose: "Get the intake form in front of the client and get it back completed.",
    watchFor: [
      "Form sent, and whether the client has opened it",
      "How much of it has been answered",
      "Required answers still missing",
      "How long the client has been sitting on it",
    ],
    links: [
      { label: "Open onboarding form", tab: "services" },
      { label: "Contacts to chase", tab: "contacts" },
    ],
  },

  access_assets: {
    purpose:
      "Collect the platform access and brand assets the work cannot start without.",
    watchFor: [
      "Which platforms still have no access recorded",
      "Access recorded but never tested",
      "Brand assets and logins the client still owes",
      "Anything critical that blocks production",
    ],
    links: [
      { label: "Access register", tab: "files" },
      { label: "Integrations", tab: "integrations" },
    ],
  },

  strategy_planning: {
    purpose: "Agree what will be built, why, and how success gets measured.",
    watchFor: [
      "Goals and KPIs written down",
      "Strategy brief drafted and shared",
      "Client approval on the brief",
      "Dependencies and risks noted before build starts",
    ],
    links: [
      { label: "Strategy brief", tab: "services" },
      { label: "Approvals", tab: "quality" },
    ],
  },

  build_implementation: {
    purpose: "Do the work, and keep it moving.",
    watchFor: [
      "Open tasks and who they sit with",
      "Anything overdue or blocked",
      "Specialists assigned to each workstream",
      "Production target date still realistic",
    ],
    links: [
      { label: "Tasks & delivery", tab: "tasks" },
      { label: "Projects", tab: "services" },
    ],
  },

  internal_qa: {
    purpose: "Check the work properly before the client ever sees it.",
    watchFor: [
      "QA checklist completed",
      "Open defects, and how severe they are",
      "Critical defects still unresolved",
      "Rework that has not been re-tested",
    ],
    links: [
      { label: "QA plans & defects", tab: "quality" },
      { label: "Tasks & delivery", tab: "tasks" },
    ],
  },

  client_review: {
    purpose: "Get a decision from the person authorised to give one.",
    watchFor: [
      "Deliverables submitted, and when",
      "Whether an authorised approver is recorded",
      "How long the client has had it",
      "Revisions requested, and which round",
    ],
    links: [
      { label: "Approvals", tab: "quality" },
      { label: "Contacts & approvers", tab: "contacts" },
    ],
  },

  ready_to_launch: {
    purpose: "Clear every launch check before anything goes live.",
    watchFor: [
      "Launch checklist items still outstanding",
      "Tracking, forms and DNS verified",
      "Backup taken and a rollback plan agreed",
      "A named launch owner and a date",
    ],
    links: [
      { label: "Launch checklist", tab: "quality" },
      { label: "Access & DNS", tab: "files" },
    ],
  },

  live_optimization: {
    purpose: "Watch the first days closely and fix what the launch surfaces.",
    watchFor: [
      "Early checks completed after go-live",
      "Tracking confirmed to be recording",
      "Technical issues raised since launch",
      "First performance numbers",
    ],
    links: [
      { label: "Reports & health", tab: "reports" },
      { label: "Tasks & delivery", tab: "tasks" },
    ],
  },

  ongoing_management: {
    purpose: "Deliver the retainer and keep the relationship healthy.",
    watchFor: [
      "This period's deliverables and reports",
      "Open client requests",
      "Health assessment still current",
      "Renewal date approaching",
    ],
    links: [
      { label: "Reports & health", tab: "reports" },
      { label: "Tasks & delivery", tab: "tasks" },
    ],
  },

  renewal_upsell: {
    purpose: "Decide what happens next, before the contract runs out.",
    watchFor: [
      "Renewal date and current monthly value",
      "Results to take into the conversation",
      "Growth opportunities worth proposing",
      "Client health going into the decision",
    ],
    links: [
      { label: "Growth & renewal", tab: "reports" },
      { label: "Contract", tab: "contacts" },
    ],
  },

  offboarding_completed: {
    purpose: "Close the engagement cleanly and leave nothing dangling.",
    watchFor: [
      "Final invoice settled",
      "Final report delivered",
      "Files and platform ownership handed over",
      "Agency access removed",
    ],
    links: [
      { label: "Offboarding", tab: "reports" },
      { label: "Access to remove", tab: "files" },
    ],
  },
};

export function stageFocusFor(key: JourneyStageKey): StageFocus {
  return STAGE_FOCUS[key];
}

/** Where a focus link points for a given client. */
export function stageFocusHref(link: StageFocusLink, clientId: string) {
  return `/clients/${clientId}?tab=${link.tab}`;
}

/* -------------------------------------------------------------------------- */
/* Live signals                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The handful of real numbers that matter at this stage.
 *
 * All of it is already on the account - the stage gate loads the intake form,
 * the access register, the defects and the approvals in order to evaluate
 * requirements, and the counts fall out of that. Showing them costs no extra
 * query, and they cannot drift from the gate because they are the same data.
 *
 * A signal is only produced when there is something real to say. A stage that has
 * nothing to report shows its watch list and no numbers, rather than a row of
 * zeroes pretending to be information.
 */
export type SignalTone = "neutral" | "good" | "warn" | "bad";

export interface StageSignal {
  label: string;
  value: string;
  tone: SignalTone;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

function taskSignals(account: JourneyAccount): StageSignal[] {
  const signals: StageSignal[] = [];

  if (account.openTaskCount > 0) {
    signals.push({
      label: "Open work",
      value: plural(account.openTaskCount, "task", "tasks"),
      tone: "neutral",
    });
  }

  if (account.overdueTaskCount > 0) {
    signals.push({
      label: "Overdue",
      value: plural(account.overdueTaskCount, "task", "tasks"),
      tone: "bad",
    });
  }

  if (account.blockedTaskCount > 0) {
    signals.push({
      label: "Blocked",
      value: plural(account.blockedTaskCount, "task", "tasks"),
      tone: "warn",
    });
  }

  return signals;
}

export function stageSignals(
  key: JourneyStageKey,
  account: JourneyAccount,
): StageSignal[] {
  switch (key) {
    case "payment_received":
      return [
        {
          label: "Project manager",
          value: account.projectManagerName ?? "Not assigned",
          tone: account.projectManagerName ? "good" : "bad",
        },
        ...taskSignals(account).slice(0, 1),
      ];

    case "onboarding":
      return [
        {
          label: "Intake form",
          value: account.intakeStatus
            ? account.intakeStatus.replaceAll("_", " ").toLowerCase()
            : "Not sent",
          tone: account.intakeStatus === "SUBMITTED" ? "good"
            : account.intakeStatus ? "warn" : "bad",
        },
      ];

    case "access_assets":
      return [
        {
          label: "Critical access missing",
          value: account.criticalAccessMissing === 0
            ? "None"
            : plural(account.criticalAccessMissing, "platform", "platforms"),
          tone: account.criticalAccessMissing === 0 ? "good" : "bad",
        },
      ];

    case "strategy_planning":
      return [
        {
          label: "Strategy brief",
          value: account.strategyBriefStatus
            ? account.strategyBriefStatus.replaceAll("_", " ").toLowerCase()
            : "Not started",
          tone: account.strategyBriefStatus === "APPROVED" ? "good"
            : account.strategyBriefStatus ? "warn" : "bad",
        },
      ];

    case "build_implementation":
      return taskSignals(account);

    case "internal_qa":
      return [
        {
          label: "Open defects",
          value: account.openDefectCount === 0
            ? "None"
            : plural(account.openDefectCount, "defect", "defects"),
          tone: account.openDefectCount === 0 ? "good" : "bad",
        },
        ...(account.reviewTaskCount > 0
          ? [{
              label: "Awaiting review",
              value: plural(account.reviewTaskCount, "task", "tasks"),
              tone: "warn" as SignalTone,
            }]
          : []),
      ];

    case "client_review":
      return [
        {
          label: "Awaiting the client",
          value: account.awaitingReviewCount === 0
            ? "Nothing outstanding"
            : plural(account.awaitingReviewCount, "review", "reviews"),
          tone: account.awaitingReviewCount === 0 ? "good" : "warn",
        },
      ];

    case "ready_to_launch":
      return [
        {
          label: "Launch date",
          value: account.launchDate
            ? new Date(account.launchDate).toLocaleDateString("en-US",
                { month: "short", day: "numeric" })
            : "Not scheduled",
          tone: account.launchDate ? "good" : "warn",
        },
        ...taskSignals(account).filter((signal) => signal.tone !== "neutral"),
      ];

    case "live_optimization":
      return [
        {
          label: "Went live",
          value: account.launchDate
            ? new Date(account.launchDate).toLocaleDateString("en-US",
                { month: "short", day: "numeric" })
            : "Date not recorded",
          tone: account.launchDate ? "good" : "warn",
        },
        ...taskSignals(account).filter((signal) => signal.tone === "bad"),
      ];

    case "ongoing_management":
      return [
        ...(account.satisfactionScore !== null
          ? [{
              label: "Satisfaction",
              value: `${account.satisfactionScore} / 100`,
              tone: (account.satisfactionScore >= 70 ? "good" : "warn") as SignalTone,
            }]
          : []),
        ...(account.renewalDate
          ? [{
              label: "Renewal",
              value: new Date(account.renewalDate).toLocaleDateString("en-US",
                { month: "short", day: "numeric" }),
              tone: "neutral" as SignalTone,
            }]
          : []),
      ];

    case "renewal_upsell":
      return [
        {
          label: "Renewal date",
          value: account.renewalDate
            ? new Date(account.renewalDate).toLocaleDateString("en-US",
                { month: "short", day: "numeric" })
            : "Not set",
          tone: account.renewalDate ? "neutral" : "warn",
        },
        ...(account.satisfactionScore !== null
          ? [{
              label: "Satisfaction",
              value: `${account.satisfactionScore} / 100`,
              tone: (account.satisfactionScore >= 70 ? "good" : "warn") as SignalTone,
            }]
          : []),
      ];

    case "offboarding_completed":
      return taskSignals(account).slice(0, 2);
  }
}
