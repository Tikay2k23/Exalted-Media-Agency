import type { TabBadges } from "@/components/clients/client-tabs";

/**
 * The words on the More menu.
 *
 * A badge is a promise that something in there is worth opening, so every one
 * of these is counted from rows the page has already loaded. Nothing is
 * estimated and nothing appears by default: a menu where every entry carries a
 * badge teaches people to stop reading them, which costs more than the badges
 * were ever worth.
 *
 * Integrations has none, and that is not an oversight. There is no integration
 * store in this application yet - nothing is connected, so there is nothing
 * true to say about connection health.
 */

export interface MoreBadgeInput {
  /** Access this account needs and does not have, counted as the page sees it. */
  missingCriticalAccess: number;
  /** Access somebody has reported a problem with. */
  accessIssues: number;
  /** Invoices past their due date and not paid. Null when finance is hidden. */
  overdueInvoices: number | null;
  /** Days until the renewal date, negative once it has passed. */
  daysToRenewal: number | null;
  /** Whether an offboarding is open on this account. */
  offboardingInFlight: boolean;
}

/** Far enough out that saying so is noise rather than a prompt. */
const RENEWAL_HORIZON_DAYS = 90;

export function moreBadges(input: MoreBadgeInput): TabBadges {
  const badges: TabBadges = {};

  /*
   * Access issues outrank missing access. Something that was granted and then
   * broke is a live problem; something never requested is a task.
   */
  if (input.accessIssues > 0) {
    badges.files = {
      label: input.accessIssues === 1 ? "1 issue" : `${input.accessIssues} issues`,
      tone: "rose",
    };
  } else if (input.missingCriticalAccess > 0) {
    badges.files = { label: `${input.missingCriticalAccess} missing`, tone: "amber" };
  }

  if (input.overdueInvoices !== null && input.overdueInvoices > 0) {
    badges.billing = { label: "Overdue", tone: "rose" };
  }

  if (input.daysToRenewal !== null) {
    if (input.daysToRenewal < 0) {
      badges.renewal = { label: "Passed", tone: "rose" };
    } else if (input.daysToRenewal <= RENEWAL_HORIZON_DAYS) {
      badges.renewal = {
        label: `${input.daysToRenewal} days`,
        /* Inside a month is a conversation somebody should already be having. */
        tone: input.daysToRenewal <= 30 ? "amber" : "slate",
      };
    }
  }

  if (input.offboardingInFlight) {
    badges.offboarding = { label: "In progress", tone: "amber" };
  }

  return badges;
}
