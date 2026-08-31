/**
 * One way in to the UAT environment.
 *
 * Every command here loads .env.uat first, and loads all of it. That is not
 * tidiness - it is the fix for a bug that cost real time. prisma.config.ts
 * resolves its connection from DIRECT_URL before DATABASE_URL, and dotenv
 * fills in any variable that is merely unset. So exporting DATABASE_URL for
 * UAT and running a migration migrated development instead: DIRECT_URL was
 * still the one from .env, and it outranked the variable that had been set on
 * purpose. Nothing warned, and the migration reported success.
 *
 * Pinning every connection variable to the same database removes the
 * precedence question entirely, and assertUatTarget below refuses to act if
 * they ever disagree again.
 *
 *   npm run uat:migrate     apply migrations
 *   npm run uat:seed        seed configuration and the six seats
 *   npm run uat:verify      prove each seat can sign in
 *   npm run uat:dev         run the app against UAT on port 3100
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.uat";

const CONNECTION_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "PRISMA_DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
];

function loadEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`[uat] ${path} is missing. It is git-ignored, so it does not arrive with a clone.`);
    console.error("[uat] Create it from .env.example, pointing every connection variable at the UAT database.");
    process.exit(1);
  }

  for (const raw of readFileSync(path, "utf8").split('\n')) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");

    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (value.length > 1 && value[0] === '"' && value[value.length - 1] === '"') {
      value = value.slice(1, -1);
    }

    // This file is the authority for this environment, so it wins outright.
    process.env[key] = value;
  }
}

/** Refuses to act unless every connection variable names the same UAT database. */
function assertUatTarget() {
  const set = CONNECTION_VARS.map((name) => [name, process.env[name]]).filter(([, v]) => Boolean(v));

  if (!set.length) {
    console.error("[uat] No database connection is configured.");
    process.exit(1);
  }

  const describe = (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  };

  const targets = new Map();

  for (const [name, url] of set) {
    const key = describe(url);
    targets.set(key, [...(targets.get(key) ?? []), name]);
  }

  if (targets.size > 1) {
    console.error("[uat] Connection variables disagree about which database to use:");

    for (const [key, names] of targets) {
      console.error(`        ${key}  <- ${names.join(", ")}`);
    }

    console.error("[uat] Pin every one of them to the UAT database in .env.uat.");
    process.exit(1);
  }

  const [[, url]] = set;
  const name = new URL(url).pathname.replace("/", "").toLowerCase();

  if (!name.includes("uat")) {
    console.error(`[uat] Refusing to act on "${name}": it is not a UAT database.`);
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) {
    console.error("[uat] Refusing to run in a production environment.");
    process.exit(1);
  }

  return name;
}

const COMMANDS = {
  migrate: ["npx", ["prisma", "migrate", "deploy"]],
  seed: ["npx", ["tsx", "scripts/seed-environment.ts"]],
  verify: ["npx", ["tsx", "scripts/verify-uat-signin.ts"]],
  dev: ["npx", ["next", "dev", "-p", "3100"]],
  // For when a dev server is already running from this directory: next refuses
  // a second one, and a built server proves the same environment wiring.
  start: ["npx", ["next", "start", "-p", "3100"]],
  build: ["npx", ["next", "build"]],
};

const command = process.argv[2];

if (!command || !(command in COMMANDS)) {
  console.error(`[uat] Usage: node scripts/uat.mjs <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}

loadEnvFile(ENV_FILE);

const database = assertUatTarget();

if (command === "seed") {
  process.env.SEED_TEAM = "1";
}

console.log(`[uat] ${command} -> ${database}`);

const [bin, args] = COMMANDS[command];
const result = spawnSync(bin, args, { stdio: "inherit", shell: true });

process.exit(result.status ?? 1);
