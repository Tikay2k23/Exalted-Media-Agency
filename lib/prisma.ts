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

const isVercelDeployment = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

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

function isLocalDatabaseUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isInvalidDatabaseUrl(value: string) {
  if (isPlaceholderDatabaseUrl(value)) {
    return true;
  }

  if (isVercelDeployment && isLocalDatabaseUrl(value)) {
    return true;
  }

  return false;
}

function resolveConnectionString() {
  return databaseUrlKeys
    .map((key) => process.env[key])
    .find((value) => typeof value === "string" && value.length > 0 && !isInvalidDatabaseUrl(value));
}

function getPrismaClient() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = resolveConnectionString();

  if (!connectionString) {
    throw new Error(
      "A valid database connection string is not configured. Set DATABASE_URL or a supported POSTGRES_* environment variable.",
    );
  }

  const adapter = globalForPrisma.adapter ?? new PrismaPg({ connectionString });
  const prismaClient = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.adapter = adapter;
    globalForPrisma.prisma = prismaClient;
  }

  return prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
