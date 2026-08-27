/**
 * Where a stage gate is actually satisfied.
 *
 * This is the piece that turns "1 requirement still to finish" into something
 * somebody can act on. A requirement here is not a row with a tick box - it is
 * a named condition evaluated against real records, so "production work
 * complete" becomes true by closing the production tasks and in no other way.
 * There is nothing to mark; there is only the record that makes it true.
 *
 * That is deliberate, and worth stating plainly because the obvious feature
 * request is a Mark Complete button. A completion flag beside these checkers
 * would be a second source of truth for the same fact: somebody would tick
 * "production work complete" while eight production tasks were open, the gate
 * would still refuse the move, and the interface would be arguing with itself.
 * The sanctioned way past a gate that cannot be met is the override that
 * already exists, which records who decided and why.
 *
 * So each key maps to the screen that owns the underlying record. The drawer
 * offers that as the action, and the reader lands on the thing they have to
 * change rather than on a generic requirements list.
 */

import type { ClientTab } from "@/lib/clients/client-workspace";

/** Where a requirement is resolved, and what to say about getting there. */
export interface RequirementRoute {
  /** The client tab that owns the record behind this gate. */
  tab: ClientTab;
  /** What the button says. Phrased as the thing they will do, not the tab. */
  action: string;
  /**
   * A Work-tab metric to arrive filtered by, where the gate is about tasks.
   * Matches the metric cards the Work tab already has, so the number the gate
   * counted and the rows they land on are the same question.
   */
  metric?: "active" | "overdue" | "blocked" | "needsReview";
  /** How the condition is actually met, in one line. */
  how: string;
}

const WORK_COMPLETE = (what: string): RequirementRoute => ({
  tab: "tasks",
  action: "Open the open work",
  metric: "active",
  how: `Close the remaining ${what}. The gate reads task status directly.`,
});

/**
 * Key to destination.
 *
 * Keys come from the requirement catalogue in stage-requirements.ts; the
 * fallback below covers any that are added later without this map, so a new
 * gate degrades to "open the client record" rather than to a dead button.
 */
export const REQUIREMENT_ROUTES: Record<string, RequirementRoute> = {
  /* Ownership and people. */
  account_owner_assigned: {
    tab: "overview",
    action: "Assign an owner",
    how: "Set the account owner on the client record.",
  },
  project_manager_assigned: {
    tab: "tasks",
    action: "Open delivery projects",
    how: "Name a project manager on the client's delivery project.",
  },
  primary_contact_recorded: {
    tab: "contacts",
    action: "Open Account",
    how: "Mark one of the client's contacts as the primary contact.",
  },
  client_approver_recorded: {
    tab: "contacts",
    action: "Open Account",
    how: "Mark a contact as the authorised approver.",
  },

  /* Commercial. */
  payment_confirmed: {
    tab: "reports",
    action: "Open billing",
    how: "Record the payment against the client's invoice.",
  },
  contract_recorded: {
    tab: "contacts",
    action: "Open Account",
    how: "Record the signed contract, its dates and its terms.",
  },
  final_billing_settled: {
    tab: "reports",
    action: "Open billing",
    how: "Settle the outstanding balance on the account.",
  },
  renewal_date_set: {
    tab: "contacts",
    action: "Open Account",
    how: "Set the renewal date on the client record.",
  },

  /* Delivery set-up. */
  project_exists: {
    tab: "tasks",
    action: "Open delivery projects",
    how: "Create the delivery project this work belongs to.",
  },
  work_assigned: {
    tab: "tasks",
    action: "Open the work",
    metric: "active",
    how: "Give the open tasks an assignee.",
  },

  /* Task-completion gates. */
  onboarding_tasks_complete: WORK_COMPLETE("onboarding tasks"),
  strategy_tasks_complete: WORK_COMPLETE("strategy tasks"),
  production_work_complete: WORK_COMPLETE("production tasks"),
  qa_tasks_complete: WORK_COMPLETE("QA tasks"),
  revisions_complete: WORK_COMPLETE("revision tasks"),
  launch_tasks_complete: WORK_COMPLETE("launch tasks"),
  no_open_work: WORK_COMPLETE("open tasks"),
  no_critical_open_work: {
    tab: "tasks",
    action: "Open the critical work",
    metric: "active",
    how: "Close or downgrade the critical tasks still open.",
  },

  /* Access and assets. */
  critical_access_collected: {
    tab: "files",
    action: "Open Files & Access",
    how: "Record access for every platform marked critical.",
  },
  critical_access_tested: {
    tab: "files",
    action: "Open Files & Access",
    how: "Test the critical platform logins and record the result.",
  },
  client_admin_access_confirmed: {
    tab: "files",
    action: "Open Files & Access",
    how: "Confirm the client holds admin access to their own platforms.",
  },

  /* Strategy. */
  strategy_brief_approved: {
    tab: "services",
    action: "Open Strategy",
    how: "Complete the brief and record its approval.",
  },

  /* Quality. */
  critical_defects_closed: {
    tab: "quality",
    action: "Open Approvals",
    how: "Close the critical defects still open.",
  },
  high_defects_closed: {
    tab: "quality",
    action: "Open Approvals",
    how: "Close the high-severity defects still open.",
  },
  client_approval_recorded: {
    tab: "quality",
    action: "Open Approvals",
    how: "Record the client's sign-off against the deliverable.",
  },

  /* Launch. */
  launch_owner_assigned: {
    tab: "tasks",
    action: "Open the launch record",
    how: "Name an owner on the launch record.",
  },
  launch_record_owned: {
    tab: "tasks",
    action: "Open the launch record",
    how: "Name an owner on the launch record.",
  },
  backup_verified: {
    tab: "tasks",
    action: "Open the launch record",
    how: "Verify and record the pre-launch backup.",
  },

  /* Retention. */
  health_assessed: {
    tab: "reports",
    action: "Open health",
    how: "Record a current health assessment for this account.",
  },
};

/**
 * The destination for a key, including ones this map has never heard of.
 *
 * A requirement added to the catalogue without a route still gets a working
 * button - it goes to the client's overview rather than nowhere, and says so
 * honestly rather than claiming to know where the fix lives.
 */
export function requirementRoute(key: string): RequirementRoute {
  return (
    REQUIREMENT_ROUTES[key] ?? {
      tab: "overview",
      action: "Open the client record",
      how: "This gate is checked against the client record.",
    }
  );
}
