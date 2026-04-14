import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrlKeys = [
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "PRISMA_DATABASE_URL",
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

const resolvedDatabaseUrl = databaseUrlKeys
  .map((key) => process.env[key])
  .find((value) => typeof value === "string" && value.length > 0 && !isInvalidDatabaseUrl(value));

const fallbackDatabaseUrl =
  resolvedDatabaseUrl
  ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolvedDatabaseUrl === process.env.DATABASE_URL
      ? env("DATABASE_URL")
      : fallbackDatabaseUrl,
  },
});
