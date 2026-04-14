import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  adapter?: PrismaPg;
  prisma?: PrismaClient;
};

const connectionString =
  process.env.DATABASE_URL
  ?? process.env.POSTGRES_URL_NON_POOLING
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "A database connection string is not configured. Set DATABASE_URL or a supported POSTGRES_* environment variable.",
  );
}

const adapter =
  globalForPrisma.adapter ?? new PrismaPg({ connectionString });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.adapter = adapter;
  globalForPrisma.prisma = prisma;
}
