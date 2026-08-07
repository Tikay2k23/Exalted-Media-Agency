import type {
  AccessStatus,
  ApprovalType,
  BriefStatus,
  DefectSeverity,
  DefectStatus,
  EmployeeTaskStatus,
  HealthStatus,
  InvoiceStatus,
  TaskCategory,
  TaskPriority,
} from "@prisma/client";

import { deriveBriefCompleteness } from "@/lib/strategy/brief-service";

/**
 * Stage gates.
 *
 * A requirement is a named, verifiable condition that must hold before an
 * account may enter a stage. Requirements live in the StageRequirement table
 * so operations can retune the process without a deploy; this module holds the
 * checkers those rows point at.
 *
 * Every checker here verifies against data the system actually stores. A
 * requirement with no checker is reported as unverifiable rather than being
 * silently treated as satisfied - a gate that quietly passes is worse than no
 * gate at all.
 */

/** Work item statuses that mean "still outstanding". */
const OPEN_TASK_STATUSES: ReadonlySet<EmployeeTaskStatus> = new Set([
  "TODO",
  "READY",
  "IN_PROGRESS",
  "WAITING_INTERNAL",
  "WAITING_CLIENT",
  "BLOCKED",
  "IN_REVIEW",
  "CHANGES_REQUIRED",
  "READY_FOR_QA",
]);

export function isOpenTask(status: EmployeeTaskStatus) {
  return OPEN_TASK_STATUSES.has(status);
}

export interface EvaluableTask {
  id: string;
  status: EmployeeTaskStatus;
  category: TaskCategory;
  priority: TaskPriority;
  assignedToId: string | null;
  title: string;
}

export interface EvaluableProject {
  id: string;
  projectManagerId: string | null;
}

export interface EvaluableContact {
  isPrimary: boolean;
  isApprover: boolean;
}

export interface EvaluableInvoice {
  status: InvoiceStatus;
}

export interface EvaluableAccessRecord {
  platform: string;
  isCritical: boolean;
  status: AccessStatus;
}

export interface EvaluableDefect {
  reference: string;
  severity: DefectSeverity;
  status: DefectStatus;
}

export interface EvaluableApproval {
  type: ApprovalType;
}

export interface EvaluableLaunch {
  backupVerifiedAt: Date | null;
  rollbackPlan: string | null;
  ownerId: string | null;
}

export interface EvaluableOffboarding {
  clientAdminAccessConfirmedAt: Date | null;
  finalBillingSettledAt: Date | null;
}

/** The account shape a stage gate needs in order to be evaluated. */
export interface EvaluableClient {
  id: string;
  assignedUserId: string | null;
  contractStartDate: Date | null;
  monthlyValue: unknown | null;
  healthStatus: HealthStatus;
  renewalDate: Date | null;
  contacts: EvaluableContact[];
  projects: EvaluableProject[];
  agencyTasks: EvaluableTask[];
  invoices: EvaluableInvoice[];
  accessRecords: EvaluableAccessRecord[];
  strategyBrief: ({ status: BriefStatus } & Record<string, unknown>) | null;
  defects: EvaluableDefect[];
  approvals: EvaluableApproval[];
  launches: EvaluableLaunch[];
  offboarding: EvaluableOffboarding | null;
}

export interface RequirementDefinition {
  key: string;
  label: string;
  description: string;
  /** Returns null when satisfied, or a human-readable reason when not. */
  check: (client: EvaluableClient) => string | null;
}

function openTasksInCategory(client: EvaluableClient, category: TaskCategory) {
  return client.agencyTasks.filter(
    (task) => task.category === category && isOpenTask(task.status),
  );
}

function describeTasks(tasks: EvaluableTask[], limit = 3) {
  const shown = tasks.slice(0, limit).map((task) => `"${task.title}"`).join(", ");
  const remainder = tasks.length - limit;

  return remainder > 0 ? `${shown} and ${remainder} more` : shown;
}

/**
 * The canonical requirement catalogue. `key` is what a StageRequirement row
 * stores, so these strings are part of the data contract - rename with a
 * migration, never in place.
 */
export const REQUIREMENT_DEFINITIONS: RequirementDefinition[] = [
  {
    key: "account_owner_assigned",
    label: "Account owner assigned",
    description: "Someone at the agency owns this relationship.",
    check: (client) =>
      client.assignedUserId ? null : "No team member is assigned to this account.",
  },
  {
    key: "primary_contact_recorded",
    label: "Primary client contact recorded",
    description: "A named contact exists on the client side.",
    check: (client) =>
      client.contacts.some((contact) => contact.isPrimary)
        ? null
        : "No contact on this account is marked as the primary contact.",
  },
  {
    key: "client_approver_recorded",
    label: "Authorized approver recorded",
    description: "A contact is authorized to sign off on deliverables.",
    check: (client) =>
      client.contacts.some((contact) => contact.isApprover)
        ? null
        : "No contact on this account is marked as an authorized approver.",
  },
  {
    key: "contract_recorded",
    label: "Contract recorded",
    description: "Contract start date and monthly value are on file.",
    check: (client) => {
      const missing: string[] = [];

      if (!client.contractStartDate) {
        missing.push("contract start date");
      }

      if (client.monthlyValue === null || client.monthlyValue === undefined) {
        missing.push("monthly value");
      }

      return missing.length ? `Missing ${missing.join(" and ")}.` : null;
    },
  },
  {
    key: "project_exists",
    label: "Delivery project created",
    description: "Production work is tracked under a project.",
    check: (client) =>
      client.projects.length ? null : "This account has no delivery project yet.",
  },
  {
    key: "project_manager_assigned",
    label: "Project manager assigned",
    description: "Every delivery project has a named manager.",
    check: (client) => {
      if (!client.projects.length) {
        return "This account has no delivery project yet.";
      }

      const unmanaged = client.projects.filter((project) => !project.projectManagerId);

      return unmanaged.length
        ? `${unmanaged.length} project(s) have no project manager assigned.`
        : null;
    },
  },
  {
    key: "work_assigned",
    label: "Work assigned to the team",
    description: "At least one work item exists and every item has an owner.",
    check: (client) => {
      if (!client.agencyTasks.length) {
        return "No work items have been created for this account.";
      }

      const unassigned = client.agencyTasks.filter(
        (task) => isOpenTask(task.status) && !task.assignedToId,
      );

      return unassigned.length
        ? `${unassigned.length} open work item(s) have no assignee.`
        : null;
    },
  },
  {
    key: "onboarding_tasks_complete",
    label: "Onboarding work complete",
    description: "No onboarding work item is still open.",
    check: (client) => {
      const open = openTasksInCategory(client, "ONBOARDING");
      return open.length
        ? `${open.length} onboarding work item(s) still open: ${describeTasks(open)}.`
        : null;
    },
  },
  {
    key: "strategy_tasks_complete",
    label: "Strategy work complete",
    description: "No strategy work item is still open.",
    check: (client) => {
      const open = openTasksInCategory(client, "STRATEGY");
      return open.length
        ? `${open.length} strategy work item(s) still open: ${describeTasks(open)}.`
        : null;
    },
  },
  {
    key: "production_work_complete",
    label: "Production work complete",
    description: "No production work item is still open.",
    check: (client) => {
      const productionCategories: TaskCategory[] = [
        "CONTENT_CALENDAR",
        "COPYWRITING",
        "CREATIVE_PRODUCTION",
        "PAID_MEDIA_OPTIMIZATION",
        "SEO_AUDIT",
        "EMAIL_CAMPAIGN",
        "WEBSITE_UPDATE",
        "COMMUNITY_MANAGEMENT",
      ];

      const open = client.agencyTasks.filter(
        (task) => productionCategories.includes(task.category) && isOpenTask(task.status),
      );

      return open.length
        ? `${open.length} production work item(s) still open: ${describeTasks(open)}.`
        : null;
    },
  },
  {
    key: "qa_tasks_complete",
    label: "Quality assurance passed",
    description: "No quality assurance work item is still open.",
    check: (client) => {
      const open = openTasksInCategory(client, "QUALITY_ASSURANCE");
      return open.length
        ? `${open.length} QA work item(s) still open: ${describeTasks(open)}.`
        : null;
    },
  },
  {
    key: "revisions_complete",
    label: "Revisions closed",
    description: "No revision work item is still open.",
    check: (client) => {
      const open = openTasksInCategory(client, "REVISION");
      return open.length
        ? `${open.length} revision(s) still open: ${describeTasks(open)}.`
        : null;
    },
  },
  {
    key: "no_critical_open_work",
    label: "No critical work outstanding",
    description: "Nothing at critical or urgent priority is still open.",
    check: (client) => {
      const open = client.agencyTasks.filter(
        (task) =>
          isOpenTask(task.status)
          && (task.priority === "CRITICAL" || task.priority === "URGENT"),
      );

      return open.length
        ? `${open.length} critical or urgent work item(s) still open: ${describeTasks(open)}.`
        : null;
    },
  },
  {
    key: "launch_owner_assigned",
    label: "Launch owner assigned",
    description: "A launch work item exists and has a named owner.",
    check: (client) => {
      const launchTasks = client.agencyTasks.filter((task) => task.category === "LAUNCH");

      if (!launchTasks.length) {
        return "No launch work item has been created for this account.";
      }

      return launchTasks.some((task) => task.assignedToId)
        ? null
        : "No launch work item has an assigned owner.";
    },
  },
  {
    key: "launch_tasks_complete",
    label: "Launch work complete",
    description: "No launch work item is still open.",
    check: (client) => {
      const open = openTasksInCategory(client, "LAUNCH");
      return open.length
        ? `${open.length} launch work item(s) still open: ${describeTasks(open)}.`
        : null;
    },
  },
  {
    key: "health_assessed",
    label: "Client health assessed",
    description: "The account has a health status other than Not Assessed.",
    check: (client) =>
      client.healthStatus === "NOT_ASSESSED"
        ? "This account has not been given a health status yet."
        : null,
  },
  {
    key: "renewal_date_set",
    label: "Renewal date set",
    description: "The account has a renewal date on file.",
    check: (client) =>
      client.renewalDate ? null : "No renewal date has been recorded for this account.",
  },
  {
    key: "no_open_work",
    label: "No open work items",
    description: "Every work item on the account is closed.",
    check: (client) => {
      const open = client.agencyTasks.filter((task) => isOpenTask(task.status));
      return open.length
        ? `${open.length} work item(s) are still open: ${describeTasks(open)}.`
        : null;
    },
  },

  // --- Requirements backed by the commercial, access, QA, and launch records ---

  {
    key: "payment_confirmed",
    label: "Payment confirmed",
    description: "At least one invoice on this account has been paid.",
    check: (client) => {
      if (!client.invoices.length) {
        return "No invoice has been raised for this account.";
      }

      const paid = client.invoices.filter((invoice) => invoice.status === "PAID");

      if (paid.length) {
        return null;
      }

      const failed = client.invoices.filter(
        (invoice) => invoice.status === "FAILED" || invoice.status === "OVERDUE",
      );

      return failed.length
        ? `No invoice is paid, and ${failed.length} invoice(s) are overdue or failed.`
        : "No invoice on this account has been paid yet.";
    },
  },
  {
    key: "critical_access_collected",
    label: "Critical platform access collected",
    description: "Every platform marked critical is granted and tested.",
    check: (client) => {
      const critical = client.accessRecords.filter((record) => record.isCritical);

      if (!critical.length) {
        return "No platform has been marked as critical access for this account.";
      }

      const outstanding = critical.filter(
        (record) => record.status !== "GRANTED" && record.status !== "TESTED",
      );

      if (!outstanding.length) {
        return null;
      }

      const names = outstanding.slice(0, 3).map((record) => record.platform).join(", ");
      const remainder = outstanding.length - 3;

      return `${outstanding.length} critical platform(s) not yet accessible: ${names}`
        + `${remainder > 0 ? ` and ${remainder} more` : ""}.`;
    },
  },
  {
    key: "critical_access_tested",
    label: "Critical platform access tested",
    description: "Every critical platform has been logged into and verified.",
    check: (client) => {
      const critical = client.accessRecords.filter((record) => record.isCritical);
      const untested = critical.filter((record) => record.status !== "TESTED");

      return untested.length
        ? `${untested.length} critical platform(s) have not been tested.`
        : null;
    },
  },
  {
    key: "strategy_brief_approved",
    label: "Strategy brief approved",
    description: "The internal project brief exists and has been approved.",
    check: (client) => {
      if (!client.strategyBrief) {
        return "No strategy brief has been created for this account.";
      }

      if (client.strategyBrief.status !== "APPROVED") {
        return `The strategy brief is ${client.strategyBrief.status.toLowerCase().replaceAll("_", " ")}, not approved.`;
      }

      // Checked here as well as at approval time, so an approval that reached
      // the database another way cannot satisfy this gate with an empty brief.
      const completeness = deriveBriefCompleteness(client.strategyBrief);

      return completeness.complete
        ? null
        : `The brief is approved but still missing ${completeness.missing.join(", ").toLowerCase()}.`;
    },
  },
  {
    key: "critical_defects_closed",
    label: "Critical defects closed",
    description: "No critical defect is still open.",
    check: (client) => {
      const openCritical = client.defects.filter(
        (defect) =>
          defect.severity === "CRITICAL"
          && defect.status !== "CLOSED"
          && defect.status !== "PASSED"
          && defect.status !== "WONT_FIX",
      );

      if (!openCritical.length) {
        return null;
      }

      const references = openCritical.slice(0, 3).map((defect) => defect.reference).join(", ");

      return `${openCritical.length} critical defect(s) still open: ${references}.`;
    },
  },
  {
    key: "high_defects_closed",
    label: "High severity defects closed",
    description: "No high severity defect is still open.",
    check: (client) => {
      const open = client.defects.filter(
        (defect) =>
          defect.severity === "HIGH"
          && defect.status !== "CLOSED"
          && defect.status !== "PASSED"
          && defect.status !== "WONT_FIX",
      );

      return open.length ? `${open.length} high severity defect(s) still open.` : null;
    },
  },
  {
    key: "client_approval_recorded",
    label: "Client approval recorded",
    description: "A deliverable or final sign-off approval is on file.",
    check: (client) =>
      client.approvals.some(
        (approval) => approval.type === "DELIVERABLE" || approval.type === "FINAL_SIGN_OFF",
      )
        ? null
        : "No client approval has been recorded for this account.",
  },
  {
    key: "backup_verified",
    label: "Backup verified and rollback plan written",
    description: "A launch record confirms a verified backup and a rollback plan.",
    check: (client) => {
      if (!client.launches.length) {
        return "No launch has been created for this account.";
      }

      const ready = client.launches.some(
        (launch) => launch.backupVerifiedAt !== null && Boolean(launch.rollbackPlan),
      );

      if (ready) {
        return null;
      }

      const missingBackup = client.launches.every((launch) => !launch.backupVerifiedAt);

      return missingBackup
        ? "No launch has a verified backup."
        : "No launch has a written rollback plan.";
    },
  },
  {
    key: "launch_record_owned",
    label: "Launch has a named owner",
    description: "A launch record exists with someone accountable for it.",
    check: (client) => {
      if (!client.launches.length) {
        return "No launch has been created for this account.";
      }

      return client.launches.some((launch) => launch.ownerId)
        ? null
        : "No launch has an assigned owner.";
    },
  },
  {
    key: "client_admin_access_confirmed",
    label: "Client administrator access confirmed",
    description:
      "The client holds administrator access on their own platforms before agency access is removed.",
    check: (client) => {
      if (!client.offboarding) {
        return "No offboarding record exists for this account.";
      }

      return client.offboarding.clientAdminAccessConfirmedAt
        ? null
        : "Client administrator access has not been confirmed. Agency access must not be removed first.";
    },
  },
  {
    key: "final_billing_settled",
    label: "Final billing settled",
    description: "No invoice is left unpaid, and final billing is marked settled.",
    check: (client) => {
      const outstanding = client.invoices.filter(
        (invoice) =>
          invoice.status === "SENT"
          || invoice.status === "OVERDUE"
          || invoice.status === "FAILED"
          || invoice.status === "PARTIALLY_PAID",
      );

      if (outstanding.length) {
        return `${outstanding.length} invoice(s) are still outstanding.`;
      }

      if (client.offboarding && !client.offboarding.finalBillingSettledAt) {
        return "Final billing has not been marked as settled.";
      }

      return null;
    },
  },
];

const definitionsByKey = new Map(
  REQUIREMENT_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function getRequirementDefinition(key: string) {
  return definitionsByKey.get(key) ?? null;
}

export interface StageRequirementRow {
  requirementKey: string;
  label: string;
  isBlocking: boolean;
}

export interface RequirementEvaluation {
  key: string;
  label: string;
  isBlocking: boolean;
  satisfied: boolean;
  /** Why the requirement is not satisfied, or why it could not be checked. */
  reason: string | null;
  /** True when no checker is registered for this key. */
  unverifiable: boolean;
}

export interface StageGateResult {
  evaluations: RequirementEvaluation[];
  unmet: RequirementEvaluation[];
  /** Unmet requirements that block the move unless overridden. */
  blocking: RequirementEvaluation[];
  passed: boolean;
}

/**
 * Evaluates every requirement configured for a stage.
 *
 * A requirement whose key has no registered checker is treated as unmet and
 * blocking. Failing closed is deliberate: it surfaces a misconfigured rule
 * instead of waving work through a gate nobody is actually checking.
 */
export function evaluateStageRequirements(
  client: EvaluableClient,
  requirements: StageRequirementRow[],
): StageGateResult {
  const evaluations = requirements.map<RequirementEvaluation>((requirement) => {
    const definition = getRequirementDefinition(requirement.requirementKey);

    if (!definition) {
      return {
        key: requirement.requirementKey,
        label: requirement.label,
        isBlocking: requirement.isBlocking,
        satisfied: false,
        reason:
          `No checker is registered for "${requirement.requirementKey}", so this `
          + "requirement cannot be verified. An administrator should correct the rule.",
        unverifiable: true,
      };
    }

    const reason = definition.check(client);

    return {
      key: definition.key,
      label: requirement.label || definition.label,
      isBlocking: requirement.isBlocking,
      satisfied: reason === null,
      reason,
      unverifiable: false,
    };
  });

  const unmet = evaluations.filter((evaluation) => !evaluation.satisfied);
  const blocking = unmet.filter((evaluation) => evaluation.isBlocking);

  return {
    evaluations,
    unmet,
    blocking,
    passed: blocking.length === 0,
  };
}

/**
 * Which requirements guard which stage, keyed by the stage's stable stageKey.
 * Seeded into StageRequirement; edit there to retune a live workspace.
 */
export const STAGE_REQUIREMENT_SEED: Record<string, string[]> = {
  access_collection: ["primary_contact_recorded"],

  onboarding_complete: [
    "primary_contact_recorded",
    "onboarding_tasks_complete",
    "critical_access_collected",
    // Granted is not the same as working. Onboarding is not complete until
    // somebody has actually logged in, which is the difference between
    // production starting and production stalling on day one.
    "critical_access_tested",
  ],

  strategy_and_planning: ["account_owner_assigned", "onboarding_tasks_complete"],

  // SOP section 10: payment confirmed, onboarding complete, critical access
  // available, project brief exists, team assigned.
  in_production: [
    "payment_confirmed",
    "contract_recorded",
    "onboarding_tasks_complete",
    "critical_access_collected",
    "strategy_brief_approved",
    "account_owner_assigned",
    "project_exists",
    "project_manager_assigned",
    "work_assigned",
  ],

  internal_quality_assurance: ["production_work_complete"],

  client_review: ["qa_tasks_complete", "critical_defects_closed", "client_approver_recorded"],

  client_approved: ["revisions_complete", "critical_defects_closed"],

  // SOP section 10: QA passed, critical defects closed, client approval
  // recorded, backups exist, launch owner assigned.
  ready_for_launch: [
    "qa_tasks_complete",
    "critical_defects_closed",
    "revisions_complete",
    "client_approval_recorded",
    "backup_verified",
    "launch_record_owned",
    "no_critical_open_work",
  ],

  live_active: ["launch_tasks_complete"],

  ongoing_management: ["account_owner_assigned", "health_assessed"],

  renewal_discussion: ["renewal_date_set"],

  offboarding: ["account_owner_assigned"],

  // Nothing is archived while money or access is still outstanding.
  archived: ["no_open_work", "final_billing_settled", "client_admin_access_confirmed"],
};
