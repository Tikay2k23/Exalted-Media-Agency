import "dotenv/config";
import { spawnSync } from "node:child_process";

const fallbackKeys = [
  "PRISMA_DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
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

const resolvedUrl = fallbackKeys
  .map((key) => process.env[key])
  .find((value) => typeof value === "string" && value.length > 0 && !isInvalidDatabaseUrl(value));

if ((!process.env.DATABASE_URL || isInvalidDatabaseUrl(process.env.DATABASE_URL)) && resolvedUrl) {
  process.env.DATABASE_URL = resolvedUrl;
}

run("node", ["scripts/prisma-generate.mjs"]);

if (isVercelDeployment && process.env.DATABASE_URL && !isInvalidDatabaseUrl(process.env.DATABASE_URL)) {
  console.log("[vercel-build] Syncing schema to the hosted database.");
  runNpx(["prisma", "db", "push", "--skip-generate"]);

  console.log("[vercel-build] Bootstrapping seed data if the database is empty.");
  run("node", ["scripts/bootstrap-seed.mjs"]);
}

runNpx(["next", "build"]);
