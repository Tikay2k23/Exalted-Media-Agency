import "dotenv/config";

import { execFileSync } from "node:child_process";

import { prisma } from "@/lib/prisma";

/**
 * Everything a new environment needs, and nothing an environment should not
 * carry between installations.
 *
 * Not a new seed. The pieces already existed and each is already idempotent -
 * prisma/seed.ts for pipelines, stages, requirements and the default users;
 * load-sops for the procedure library; seed-uat and classify-uat for the test
 * catalogue. What was missing was one command that runs them in the right
 * order, so standing up a database does not depend on somebody remembering
 * four scripts and which comes first.
 *
 * Order matters in exactly one place: stage requirements attach to stages, so
 * pipelines and stages have to exist first. prisma/seed.ts already does both
 * in sequence.
 *
 * Configuration only. It creates no client, no lead, no task and no test run -
 * an environment seeded with this has nothing operational in it at all, which
 * is the point.
 */

/**
 * The six team seats.
 *
 * Opt-in, and deliberately so. seed-team keeps itself out of the required seed
 * so that running a seed against a live workspace never invents staff; that
 * property is worth keeping, so this asks for SEED_TEAM=1 rather than removing
 * the guard. A fresh UAT database wants the seats, because there is nobody to
 * sign in as otherwise - and because the SOP library needs an active agency
 * owner to record as the author, which is why it runs before that step.
 */
const seedTeam = process.env.SEED_TEAM === "1";

const STEPS: { name: string; command: string; args: string[] }[] = [
  {
    name: "Pipelines, stages, requirements and default users",
    command: "npx",
    args: ["tsx", "prisma/seed.ts"],
  },
  ...(seedTeam
    ? [
        {
          name: "Team seats",
          command: "node",
          args: ["scripts/seed-team.mjs"],
        },
      ]
    : []),
  {
    name: "SOP library",
    command: "node",
    args: ["scripts/load-sops.mjs"],
  },
  {
    name: "UAT test case catalogue",
    command: "npx",
    args: ["tsx", "scripts/seed-uat.ts"],
  },
  {
    name: "UAT release scope classification",
    command: "npx",
    args: ["tsx", "scripts/classify-uat.ts"],
  },
];

/** The variables a script in this repo might resolve a connection from. */
const CONNECTION_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "PRISMA_DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

const redact = (url: string) => url.replace(/:\/\/[^@]*@/, "://***@");

/**
 * Refuses to seed anything the caller did not clearly mean to seed.
 *
 * Two failures this exists to prevent, both observed rather than imagined.
 *
 * The scripts do not agree on which variable wins: lib/prisma.ts takes
 * DATABASE_URL first, seed-team and bootstrap-seed take DIRECT_URL first. Set
 * one and leave the rest, and dotenv quietly supplies the others from .env -
 * so a run aimed at UAT reads development, reports that everything already
 * exists, and looks like a success. If the variables that are set disagree
 * about the database, that is not a preference to resolve, it is a mistake to
 * stop on.
 *
 * And a seed is a write. Production is never the right target for one.
 */
function assertSafeTarget() {
  const set: { name: string; url: string }[] = [];

  for (const name of CONNECTION_VARS) {
    const url = process.env[name];

    if (url) set.push({ name, url });
  }

  if (!set.length) {
    throw new Error("No database connection is configured.");
  }

  /* Compared on host and database name; credentials and pooling flags vary. */
  const target = (url: string) => {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return url;
    }
  };

  const targets = new Map<string, string[]>();

  for (const { name, url } of set) {
    const key = target(url);
    targets.set(key, [...(targets.get(key) ?? []), name]);
  }

  if (targets.size > 1) {
    const detail = [...targets].map(([key, names]) => `  ${key}  <- ${names.join(", ")}`);

    throw new Error(
      `Connection variables disagree about which database to seed:\n${detail.join("\n")}\n\n`
        + "Pin every one of them to the same database, or unset the ones you do not mean.",
    );
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) {
    throw new Error("Refusing to seed a production environment.");
  }

  const [{ url }] = set;

  if (/prod/i.test(url)) {
    throw new Error(`Refusing to seed ${redact(url)}: it looks like production.`);
  }
}

/** Settings the application reads and nothing seeds. */
async function seedWorkspaceSettings() {
  const defaults: { key: string; value: string }[] = [
    { key: "weeklyReport.dueWeekday", value: "5" },
    { key: "weeklyReport.dueTime", value: "17:00" },
  ];

  let written = 0;

  for (const setting of defaults) {
    const existing = await prisma.workspaceSetting.findUnique({
      where: { key: setting.key },
      select: { key: true },
    });

    /*
     * Created if absent, left alone if present. An environment where somebody
     * has changed the weekly deadline should keep their answer.
     */
    if (existing) continue;

    await prisma.workspaceSetting.create({ data: setting });
    written += 1;
  }

  return written;
}

async function counts() {
  return {
    pipelines: await prisma.pipeline.count(),
    stages: await prisma.pipelineStage.count(),
    requirements: await prisma.stageRequirement.count(),
    sops: await prisma.sop.count(),
    settings: await prisma.workspaceSetting.count(),
    users: await prisma.user.count(),
    uatCases: await prisma.uatTestCase.count(),
    /* Operational tables. All of these must stay at zero. */
    clients: await prisma.client.count(),
    leads: await prisma.lead.count(),
    contacts: await prisma.contact.count(),
    tasks: await prisma.employeeTask.count(),
    uatRuns: await prisma.uatTestRun.count(),
  };
}

async function main() {
  assertSafeTarget();

  console.log(`Seeding configuration into ${redact(process.env.DATABASE_URL ?? "")}\n`);

  for (const step of STEPS) {
    console.log(`--- ${step.name}`);

    try {
      execFileSync(step.command, step.args, { stdio: "inherit", shell: true });
    } catch {
      console.error(`\nFailed at: ${step.name}`);
      process.exitCode = 1;
      return;
    }

    console.log("");
  }

  console.log("--- Workspace settings");
  console.log(`  ${await seedWorkspaceSettings()} written\n`);

  const result = await counts();

  console.log("=== configuration ===");
  for (const key of ["pipelines", "stages", "requirements", "sops", "settings", "users", "uatCases"] as const) {
    console.log(`  ${String(result[key]).padStart(5)}  ${key}`);
  }

  console.log("\n=== operational (must be zero) ===");
  let dirty = false;

  for (const key of ["clients", "leads", "contacts", "tasks", "uatRuns"] as const) {
    const value = result[key];

    if (value > 0) dirty = true;

    console.log(`  ${String(value).padStart(5)}  ${key}${value > 0 ? "   <-- not a clean baseline" : ""}`);
  }

  console.log(
    dirty
      ? "\nThis environment already holds operational data. It is not a fresh baseline."
      : "\nClean: configuration only, nothing operational.",
  );
}

main().finally(() => prisma.$disconnect());
