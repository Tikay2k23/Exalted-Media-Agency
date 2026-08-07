import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

import {
  STAGE_REQUIREMENT_SEED,
  getRequirementDefinition,
} from "@/lib/journey/stage-requirements";
import { getRequirementRemedy } from "@/lib/journey/requirement-remedies";
import {
  buildStageSeedData,
  defaultAgencyUsers,
  defaultPipelines,
  legacySeedClientCompanies,
  legacySeedEmails,
  readDefaultUserPassword,
} from "@/lib/workspace-defaults";

const connectionString =
  process.env.DIRECT_URL
  ?? process.env.PRISMA_DATABASE_URL
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL_NON_POOLING
  ?? process.env.DATABASE_URL
  ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "A database connection string is not configured for seeding. Set DIRECT_URL, PRISMA_DATABASE_URL, or another supported PostgreSQL URL.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function removeLegacySeedData() {
  const legacyUsers = await prisma.user.findMany({
    where: {
      email: {
        in: [...legacySeedEmails],
      },
    },
    select: {
      id: true,
    },
  });
  const legacyUserIds = legacyUsers.map((user) => user.id);

  const legacyClients = await prisma.client.findMany({
    where: {
      companyName: {
        in: [...legacySeedClientCompanies],
      },
    },
    select: {
      id: true,
    },
  });
  const legacyClientIds = legacyClients.map((client) => client.id);

  const taskWhere =
    legacyClientIds.length || legacyUserIds.length
      ? {
          OR: [
            ...(legacyClientIds.length
              ? [
                  {
                    clientId: {
                      in: legacyClientIds,
                    },
                  },
                ]
              : []),
            ...(legacyUserIds.length
              ? [
                  {
                    assignedToId: {
                      in: legacyUserIds,
                    },
                  },
                  {
                    createdById: {
                      in: legacyUserIds,
                    },
                  },
                ]
              : []),
          ],
        }
      : null;

  const legacyTasks = taskWhere
    ? await prisma.employeeTask.findMany({
        where: taskWhere,
        select: {
          id: true,
        },
      })
    : [];
  const legacyTaskIds = legacyTasks.map((task) => task.id);

  if (legacyTaskIds.length) {
    await prisma.employeeTaskEodEntry.deleteMany({
      where: {
        taskId: {
          in: legacyTaskIds,
        },
      },
    });
  }

  const activityFilters = [
    ...(legacyUserIds.length
      ? [
          {
            actorId: {
              in: legacyUserIds,
            },
          },
        ]
      : []),
    ...(legacyClientIds.length
      ? [
          {
            entityId: {
              in: legacyClientIds,
            },
          },
        ]
      : []),
    ...(legacyTaskIds.length
      ? [
          {
            entityId: {
              in: legacyTaskIds,
            },
          },
        ]
      : []),
  ];

  if (activityFilters.length) {
    await prisma.activityLog.deleteMany({
      where: {
        OR: activityFilters,
      },
    });
  }

  if (legacyTaskIds.length) {
    await prisma.employeeTask.deleteMany({
      where: {
        id: {
          in: legacyTaskIds,
        },
      },
    });
  }

  if (legacyClientIds.length) {
    await prisma.socialMediaTask.deleteMany({
      where: {
        clientId: {
          in: legacyClientIds,
        },
      },
    });

    await prisma.clientStageHistory.deleteMany({
      where: {
        clientId: {
          in: legacyClientIds,
        },
      },
    });

    await prisma.client.deleteMany({
      where: {
        id: {
          in: legacyClientIds,
        },
      },
    });
  }

  if (legacyUserIds.length) {
    await prisma.session.deleteMany({
      where: {
        userId: {
          in: legacyUserIds,
        },
      },
    });

    await prisma.account.deleteMany({
      where: {
        userId: {
          in: legacyUserIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: legacyUserIds,
        },
      },
    });
  }
}

// The seed is documented as safe to rerun, so it must not silently overwrite
// state a real user owns. Passwords are only reset when explicitly requested,
// and profile photos are never cleared for an account that already exists.
const shouldResetExistingPasswords =
  process.env.RESET_DEFAULT_USER_PASSWORDS?.trim().toLowerCase() === "true";

async function syncDefaultUsers() {
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
        `Missing ${key === "admin" ? "DEFAULT_ADMIN_PASSWORD" : "DEFAULT_MANAGER_PASSWORD"} for seed creation.`,
      );
    }

    await prisma.user.upsert({
      where: {
        email: userData.email,
      },
      update: {
        name: userData.name,
        role: userData.role,
        department: userData.department,
        jobTitle: userData.jobTitle,
        weeklyCapacityHours: userData.weeklyCapacityHours,
        isActive: true,
        ...(password && shouldResetExistingPasswords
          ? { passwordHash: await hash(password, 12) }
          : {}),
      },
      create: {
        ...userData,
        passwordHash: await hash(password!, 12),
        avatarUrl: null,
        isActive: true,
      },
    });
  }
}

/**
 * Installs the stage gates.
 *
 * A requirement only blocks a stage move when the app actually provides a way
 * to satisfy it. Anything whose remedy is still marked `notBuiltYet` is
 * installed as advisory: it is evaluated and shown, but it does not stop work.
 * Enforcing a rule nobody can comply with just trains people to override.
 *
 * As each module is built, removing `notBuiltYet` from its remedy turns the
 * gate back on at the next seed.
 */
async function syncStageRequirements() {
  let created = 0;
  let retuned = 0;

  for (const [stageKey, requirementKeys] of Object.entries(STAGE_REQUIREMENT_SEED)) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { stageKey, isDeprecated: false },
      select: { id: true },
    });

    if (!stage) {
      continue;
    }

    for (const [index, requirementKey] of requirementKeys.entries()) {
      const definition = getRequirementDefinition(requirementKey);

      if (!definition) {
        console.warn(
          `[seed] Skipping unknown stage requirement "${requirementKey}" on stage "${stageKey}".`,
        );
        continue;
      }

      const isBlocking = !getRequirementRemedy(definition.key).notBuiltYet;

      const result = await prisma.stageRequirement.createMany({
        data: {
          stageId: stage.id,
          requirementKey: definition.key,
          label: definition.label,
          description: definition.description,
          isBlocking,
          position: index,
        },
        skipDuplicates: true,
      });

      created += result.count;

      if (result.count === 0) {
        // Bring an existing rule in line with whether it can be complied with.
        const updated = await prisma.stageRequirement.updateMany({
          where: {
            stageId: stage.id,
            requirementKey: definition.key,
            isBlocking: { not: isBlocking },
          },
          data: { isBlocking },
        });

        retuned += updated.count;
      }
    }
  }

  console.log(
    `Stage gates synchronized. ${created} added, ${retuned} retuned to match what the app can satisfy.`,
  );
}

async function main() {
  await removeLegacySeedData();

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

  await syncStageRequirements();

  await syncDefaultUsers();

  console.log("Seed complete. Default agency users and pipeline stages are synchronized.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
