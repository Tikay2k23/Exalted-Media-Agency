import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import {
  defaultAgencyUsers,
  defaultPipelineStages,
  readDefaultUserPassword,
} from "@/lib/workspace-defaults";

const globalForWorkspaceBootstrap = globalThis as unknown as {
  workspaceBootstrapComplete?: boolean;
  workspaceBootstrapPromise?: Promise<void>;
};

async function bootstrapWorkspace() {
  await prisma.pipelineStage.createMany({
    data: defaultPipelineStages,
    skipDuplicates: true,
  });

  for (const user of defaultAgencyUsers) {
    const { key, ...userData } = user;
    const existing = await prisma.user.findUnique({
      where: {
        email: userData.email,
      },
      select: {
        id: true,
      },
    });

    const password = readDefaultUserPassword(key);

    if (!existing && !password) {
      throw new Error(
        `Missing ${key === "admin" ? "DEFAULT_ADMIN_PASSWORD" : "DEFAULT_MANAGER_PASSWORD"} for initial workspace bootstrap.`,
      );
    }

    if (existing) {
      await prisma.user.update({
        where: {
          email: userData.email,
        },
        data: {
          name: userData.name,
          role: userData.role,
          department: userData.department,
          jobTitle: userData.jobTitle,
          weeklyCapacityHours: userData.weeklyCapacityHours,
          isActive: true,
        },
      });
      continue;
    }

    await prisma.user.create({
      data: {
        ...userData,
        passwordHash: await hash(password!, 12),
        isActive: true,
      },
    });
  }
}

export async function ensureRequiredWorkspaceInitialized() {
  if (globalForWorkspaceBootstrap.workspaceBootstrapComplete) {
    return;
  }

  if (!globalForWorkspaceBootstrap.workspaceBootstrapPromise) {
    globalForWorkspaceBootstrap.workspaceBootstrapPromise = bootstrapWorkspace()
      .then(() => {
        globalForWorkspaceBootstrap.workspaceBootstrapComplete = true;
      })
      .finally(() => {
        globalForWorkspaceBootstrap.workspaceBootstrapPromise = undefined;
      });
  }

  return globalForWorkspaceBootstrap.workspaceBootstrapPromise;
}
