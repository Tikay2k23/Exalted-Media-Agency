/**
 * Says which database a command is actually about to touch, and refuses to let
 * it proceed against the wrong one.
 *
 * The reason this exists: on 2026-08-31 a migration aimed at UAT ran against
 * development, reported "no pending migrations", and looked like a success.
 * The UAT database was still empty and nothing said so. A wrong target has to
 * fail loudly, and it has to be checked against the server rather than against
 * the string we hoped was configured - a connection string can be right in the
 * environment and still not be what the connection resolved to.
 *
 * Import as a library, or run directly to print what is resolved:
 *
 *   node --env-file=.env.uat scripts/db-identity.mjs uat
 */
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/* The order prisma.config.ts resolves in. DATABASE_URL is not first. */
export const CONNECTION_KEYS = [
  "DIRECT_URL",
  "PRISMA_DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
];

export const ENVIRONMENTS = {
  development: { match: (n) => n === "exalted_media_agency", label: "Development" },
  test: { match: (n) => n === "exalted_test", label: "Test" },
  uat: { match: (n) => n.includes("uat") || n.includes("staging"), label: "Staging/UAT" },
  production: { match: (n) => n.includes("prod"), label: "Production" },
};

/** Loads an env file over the current environment. */
export function loadEnvFile(path) {
  if (!existsSync(path)) return false;

  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");

    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }

  return true;
}

export const redact = (url) => String(url).replace(/:\/\/[^@]*@/, "://***@");

/** Classifies a database name. Anything unrecognised is "unknown", never safe. */
export function classify(name) {
  for (const [key, env] of Object.entries(ENVIRONMENTS)) {
    if (env.match(name.toLowerCase())) return key;
  }

  return "unknown";
}

/**
 * What the environment says the target is, before connecting.
 *
 * Throws when the connection variables disagree: that is not a preference to
 * resolve quietly, it is the exact shape of the bug this file exists for.
 */
export function resolveTarget() {
  const set = [];

  for (const key of CONNECTION_KEYS) {
    if (process.env[key]) set.push({ key, url: process.env[key] });
  }

  if (!set.length) throw new Error("No database connection is configured.");

  const describe = (url) => {
    const parsed = new URL(url);
    return { host: parsed.host, name: parsed.pathname.replace("/", "") };
  };

  const groups = new Map();

  for (const { key, url } of set) {
    const { host, name } = describe(url);
    const id = `${host}/${name}`;
    groups.set(id, [...(groups.get(id) ?? []), key]);
  }

  if (groups.size > 1) {
    const detail = [...groups].map(([id, keys]) => `    ${id}  <- ${keys.join(", ")}`).join("\n");

    throw new Error(
      `Connection variables disagree about the target database:\n${detail}\n\n`
        + "Pin every one of them to the same database. The first key in the list wins,\n"
        + "and it is DIRECT_URL, not DATABASE_URL.",
    );
  }

  const winner = set[0];
  const { host, name } = describe(winner.url);

  return { host, name, environment: classify(name), decidedBy: winner.key, url: winner.url };
}

/**
 * Asks the server what it is, rather than trusting the string.
 *
 * Takes a client with $queryRawUnsafe - the caller owns the connection, so
 * this works for Prisma without opening a second one.
 */
export async function serverIdentity(client) {
  const [row] = await client.$queryRawUnsafe(
    "SELECT current_database() AS database, current_user AS user, "
      + "inet_server_addr()::text AS host, inet_server_port() AS port, version() AS version",
  );

  return {
    database: row.database,
    user: row.user,
    host: row.host ?? "local socket",
    port: Number(row.port),
    version: String(row.version).split(",")[0],
  };
}

/** Prints the identity block, and aborts unless the server matches `expected`. */
export async function assertIdentity({ expected, client, action }) {
  const target = resolveTarget();
  const actual = client ? await serverIdentity(client) : null;
  const actualName = actual ? actual.database : target.name;
  const actualEnv = classify(actualName);

  const lines = [
    `Expected environment: ${ENVIRONMENTS[expected]?.label ?? expected}`,
    `Expected database:    ${expected === "uat" ? "exalted_uat" : expected === "test" ? "exalted_test" : expected === "development" ? "exalted_media_agency" : "(named by policy)"}`,
    `Actual database:      ${actualName}`,
    `Actual environment:   ${ENVIRONMENTS[actualEnv]?.label ?? actualEnv}`,
    `Resolved by variable: ${target.decidedBy}`,
    `Host:                 ${target.host}`,
  ];

  if (actual) {
    lines.push(
      `Server reports:       ${actual.database} as ${actual.user} on ${actual.host}:${actual.port}`,
      `Server version:       ${actual.version}`,
    );
  }

  const match = actualEnv === expected;

  lines.push(`Match:                ${match ? "YES" : "NO"}`);

  console.log(lines.map((line) => `  ${line}`).join("\n"));

  if (!match) {
    console.error(
      `\n[abort] ${action ?? "This command"} expects ${expected} `
        + `but resolved ${actualEnv} ("${actualName}"). Nothing was run.`,
    );
    process.exit(1);
  }

  return { target, actual };
}

/* Run directly: node --env-file=<file> scripts/db-identity.mjs <expected> */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expected = process.argv[2];
  const target = resolveTarget();

  console.log(`  Resolved by variable: ${target.decidedBy}`);
  console.log(`  Host:                 ${target.host}`);
  console.log(`  Database:             ${target.name}`);
  console.log(`  Environment:          ${ENVIRONMENTS[target.environment]?.label ?? target.environment}`);

  if (expected && target.environment !== expected) {
    console.error(`\n[abort] expected ${expected}, resolved ${target.environment}`);
    process.exit(1);
  }
}
