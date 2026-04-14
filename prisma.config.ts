import "dotenv/config";
import { defineConfig, env } from "prisma/config";

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

const resolvedDatabaseUrl = databaseUrlKeys
  .map((key) => process.env[key])
  .find((value) => typeof value === "string" && value.length > 0 && !isPlaceholderDatabaseUrl(value));

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
