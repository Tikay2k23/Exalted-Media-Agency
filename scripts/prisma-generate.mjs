import "dotenv/config";
import { spawnSync } from "node:child_process";

const fallbackKeys = [
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
];

const resolvedUrl = fallbackKeys
  .map((key) => process.env[key])
  .find((value) => typeof value === "string" && value.length > 0);

if (!process.env.DATABASE_URL && resolvedUrl) {
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
