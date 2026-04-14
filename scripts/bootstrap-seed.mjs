import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const fallbackKeys = [
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "PRISMA_DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
];

const isVercelDeployment = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

function isPlaceholderDatabaseUrl(value) {
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

function isLocalDatabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isInvalidDatabaseUrl(value) {
  if (isPlaceholderDatabaseUrl(value)) {
    return true;
  }

  if (isVercelDeployment && isLocalDatabaseUrl(value)) {
    return true;
  }

  return false;
}

const resolvedUrl = fallbackKeys
  .map((key) => process.env[key])
  .find((value) => typeof value === "string" && value.length > 0 && !isInvalidDatabaseUrl(value));

if ((!process.env.DATABASE_URL || isInvalidDatabaseUrl(process.env.DATABASE_URL)) && resolvedUrl) {
  process.env.DATABASE_URL = resolvedUrl;
}

if (!process.env.DATABASE_URL || isInvalidDatabaseUrl(process.env.DATABASE_URL)) {
  console.warn("[bootstrap-seed] Skipping bootstrap because no valid database URL is configured.");
  process.exit(0);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
}

function runNpx(args) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/c", "npx", ...args]);
    return;
  }

  run("npx", args);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  const [userCount, stageCount, clientCount] = await Promise.all([
    prisma.user.count(),
    prisma.pipelineStage.count(),
    prisma.client.count(),
  ]);

  if (userCount === 0 && stageCount === 0 && clientCount === 0) {
    console.log("[bootstrap-seed] Database is empty. Running Prisma seed.");
    runNpx(["prisma", "db", "seed"]);
  } else {
    console.log("[bootstrap-seed] Existing data found. Skipping Prisma seed.");
  }
} finally {
  await prisma.$disconnect();
}
