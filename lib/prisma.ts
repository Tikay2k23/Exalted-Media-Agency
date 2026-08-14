import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  adapter?: PrismaPg;
  prisma?: PrismaClient;
};

// Module-scoped cache. This must apply in every environment: the exported proxy
// below resolves the client on every property access, so without it each access
// would build a new PrismaClient and a new connection pool.
let cachedClient: PrismaClient | undefined;

const databaseUrlKeys = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DIRECT_URL",
  "PRISMA_DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
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
  const existingClient = cachedClient ?? globalForPrisma.prisma;

  if (existingClient) {
    cachedClient = existingClient;
    return existingClient;
  }

  const connectionString = resolveConnectionString();

  if (!connectionString) {
    throw new Error(
      "A valid database connection string is not configured. Set DATABASE_URL, PRISMA_DATABASE_URL, or a supported POSTGRES_* environment variable.",
    );
  }

  if (process.env.DATABASE_URL !== connectionString) {
    process.env.DATABASE_URL = connectionString;
  }

  /*
   * One connection per container, and the pool kept on globalThis.
   *
   * PrismaPg wraps a pg Pool, which defaults to ten connections. A serverless
   * function that builds its own pool per invocation therefore reserves ten
   * every time, and a handful of people clicking around at once is enough to
   * exhaust the database's limit - which is exactly how production started
   * answering "too many connections for role prisma_migration" and showing the
   * error page.
   *
   * A warm container serves requests one at a time, so a single connection is
   * all it can use; anything above one is reserved and idle. Caching on
   * globalThis is what lets the next invocation in that container reuse it
   * rather than open another.
   */
  const adapter =
    globalForPrisma.adapter ?? new PrismaPg({ connectionString, max: 1 });

  const prismaClient = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  cachedClient = prismaClient;

  /*
   * Cached in every environment, production included. It was previously kept
   * only outside production, to survive dev-server hot reloads - but module
   * state is discarded between serverless invocations too, so the environment
   * that most needed the reuse was the one environment not getting it.
   */
  globalForPrisma.adapter = adapter;
  globalForPrisma.prisma = prismaClient;

  return prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, receiver);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
