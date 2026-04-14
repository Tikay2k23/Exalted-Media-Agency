import {
  Department,
  type Prisma,
  Role,
} from "@prisma/client";
import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";

const globalForDemoBootstrap = globalThis as unknown as {
  demoBootstrapComplete?: boolean;
  demoBootstrapPromise?: Promise<void>;
};

const demoUserSeed = [
  {
    name: "Ariana Blake",
    email: "admin@exaltedagency.com",
    role: Role.ADMIN,
    department: Department.OPERATIONS,
    jobTitle: "Agency Director",
    weeklyCapacityHours: 35,
    avatarUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
  },
  {
    name: "Noah Carter",
    email: "manager@exaltedagency.com",
    role: Role.MANAGER,
    department: Department.ACCOUNT_MANAGEMENT,
    jobTitle: "Client Services Manager",
    weeklyCapacityHours: 38,
    avatarUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
  },
  {
    name: "Sarah Kim",
    email: "sarah@exaltedagency.com",
    role: Role.TEAM_MEMBER,
    department: Department.CONTENT,
    jobTitle: "Content Strategist",
    weeklyCapacityHours: 40,
    avatarUrl:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80",
  },
  {
    name: "Devon Price",
    email: "devon@exaltedagency.com",
    role: Role.TEAM_MEMBER,
    department: Department.PAID_MEDIA,
    jobTitle: "Paid Media Specialist",
    weeklyCapacityHours: 42,
    avatarUrl:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80",
  },
] satisfies Array<{
  name: string;
  email: string;
  role: Role;
  department: Department;
  jobTitle: string;
  weeklyCapacityHours: number;
  avatarUrl: string;
}>;

const defaultStageSeed = [
  { name: "New Client", slug: "new-client", color: "#0ea5e9", position: 1, isDefault: true },
  { name: "Onboarding", slug: "onboarding", color: "#8b5cf6", position: 2, isDefault: false },
  { name: "In Progress", slug: "in-progress", color: "#f59e0b", position: 3, isDefault: false },
  { name: "Waiting on Client", slug: "waiting-on-client", color: "#ef4444", position: 4, isDefault: false },
  { name: "Review", slug: "review", color: "#14b8a6", position: 5, isDefault: false },
  { name: "Completed", slug: "completed", color: "#22c55e", position: 6, isDefault: false },
] satisfies Prisma.PipelineStageCreateManyInput[];

async function bootstrapDemoWorkspace() {
  const [userCount, stageCount] = await Promise.all([
    prisma.user.count(),
    prisma.pipelineStage.count(),
  ]);

  if (stageCount === 0) {
    await prisma.pipelineStage.createMany({
      data: defaultStageSeed,
      skipDuplicates: true,
    });
  }

  if (userCount > 0) {
    return;
  }

  const passwordHash = await hash("Agency123!", 12);

  await Promise.all(
    demoUserSeed.map((user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          ...user,
          passwordHash,
        },
      }),
    ),
  );
}

export async function ensureDemoWorkspaceInitialized() {
  if (globalForDemoBootstrap.demoBootstrapComplete) {
    return;
  }

  if (!globalForDemoBootstrap.demoBootstrapPromise) {
    globalForDemoBootstrap.demoBootstrapPromise = bootstrapDemoWorkspace()
      .then(() => {
        globalForDemoBootstrap.demoBootstrapComplete = true;
      })
      .finally(() => {
        globalForDemoBootstrap.demoBootstrapPromise = undefined;
      });
  }

  return globalForDemoBootstrap.demoBootstrapPromise;
}
