import type { ServiceType, TaskCategory, TaskPriority, TeamRole } from "@prisma/client";

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
  /** Whoever holds that specialist seat on this client's workstreams. */
  | "AUTOMATION_SPECIALIST"
  | "CREATIVE_SPECIALIST"
  | "ADS_SPECIALIST"
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

/**
 * The build work each service actually involves.
 *
 * Stage templates cover the process every client goes through - collect the
 * access, write the strategy, run the QA. They cannot cover what is being
 * built, because that depends on what was bought: a website client needs
 * service pages and form testing, a CRM client needs pipelines and workflows,
 * and generating both for both would bury each of them in the other's work.
 *
 * Added to the production stage only. Before that there is nothing to build,
 * and after it the work exists already.
 */
export const SERVICE_TASK_TEMPLATES: Partial<Record<ServiceType, TaskTemplate[]>> = {
  WEBSITE_SUPPORT: [
    {
      title: "Build the homepage",
      note: "Structure, copy blocks and the primary call to action.",
      category: "WEBSITE_UPDATES",
      priority: "HIGH",
      estimatedHours: 8,
      dueInDays: 10,
      assignTo: "CREATIVE_SPECIALIST",
      requiresQa: true,
    },
    {
      title: "Build the service pages",
      note: "One page per service the client sells, from the approved strategy.",
      category: "WEBSITE_UPDATES",
      priority: "HIGH",
      estimatedHours: 10,
      dueInDays: 14,
      assignTo: "CREATIVE_SPECIALIST",
      requiresQa: true,
    },
    {
      title: "Test the site on mobile",
      note: "Every page at phone width: layout, tap targets, and load time.",
      category: "WEBSITE_UPDATES",
      priority: "MEDIUM",
      estimatedHours: 3,
      dueInDays: 16,
      assignTo: "CREATIVE_SPECIALIST",
      completionCriteria: "Checked at 375px and 768px with no horizontal scroll.",
    },
    {
      title: "Test every form end to end",
      note: "Submit each form and confirm where the lead actually arrives.",
      category: "WEBSITE_UPDATES",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 16,
      assignTo: "AUTOMATION_SPECIALIST",
      completionCriteria: "A test submission was received in the CRM and by email.",
    },
    {
      title: "Add page titles and descriptions",
      note: "Titles, meta descriptions and social preview images per page.",
      category: "SEO",
      priority: "MEDIUM",
      estimatedHours: 3,
      dueInDays: 18,
      assignTo: "ADS_SPECIALIST",
    },
  ],

  CRM_AUTOMATION: [
    {
      title: "Build the sales pipeline",
      note: "Stages that match how this client actually sells, not a default.",
      category: "CRM_AND_AUTOMATION",
      priority: "HIGH",
      estimatedHours: 4,
      dueInDays: 7,
      assignTo: "AUTOMATION_SPECIALIST",
    },
    {
      title: "Create the custom fields",
      note: "The fields their process needs recorded against a contact.",
      category: "CRM_AND_AUTOMATION",
      priority: "MEDIUM",
      estimatedHours: 3,
      dueInDays: 8,
      assignTo: "AUTOMATION_SPECIALIST",
    },
    {
      title: "Set up the booking calendars",
      note: "Availability, buffers and who each booking routes to.",
      category: "CRM_AND_AUTOMATION",
      priority: "MEDIUM",
      estimatedHours: 3,
      dueInDays: 10,
      assignTo: "AUTOMATION_SPECIALIST",
    },
    {
      title: "Build the follow-up workflows",
      note: "What happens automatically when a lead arrives and when it goes quiet.",
      category: "CRM_AND_AUTOMATION",
      priority: "HIGH",
      estimatedHours: 8,
      dueInDays: 14,
      assignTo: "AUTOMATION_SPECIALIST",
      requiresQa: true,
    },
    {
      title: "Write the email and SMS templates",
      note: "The messages the workflows send, in the client's voice.",
      category: "EMAIL_AND_SMS_MARKETING",
      priority: "MEDIUM",
      estimatedHours: 5,
      dueInDays: 14,
      assignTo: "CREATIVE_SPECIALIST",
    },
    {
      title: "Complete the A2P registration",
      note: "Carrier registration has to be approved before any texting starts.",
      category: "CRM_AND_AUTOMATION",
      priority: "HIGH",
      estimatedHours: 3,
      dueInDays: 12,
      assignTo: "AUTOMATION_SPECIALIST",
      completionCriteria: "Submitted to the provider and the decision recorded.",
    },
    {
      title: "Verify lead tracking end to end",
      note: "A real submission reaching the pipeline, attributed to its source.",
      category: "ANALYTICS_AND_TRACKING",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 16,
      assignTo: "AUTOMATION_SPECIALIST",
    },
  ],

  PAID_ADVERTISING: [
    {
      title: "Install and verify the tracking pixel",
      note: "Fired on the pages that matter, checked in the platform.",
      category: "ANALYTICS_AND_TRACKING",
      priority: "HIGH",
      estimatedHours: 2,
      dueInDays: 5,
      assignTo: "AUTOMATION_SPECIALIST",
    },
    {
      title: "Build the campaign structure",
      note: "Campaigns, ad sets and audiences from the approved strategy.",
      category: "PAID_MEDIA",
      priority: "HIGH",
      estimatedHours: 6,
      dueInDays: 10,
      assignTo: "ADS_SPECIALIST",
    },
    {
      title: "Produce the launch creative",
      note: "Enough variations to learn something in the first two weeks.",
      category: "CREATIVE_DESIGN",
      priority: "HIGH",
      estimatedHours: 8,
      dueInDays: 12,
      assignTo: "CREATIVE_SPECIALIST",
      requiresApproval: true,
    },
    {
      title: "Set up conversion tracking",
      note: "The events worth optimising towards, not just page views.",
      category: "ANALYTICS_AND_TRACKING",
      priority: "HIGH",
      estimatedHours: 3,
      dueInDays: 12,
      assignTo: "AUTOMATION_SPECIALIST",
    },
    {
      title: "Build the reporting dashboard",
      note: "Spend, leads and cost per lead, in terms the client asked for.",
      category: "CLIENT_REPORTING",
      priority: "MEDIUM",
      estimatedHours: 4,
      dueInDays: 18,
      assignTo: "ADS_SPECIALIST",
    },
  ],

  SEO: [
    {
      title: "Run the keyword research",
      note: "What their customers actually search, with volumes and intent.",
      category: "SEO",
      priority: "HIGH",
      estimatedHours: 6,
      dueInDays: 7,
      assignTo: "ADS_SPECIALIST",
    },
    {
      title: "Optimise the existing pages",
      note: "Titles, headings and copy against the chosen terms.",
      category: "SEO",
      priority: "HIGH",
      estimatedHours: 8,
      dueInDays: 14,
      assignTo: "ADS_SPECIALIST",
    },
    {
      title: "Complete the technical audit",
      note: "Crawlability, speed, structured data and broken links.",
      category: "SEO",
      priority: "MEDIUM",
      estimatedHours: 5,
      dueInDays: 12,
      assignTo: "ADS_SPECIALIST",
    },
    {
      title: "Set up the local listings",
      note: "Business profile, categories, hours and service areas.",
      category: "SEO",
      priority: "MEDIUM",
      estimatedHours: 3,
      dueInDays: 14,
      assignTo: "ADS_SPECIALIST",
    },
    {
      title: "Set up rank and traffic reporting",
      note: "A baseline recorded now, so later movement means something.",
      category: "CLIENT_REPORTING",
      priority: "MEDIUM",
      estimatedHours: 3,
      dueInDays: 16,
      assignTo: "ADS_SPECIALIST",
    },
  ],
};

/** The service work for a client, or nothing for a service without a list. */
export function getServiceTaskTemplates(service: ServiceType | null): TaskTemplate[] {
  if (!service) return [];

  return SERVICE_TASK_TEMPLATES[service] ?? [];
}

/**
 * A stable name for one generated task, unique within a client.
 *
 * Derived from the source and the title rather than stored, so the same
 * template always produces the same key and re-running the automation collides
 * with what it made last time instead of duplicating it. Changing a template's
 * title makes a new task, which is the right outcome: it is different work.
 */
export function templateKeyFor(source: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return `${source}:${slug}`;
}

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
  /**
   * Who holds each specialist seat on this client, from its workstreams.
   *
   * Absent seats are simply not here: a CRM-only client has no creative
   * workstream, and a task routed at one should land somewhere sensible rather
   * than inventing an owner.
   */
  workstreamOwners?: Partial<Record<TeamRole, string | null>>;
}

/**
 * Resolves who a generated work item belongs to.
 *
 * Falls back through account owner then the acting user, so automation never
 * produces an unowned work item - an unassigned task is one nobody does.
 *
 * The specialist strategies were the missing piece: before them every
 * generated task landed on the project manager or whoever moved the stage,
 * which is why work never appeared to reach the people doing it.
 */
export function resolveAssignee(
  strategy: AssigneeStrategy,
  candidates: AssigneeCandidates,
): string {
  const { accountOwnerId, projectManagerId, actorId, workstreamOwners } = candidates;

  const specialist = (role: TeamRole) =>
    // Falling back to the project manager rather than the actor: if the seat
    // is unstaffed, the person coordinating delivery is who picks it up, and
    // they are the one who can staff it.
    workstreamOwners?.[role] ?? projectManagerId ?? accountOwnerId ?? actorId;

  switch (strategy) {
    case "PROJECT_MANAGER":
      return projectManagerId ?? accountOwnerId ?? actorId;
    case "ACCOUNT_OWNER":
      return accountOwnerId ?? actorId;
    case "AUTOMATION_SPECIALIST":
      return specialist("AUTOMATION_SPECIALIST");
    case "CREATIVE_SPECIALIST":
      return specialist("CREATIVE_SPECIALIST");
    case "ADS_SPECIALIST":
      return specialist("ADS_SPECIALIST");
    case "ACTOR":
    default:
      return actorId;
  }
}
