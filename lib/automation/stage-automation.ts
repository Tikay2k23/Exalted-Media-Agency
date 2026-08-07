import type { TaskCategory, TaskPriority } from "@prisma/client";

/**
 * Stage automation.
 *
 * Entering a journey stage creates the work the SOP says must happen next, so
 * the process does not depend on somebody remembering it. Templates are keyed
 * by the stage's stable stageKey.
 *
 * Automation only ever creates internal work items. It never sends anything to
 * a client - client-facing communication stays an explicit, logged human action.
 */

/** Who a generated work item should land on. */
export type AssigneeStrategy =
  /** The team member who owns the client relationship. */
  | "ACCOUNT_OWNER"
  /** The manager of the account's delivery project. */
  | "PROJECT_MANAGER"
  /** Whoever moved the account into this stage. */
  | "ACTOR";

export interface TaskTemplate {
  title: string;
  note: string;
  category: TaskCategory;
  priority: TaskPriority;
  estimatedHours: number;
  /** Days from the transition date until the work item is due. */
  dueInDays: number;
  assignTo: AssigneeStrategy;
  isClientFacing?: boolean;
  requiresQa?: boolean;
  requiresApproval?: boolean;
  completionCriteria?: string;
}

export const STAGE_TASK_TEMPLATES: Record<string, TaskTemplate[]> = {
  payment_received: [
    {
      title: "Send welcome email and onboarding form",
      note: "Confirm the engagement, introduce the delivery team, and send the onboarding form.",
      category: "ONBOARDING",
      priority: "HIGH",
      estimatedHours: 1,
      dueInDays: 1,
      assignTo: "ACCOUNT_OWNER",
      isClientFacing: true,
      completionCriteria: "Welcome email sent and onboarding form delivered to the primary contact.",
    },
    {
      title: "Schedule kickoff call",
      note: "Book the kickoff call with the decision maker and confirm attendees.",
      category: "ONBOARDING",
      priority: "HIGH",
      estimatedHours: 1,
      dueInDays: 3,
      assignTo: "ACCOUNT_OWNER",
      isClientFacing: true,
      completionCriteria: "Kickoff call is on the calendar with the decision maker confirmed.",
    },
    {
      title: "Record contract terms and billing schedule",
      note: "Capture contract start, monthly value, renewal date, and billing cadence on the account.",
      category: "INTERNAL_OPERATIONS",
      priority: "HIGH",
      estimatedHours: 1,
      dueInDays: 2,
      assignTo: "ACCOUNT_OWNER",
      completionCriteria: "Contract start date, monthly value, and renewal date are recorded.",
    },
  ],

  access_collection: [
    {
      title: "Collect and test platform access",
      note: "Request access for every platform in scope, confirm permission levels, and test that each login works.",
      category: "ONBOARDING",
      priority: "CRITICAL",
      estimatedHours: 3,
      dueInDays: 5,
      assignTo: "ACCOUNT_OWNER",
      completionCriteria: "Every required platform is accessible and tested. Never record passwords here.",
    },
    {
      title: "Collect brand assets and existing materials",
      note: "Logos, brand guidelines, imagery, prior campaign material, and any existing copy.",
      category: "ONBOARDING",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 5,
      assignTo: "ACCOUNT_OWNER",
    },
  ],

  onboarding_complete: [
    {
      title: "Build the internal project brief",
      note: "Goals, success metrics, audience, offer, funnel, tracking, risks, and responsibilities on both sides.",
      category: "STRATEGY",
      priority: "HIGH",
      estimatedHours: 4,
      dueInDays: 5,
      assignTo: "ACCOUNT_OWNER",
      requiresApproval: true,
      completionCriteria: "Brief is complete and approved by the operations manager.",
    },
  ],

  strategy_and_planning: [
    {
      title: "Create delivery project and milestones",
      note: "Set up the project, assign a project manager, and break the scope into milestones.",
      category: "STRATEGY",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 3,
      assignTo: "ACCOUNT_OWNER",
      completionCriteria: "Project exists with a named manager and dated milestones.",
    },
    {
      title: "Assign the delivery team",
      note: "Assign each workstream to a specialist and confirm they have capacity.",
      category: "INTERNAL_OPERATIONS",
      priority: "HIGH",
      estimatedHours: 1,
      dueInDays: 3,
      assignTo: "PROJECT_MANAGER",
    },
  ],

  in_production: [
    {
      title: "Run weekly production check-in",
      note: "Review progress against milestones, surface blockers, and confirm the launch date still holds.",
      category: "INTERNAL_OPERATIONS",
      priority: "MEDIUM",
      estimatedHours: 1,
      dueInDays: 7,
      assignTo: "PROJECT_MANAGER",
    },
  ],

  internal_quality_assurance: [
    {
      title: "Complete internal QA pass",
      note: "Work through the QA test plan, log every defect with severity, and record evidence.",
      category: "QUALITY_ASSURANCE",
      priority: "CRITICAL",
      estimatedHours: 4,
      dueInDays: 3,
      assignTo: "PROJECT_MANAGER",
      requiresQa: true,
      completionCriteria: "Every test is executed and all critical defects are closed and retested.",
    },
  ],

  client_review: [
    {
      title: "Send deliverables for client review",
      note: "Share the review link and walkthrough, name the authorized approver, and set the feedback deadline.",
      category: "CLIENT_REPORTING",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 2,
      assignTo: "ACCOUNT_OWNER",
      isClientFacing: true,
      completionCriteria: "Client has the review link and a stated feedback deadline.",
    },
  ],

  revisions_required: [
    {
      title: "Triage client feedback into revisions",
      note: "Categorise each item as defect, included revision, preference, or scope change, then assign owners.",
      category: "REVISION",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 2,
      assignTo: "PROJECT_MANAGER",
      completionCriteria: "Every feedback item is categorised, assigned, and dated.",
    },
  ],

  client_approved: [
    {
      title: "Prepare launch checklist and backups",
      note: "Confirm backups, rollback plan, domain and DNS readiness, tracking, and integrations.",
      category: "LAUNCH",
      priority: "CRITICAL",
      estimatedHours: 3,
      dueInDays: 3,
      assignTo: "PROJECT_MANAGER",
      completionCriteria: "Checklist complete, backup verified, and a rollback plan is written down.",
    },
  ],

  ready_for_launch: [
    {
      title: "Run end-to-end pre-launch test",
      note: "Forms, calendars, pipelines, workflows, email, SMS, payments, tracking, and ads all tested end to end.",
      category: "LAUNCH",
      priority: "CRITICAL",
      estimatedHours: 3,
      dueInDays: 2,
      assignTo: "PROJECT_MANAGER",
      requiresQa: true,
    },
  ],

  live_active: [
    {
      title: "Monitor launch - first 24 hours",
      note: "Watch lead capture, forms, tracking, and campaign delivery. Log any incident immediately.",
      category: "LAUNCH",
      priority: "CRITICAL",
      estimatedHours: 2,
      dueInDays: 1,
      assignTo: "PROJECT_MANAGER",
    },
    {
      title: "Monitor launch - first 7 days",
      note: "Confirm stable performance, verify tracking data, and check the first results against targets.",
      category: "LAUNCH",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 7,
      assignTo: "PROJECT_MANAGER",
    },
    {
      title: "Deliver client training and handover",
      note: "Walk the client through what was built, record the session, and share the written guide.",
      category: "CLIENT_TRAINING",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 7,
      assignTo: "ACCOUNT_OWNER",
      isClientFacing: true,
    },
  ],

  ongoing_management: [
    {
      title: "Set up recurring client reporting",
      note: "Establish the weekly update and monthly report cadence, and confirm data sources are reliable.",
      category: "CLIENT_REPORTING",
      priority: "MEDIUM",
      estimatedHours: 2,
      dueInDays: 7,
      assignTo: "ACCOUNT_OWNER",
    },
    {
      title: "Complete first client health assessment",
      note: "Score communication, payment, performance, and participation, then set the health status.",
      category: "INTERNAL_OPERATIONS",
      priority: "MEDIUM",
      estimatedHours: 1,
      dueInDays: 14,
      assignTo: "ACCOUNT_OWNER",
    },
  ],

  renewal_discussion: [
    {
      title: "Prepare renewal review and recommendation",
      note: "Summarise results to date, recommend the next package, and identify expansion opportunities.",
      category: "RENEWAL",
      priority: "HIGH",
      estimatedHours: 3,
      dueInDays: 7,
      assignTo: "ACCOUNT_OWNER",
      isClientFacing: true,
    },
  ],

  offboarding: [
    {
      title: "Complete offboarding checklist",
      note: "Final report, asset transfer, data export, access handover, and subscription cancellations.",
      category: "OFFBOARDING",
      priority: "HIGH",
      estimatedHours: 4,
      dueInDays: 14,
      assignTo: "ACCOUNT_OWNER",
      completionCriteria:
        "Client administrator access is confirmed before any agency access is removed.",
    },
    {
      title: "Record lessons learned",
      note: "Capture why the engagement ended and what the agency should change.",
      category: "AUDIT",
      priority: "MEDIUM",
      estimatedHours: 1,
      dueInDays: 21,
      assignTo: "ACCOUNT_OWNER",
    },
  ],
};

export function getStageTaskTemplates(stageKey: string | null): TaskTemplate[] {
  if (!stageKey) {
    return [];
  }

  return STAGE_TASK_TEMPLATES[stageKey] ?? [];
}

export interface AssigneeCandidates {
  accountOwnerId: string | null;
  projectManagerId: string | null;
  actorId: string;
}

/**
 * Resolves who a generated work item belongs to.
 *
 * Falls back through account owner then the acting user, so automation never
 * produces an unowned work item - an unassigned task is one nobody does.
 */
export function resolveAssignee(
  strategy: AssigneeStrategy,
  candidates: AssigneeCandidates,
): string {
  const { accountOwnerId, projectManagerId, actorId } = candidates;

  switch (strategy) {
    case "PROJECT_MANAGER":
      return projectManagerId ?? accountOwnerId ?? actorId;
    case "ACCOUNT_OWNER":
      return accountOwnerId ?? actorId;
    case "ACTOR":
    default:
      return actorId;
  }
}
