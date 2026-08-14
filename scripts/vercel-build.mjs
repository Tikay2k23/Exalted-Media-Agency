import "dotenv/config";
import { spawnSync } from "node:child_process";

const fallbackKeys = [
  "DIRECT_URL",
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
  /*
   * `migrate deploy`, not `db push`.
   *
   * db push diffs the schema and applies the result directly, which is fine on
   * an empty database and wrong on one with rows in it. The difference is not
   * theoretical here: the schema wants PipelineStage.pipelineId NOT NULL, and
   * db push emits that as a single ALTER against a populated table, which
   * either fails the build or takes the data with it. The migration that
   * introduces that column adds it nullable, backfills every existing stage,
   * and only then applies the constraint - which is exactly the care db push
   * throws away.
   *
   * This also means the migration history is the record of what production
   * has, rather than something nobody can reconstruct after the fact.
   */
  console.log("[vercel-build] Applying pending migrations to the hosted database.");
  runNpx(["prisma", "migrate", "deploy"]);

  /*
   * The seed does NOT run here, and must not.
   *
   * `prisma db seed` runs prisma/seed.ts, which deletes the records it
   * considers legacy before writing its canonical set - reasonable when
   * setting a workspace up, indefensible on every deploy. It removed four
   * users and five work items the first time this ran, and the only reason
   * that was survivable is that the accounts it kept happened to be the real
   * ones.
   *
   * Required workspace records are handled at runtime by
   * ensureRequiredWorkspaceInitialized, which upserts and never deletes. Seed
   * a new environment by hand with `npm run db:seed`.
   */
}

runNpx(["next", "build"]);
