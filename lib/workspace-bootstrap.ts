import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import {
  buildStageSeedData,
  defaultAgencyUsers,
  defaultPipelines,
  readDefaultUserPassword,
} from "@/lib/workspace-defaults";

const globalForWorkspaceBootstrap = globalThis as unknown as {
  workspaceBootstrapComplete?: boolean;
  workspaceBootstrapPromise?: Promise<void>;
};

async function bootstrapWorkspace() {
  // Pipelines must exist before their stages can reference them.
  for (const pipeline of defaultPipelines) {
    await prisma.pipeline.upsert({
      where: { id: pipeline.id },
      update: {
        kind: pipeline.kind,
        name: pipeline.name,
        slug: pipeline.slug,
        description: pipeline.description,
        isDefault: true,
      },
      create: { ...pipeline, isDefault: true },
    });
  }

  await prisma.pipelineStage.createMany({
    data: buildStageSeedData(),
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
