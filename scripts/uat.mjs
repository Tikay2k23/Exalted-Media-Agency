/**
 * One way in to the UAT environment.
 *
 * Every command loads .env.uat first, and loads all of it. That is not
 * tidiness - it is the fix for a bug that cost real time. prisma.config.ts
 * resolves its connection from DIRECT_URL before DATABASE_URL, and dotenv
 * fills in any variable that is merely unset. So exporting DATABASE_URL for
 * UAT and running a migration migrated development instead: DIRECT_URL was
 * still the one from .env, and it outranked the variable that had been set on
 * purpose. Nothing warned, and the migration reported "no pending migrations"
 * while the UAT database sat empty.
 *
 * Targeting is checked twice. Before spawning anything, the environment is
 * resolved and classified. For commands that connect, `identity` asks the
 * server what database it is actually in - a string can be right and the
 * connection still land somewhere else.
 *
 *   npm run uat:identity    ask the server what it is
 *   npm run uat:migrate     apply migrations
 *   npm run uat:seed        configuration, SOPs, the catalogue and the seats
 *   npm run uat:clients     the accounts UAT is carried out against
 *   npm run uat:verify      prove each seat can sign in
 *   npm run uat:dev         run the app against UAT on port 3100
 *   npm run uat:start       the built app, when a dev server already runs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { ENVIRONMENTS, classify, loadEnvFile, resolveTarget } from "./db-identity.mjs";

const ENV_FILE = ".env.uat";
const EXPECTED = "uat";

const COMMANDS = {
  identity: null,
  migrate: ["npx", ["prisma", "migrate", "deploy"]],
  seed: ["npx", ["tsx", "scripts/seed-environment.ts"]],
  clients: ["npx", ["tsx", "scripts/seed-uat-clients.ts"]],
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

if (!existsSync(ENV_FILE)) {
  console.error(`[uat] ${ENV_FILE} is missing. It is git-ignored, so it does not arrive with a clone.`);
  console.error("[uat] Create it from .env.example, pointing every connection variable at the UAT database.");
  process.exit(1);
}

loadEnvFile(ENV_FILE);

let target;

try {
  target = resolveTarget();
} catch (error) {
  console.error(`[uat] ${error.message}`);
  process.exit(1);
}

if (target.environment !== EXPECTED) {
  console.error(
    `[uat] Refusing to run: expected ${ENVIRONMENTS[EXPECTED].label}, `
      + `resolved ${ENVIRONMENTS[target.environment]?.label ?? target.environment} `
      + `("${target.name}" via ${target.decidedBy}). Nothing was run.`,
  );
  process.exit(1);
}

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) {
  console.error("[uat] Refusing to run in a production environment.");
  process.exit(1);
}

/* Ask the server, rather than trusting the string that was configured. */
if (command === "identity") {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: target.url });

  await client.connect();

  const { rows } = await client.query(
    "SELECT current_database() AS database, current_user AS \"user\", "
      + "inet_server_addr()::text AS host, inet_server_port() AS port, "
      + "(SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') AS tables",
  );

  const [row] = rows;
  const actual = classify(row.database);

  console.log(`  Expected environment: ${ENVIRONMENTS[EXPECTED].label}`);
  console.log(`  Expected database:    exalted_uat`);
  console.log(`  Actual database:      ${row.database}`);
  console.log(`  Actual environment:   ${ENVIRONMENTS[actual]?.label ?? actual}`);
  console.log(`  Resolved by variable: ${target.decidedBy}`);
  console.log(`  Server:               ${row.host ?? "local socket"}:${row.port} as ${row.user}`);
  console.log(`  Public tables:        ${row.tables}`);
  console.log(`  Match:                ${actual === EXPECTED ? "YES" : "NO"}`);

  await client.end();

  process.exit(actual === EXPECTED ? 0 : 1);
}

if (command === "seed") {
  process.env.SEED_TEAM = "1";
}

console.log(`[uat] ${command} -> ${target.name} (resolved by ${target.decidedBy})`);

const [bin, args] = COMMANDS[command];
const result = spawnSync(bin, args, { stdio: "inherit", shell: true });

process.exit(result.status ?? 1);
