import { Department, type Prisma, Role } from "@prisma/client";

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

export const defaultPipelineStages = [
  { name: "New Client", slug: "new-client", color: "#2563eb", position: 1, isDefault: true },
  { name: "Onboarding", slug: "onboarding", color: "#0f766e", position: 2, isDefault: false },
  { name: "In Progress", slug: "in-progress", color: "#ea580c", position: 3, isDefault: false },
  { name: "Waiting on Client", slug: "waiting-on-client", color: "#dc2626", position: 4, isDefault: false },
  { name: "Review", slug: "review", color: "#7c3aed", position: 5, isDefault: false },
  { name: "Completed", slug: "completed", color: "#16a34a", position: 6, isDefault: false },
] satisfies Prisma.PipelineStageCreateManyInput[];

export const defaultAgencyUsers = [
  {
    key: "admin",
    name: "Aileen Romero",
    email: "aileen@theexaltedmedia.com",
    role: Role.ADMIN,
    department: Department.OPERATIONS,
    jobTitle: "Agency Director",
    weeklyCapacityHours: 40,
  },
  {
    key: "manager",
    name: "Mark Angelo Yakit",
    email: "angelo@theexaltedmedia.com",
    role: Role.MANAGER,
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
