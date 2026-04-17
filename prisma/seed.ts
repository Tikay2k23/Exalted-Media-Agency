import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

import {
  defaultAgencyUsers,
  defaultPipelineStages,
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
        avatarUrl: null,
        isActive: true,
        ...(password ? { passwordHash: await hash(password, 12) } : {}),
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

async function main() {
  await removeLegacySeedData();

  await prisma.pipelineStage.createMany({
    data: defaultPipelineStages,
    skipDuplicates: true,
  });

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
