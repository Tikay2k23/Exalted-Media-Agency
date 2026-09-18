/**
 * Removes the demo operational data from a database, so real work can start.
 *
 *   npx tsx scripts/clean-demo-data.ts --env-file <file>                # dry run
 *   npx tsx scripts/clean-demo-data.ts --env-file <file> --apply        # delete
 *
 * Optional tiers, off unless asked for:
 *   --include-converted   Kestrel Software: a client converted from a demo
 *                         lead during testing (real action, fake source)
 *   --include-unlinked    demo-style tasks with no client, and the weekly
 *                         reports written during the demo period
 *
 * WHAT COUNTS AS DEMO
 *
 * Not a guess from how a record looks. Every item was traced to how it was
 * made, from production's own records:
 *
 *   - 21 leads created exactly every two days, 3 Jul - 12 Aug, with sources
 *     cycling through every channel in turn and email addresses built from a
 *     truncated business name. Generated.
 *   - 8 clients created in one batch, in the same minute (14 Aug, 19:42).
 *   - The tasks, EOD entries, comments, projects, invoices and access records
 *     attached to those - several dated before the client they belong to.
 *
 * Each list is also bounded by date, so a real client created later under the
 * same name is never touched.
 *
 * WHAT IS NEVER TOUCHED
 *
 * Users. SOPs and their versions. SOP resources. Pipelines and stages. Stage
 * requirements. UAT test cases. Workspace settings. Activity and notifications
 * about anything that is not being deleted - including all SOP governance
 * history. This script names the tables it deletes from; nothing else is
 * reachable from it.
 *
 * SAFETY
 *
 * Dry run unless --apply. Before deleting, every row that will go - including
 * the rows the database will cascade - is written to a JSON backup outside the
 * repository. The delete runs in one transaction: all of it, or none of it.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { config } from "dotenv";

/* --- arguments --- */

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const envFileIndex = args.indexOf("--env-file");
const envFile = envFileIndex >= 0 ? args[envFileIndex + 1] : null;

if (!envFile) {
  console.error("Pass --env-file <file> so it is explicit which database this touches.");
  process.exit(1);
}

/*
 * dotenv rather than node --env-file: Vercel's pulled environment contains a
 * multi-line PEM key that Node's own parser mis-reads, silently dropping the
 * variables after it. dotenv handles it. override so a stray shell variable
 * cannot point this at a different database than the file names.
 */
config({ path: envFile, override: true });

const APPLY = flag("--apply");
const INCLUDE_CONVERTED = flag("--include-converted");
const INCLUDE_UNLINKED = flag("--include-unlinked");

/* --- the manifest --- */

const DEMO_LEAD_BUSINESSES = [
  "Sunny Lane Florist",
  "Redstone Construction",
  "Clearwater Pools",
  "Pinnacle Roofing Co",
  "Old Town Brewing",
  "Maple Grove Childcare",
  "Kestrel Software",
  "Fairview Pet Clinic",
  "Stonebridge Wealth",
  "Riverbend Orthodontics",
  "Anchor Point Insurance",
  "Trailhead Outfitters",
  "Copperfield Interiors",
  "Lakeside Physio",
  "Blue Harbor Marine",
  "Vista Ridge Realty",
  "Golden Crust Bakery",
  "Precision Auto Works",
  "Ironclad Security",
  "Willow Creek Dental",
  "Summit Peak Roofing",
];
/** Every demo lead was created before this. */
const LEADS_BEFORE = new Date("2026-08-15T00:00:00Z");

const DEMO_CLIENT_BATCH = [
  "Best Life Chiropractic",
  "Metro South Chamber",
  "Sunrise Dental Group",
  "Elite Fitness Collective",
  "Harbor Point Legal",
  "Cedar Ridge Landscaping",
  "Brightline Accounting",
  "Northgate Veterinary",
];
/** The batch was created on 14 Aug. */
const BATCH_FROM = new Date("2026-08-14T00:00:00Z");
const BATCH_TO = new Date("2026-08-15T00:00:00Z");

const CONVERTED_CLIENT = "Kestrel Software";
const CONVERTED_BEFORE = new Date("2026-09-01T00:00:00Z");

/** Demo-style tasks with no client, all written during the demo period. */
const UNLINKED_TASK_TITLES = [
  "Follow up the Stonebridge proposal",
  "Connect the booking calendar to the CRM",
  "Prepare the Kestrel negotiation terms",
  "Review agency margin by service line",
  "Audit the Google Ads search terms",
  "Update the client onboarding SOP",
];
const UNLINKED_BEFORE = new Date("2026-08-20T00:00:00Z");
const REPORTS_BEFORE = new Date("2026-08-31T00:00:00Z");

async function main() {
  const { prisma } = await import("@/lib/prisma");

  const [target] = await prisma.$queryRaw<{ db: string; users: bigint }[]>`
    select current_database() as db, (select count(*) from "User")::bigint as users`;
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@([^/:]+).*$/, "$1") || "(unknown host)";

  console.log(`\nTarget: ${target.db} on ${host} (${target.users} users)`);
  console.log(APPLY ? "Mode:   APPLY - rows will be deleted\n" : "Mode:   dry run - nothing will be deleted\n");

  /* --- resolve the manifest to ids --- */

  const leads = await prisma.lead.findMany({
    where: { businessName: { in: DEMO_LEAD_BUSINESSES }, createdAt: { lt: LEADS_BEFORE } },
    select: { id: true, businessName: true },
  });

  const batchClients = await prisma.client.findMany({
    where: { companyName: { in: DEMO_CLIENT_BATCH }, createdAt: { gte: BATCH_FROM, lt: BATCH_TO } },
    select: { id: true, companyName: true },
  });

  /*
   * Only a client that one of the demo leads was converted into - identified by
   * the conversion itself, not by the name, so a real client that happens to be
   * called the same thing is never matched.
   */
  const convertedIds = INCLUDE_CONVERTED
    ? (
        await prisma.lead.findMany({
          where: { id: { in: leads.map((l) => l.id) }, convertedClientId: { not: null } },
          select: { convertedClientId: true },
        })
      ).map((lead) => lead.convertedClientId as string)
    : [];

  const convertedClients = convertedIds.length
    ? await prisma.client.findMany({
        where: { id: { in: convertedIds }, companyName: CONVERTED_CLIENT, createdAt: { lt: CONVERTED_BEFORE } },
        select: { id: true, companyName: true },
      })
    : [];

  const clients = [...batchClients, ...convertedClients];
  const clientIds = clients.map((c) => c.id);
  const leadIds = leads.map((l) => l.id);

  const linkedTasks = await prisma.employeeTask.findMany({
    where: { OR: [{ clientId: { in: clientIds } }, { leadId: { in: leadIds } }] },
    select: { id: true, title: true },
  });

  const unlinkedTasks = INCLUDE_UNLINKED
    ? await prisma.employeeTask.findMany({
        where: { title: { in: UNLINKED_TASK_TITLES }, clientId: null, createdAt: { lt: UNLINKED_BEFORE } },
        select: { id: true, title: true },
      })
    : [];

  const tasks = [...linkedTasks, ...unlinkedTasks.filter((t) => !linkedTasks.some((l) => l.id === t.id))];
  const taskIds = tasks.map((t) => t.id);

  const weeklyReports = INCLUDE_UNLINKED
    ? await prisma.weeklyReport.findMany({
        where: { createdAt: { lt: REPORTS_BEFORE } },
        select: { id: true },
      })
    : [];
  const reportIds = weeklyReports.map((r) => r.id);

  /* Everything whose loose entityId points at something being deleted. */
  const deletedEntityIds = [...clientIds, ...leadIds, ...taskIds, ...reportIds];

  /*
   * Projects and invoices cascade from the client, but activity and
   * notifications about them carry the project's or invoice's own id - so
   * those ids join the match list too.
   */
  const [projects, invoices] = await Promise.all([
    prisma.project.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } }),
    prisma.invoice.findMany({ where: { clientId: { in: clientIds } }, select: { id: true } }),
  ]);
  const looseIds = [...deletedEntityIds, ...projects.map((p) => p.id), ...invoices.map((i) => i.id)];

  const [notificationCount, activityCount] = await Promise.all([
    prisma.notification.count({ where: { entityId: { in: looseIds } } }),
    prisma.activityLog.count({ where: { entityId: { in: looseIds } } }),
  ]);

  /* --- report --- */

  console.log(`Leads (${leads.length}): ${leads.map((l) => l.businessName).join(", ") || "none"}`);
  console.log(`Clients (${clients.length}): ${clients.map((c) => c.companyName).join(", ") || "none"}`);
  console.log(`Tasks (${tasks.length})${INCLUDE_UNLINKED ? ` - ${unlinkedTasks.length} of them unlinked` : ""}`);
  if (INCLUDE_UNLINKED) console.log(`Weekly reports (${weeklyReports.length})`);
  console.log(`Notifications about them: ${notificationCount}`);
  console.log(`Activity log entries about them: ${activityCount}`);

  /* Rows the database will cascade, counted so nothing is a surprise. */
  const cascaded = await cascadeCounts(prisma, { clientIds, leadIds, taskIds });
  console.log("\nAlso removed by the database's own cascades:");
  for (const [table, count] of Object.entries(cascaded)) {
    if (count) console.log(`  ${table.padEnd(26)} ${count}`);
  }

  if (!APPLY) {
    console.log("\nDry run complete. Nothing was deleted. Re-run with --apply to delete.\n");
    return;
  }

  if (!deletedEntityIds.length) {
    console.log("\nNothing to delete.\n");
    return;
  }

  /* --- backup --- */

  const backupDir = join(homedir(), "exalted-backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `demo-cleanup-${target.db}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  const backup = await buildBackup(prisma, { clientIds, leadIds, taskIds, reportIds, looseIds });
  writeFileSync(backupPath, JSON.stringify(backup, null, 1));
  console.log(`\nBackup written: ${backupPath}`);

  /* --- delete, all or nothing --- */

  await prisma.$transaction(
    async (tx) => {
      await tx.notification.deleteMany({ where: { entityId: { in: looseIds } } });
      await tx.activityLog.deleteMany({ where: { entityId: { in: looseIds } } });
      /* Tasks first: they only set-null against clients and leads, so they must go explicitly. */
      await tx.employeeTask.deleteMany({ where: { id: { in: taskIds } } });
      await tx.weeklyReport.deleteMany({ where: { id: { in: reportIds } } });
      await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
      await tx.client.deleteMany({ where: { id: { in: clientIds } } });
    },
    { timeout: 120_000 },
  );

  console.log("Deleted. Users, SOPs, resources, pipelines and settings were not touched.\n");
}

/* --- helpers --- */

type Prisma = (typeof import("@/lib/prisma"))["prisma"];

/** The CASCADE children of the three parents, read from the database itself. */
async function cascadeChildren(prisma: Prisma, parent: string) {
  return prisma.$queryRaw<{ child: string; col: string }[]>`
    select tc.table_name as child, kcu.column_name as col
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
    join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and rc.delete_rule = 'CASCADE' and ccu.table_name = ${parent}`;
}

async function rowsWhere(prisma: Prisma, table: string, col: string, ids: string[]) {
  if (!ids.length) return [];
  /* Identifiers come from information_schema, never from input. */
  return prisma.$queryRawUnsafe<{ row: Record<string, unknown> }[]>(
    `select to_jsonb(t) as row from "${table.replace(/"/g, "")}" t where t."${col.replace(/"/g, "")}" = any($1::text[])`,
    ids,
  );
}

async function cascadeCounts(prisma: Prisma, ids: { clientIds: string[]; leadIds: string[]; taskIds: string[] }) {
  const counts: Record<string, number> = {};
  const add = (table: string, n: number) => (counts[table] = (counts[table] ?? 0) + n);

  for (const [parent, list] of [["Client", ids.clientIds], ["Lead", ids.leadIds], ["EmployeeTask", ids.taskIds]] as const) {
    for (const { child, col } of await cascadeChildren(prisma, parent)) {
      const rows = await rowsWhere(prisma, child, col, list);
      add(child, rows.length);

      /* Second level: payments under invoices, milestones under projects. */
      if (child === "Invoice" || child === "Project") {
        const childIds = rows.map((r) => String(r.row.id));
        for (const grand of await cascadeChildren(prisma, child)) {
          add(grand.child, (await rowsWhere(prisma, grand.child, grand.col, childIds)).length);
        }
      }
    }
  }

  return counts;
}

async function buildBackup(
  prisma: Prisma,
  ids: { clientIds: string[]; leadIds: string[]; taskIds: string[]; reportIds: string[]; looseIds: string[] },
) {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const push = (table: string, rows: { row: Record<string, unknown> }[]) =>
    (tables[table] = [...(tables[table] ?? []), ...rows.map((r) => r.row)]);

  push("Client", await rowsWhere(prisma, "Client", "id", ids.clientIds));
  push("Lead", await rowsWhere(prisma, "Lead", "id", ids.leadIds));
  push("EmployeeTask", await rowsWhere(prisma, "EmployeeTask", "id", ids.taskIds));
  push("WeeklyReport", await rowsWhere(prisma, "WeeklyReport", "id", ids.reportIds));
  push("Notification", await rowsWhere(prisma, "Notification", "entityId", ids.looseIds));
  push("ActivityLog", await rowsWhere(prisma, "ActivityLog", "entityId", ids.looseIds));

  for (const [parent, list] of [["Client", ids.clientIds], ["Lead", ids.leadIds], ["EmployeeTask", ids.taskIds]] as const) {
    for (const { child, col } of await cascadeChildren(prisma, parent)) {
      const rows = await rowsWhere(prisma, child, col, list);
      push(child, rows);
      if (child === "Invoice" || child === "Project") {
        const childIds = rows.map((r) => String(r.row.id));
        for (const grand of await cascadeChildren(prisma, child)) {
          push(grand.child, await rowsWhere(prisma, grand.child, grand.col, childIds));
        }
      }
    }
  }

  return { takenAt: new Date().toISOString(), tables };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  });
