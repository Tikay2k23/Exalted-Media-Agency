import type {
  EmployeeTaskStatus,
  TaskCategory,
  TaskPlatform,
  TaskRecurrence,
  TeamRole,
} from "@prisma/client";

/**
 * What each kind of work is, who normally does it, and what "done" looks like.
 *
 * One place, because the same facts are needed in three: the category dropdown,
 * the specialist the form suggests, and the guidance panel beside it. Held apart
 * they drift, and a panel that describes a different job from the one selected
 * is worse than no panel.
 *
 * The suggestion is a suggestion. Nothing here overrides the assignee the owner
 * picks - the person assigning knows things this table does not, like who is on
 * leave.
 */

export interface CategoryGuide {
  value: TaskCategory;
  label: string;
  /** One line, in the words somebody would use out loud. */
  description: string;
  /** The seat that normally does this. */
  specialist: TeamRole;
  /** What usually comes out of this kind of work. */
  deliverables: string[];
  /** SOP references to look up. Only ones that exist are shown. */
  sopReferences: string[];
}

const CREATIVE: TeamRole = "CREATIVE_SPECIALIST";
const AUTOMATION: TeamRole = "AUTOMATION_SPECIALIST";
const ADS: TeamRole = "ADS_SPECIALIST";
const SALES: TeamRole = "SALES_REP";
const PM: TeamRole = "PROJECT_MANAGER";

/**
 * The work somebody assigns.
 *
 * Lifecycle categories - onboarding, strategy, quality assurance, revision,
 * launch and the rest - are deliberately absent. Stage automation creates
 * those and five stage gates match on them by name; offering them here would
 * let somebody hand-make a task that a gate then reads as process.
 */
export const CATEGORY_GUIDES: CategoryGuide[] = [
  {
    value: "CONTENT_PLANNING",
    label: "Content planning",
    description: "Deciding what goes out, where, and when.",
    specialist: CREATIVE,
    deliverables: ["Content calendar", "Topic and angle list", "Posting schedule", "Approval plan"],
    sopReferences: ["SOP-05", "SOP-08"],
  },
  {
    value: "COPYWRITING",
    label: "Copywriting",
    description: "The words on pages, ads, emails and messages.",
    specialist: CREATIVE,
    deliverables: ["Page or ad copy", "Headline and CTA options", "Proofread final draft"],
    sopReferences: ["SOP-05", "SOP-06"],
  },
  {
    value: "CREATIVE_DESIGN",
    label: "Creative design",
    description: "Graphics, layouts and anything the client sees.",
    specialist: CREATIVE,
    deliverables: ["Design files", "Sized exports per placement", "Source file handed over"],
    sopReferences: ["SOP-05", "SOP-06"],
  },
  {
    value: "VIDEO_PRODUCTION",
    label: "Video production",
    description: "Filming, editing and cutting video down for each channel.",
    specialist: CREATIVE,
    deliverables: ["Edited master", "Platform cuts", "Captions", "Thumbnail"],
    sopReferences: ["SOP-05"],
  },
  {
    value: "PAID_MEDIA",
    label: "Paid media",
    description: "Campaign setup, budgets, optimisation and ad tests.",
    specialist: ADS,
    deliverables: ["Campaign build", "Audience and budget setup", "Performance review", "Optimisation notes"],
    sopReferences: ["SOP-05", "SOP-08"],
  },
  {
    value: "SEO",
    label: "SEO",
    description: "On-page work, content and technical fixes that earn traffic.",
    specialist: CREATIVE,
    deliverables: ["Keyword and page plan", "On-page changes", "Technical fix list"],
    sopReferences: ["SOP-05", "SOP-08"],
  },
  {
    value: "SOCIAL_MEDIA",
    label: "Social media",
    description: "Posting, scheduling and replying on the client's channels.",
    specialist: CREATIVE,
    deliverables: ["Scheduled posts", "Caption and asset set", "Engagement summary"],
    sopReferences: ["SOP-05", "SOP-08"],
  },
  {
    value: "EMAIL_AND_SMS_MARKETING",
    label: "Email and SMS marketing",
    description: "Sequences, broadcasts and the automation behind them.",
    specialist: AUTOMATION,
    deliverables: ["Built sequence", "Templates", "Trigger and exit conditions", "Send test"],
    sopReferences: ["SOP-05", "SOP-06"],
  },
  {
    value: "CRM_AND_AUTOMATION",
    label: "CRM and automation",
    description: "GoHighLevel build: pipelines, fields, calendars, workflows.",
    specialist: AUTOMATION,
    deliverables: ["Pipeline and stages", "Custom fields and tags", "Workflows", "End-to-end test"],
    sopReferences: ["SOP-05", "SOP-06"],
  },
  {
    value: "FUNNELS_AND_LANDING_PAGES",
    label: "Funnels and landing pages",
    description: "Pages built to convert, and the forms behind them.",
    specialist: CREATIVE,
    deliverables: ["Built pages", "Forms wired to the CRM", "Mobile and tablet check", "Tracking in place"],
    sopReferences: ["SOP-05", "SOP-06"],
  },
  {
    value: "WEBSITE_UPDATES",
    label: "Website updates",
    description: "Changes to an existing site.",
    specialist: CREATIVE,
    deliverables: ["Updated pages", "Responsive check", "Links and forms verified"],
    sopReferences: ["SOP-05", "SOP-06"],
  },
  {
    value: "LEAD_GENERATION_AND_OUTREACH",
    label: "Lead generation and outreach",
    description: "Finding and contacting people who might buy.",
    specialist: SALES,
    deliverables: ["Prospect list", "Outreach sequence", "Contact log", "Qualified handover"],
    sopReferences: ["SOP-01", "SOP-02"],
  },
  {
    value: "ANALYTICS_AND_TRACKING",
    label: "Analytics and tracking",
    description: "Pixels, events, attribution - making the numbers trustworthy.",
    specialist: ADS,
    deliverables: ["Tracking installed", "Conversion events firing", "UTM structure", "Validation notes"],
    sopReferences: ["SOP-05", "SOP-08"],
  },
  {
    value: "CLIENT_REPORTING",
    label: "Client reporting",
    description: "Telling the client what happened and what it means.",
    specialist: ADS,
    deliverables: ["Report document", "Data sources listed", "Findings and recommendations"],
    sopReferences: ["SOP-08"],
  },
  {
    value: "REPUTATION_MANAGEMENT",
    label: "Reputation management",
    description: "Reviews, listings and how the business looks when searched.",
    specialist: AUTOMATION,
    deliverables: ["Review request workflow", "Listing corrections", "Response templates"],
    sopReferences: ["SOP-08", "SOP-09"],
  },
  {
    value: "INTEGRATIONS",
    label: "Integrations",
    description: "Making two systems talk: Zapier, Make, n8n, webhooks, APIs.",
    specialist: AUTOMATION,
    deliverables: ["Working connection", "Field mapping", "Error handling", "Test evidence"],
    sopReferences: ["SOP-05", "SOP-06"],
  },
  {
    value: "CLIENT_MANAGEMENT",
    label: "Client management",
    description: "The relationship: updates, calls, expectations, chasing.",
    specialist: PM,
    deliverables: ["Client update sent", "Call notes", "Agreed next steps"],
    sopReferences: ["SOP-03", "SOP-08"],
  },
  {
    value: "INTERNAL_OPERATIONS",
    label: "Internal operations",
    description: "Agency work that is not for one client.",
    specialist: PM,
    deliverables: [
      "Documented outcome",
      "Process or template updated",
      "Team told what changed",
    ],
    sopReferences: ["SOP-10"],
  },
];

const GUIDE_BY_CATEGORY = new Map(CATEGORY_GUIDES.map((guide) => [guide.value, guide]));

/** The guidance for a category, or null for a lifecycle one. */
export function categoryGuide(category: TaskCategory | null): CategoryGuide | null {
  return category ? GUIDE_BY_CATEGORY.get(category) ?? null : null;
}

/** The seat this kind of work normally goes to. */
export function suggestedSpecialist(category: TaskCategory | null): TeamRole | null {
  return categoryGuide(category)?.specialist ?? null;
}

/** Categories somebody may assign, in the order the form lists them. */
export function assignableCategories() {
  return CATEGORY_GUIDES;
}

export const PLATFORM_OPTIONS: { value: TaskPlatform; label: string }[] = [
  { value: "META_ADS", label: "Meta Ads" },
  { value: "GOOGLE_ADS", label: "Google Ads" },
  { value: "GOHIGHLEVEL", label: "GoHighLevel" },
  { value: "WEBSITE", label: "Website" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "GOOGLE_BUSINESS_PROFILE", label: "Google Business Profile" },
  { value: "YOUTUBE", label: "YouTube" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "CANVA", label: "Canva" },
  { value: "ZAPIER", label: "Zapier" },
  { value: "MAKE", label: "Make" },
  { value: "N8N", label: "n8n" },
  { value: "OTHER", label: "Other" },
];

export const RECURRENCE_OPTIONS: { value: TaskRecurrence; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every two weeks" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
];

/**
 * Statuses work may be created in.
 *
 * Cancelled is missing on purpose: nothing is created cancelled, and offering
 * it would only ever be a misclick.
 */
export const STARTING_STATUSES: { value: EmployeeTaskStatus; label: string }[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CLIENT", label: "Waiting on client" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "NEEDS_REVIEW", label: "Needs review" },
  { value: "REVISION_REQUIRED", label: "Revision required" },
  { value: "APPROVED", label: "Approved" },
  { value: "DONE", label: "Done" },
];

/** Every status, for filters and tables. */
export const ALL_STATUSES: { value: EmployeeTaskStatus; label: string }[] = [
  ...STARTING_STATUSES,
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_LABELS = new Map(ALL_STATUSES.map((status) => [status.value, status.label]));

/** The status in words, for a badge. */
export function statusLabel(status: EmployeeTaskStatus): string {
  return STATUS_LABELS.get(status) ?? status.replaceAll("_", " ");
}

/**
 * The colour a status wears.
 *
 * One mapping, because the same status showing amber on one screen and rose on
 * another teaches people to read the words instead of the colours, which is the
 * whole point of having colours.
 */
export function statusTone(
  status: EmployeeTaskStatus | string,
): "slate" | "sky" | "amber" | "rose" | "emerald" | "violet" {
  switch (status) {
    case "IN_PROGRESS":
      return "sky";
    case "NEEDS_REVIEW":
      return "violet";
    case "WAITING_CLIENT":
      return "amber";
    case "BLOCKED":
    case "REVISION_REQUIRED":
      return "rose";
    case "APPROVED":
    case "DONE":
      return "emerald";
    default:
      return "slate";
  }
}

/** The colour a priority wears. */
export function priorityTone(
  priority: string,
): "slate" | "sky" | "amber" | "rose" | "emerald" | "violet" {
  switch (priority) {
    case "CRITICAL":
    case "URGENT":
      return "rose";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "sky";
    default:
      return "slate";
  }
}

export const PRIORITY_OPTIONS = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

/** Statuses that mean the work is still live. */
export const OPEN_STATUSES: EmployeeTaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "NEEDS_REVIEW",
  "REVISION_REQUIRED",
];
