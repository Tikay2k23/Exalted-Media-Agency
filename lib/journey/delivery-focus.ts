/**
 * What the delivery card should say, and what its buttons should do.
 *
 * The card used to be keyed on the journey stage alone: every account in
 * production got "Do the work, and keep it moving" whether it was moving or
 * had been stopped by a critical blocker for a fortnight. The counts beside it
 * were real, which made it worse - the numbers said two tasks overdue while
 * the sentence said everything was fine.
 *
 * So the heading is derived from the same records the counts are. The order
 * below is the point of the module: a lower-priority state must never be able
 * to hide a higher one, because the whole failure being fixed is a reassuring
 * headline sitting on top of a problem.
 *
 * Counts come from the shared predicates in lib/clients/client-work, not from
 * a second definition of "open" written here. The card and the Work tab it
 * links to have to be answering the same question, or the reader clicks
 * through to a list that does not match the number they clicked.
 */

import { isOpen, isOverdue, type TaskTiming } from "@/lib/clients/client-work";

/** The states this card can be in, worst first. */
export type DeliveryFocusKey =
  | "RESOLVE_BLOCKER"
  | "DELIVERY_RECOVERY"
  | "WAITING_ON_CLIENT"
  | "BUILD"
  | "QA_READINESS"
  | "READY_FOR_QA";

/** Everything the card's buttons can do. A closed set, so none can be unwired. */
export type DeliveryActionKey =
  | "view-blocker"
  | "review-overdue"
  | "contacts-to-chase"
  | "tasks-and-delivery"
  | "projects"
  | "complete-requirements"
  | "view-requirement"
  | "advance-stage"
  | "review-readiness";

export interface DeliveryAction {
  key: DeliveryActionKey;
  label: string;
  primary: boolean;
}

export type CountTone = "good" | "warn" | "bad" | "neutral";

/**
 * One of the numbers on the card.
 *
 * `metric` is what the Work tab should arrive filtered by. Null means the
 * count is not something the Work tab can show, and the interface renders it
 * as a figure rather than as a button that would go somewhere unhelpful.
 */
export interface DeliveryCount {
  label: string;
  value: number;
  /**
   * What the number is counting, singular.
   *
   * Carried rather than assumed. Every counter used to be rendered as
   * "N tasks", which read as "20 tasks" beside a client-dependency figure
   * made of unanswered intake questions and open access requests.
   */
  unit: string;
  tone: CountTone;
  metric: "active" | "overdue" | "blocked" | "needsReview" | null;
}

export interface DeliveryFocus {
  key: DeliveryFocusKey;
  title: string;
  description: string;
  counts: DeliveryCount[];
  actions: DeliveryAction[];
  /**
   * Whether the production target still looks achievable.
   *
   * Derived rather than asserted: the card used to carry the line "production
   * target date still realistic" as a bullet point regardless of whether it
   * was.
   */
  targetHealth: "ON_TRACK" | "AT_RISK" | "DELAYED" | "UNKNOWN";
  targetNote: string;
}

export interface DeliveryInput {
  tasks: TaskTiming[];
  /** Open blockers on the account, worst first. */
  blockers: {
    id: string;
    reason: string;
    severity: string | null;
    blocksStage: boolean;
  }[];
  /** Open client-owed items, from the same derivation the chase list uses. */
  waitingOnClient: number;
  /** Unmet blocking gates on the next stage. */
  blockingRequirements: number;
  nextStageName: string | null;
  /** Delivery projects, for the target-date read. */
  projects: {
    id: string;
    name: string;
    status: string;
    targetDate: string | null;
    openTasks: number;
    overdueTasks: number;
  }[];
  now: Date;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Whether the production date still looks achievable.
 *
 * Three inputs, in the order they actually cost a date: a target already gone
 * by, work that is late, and a blocker nobody has cleared. Deliberately not a
 * score - the card says which of those is true, and a project manager can
 * argue with a reason in a way they cannot argue with a number.
 */
function readTarget(input: DeliveryInput): { health: DeliveryFocus["targetHealth"]; note: string } {
  const dated = input.projects.filter((project) => project.targetDate !== null);
  const overdueTasks = input.tasks.filter((task) => isOverdue(task, input.now)).length;
  const stageBlocker = input.blockers.some((blocker) => blocker.blocksStage);

  const passed = dated.filter(
    (project) =>
      new Date(project.targetDate as string) < input.now && project.openTasks > 0,
  );

  if (passed.length > 0) {
    return {
      health: "DELAYED",
      note: `${plural(passed.length, "project is", "projects are")} past target with work still open.`,
    };
  }

  if (stageBlocker) {
    return { health: "AT_RISK", note: "A blocker is holding the stage." };
  }

  if (overdueTasks > 0) {
    return {
      health: "AT_RISK",
      note: `${plural(overdueTasks, "task is", "tasks are")} overdue.`,
    };
  }

  if (dated.length === 0) {
    // No date to judge against. Saying "on track" here would be an opinion.
    return { health: "UNKNOWN", note: "No project target date is set." };
  }

  return { health: "ON_TRACK", note: "No overdue work and no blockers." };
}

/**
 * The delivery card, decided.
 *
 * Read top to bottom; the first arm that matches wins. Every arm carries its
 * own buttons, so a heading can never appear with an action that does not suit
 * it.
 */
export function deliveryFocus(input: DeliveryInput): DeliveryFocus {
  const { now } = input;
  const openTasks = input.tasks.filter((task) => isOpen(task));
  const overdue = openTasks.filter((task) => isOverdue(task, now));
  const blocked = openTasks.filter((task) => task.status === "BLOCKED");
  const target = readTarget(input);

  const counts: DeliveryCount[] = [
    {
      label: "Open work",
      value: openTasks.length,
      unit: "task",
      tone: openTasks.length === 0 ? "good" : "neutral",
      metric: "active",
    },
    {
      label: "Overdue",
      value: overdue.length,
      unit: "task",
      tone: overdue.length === 0 ? "good" : "bad",
      metric: "overdue",
    },
  ];

  if (blocked.length > 0) {
    counts.push({
      label: "Blocked",
      value: blocked.length,
      unit: "task",
      tone: "bad",
      metric: "blocked",
    });
  }

  if (input.waitingOnClient > 0) {
    counts.push({
      label: "Waiting on client",
      value: input.waitingOnClient,
      unit: "request",
      tone: "warn",
      // Not a task state - it comes from the raised conditions, so the Work
      // tab has no filter that would show the same set.
      metric: null,
    });
  }

  const shell = { counts, targetHealth: target.health, targetNote: target.note };

  /* 1. A blocker holding the stage beats everything else on the card. */
  const stageBlocker = input.blockers.find((blocker) => blocker.blocksStage);

  if (stageBlocker) {
    return {
      ...shell,
      key: "RESOLVE_BLOCKER",
      title: "Focus: Resolve Production Blocker",
      description: `A blocking issue is preventing production from moving forward: ${stageBlocker.reason}`,
      actions: [
        { key: "view-blocker", label: "View Blocker", primary: true },
        { key: "tasks-and-delivery", label: "Tasks & Delivery", primary: false },
      ],
    };
  }

  /* 2. Work that is already late. */
  if (overdue.length > 0) {
    return {
      ...shell,
      key: "DELIVERY_RECOVERY",
      title: "Focus: Delivery Recovery",
      description: `${plural(overdue.length, "task is", "tasks are")} overdue and may affect the production timeline.`,
      actions: [
        { key: "review-overdue", label: "Review Overdue Work", primary: true },
        { key: "projects", label: "Projects", primary: false },
      ],
    };
  }

  /*
   * 3. Nothing is late, but the client owes us something.
   *
   * Above open work because a specialist cannot finish a task whose input has
   * not arrived, and below overdue because a late task is a date already lost.
   */
  if (input.waitingOnClient > 0 && openTasks.length > 0) {
    return {
      ...shell,
      key: "WAITING_ON_CLIENT",
      title: "Focus: Waiting on Client",
      description: `Production is open but ${plural(input.waitingOnClient, "item is", "items are")} still owed by the client.`,
      actions: [
        { key: "contacts-to-chase", label: "Contacts to Chase", primary: true },
        { key: "tasks-and-delivery", label: "Tasks & Delivery", primary: false },
      ],
    };
  }

  /* 4. Ordinary production. */
  if (openTasks.length > 0) {
    return {
      ...shell,
      key: "BUILD",
      title: "Focus: Build / Implementation",
      description: "Production is actively moving forward.",
      actions: [
        { key: "tasks-and-delivery", label: "Tasks & Delivery", primary: true },
        { key: "projects", label: "Projects", primary: false },
      ],
    };
  }

  /* 5. Work done, gates outstanding. */
  if (input.blockingRequirements > 0) {
    return {
      ...shell,
      key: "QA_READINESS",
      title: "Focus: QA Readiness",
      description: `Production work is complete. Finish the remaining ${plural(
        input.blockingRequirements,
        "requirement",
        "requirements",
      )} before ${input.nextStageName ?? "the next stage"}.`,
      actions: [
        { key: "complete-requirements", label: "Complete Requirements", primary: true },
        { key: "view-requirement", label: "View Requirement", primary: false },
      ],
    };
  }

  /* 6. Everything clear. */
  return {
    ...shell,
    key: "READY_FOR_QA",
    title: `Focus: Ready for ${input.nextStageName ?? "the next stage"}`,
    description: "Production and exit requirements are complete.",
    actions: [
      {
        key: "advance-stage",
        label: `Advance to ${input.nextStageName ?? "the next stage"}`,
        primary: true,
      },
      { key: "review-readiness", label: "Review Readiness", primary: false },
    ],
  };
}
