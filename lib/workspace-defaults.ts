import { Department, PipelineKind, type Prisma, Position, Role } from "@prisma/client";

export const legacySeedEmails = [
  "admin@exaltedagency.com",
  "manager@exaltedagency.com",
  "sarah@exaltedagency.com",
  "devon@exaltedagency.com",
] as const;

export const legacySeedClientCompanies = [
  "Northstar Fitness",
  "Bloom & Beam Skincare",
  "Harborstone Realty",
  "Signal Peak AI",
  "Marlow Interiors",
  "Summit Trails",
] as const;

/// Fixed pipeline ids, created by the SOP foundation migration. Referencing
/// them by constant keeps the seed, the stage-gate rules, and any future
/// migration pointing at the same rows.
export const SALES_PIPELINE_ID = "pipeline_sales";
export const FULFILLMENT_PIPELINE_ID = "pipeline_fulfillment";

/// Slugs of the six stages that existed before the SOP rollout. They are kept
/// as deprecated stages so accounts already sitting on them stay valid.
export const legacyFulfillmentStageSlugs = [
  "new-client",
  "onboarding",
  "in-progress",
  "waiting-on-client",
  "review",
  "completed",
] as const;

export const defaultPipelines = [
  {
    id: SALES_PIPELINE_ID,
    kind: PipelineKind.SALES,
    name: "Sales Pipeline",
    slug: "sales",
    description: "Lead capture through to a closed opportunity.",
  },
  {
    id: FULFILLMENT_PIPELINE_ID,
    kind: PipelineKind.FULFILLMENT,
    name: "Client Journey",
    slug: "client-journey",
    description: "Payment received through to offboarding and archive.",
  },
] as const;

interface StageDefinition {
  stageKey: string;
  name: string;
  slug: string;
  color: string;
  position: number;
  isDefault?: boolean;
  isTerminal?: boolean;
  slaDays?: number;
  description?: string;
}

/// SOP section 8. Lead capture through to a closed opportunity.
export const salesPipelineStages: StageDefinition[] = [
  { stageKey: "new_website_lead", name: "New Website Lead", slug: "sales-new-website-lead", color: "#2563eb", position: 1, isDefault: true, slaDays: 1, description: "Inbound enquiry that has not been actioned yet." },
  { stageKey: "application_submitted", name: "Application Submitted", slug: "sales-application-submitted", color: "#1d4ed8", position: 2, slaDays: 1 },
  { stageKey: "attempting_contact", name: "Attempting Contact", slug: "sales-attempting-contact", color: "#0284c7", position: 3, slaDays: 3 },
  { stageKey: "contacted", name: "Contacted", slug: "sales-contacted", color: "#0891b2", position: 4, slaDays: 3 },
  { stageKey: "strategy_call_booked", name: "Strategy Call Booked", slug: "sales-strategy-call-booked", color: "#0d9488", position: 5, slaDays: 7 },
  { stageKey: "strategy_call_showed", name: "Strategy Call Showed", slug: "sales-strategy-call-showed", color: "#059669", position: 6, slaDays: 2 },
  { stageKey: "qualified", name: "Qualified", slug: "sales-qualified", color: "#16a34a", position: 7, slaDays: 2 },
  { stageKey: "proposal_sent", name: "Proposal Sent", slug: "sales-proposal-sent", color: "#7c3aed", position: 8, slaDays: 5 },
  { stageKey: "negotiation", name: "Negotiation", slug: "sales-negotiation", color: "#9333ea", position: 9, slaDays: 7 },
  { stageKey: "long_term_nurture", name: "Long-Term Nurture", slug: "sales-long-term-nurture", color: "#64748b", position: 10, slaDays: 90 },
  { stageKey: "won", name: "Won", slug: "sales-won", color: "#15803d", position: 11, isTerminal: true },
  { stageKey: "lost", name: "Lost", slug: "sales-lost", color: "#dc2626", position: 12, isTerminal: true },
  { stageKey: "abandoned", name: "Abandoned", slug: "sales-abandoned", color: "#94a3b8", position: 13, isTerminal: true },
];

/// SOP section 10. Payment received through to archive.
export const fulfillmentPipelineStages: StageDefinition[] = [
  { stageKey: "payment_received", name: "Payment Received", slug: "journey-payment-received", color: "#16a34a", position: 1, isDefault: true, slaDays: 1, description: "Funds confirmed. The delivery clock starts here." },
  { stageKey: "onboarding_form_sent", name: "Onboarding Form Sent", slug: "journey-onboarding-form-sent", color: "#2563eb", position: 2, slaDays: 1 },
  { stageKey: "waiting_for_client_information", name: "Waiting for Client Information", slug: "journey-waiting-client-information", color: "#f59e0b", position: 3, slaDays: 7 },
  { stageKey: "access_collection", name: "Access Collection", slug: "journey-access-collection", color: "#f97316", position: 4, slaDays: 7 },
  { stageKey: "onboarding_complete", name: "Onboarding Complete", slug: "journey-onboarding-complete", color: "#0d9488", position: 5, slaDays: 2 },
  { stageKey: "strategy_and_planning", name: "Strategy and Planning", slug: "journey-strategy-planning", color: "#7c3aed", position: 6, slaDays: 5 },
  { stageKey: "in_production", name: "In Production", slug: "journey-in-production", color: "#ea580c", position: 7, slaDays: 21 },
  { stageKey: "internal_quality_assurance", name: "Internal Quality Assurance", slug: "journey-internal-qa", color: "#9333ea", position: 8, slaDays: 3 },
  { stageKey: "client_review", name: "Client Review", slug: "journey-client-review", color: "#8b5cf6", position: 9, slaDays: 5 },
  { stageKey: "revisions_required", name: "Revisions Required", slug: "journey-revisions-required", color: "#f43f5e", position: 10, slaDays: 5 },
  { stageKey: "client_approved", name: "Client Approved", slug: "journey-client-approved", color: "#22c55e", position: 11, slaDays: 2 },
  { stageKey: "ready_for_launch", name: "Ready for Launch", slug: "journey-ready-for-launch", color: "#14b8a6", position: 12, slaDays: 3 },
  { stageKey: "live_active", name: "Live / Active", slug: "journey-live-active", color: "#0ea5e9", position: 13, slaDays: 7 },
  { stageKey: "ongoing_management", name: "Ongoing Management", slug: "journey-ongoing-management", color: "#3b82f6", position: 14 },
  { stageKey: "renewal_discussion", name: "Renewal Discussion", slug: "journey-renewal-discussion", color: "#a855f7", position: 15, slaDays: 30 },
  { stageKey: "offboarding", name: "Offboarding", slug: "journey-offboarding", color: "#f97316", position: 16, slaDays: 30 },
  { stageKey: "project_completed", name: "Project Completed", slug: "journey-project-completed", color: "#16a34a", position: 17, isTerminal: true },
  { stageKey: "archived", name: "Archived", slug: "journey-archived", color: "#64748b", position: 18, isTerminal: true },
];

export function buildStageSeedData(): Prisma.PipelineStageCreateManyInput[] {
  const toRow = (pipelineId: string) => (stage: StageDefinition) => ({
    pipelineId,
    stageKey: stage.stageKey,
    name: stage.name,
    slug: stage.slug,
    color: stage.color,
    position: stage.position,
    isDefault: stage.isDefault ?? false,
    isTerminal: stage.isTerminal ?? false,
    slaDays: stage.slaDays ?? null,
    description: stage.description ?? null,
  });

  return [
    ...salesPipelineStages.map(toRow(SALES_PIPELINE_ID)),
    ...fulfillmentPipelineStages.map(toRow(FULFILLMENT_PIPELINE_ID)),
  ];
}

/// Kept for callers that still expect the original export name.
export const defaultPipelineStages = buildStageSeedData();

export const defaultAgencyUsers = [
  {
    key: "admin",
    name: "Aileen Romero",
    email: "aileen@theexaltedmedia.com",
    role: Role.ADMIN,
    position: Position.AGENCY_DIRECTOR,
    department: Department.OPERATIONS,
    jobTitle: "Agency Director",
    weeklyCapacityHours: 40,
  },
  {
    key: "manager",
    name: "Mark Angelo Yakit",
    email: "angelo@theexaltedmedia.com",
    role: Role.MANAGER,
    position: Position.OPERATIONS_MANAGER,
    department: Department.ACCOUNT_MANAGEMENT,
    jobTitle: "Operations Manager",
    weeklyCapacityHours: 40,
  },
] as const;

type DefaultUserKey = (typeof defaultAgencyUsers)[number]["key"];

function isProductionDeployment() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);
}

export function readDefaultUserPassword(key: DefaultUserKey) {
  const envKey = key === "admin" ? "DEFAULT_ADMIN_PASSWORD" : "DEFAULT_MANAGER_PASSWORD";
  const value = process.env[envKey]?.trim();

  if (value) {
    return value;
  }

  if (!isProductionDeployment()) {
    return "ExaltedLocal123!";
  }

  return null;
}
