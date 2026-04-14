import "dotenv/config";
import { spawnSync } from "node:child_process";

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

if (!process.env.DATABASE_URL) {
  console.warn(
    "[prisma-generate] DATABASE_URL was not found. Falling back to a placeholder URL so Prisma Client can generate during install. Set DATABASE_URL or a supported POSTGRES_* variable in Vercel before runtime.",
  );
  process.env.DATABASE_URL =
    "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";
}

const command = process.platform === "win32" ? "cmd.exe" : "npx";
const args =
  process.platform === "win32"
    ? ["/c", "npx", "prisma", "generate"]
    : ["prisma", "generate"];

const result = spawnSync(command, args, {
  stdio: "inherit",
  env: process.env,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}
