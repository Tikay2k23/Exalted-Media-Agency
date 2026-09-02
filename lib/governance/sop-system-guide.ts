/**
 * Where each procedure is actually carried out in this application.
 *
 * This is the third layer of an SOP and the only one that is not the agency's
 * text. The written procedure says what the agency does and stays true when
 * the software changes; this says which screen to open, and has to change
 * whenever the software does. Keeping the two apart is the point - a procedure
 * that names buttons goes stale every time a tab is renamed, and then nobody
 * trusts the procedure either.
 *
 * So it lives in code, next to the routes it names, rather than in the SOP
 * body. It is not a copy of anything in the document: the document does not
 * say where to click, and this does not restate policy.
 *
 * Same shape as lib/journey/requirement-remedies.ts, for the same reason -
 * telling somebody a rule without telling them where to go is a dead end.
 */

export interface SystemGuideStep {
  /** The part of the procedure this covers, e.g. "Client intake". */
  area: string;
  /** The path through the interface, written the way the menus read. */
  where: string;
  /** What to do once there, in a sentence. */
  detail: string;
  /**
   * Where to send somebody now. Areas that live on one account link to the
   * client list rather than pretending to know which account is meant.
   */
  href?: string;
}

/**
 * Keyed by SOP reference.
 *
 * A procedure with no entry shows an empty state rather than a guess. Being
 * wrong about where something lives is worse than saying nothing: somebody
 * follows it, does not find the screen, and stops believing the rest.
 */
export const SOP_SYSTEM_GUIDE: Record<string, SystemGuideStep[]> = {
  "SOP-01": [
    {
      area: "Capture and qualify",
      where: "Sales",
      detail:
        "Add the lead, record where it came from, and let the score and status follow from what is filled in.",
      href: "/leads",
    },
    {
      area: "Assignment and follow-up",
      where: "Sales → the lead",
      detail:
        "Set the salesperson, then log calls and notes on the lead as the conversation moves.",
      href: "/leads",
    },
  ],
  "SOP-02": [
    {
      area: "Discovery and proposal",
      where: "Sales → the lead",
      detail: "Log discovery calls and keep the opportunity value and status current.",
      href: "/leads",
    },
    {
      area: "Closing",
      where: "Sales → the lead → Convert",
      detail:
        "Converting creates the account and the onboarding work, and hands the relationship to delivery. It is the handover, not a status change.",
      href: "/leads",
    },
  ],
  "SOP-03": [
    {
      area: "Payment",
      where: "Clients → the account → Billing & Payments",
      detail: "Raise the invoice and mark it paid once the money has actually cleared.",
      href: "/clients",
    },
    {
      area: "Client intake",
      where: "Clients → the account → Strategy",
      detail:
        "Send the intake form to a named contact. Re-sending rotates the link, so a form that reached the wrong person stops working.",
      href: "/clients",
    },
    {
      area: "Access and assets",
      where: "Clients → the account → More → Files & Access",
      detail:
        "Request each platform, then track it through to verified. Requested and received are not the same thing as working.",
      href: "/clients",
    },
    {
      area: "A2P registration",
      where: "Clients → the account → A2P",
      detail:
        "Complete the messaging profile and samples and submit. Internal readiness is not carrier approval; the system keeps the two apart.",
      href: "/clients",
    },
    {
      area: "Onboarding readiness",
      where: "Journey → the account",
      detail:
        "The stage requirements show what is still outstanding and what is blocking the move into strategy.",
      href: "/journey",
    },
  ],
  "SOP-04": [
    {
      area: "Strategy brief",
      where: "Clients → the account → Strategy",
      detail:
        "Write the brief and send it for approval. Whoever wrote it cannot approve it, so production cannot start on one person's opinion.",
      href: "/clients",
    },
    {
      area: "Internal handoff",
      where: "Journey → the account",
      detail: "Advancing the stage assigns the specialists and records the handoff.",
      href: "/journey",
    },
  ],
  "SOP-05": [
    {
      area: "Production work",
      where: "Clients → the account → Work",
      detail: "Projects, milestones and work items for the account, with their status.",
      href: "/clients",
    },
    {
      area: "Each person's queue",
      where: "My Work",
      detail: "What is assigned to you, and what is due today.",
      href: "/work",
    },
    {
      area: "Daily reporting",
      where: "Weekly Work",
      detail: "The end-of-day entries and each person's week.",
      href: "/fulfillment",
    },
  ],
  "SOP-06": [
    {
      area: "Internal QA",
      where: "Clients → the account → Approvals",
      detail: "QA plans and their tests, and the defects raised against them.",
      href: "/clients",
    },
    {
      area: "Client review",
      where: "Clients → the account → Approvals",
      detail:
        "Send the review, record the feedback, and track revisions through to closure.",
      href: "/clients",
    },
  ],
  "SOP-07": [
    {
      area: "Launch",
      where: "Clients → the account → Approvals",
      detail:
        "The launch checklist and the monitoring windows that follow it, at 2h, 24h, 72h and 7 days.",
      href: "/clients",
    },
    {
      area: "Client sign-off",
      where: "Clients → the account → Approvals",
      detail: "Client approval is recorded here, against the thing being approved.",
      href: "/clients",
    },
  ],
  "SOP-08": [
    {
      area: "Account health",
      where: "Clients → the account → Overview",
      detail: "The health assessment and what it is based on.",
      href: "/clients",
    },
    {
      area: "Reporting and optimisations",
      where: "Clients → the account → Reports",
      detail: "Client reports and the optimisations recorded against the account.",
      href: "/clients",
    },
  ],
  "SOP-09": [
    {
      area: "Renewal and growth",
      where: "Clients → the account → More → Renewal & Growth",
      detail: "Renewals, expansion opportunities, testimonials and referrals.",
      href: "/clients",
    },
    {
      area: "Offboarding",
      where: "Clients → the account → More → Offboarding",
      detail:
        "The checklist, in order. Confirm the client owns their platforms before agency access is removed - that step cannot be undone from inside the system.",
      href: "/clients",
    },
  ],
  "SOP-10": [
    {
      area: "Procedures",
      where: "SOPs and Audits",
      detail: "This library. Editing publishes a version and returns the SOP for approval.",
      href: "/governance",
    },
    {
      area: "Audits and corrective actions",
      where: "SOPs and Audits",
      detail:
        "Audits, their findings, and the corrective actions raised to close them out.",
      href: "/governance",
    },
    {
      area: "Release sign-off",
      where: "SOPs and Audits → System UAT",
      detail: "Test cases, their results, and the gate that decides a release.",
      href: "/governance",
    },
  ],
};

/**
 * How-to guides, one per task somebody has to be shown once.
 *
 * There is no knowledge-base model in this system and adding one to hold eight
 * sentences would be a content system nobody maintains. These point at the
 * screen where the task is done, which is the part that would go stale in a
 * written guide anyway.
 */
export interface SopHowTo {
  title: string;
  where: string;
  href?: string;
}

export const SOP_HOW_TO: Record<string, SopHowTo[]> = {
  "SOP-03": [
    { title: "Send a client intake form", where: "Account → Strategy", href: "/clients" },
    { title: "Request platform access", where: "Account → More → Files & Access", href: "/clients" },
    { title: "Verify received access", where: "Account → More → Files & Access", href: "/clients" },
    { title: "Record a payment", where: "Account → Billing & Payments", href: "/clients" },
    { title: "See what is blocking a stage", where: "Journey → the account", href: "/journey" },
  ],
  "SOP-04": [
    { title: "Write a strategy brief", where: "Account → Strategy", href: "/clients" },
    { title: "Send a brief for approval", where: "Account → Strategy", href: "/clients" },
    { title: "Advance a journey stage", where: "Journey → the account", href: "/journey" },
  ],
  "SOP-05": [
    { title: "Assign a marketing task", where: "My Work → Assign work", href: "/work" },
    { title: "File an end-of-day entry", where: "Weekly Work", href: "/fulfillment" },
  ],
  "SOP-06": [
    { title: "Raise a defect", where: "Account → Approvals", href: "/clients" },
    { title: "Send a client review", where: "Account → Approvals", href: "/clients" },
  ],
  "SOP-09": [
    { title: "Record a renewal", where: "Account → More → Renewal & Growth", href: "/clients" },
    { title: "Offboard a client", where: "Account → More → Offboarding", href: "/clients" },
  ],
  "SOP-10": [
    { title: "Publish a new SOP version", where: "SOPs and Audits → Edit SOP", href: "/governance" },
    { title: "Record an audit finding", where: "SOPs and Audits", href: "/governance" },
    { title: "Override a stage requirement", where: "Journey → the account", href: "/journey" },
  ],
};
