/**
 * What each stage requirement means, and how to actually satisfy it.
 *
 * A gate that says "blocked" without saying what to do next is a dead end.
 * Every requirement the system can block on has an entry here written in plain
 * language, so the person looking at it knows what to do without needing to
 * understand the data model.
 */

export interface RequirementRemedy {
  /** Plain-language explanation of what the rule is protecting against. */
  whatItMeans: string;
  /** Concrete steps to satisfy it. */
  howToFix: string;
  /** Where to go to do it. `:id` is replaced with the client id. */
  href?: string;
  actionLabel?: string;
  /** True when this cannot be resolved in the app yet. */
  notBuiltYet?: boolean;
}

export const REQUIREMENT_REMEDIES: Record<string, RequirementRemedy> = {
  account_owner_assigned: {
    whatItMeans:
      "Nobody at the agency is named as the owner of this relationship, so there is no one accountable for it.",
    howToFix: "Edit the account and set the assigned team member.",
    href: "/clients/:id",
    actionLabel: "Assign an owner",
  },
  primary_contact_recorded: {
    whatItMeans:
      "There is no named person on the client side, so nobody knows who to actually talk to.",
    howToFix: "Add a contact on the account and mark them as the primary contact.",
    href: "/clients/:id",
    actionLabel: "Add a contact",
  },
  client_approver_recorded: {
    whatItMeans:
      "No one on the client side is authorised to sign work off, so an approval could be disputed later.",
    howToFix:
      "Add the contact who signs off deliverables and mark them as an authorised approver.",
    href: "/clients/:id",
    actionLabel: "Add an approver",
  },
  contract_recorded: {
    whatItMeans:
      "The commercial terms are not on file, so nobody can tell what was agreed or what to bill.",
    howToFix: "Edit the account and set the contract start date and monthly value.",
    href: "/clients/:id",
    actionLabel: "Record the contract",
  },
  payment_confirmed: {
    whatItMeans:
      "No payment has been received. Starting production before money arrives is how agencies end up working for free.",
    howToFix: "Raise an invoice against the account and mark it paid once funds clear.",
    href: "/clients/:id",
    actionLabel: "Record an invoice",
  },
  critical_access_collected: {
    whatItMeans:
      "The agency cannot get into the platforms it needs, so production would stall as soon as it started.",
    howToFix:
      "Add each platform the work depends on, mark the essential ones as critical, and record access once granted. Never store passwords here - only where the credential lives.",
    href: "/clients/:id",
    actionLabel: "Add platform access",
  },
  critical_access_tested: {
    whatItMeans:
      "Access was granted but nobody has logged in to confirm it actually works at the right permission level.",
    howToFix: "Log in to each critical platform, then mark its access record as tested.",
    href: "/clients/:id",
    actionLabel: "Test access",
  },
  strategy_brief_approved: {
    whatItMeans:
      "There is no agreed plan, so the team would be building without a shared definition of done.",
    howToFix:
      "Write the strategy brief covering goals, audience, offer, and responsibilities, then have it approved.",
    href: "/clients/:id",
    actionLabel: "Write the brief",
  },
  project_exists: {
    whatItMeans:
      "Production work is not tracked under a project, so there is nothing to plan or report against.",
    howToFix: "Create a delivery project for this account.",
    href: "/clients/:id",
    actionLabel: "Create a project",
  },
  project_manager_assigned: {
    whatItMeans: "No one is running delivery, so blockers have nowhere to go.",
    howToFix: "Open the project and assign a project manager.",
    href: "/clients/:id",
    actionLabel: "Assign a manager",
  },
  work_assigned: {
    whatItMeans:
      "Either no work exists, or some of it has no owner. Unowned work does not get done.",
    howToFix: "Create the work items for this account and give every one an assignee.",
    href: "/team",
    actionLabel: "Assign work",
  },
  onboarding_tasks_complete: {
    whatItMeans:
      "Onboarding work is still open, so the information production depends on has not been gathered.",
    howToFix: "Finish the open onboarding work items, or cancel any that no longer apply.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  strategy_tasks_complete: {
    whatItMeans: "Planning work is still open.",
    howToFix: "Finish the open strategy work items, or cancel any that no longer apply.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  production_work_complete: {
    whatItMeans: "Build work is still in progress, so there is nothing stable to test.",
    howToFix: "Finish the open production work items before sending this to QA.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  qa_tasks_complete: {
    whatItMeans: "Quality assurance has not finished, so the work is unverified.",
    howToFix: "Complete the open QA work items.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  revisions_complete: {
    whatItMeans: "Client feedback has been logged but not yet actioned.",
    howToFix: "Finish the open revision work items.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  critical_defects_closed: {
    whatItMeans:
      "A critical defect is still open. Shipping over a known critical fault is how launches turn into incidents.",
    howToFix: "Fix each critical defect and have it verified by someone other than the builder.",
    href: "/clients/:id",
    actionLabel: "Review defects",
  },
  high_defects_closed: {
    whatItMeans: "A high severity defect is still open.",
    howToFix: "Fix and verify the outstanding high severity defects.",
    href: "/clients/:id",
    actionLabel: "Review defects",
  },
  no_critical_open_work: {
    whatItMeans: "Work marked critical or urgent is still outstanding.",
    howToFix:
      "Finish the critical work, or lower its priority if it is no longer genuinely urgent.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  client_approval_recorded: {
    whatItMeans:
      "The client has not signed off. Launching without a recorded approval leaves the agency exposed if they later object.",
    howToFix: "Record the client's approval of the deliverable, with evidence.",
    href: "/clients/:id",
    actionLabel: "Record approval",
    notBuiltYet: true,
  },
  launch_owner_assigned: {
    whatItMeans: "No one is accountable for the launch itself.",
    howToFix: "Create a launch work item and assign an owner.",
    href: "/team",
    actionLabel: "Assign work",
  },
  launch_record_owned: {
    whatItMeans: "There is no launch record, so there is nothing to plan or monitor against.",
    howToFix: "Create the launch, set its date, and name an owner.",
    href: "/clients/:id",
    actionLabel: "Create a launch",
  },
  launch_tasks_complete: {
    whatItMeans: "Launch work is still open.",
    howToFix: "Finish the open launch work items.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  backup_verified: {
    whatItMeans:
      "There is no verified backup or written rollback plan, so a bad launch could not be undone.",
    howToFix: "Take a backup, confirm it restores, and write the rollback plan on the launch.",
    href: "/clients/:id",
    actionLabel: "Open the launch",
  },
  health_assessed: {
    whatItMeans: "The account has never been given a health status, so risk is invisible.",
    howToFix: "Edit the account and set its health to Green, Yellow, or Red.",
    href: "/clients/:id",
    actionLabel: "Set health",
  },
  renewal_date_set: {
    whatItMeans: "No renewal date is on file, so the renewal conversation will be missed.",
    howToFix: "Edit the account and set the renewal date.",
    href: "/clients/:id",
    actionLabel: "Set renewal date",
  },
  no_open_work: {
    whatItMeans: "Work is still open on an account being closed out.",
    howToFix: "Finish or cancel every remaining work item.",
    href: "/fulfillment",
    actionLabel: "Open weekly work",
  },
  final_billing_settled: {
    whatItMeans:
      "Money is still outstanding. Archiving now would write off revenue that is still collectable.",
    howToFix: "Settle or write off every outstanding invoice, then mark final billing settled.",
    href: "/clients/:id",
    actionLabel: "Review invoices",
  },
  client_admin_access_confirmed: {
    whatItMeans:
      "The client has not been confirmed as an administrator of their own platforms. Removing agency access first would lock them out of their own business.",
    howToFix:
      "Confirm the client holds administrator access on every platform, then record it on the offboarding record.",
    href: "/clients/:id",
    actionLabel: "Open offboarding",
    notBuiltYet: true,
  },
};

export function getRequirementRemedy(key: string): RequirementRemedy {
  return (
    REQUIREMENT_REMEDIES[key] ?? {
      whatItMeans: "This requirement is configured but has no guidance recorded yet.",
      howToFix:
        "Ask an administrator what this rule is checking, and have guidance added for it.",
    }
  );
}

/** Fills the client id into a remedy link. */
export function resolveRemedyHref(remedy: RequirementRemedy, clientId: string) {
  return remedy.href?.replace(":id", clientId) ?? null;
}
