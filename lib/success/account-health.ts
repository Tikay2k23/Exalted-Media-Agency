/**
 * Account health, assembled from the systems that already know.
 *
 * The point of this file is what it does not do. It does not decide whether
 * the journey is at risk, whether approvals are clear, whether the work is
 * late or whether the client has paid - four systems answer those already, and
 * a fifth opinion is how an account ends up green on one page and red on
 * another. This reads their answers and weighs them.
 *
 * Two rules follow from that, and they are the whole design:
 *
 *   A category with nothing to read is not zero. It is Not assessed, and it
 *   leaves the average rather than dragging it down. An account with no
 *   invoices is not an account with bad payment history.
 *
 *   Every category says where its number came from. A score somebody cannot
 *   argue with is a score nobody can act on.
 */

export type HealthCategoryKey =
  | "delivery"
  | "performance"
  | "communication"
  | "journey"
  | "approval"
  | "financial"
  | "relationship";

export interface HealthCategory {
  key: HealthCategoryKey;
  label: string;
  /** 0-100, or null when there is not enough recorded to say. */
  score: number | null;
  /** How much it counts, among the categories that have a score. */
  weight: number;
  /** What was read, in a sentence somebody can check. */
  detail: string;
  /** Which system the number came from. */
  source: string;
}

export type AccountHealthStatus = "GOOD" | "NEEDS_ATTENTION" | "AT_RISK" | "CRITICAL";

export const ACCOUNT_HEALTH_LABELS: Record<AccountHealthStatus, string> = {
  GOOD: "Good",
  NEEDS_ATTENTION: "Needs attention",
  AT_RISK: "At risk",
  CRITICAL: "Critical",
};

/**
 * The colour the client record stores, which has four values of its own.
 *
 * Mapped rather than replaced: the account carries a green/yellow/red flag
 * that the board, the dashboard and the journey all read, and inventing a
 * parallel vocabulary here would leave two answers to one question.
 */
export const STATUS_TO_HEALTH_FLAG: Record<AccountHealthStatus, "GREEN" | "YELLOW" | "RED"> = {
  GOOD: "GREEN",
  NEEDS_ATTENTION: "YELLOW",
  AT_RISK: "RED",
  CRITICAL: "RED",
};

export interface AccountHealth {
  /** Null when no category had anything to read. */
  score: number | null;
  status: AccountHealthStatus | null;
  categories: HealthCategory[];
  /** The categories that actually counted. */
  assessedCount: number;
  strengths: string[];
  risks: string[];
  /** What to do about the worst of it, pointing at the system that owns it. */
  actions: { label: string; target: HealthCategoryKey | "report" | "recovery" }[];
}

export interface AccountHealthInput {
  /** From journeyHealth() - the journey's own score, not a second opinion. */
  journey: { score: number; label: string } | null;
  /**
   * From approvalGate() - its own weighted score and its own list of what is
   * in the way. Not recalculated here: the gate is the authority on whether
   * quality and approvals are clear, and it already publishes a number.
   */
  approvals: { score: number; blockers: string[] } | null;
  delivery: { total: number; overdue: number; blocked: number };
  /** Reports promised and delivered, and goals being met. */
  performance: {
    reportsDue: number;
    reportsOverdue: number;
    goalsTracked: number;
    goalsBehind: number;
  };
  communication: {
    openComplaints: number;
    /** Longest open wait on the client, in days. */
    waitingDays: number | null;
    /**
     * Whether this account has any communication history at all - a complaint
     * ever raised, a flag ever set, a request ever sent.
     *
     * Without it, silence reads as good news, and a client nobody has spoken
     * to since signing would score full marks for communication.
     */
    hasHistory: boolean;
  };
  /** Null when the reader may not see money, which is not the same as good. */
  financial: { overdueInvoices: number; failedInvoices: number; total: number } | null;
  /** The human half: what a person judged, 0-100. */
  relationship: {
    satisfactionScore: number | null;
    renewalProbability: number | null;
    cancellationThreat: boolean;
  } | null;
}

/**
 * Weights.
 *
 * Delivery and journey carry the most because they are what the agency is
 * being paid for and what fails first. Relationship carries least: it is one
 * person's read, and it is the number most likely to be optimistic.
 */
const WEIGHTS: Record<HealthCategoryKey, number> = {
  delivery: 20,
  journey: 20,
  performance: 15,
  approval: 15,
  communication: 12,
  financial: 10,
  relationship: 8,
};

const LABELS: Record<HealthCategoryKey, string> = {
  delivery: "Delivery health",
  performance: "Performance health",
  communication: "Communication health",
  journey: "Journey health",
  approval: "Approval health",
  financial: "Financial health",
  relationship: "Relationship health",
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function accountHealth(input: AccountHealthInput): AccountHealth {
  const categories: HealthCategory[] = [];

  const add = (
    key: HealthCategoryKey,
    score: number | null,
    detail: string,
    source: string,
  ) => {
    categories.push({ key, label: LABELS[key], score, weight: WEIGHTS[key], detail, source });
  };

  /* ------------------------------------------------------------ delivery -- */
  if (input.delivery.total === 0) {
    add("delivery", null, "No work on this account yet.", "Tasks");
  } else {
    const { total, overdue, blocked } = input.delivery;
    /*
     * Overdue costs more than blocked. Blocked work is usually waiting on
     * somebody and is visible; overdue work is late and often is not.
     */
    const penalty = (overdue / total) * 70 + (blocked / total) * 40;

    add(
      "delivery",
      clamp(100 - penalty),
      overdue === 0 && blocked === 0
        ? `${plural(total, "task", "tasks")}, none overdue or blocked.`
        : `${plural(overdue, "task", "tasks")} overdue and ${plural(blocked, "blocked", "blocked")} of ${total}.`,
      "Tasks",
    );
  }

  /* --------------------------------------------------------- performance -- */
  const { reportsDue, reportsOverdue, goalsTracked, goalsBehind } = input.performance;

  if (reportsDue === 0 && goalsTracked === 0) {
    add(
      "performance",
      null,
      "No goals agreed and no reports promised, so there is nothing to measure against.",
      "Goals and reports",
    );
  } else {
    const reportScore = reportsDue === 0 ? null : clamp(100 - (reportsOverdue / reportsDue) * 100);
    const goalScore = goalsTracked === 0 ? null : clamp(100 - (goalsBehind / goalsTracked) * 100);
    const parts = [reportScore, goalScore].filter((v): v is number => v !== null);

    add(
      "performance",
      clamp(parts.reduce((sum, v) => sum + v, 0) / parts.length),
      [
        reportsDue > 0 ? `${reportsOverdue} of ${reportsDue} reports overdue` : null,
        goalsTracked > 0 ? `${goalsBehind} of ${goalsTracked} goals behind` : null,
      ]
        .filter(Boolean)
        .join(", ") + ".",
      "Goals and reports",
    );
  }

  /* ------------------------------------------------------- communication -- */
  {
    const { openComplaints, waitingDays, hasHistory } = input.communication;

    if (openComplaints === 0 && waitingDays === null && !hasHistory) {
      add(
        "communication",
        null,
        "Nothing has been exchanged with this client yet, so there is nothing to read either way.",
        "Complaints and journey flags",
      );
    } else if (openComplaints === 0 && waitingDays === null) {
      add(
        "communication",
        100,
        "No open complaints and nothing waiting on the client.",
        "Complaints and journey flags",
      );
    } else {
      /* A week of waiting is a nudge. A month is the problem itself. */
      const waitPenalty = waitingDays === null ? 0 : Math.min(60, (waitingDays / 30) * 60);
      const complaintPenalty = Math.min(60, openComplaints * 30);

      add(
        "communication",
        clamp(100 - waitPenalty - complaintPenalty),
        [
          openComplaints > 0 ? `${plural(openComplaints, "complaint", "complaints")} open` : null,
          waitingDays !== null ? `waiting ${plural(waitingDays, "day", "days")} on the client` : null,
        ]
          .filter(Boolean)
          .join(", ") + ".",
        "Complaints and journey flags",
      );
    }
  }

  /* -------------------------------------------------------------- journey -- */
  if (input.journey) {
    add("journey", clamp(input.journey.score), `The journey reads ${input.journey.label}.`, "Journey");
  } else {
    add("journey", null, "This account is not on a journey stage.", "Journey");
  }

  /* ------------------------------------------------------------- approval -- */
  if (input.approvals) {
    add(
      "approval",
      clamp(input.approvals.score),
      input.approvals.blockers.length === 0
        ? "Nothing is in the way of the next step."
        : `${plural(input.approvals.blockers.length, "thing", "things")} in the way: ${input.approvals.blockers.join(", ")}.`,
      "Approvals",
    );
  } else {
    add("approval", null, "Nothing has reached approval yet.", "Approvals");
  }

  /* ------------------------------------------------------------ financial -- */
  if (input.financial === null) {
    add("financial", null, "Not visible from your seat.", "Invoices");
  } else if (input.financial.total === 0) {
    add("financial", null, "No invoices raised yet.", "Invoices");
  } else {
    const { overdueInvoices, failedInvoices, total } = input.financial;

    add(
      "financial",
      clamp(100 - ((overdueInvoices + failedInvoices * 1.5) / total) * 100),
      overdueInvoices === 0 && failedInvoices === 0
        ? "Payments current."
        : `${overdueInvoices} overdue and ${failedInvoices} failed of ${total} invoices.`,
      "Invoices",
    );
  }

  /* --------------------------------------------------------- relationship -- */
  if (!input.relationship || (input.relationship.satisfactionScore === null
      && input.relationship.renewalProbability === null)) {
    add("relationship", null, "Nobody has recorded a judgement yet.", "Health assessment");
  } else {
    const parts = [input.relationship.satisfactionScore, input.relationship.renewalProbability]
      .filter((v): v is number => v !== null);
    const base = parts.reduce((sum, v) => sum + v, 0) / parts.length;

    add(
      "relationship",
      /* A stated intention to leave is the single loudest signal there is. */
      clamp(input.relationship.cancellationThreat ? Math.min(base, 25) : base),
      input.relationship.cancellationThreat
        ? "The client has threatened to cancel."
        : `Recorded at ${Math.round(base)} of 100 by the last assessment.`,
      "Health assessment",
    );
  }

  /* ---------------------------------------------------------------- total -- */
  const scored = categories.filter(
    (category): category is HealthCategory & { score: number } => category.score !== null,
  );

  if (scored.length === 0) {
    return {
      score: null,
      status: null,
      categories,
      assessedCount: 0,
      strengths: [],
      risks: [],
      actions: [],
    };
  }

  const totalWeight = scored.reduce((sum, category) => sum + category.weight, 0);
  const score = clamp(
    scored.reduce((sum, category) => sum + category.score * category.weight, 0) / totalWeight,
  );

  const status: AccountHealthStatus =
    score >= 80 ? "GOOD" : score >= 65 ? "NEEDS_ATTENTION" : score >= 45 ? "AT_RISK" : "CRITICAL";

  const strengths = scored
    .filter((category) => category.score >= 85)
    .map((category) => `${category.label}: ${category.detail}`);

  const risks = scored
    .filter((category) => category.score < 65)
    .sort((a, b) => a.score - b.score)
    .map((category) => `${category.label}: ${category.detail}`);

  /*
   * One action per weak category, pointing at the system that owns the
   * problem. Nothing vague: if there is nothing to do, the list is empty.
   */
  const ACTIONS: Record<HealthCategoryKey, string> = {
    delivery: "Review overdue work",
    performance: "Review goal performance",
    communication: "Follow up with the client",
    journey: "Review journey blockers",
    approval: "Review what is waiting for approval",
    financial: "Review outstanding invoices",
    relationship: "Record a fresh assessment",
  };

  const actions: AccountHealth["actions"] = scored
    .filter((category) => category.score < 65)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((category) => ({ label: ACTIONS[category.key], target: category.key }));

  if (status === "AT_RISK" || status === "CRITICAL") {
    actions.unshift({ label: "Create a recovery plan", target: "recovery" });
  }

  return {
    score,
    status,
    categories,
    assessedCount: scored.length,
    strengths,
    risks,
    actions,
  };
}
