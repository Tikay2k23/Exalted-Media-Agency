import { type Position, type Role, TeamRole } from "@prisma/client";

/**
 * Authorization model.
 *
 * One question decides what somebody can do: which of the six seats do they
 * hold?
 *
 *   1. Team role       - the seat. This is the answer, and the only table
 *                        anyone should need to read to understand access.
 *   2. Access tier     - a backward-compatibility floor for accounts created
 *                        before seats existed, so an ADMIN never silently
 *                        loses admin access.
 *   3. Per-user overrides - explicit ALLOW/DENY rows in
 *                        UserPermissionOverride. DENY always wins.
 *
 * Effective set = (seat ∪ tier ∪ ALLOW overrides) − DENY overrides.
 *
 * `Position` is a descriptive job title and grants nothing. It used to drive
 * this file through a 26-row table, which modelled the agency's vocabulary
 * rather than its access and made the system harder to reason about than the
 * six-person team it serves.
 */

export const PERMISSIONS = [
  // Dashboard and activity
  "dashboard.view.agency",
  "dashboard.view.own",
  "activity.view.all",

  // Leads and sales
  "leads.view.all",
  "leads.view.assigned",
  "leads.create",
  "leads.edit",
  "leads.delete",
  "leads.convert",
  "sales.reporting",

  // Client accounts
  "clients.view.all",
  "clients.view.assigned",
  "clients.create",
  "clients.edit",
  "clients.delete",
  "clients.export",

  // Client journey
  "journey.view",
  "journey.move",
  "journey.override",

  // Projects and work items
  "projects.view.all",
  "projects.view.assigned",
  "projects.manage",
  "workItems.view.all",
  "workItems.view.assigned",
  "workItems.assign",
  "workItems.edit",
  "workItems.updateOwn",

  // Quality assurance
  "qa.view",
  "qa.test",
  "qa.closeDefect",
  "qa.approve",

  // Client review and revisions
  "revisions.view",
  "revisions.manage",
  "revisions.recordApproval",

  // Launch
  "launch.view",
  "launch.schedule",
  "launch.activate",

  // Reporting
  "reporting.client",
  "reporting.internal",
  "reporting.financial",

  // Client health and retention
  "health.view",
  "health.manage",
  "complaints.manage",
  "renewals.view",
  "renewals.manage",
  "offboarding.manage",

  // Finance
  "finance.view",
  "finance.edit",

  // Team
  "team.view",
  "team.manage",
  "team.training",

  // Governance
  "governance.view",
  "governance.audit",
  "governance.correctiveAction",
  "sop.manage",

  // Administration and security
  "users.manage",
  "security.view",
  "security.manageAccess",
  "security.permissions",
  "settings.system",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const permissionSet = new Set<string>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return permissionSet.has(value);
}

/** Everything. Used by the owner tier. */
const ALL: readonly Permission[] = PERMISSIONS;

/** The floor every authenticated user gets, whatever their position. */
const BASE: readonly Permission[] = [
  "dashboard.view.own",
  "clients.view.assigned",
  "projects.view.assigned",
  "workItems.view.assigned",
  "workItems.updateOwn",
  "journey.view",
];

/** A fulfillment specialist: sees only their own assigned work. */
const SPECIALIST: readonly Permission[] = [
  ...BASE,
  "qa.view",
];

const DELIVERY_OVERSIGHT: readonly Permission[] = [
  "dashboard.view.agency",
  "clients.view.all",
  "clients.edit",
  "projects.view.all",
  "projects.manage",
  "workItems.view.all",
  "workItems.assign",
  "workItems.edit",
  "journey.view",
  "journey.move",
  "qa.view",
  "launch.view",
  "team.view",
  "health.view",
  "reporting.internal",
  "activity.view.all",
];

/**
 * The role matrix.
 *
 * Six seats, one row each. This is the single place to look up, or change,
 * what somebody can do. It replaced a 26-row table keyed on job title, which
 * described the agency's vocabulary rather than its access.
 *
 * Quality assurance is deliberately spread across the three specialist seats
 * plus the project manager rather than concentrated in a QA role: the agency
 * has six people, not seven. Self-approval is blocked separately, in
 * lib/quality/defect-closure.ts, so sharing QA never means marking your own
 * work correct.
 */
const TEAM_ROLE_PERMISSIONS: Record<TeamRole, readonly Permission[]> = {
  // Owner / Strategist: everything, including money and governance.
  AGENCY_OWNER: ALL,

  // Sales: leads and opportunities. Explicitly no production access, no
  // financial reporting, and no sight of unrelated client delivery.
  SALES_REP: [
    ...BASE,
    "leads.view.all",
    "leads.view.assigned",
    "leads.create",
    "leads.edit",
    "leads.convert",
    "sales.reporting",
    "clients.view.all",
  ],

  // Project Manager / Client Success: runs delivery and owns the client
  // relationship. The busiest seat in a six-person agency.
  PROJECT_MANAGER: [
    ...DELIVERY_OVERSIGHT,
    "clients.create",
    "clients.edit",
    "journey.override",
    "workItems.assign",
    "workItems.edit",
    "qa.view",
    "qa.test",
    "qa.closeDefect",
    "qa.approve",
    "revisions.view",
    "revisions.manage",
    "revisions.recordApproval",
    "launch.view",
    "launch.schedule",
    "launch.activate",
    "reporting.client",
    "reporting.internal",
    "health.view",
    "health.manage",
    "complaints.manage",
    "renewals.view",
    "renewals.manage",
    "offboarding.manage",
    "team.view",
    "team.training",
    "governance.view",
    "governance.audit",
    "governance.correctiveAction",
    // Access collection is an onboarding job, and onboarding is this seat's.
    // Note this grants no sight of credentials: the tracker records only
    // whether access works and where the credential is held.
    "security.view",
    "security.manageAccess",
  ],

  // The three specialist seats share a shape: their own assigned work, plus QA
  // on the part of the build they are responsible for.
  AUTOMATION_SPECIALIST: [...SPECIALIST, "qa.test"],
  CREATIVE_SPECIALIST: [...SPECIALIST, "qa.test"],
  ADS_SPECIALIST: [...SPECIALIST, "qa.test", "reporting.client"],
};

/**
 * Access-tier permissions, kept so users who predate positions do not lose
 * access. ADMIN maps to full access exactly as it did before.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  MANAGER: [
    ...DELIVERY_OVERSIGHT,
    "clients.create",
    "clients.delete",
    "leads.view.all",
    "workItems.assign",
    "reporting.internal",
  ],
  TEAM_MEMBER: BASE,
};

export interface PermissionOverride {
  permission: string;
  effect: "ALLOW" | "DENY";
  expiresAt?: Date | null;
}

export interface AuthorizableUser {
  role: Role;
  /** The seat. Absent only for callers that still pass a bare access tier. */
  teamRole?: TeamRole | null;
  /** Descriptive job title. Never consulted for authorization. */
  position?: Position | null;
  permissionOverrides?: PermissionOverride[] | null;
}

/** Resolves the effective permission set for a user. */
export function resolvePermissions(user: AuthorizableUser): Set<Permission> {
  const effective = new Set<Permission>(ROLE_PERMISSIONS[user.role] ?? BASE);

  if (user.teamRole) {
    for (const permission of TEAM_ROLE_PERMISSIONS[user.teamRole] ?? BASE) {
      effective.add(permission);
    }
  }

  const now = Date.now();
  const denied = new Set<Permission>();

  for (const override of user.permissionOverrides ?? []) {
    if (!isPermission(override.permission)) {
      continue;
    }

    if (override.expiresAt && override.expiresAt.getTime() <= now) {
      continue;
    }

    if (override.effect === "DENY") {
      denied.add(override.permission);
    } else {
      effective.add(override.permission);
    }
  }

  // DENY always wins, so it is applied last.
  for (const permission of denied) {
    effective.delete(permission);
  }

  return effective;
}

export function can(user: AuthorizableUser, permission: Permission): boolean {
  return resolvePermissions(user).has(permission);
}

export function canAny(user: AuthorizableUser, permissions: Permission[]): boolean {
  const effective = resolvePermissions(user);
  return permissions.some((permission) => effective.has(permission));
}

export function canAll(user: AuthorizableUser, permissions: Permission[]): boolean {
  const effective = resolvePermissions(user);
  return permissions.every((permission) => effective.has(permission));
}

/** What each seat is called in the interface. */
export const teamRoleLabels: Record<TeamRole, string> = {
  AGENCY_OWNER: "Agency Owner",
  SALES_REP: "Sales",
  PROJECT_MANAGER: "Project Manager",
  AUTOMATION_SPECIALIST: "Automation Specialist",
  CREATIVE_SPECIALIST: "Creative Specialist",
  ADS_SPECIALIST: "Ads and Reporting",
};

/** One-line description of what each seat is responsible for. */
export const teamRoleDescriptions: Record<TeamRole, string> = {
  AGENCY_OWNER: "Agency leadership, pricing, profitability, and governance.",
  SALES_REP: "Leads, discovery calls, proposals, and closing.",
  PROJECT_MANAGER: "Onboarding, delivery, client communication, and renewals.",
  AUTOMATION_SPECIALIST: "GoHighLevel, CRM configuration, workflows, and integrations.",
  CREATIVE_SPECIALIST: "Websites, funnels, design, and copy.",
  ADS_SPECIALIST: "Paid campaigns, tracking, and performance reporting.",
};

export const roleLabels: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEAM_MEMBER: "Team Member",
};

export const positionLabels: Record<Position, string> = {
  UNASSIGNED: "Unassigned",
  AGENCY_OWNER: "Agency Owner",
  AGENCY_DIRECTOR: "Agency Director",
  OPERATIONS_MANAGER: "Operations Manager",
  SALES_MANAGER: "Sales Manager",
  SALES_REPRESENTATIVE: "Sales Representative",
  CLIENT_SUCCESS_MANAGER: "Client Success Manager",
  ACCOUNT_MANAGER: "Account Manager",
  PROJECT_MANAGER: "Project Manager",
  GOHIGHLEVEL_SPECIALIST: "GoHighLevel Specialist",
  CRM_AUTOMATION_SPECIALIST: "CRM and Automation Specialist",
  FUNNEL_WEBSITE_BUILDER: "Funnel and Website Builder",
  META_ADS_SPECIALIST: "Meta Ads Specialist",
  GOOGLE_ADS_SPECIALIST: "Google Ads Specialist",
  SEO_SPECIALIST: "SEO Specialist",
  COPYWRITER: "Copywriter",
  GRAPHIC_DESIGNER: "Graphic Designer",
  VIDEO_EDITOR: "Video Editor",
  CONTENT_SPECIALIST: "Content Specialist",
  SOCIAL_MEDIA_MANAGER: "Social Media Manager",
  TRACKING_ANALYTICS_SPECIALIST: "Tracking and Analytics Specialist",
  INTEGRATION_SPECIALIST: "Integration Specialist",
  QA_REVIEWER: "Quality Assurance Reviewer",
  CLIENT_TRAINER: "Client Trainer",
  FINANCE_ADMINISTRATOR: "Finance and Billing Administrator",
  SECURITY_ADMINISTRATOR: "Security and Access Administrator",
  HR_TRAINING_MANAGER: "Human Resources and Training Manager",
};

// ---------------------------------------------------------------------------
// Backward-compatible helpers.
//
// Existing call sites pass a bare Role. They keep working unchanged, and now
// route through the permission engine so there is one source of truth.
// ---------------------------------------------------------------------------

function fromRole(role: Role): AuthorizableUser {
  return { role };
}

export function canManageUsers(role: Role) {
  return can(fromRole(role), "users.manage");
}

export function canManageClients(role: Role) {
  return can(fromRole(role), "clients.edit");
}

export function canManageEmployeeTasks(role: Role) {
  return can(fromRole(role), "workItems.assign");
}

export function canMovePipeline(role: Role) {
  return can(fromRole(role), "journey.move");
}

export function canViewAllAgencyData(role: Role) {
  return can(fromRole(role), "clients.view.all");
}

export function canAccessAssignedRecord(
  role: Role,
  currentUserId: string,
  assignedUserId?: string | null,
) {
  return canViewAllAgencyData(role) || currentUserId === assignedUserId;
}

export function canUpdateEmployeeTask(
  role: Role,
  currentUserId: string,
  assignedToId?: string | null,
) {
  return canManageEmployeeTasks(role) || currentUserId === assignedToId;
}
