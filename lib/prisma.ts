import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  adapter?: PrismaPg;
  prisma?: PrismaClient;
};

const databaseUrlKeys = [
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
] as const;

function isPlaceholderDatabaseUrl(value: string) {
  if (value.toLowerCase().includes("placeholder")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const username = decodeURIComponent(parsed.username).toLowerCase();
    const password = decodeURIComponent(parsed.password).toLowerCase();
    const databaseName = parsed.pathname.replace(/^\//, "").toLowerCase();

    return (
      hostname === "host"
      || username === "user"
      || password === "password"
      || databaseName === "dbname"
    );
  } catch {
    return false;
  }
}

const connectionString = databaseUrlKeys
  .map((key) => process.env[key])
  .find((value) => typeof value === "string" && value.length > 0 && !isPlaceholderDatabaseUrl(value));

if (!connectionString) {
  throw new Error(
    "A valid database connection string is not configured. Set DATABASE_URL or a supported POSTGRES_* environment variable.",
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
