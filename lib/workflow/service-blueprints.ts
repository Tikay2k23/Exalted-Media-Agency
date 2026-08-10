import type { ServiceType, TeamRole } from "@prisma/client";

/**
 * Which seats a purchased service actually needs.
 *
 * The system used to run every client through the same shape regardless of
 * what they bought, so a CRM-only account grew website and advertising work
 * that nobody ever intended to do. Somebody then had to close those by hand,
 * and after a while people stopped trusting what the board said.
 *
 * A blueprint fixes that at the point the client is created: the workstreams
 * that exist are the ones the client is paying for.
 *
 * Pure data, deliberately. The agency has six people and ten services; a
 * configuration table would be a database round trip and a migration every
 * time somebody adds a service, in exchange for flexibility nobody has asked
 * for yet. When the agency needs per-client variation, the workstream rows are
 * already the place to vary it - they are created from this, not bound to it.
 */

/** Everyone runs through sales and the project manager. */
const ALWAYS: readonly TeamRole[] = ["SALES_REP", "PROJECT_MANAGER"];

const AUTOMATION: TeamRole = "AUTOMATION_SPECIALIST";
const CREATIVE: TeamRole = "CREATIVE_SPECIALIST";
const ADS: TeamRole = "ADS_SPECIALIST";

export interface ServiceBlueprint {
  label: string;
  /** Seats beyond sales and the project manager. */
  specialists: readonly TeamRole[];
  /** One line the team can read on the client page. */
  summary: string;
}

export const SERVICE_BLUEPRINTS: Record<ServiceType, ServiceBlueprint> = {
  CRM_AUTOMATION: {
    label: "CRM and automation",
    specialists: [AUTOMATION],
    summary: "GoHighLevel build, workflows and integrations.",
  },
  FUNNEL_BUILD: {
    label: "Funnel build",
    specialists: [CREATIVE, AUTOMATION],
    summary: "Pages and copy, with the automation behind the forms.",
  },
  WEBSITE_SUPPORT: {
    label: "Website",
    specialists: [CREATIVE],
    summary: "Site build and ongoing page work.",
  },
  PAID_ADVERTISING: {
    label: "Paid advertising",
    specialists: [ADS, CREATIVE],
    summary: "Campaigns and tracking, with creative for the ads.",
  },
  SEO: {
    label: "SEO",
    specialists: [CREATIVE, ADS],
    summary: "Content and on-page work, with tracking to prove it.",
  },
  EMAIL_MARKETING: {
    label: "Email marketing",
    specialists: [AUTOMATION, CREATIVE],
    summary: "Sequences and templates.",
  },
  CONTENT_PRODUCTION: {
    label: "Content production",
    specialists: [CREATIVE],
    summary: "Copy, design and creative assets.",
  },
  SOCIAL_MEDIA_MANAGEMENT: {
    label: "Social media",
    specialists: [CREATIVE],
    summary: "Content, scheduling and community.",
  },
  BRAND_STRATEGY: {
    label: "Brand strategy",
    specialists: [CREATIVE],
    summary: "Positioning, messaging and identity.",
  },
  FULL_SERVICE_RETAINER: {
    label: "Full service",
    specialists: [AUTOMATION, CREATIVE, ADS],
    summary: "Everything: CRM, site and funnels, campaigns and reporting.",
  },
};

/**
 * Every seat a client needs, in journey order.
 *
 * Sales first, then the project manager, then the specialists. The order is
 * what the handoff engine walks, so it is the order the work happens in.
 */
export function rolesForService(service: ServiceType): TeamRole[] {
  const blueprint = SERVICE_BLUEPRINTS[service];

  // Falling back to project-manager-only rather than throwing: an unmapped
  // service should leave somebody holding the client, not leave it nowhere.
  if (!blueprint) {
    return [...ALWAYS];
  }

  return [...ALWAYS, ...blueprint.specialists];
}

/** The specialist seats only - the ones that vary by what was bought. */
export function specialistsForService(service: ServiceType): TeamRole[] {
  return [...(SERVICE_BLUEPRINTS[service]?.specialists ?? [])];
}

export function blueprintFor(service: ServiceType): ServiceBlueprint | null {
  return SERVICE_BLUEPRINTS[service] ?? null;
}
