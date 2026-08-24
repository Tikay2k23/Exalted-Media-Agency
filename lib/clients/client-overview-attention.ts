import {
  type AttentionKey,
  type ClientRow,
  type ClientTab,
  attentionReasons,
} from "@/lib/clients/client-workspace";
import { formatEnumLabel } from "@/lib/utils";

/**
 * The Needs Attention rows, in the shape the Overview draws them.
 *
 * attentionReasons already decides *what* is wrong with an account and which
 * tab fixes it; this only dresses each reason for the panel - a heading, the
 * record it came from, a sentence, and the button that goes to the place the
 * work happens. Nothing new is detected here, so an account cannot look fine on
 * the Clients list and troubled on its own page.
 *
 * Two rules about the buttons, both learned the hard way:
 *
 * - Intake never gets a send control here. Sending the form lives on Strategy
 *   and stays there; from Overview the action is to go and open it. A second
 *   send button would rotate the client's link from a page whose job is to
 *   summarise.
 * - There is no reminder workflow in this application. The system deliberately
 *   does not send client-facing mail - a project manager copies the link into
 *   whatever they email from - so no row here offers to send one.
 */

export interface AttentionItem {
  key: AttentionKey;
  /** The bold heading on the row. */
  title: string;
  /** "Cedar Ridge Landscaping · Onboarding Form Sent" */
  context: string;
  /** The coloured sentence underneath. */
  description: string;
  tone: "rose" | "amber";
  action: { label: string; tab: ClientTab };
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Intake states where the form is out and the client has not finished it. */
const INTAKE_SENT = ["SENT", "VIEWED", "IN_PROGRESS", "PARTIAL"];

function intakeItem(client: ClientRow, tone: "rose" | "amber"): AttentionItem {
  const sent = client.intakeStatus !== null && INTAKE_SENT.includes(client.intakeStatus);

  return {
    key: "intake-incomplete",
    title: sent ? "Onboarding Form Incomplete" : "Intake Form Not Sent",
    context: `${client.companyName} · ${
      client.intakeStatus ? formatEnumLabel(client.intakeStatus) : "Not sent"
    }`,
    description: sent
      ? "Waiting on the client to complete the onboarding form."
      : "The client has not been sent an intake form yet.",
    tone,
    // Both go to Strategy, which owns the form. Sending and re-sending happen
    // there and nowhere else.
    action: { label: sent ? "Open Intake Setup" : "Go to Strategy", tab: "services" },
  };
}

export function attentionItems(client: ClientRow, now: Date): AttentionItem[] {
  return attentionReasons(client, now).map((reason): AttentionItem => {
    // Anything already late is red; anything merely outstanding is amber.
    const tone: "rose" | "amber" =
      reason.weight >= 80 || reason.key === "report-overdue" ? "rose" : "amber";

    switch (reason.key) {
      case "blocker":
        return {
          key: reason.key,
          title: "Journey Blocked",
          context: `${client.companyName} · ${client.stageName}`,
          description: reason.detail,
          tone: "rose",
          action: { label: "View Requirements", tab: "journey" },
        };

      case "overdue-work":
        return {
          key: reason.key,
          title: `${plural(client.overdueTaskCount, "Overdue Task", "Overdue Tasks")}`,
          context: `${client.companyName} · ${formatEnumLabel(client.serviceType)}`,
          description: "Past its due date and still open.",
          tone: "rose",
          action: { label: "Open Task", tab: "tasks" },
        };

      case "missing-access":
        return {
          key: reason.key,
          title: "Access Collection Incomplete",
          context: `${client.companyName} · ${client.stageName}`,
          description: `${plural(
            client.criticalAccessMissing,
            "required item is",
            "required items are",
          )} still missing.`,
          tone,
          action: { label: "View Requirements", tab: "journey" },
        };

      case "intake-incomplete":
        return intakeItem(client, tone);

      case "approval-overdue":
        return {
          key: reason.key,
          title: "Client Approval Outstanding",
          context: `${client.companyName} · ${client.stageName}`,
          description: `${plural(
            client.awaitingReviewCount,
            "review is",
            "reviews are",
          )} waiting on the client.`,
          tone,
          action: { label: "Open Approvals", tab: "quality" },
        };

      case "open-defect":
        return {
          key: reason.key,
          title: `${plural(client.openDefectCount, "Open Defect", "Open Defects")}`,
          context: `${client.companyName} · Quality`,
          description: "A quality issue is still outstanding.",
          tone,
          action: { label: "Open Approvals", tab: "quality" },
        };

      case "report-overdue":
        return {
          key: reason.key,
          title: "Report Overdue",
          context: `${client.companyName} · Reporting`,
          description: `${plural(
            client.overdueReportCount,
            "report is",
            "reports are",
          )} past its date.`,
          tone: "rose",
          action: { label: "Open Reports", tab: "reports" },
        };

      case "renewal-approaching":
        return {
          key: reason.key,
          title: reason.label,
          context: `${client.companyName} · Contract`,
          description: `${reason.detail}. Decide what happens next.`,
          tone,
          action: { label: "Review Renewal", tab: "reports" },
        };

      case "no-activity":
        return {
          key: reason.key,
          title: "No Recent Activity",
          context: `${client.companyName} · ${client.stageName}`,
          description: `${reason.detail} on this account.`,
          tone,
          action: { label: "Open Activity", tab: "activity" },
        };

      case "no-next-action":
      default:
        return {
          key: reason.key,
          title: "No Next Action Set",
          context: `${client.companyName} · ${client.stageName}`,
          description: "Nobody has said what happens next on this account.",
          tone,
          // Not "overview", which is the tab you are already reading. The next
          // action is a field on the account record, so send people to it.
          action: { label: "Set Next Action", tab: "contacts" },
        };
    }
  });
}
