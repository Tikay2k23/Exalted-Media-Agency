import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

/**
 * Fills the team seats that nobody holds yet.
 *
 * Deliberately not seed-team.mjs, which creates all six including generic
 * owner@ and pm@ accounts. Those two seats belong to real people here, and a
 * second account holding the same seat makes "who owns this" ambiguous in
 * every assignment dropdown and every report.
 *
 * Never touches an account that already exists - no password reset, no seat
 * reassignment - so running it twice is safe and running it against a live
 * workspace cannot lock anybody out.
 *
 * The password comes from SEAT_PASSWORD and is hashed before it is stored. It
 * is never written to the console, and the plain value never touches the
 * database.
 */

const databaseUrlKeys = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "PRISMA_DATABASE_URL",
  "DIRECT_URL",
];

const connectionString = databaseUrlKeys
  .map((key) => process.env[key])
  .find((value) => typeof value === "string" && value.length > 0);

if (!connectionString) {
  console.error("[seats] No database connection string configured.");
  process.exit(1);
}

const password = process.env.SEAT_PASSWORD?.trim();

if (!password) {
  console.error("[seats] SEAT_PASSWORD is not set. Refusing to invent one.");
  process.exit(1);
}

/** name, email local part, seat, access tier, department */
const seats = [
  ["Sales Representative", "sales", "SALES_REP", "TEAM_MEMBER", "SALES"],
  [
    "Automation Specialist",
    "automation",
    "AUTOMATION_SPECIALIST",
    "TEAM_MEMBER",
    "WEB_DEVELOPMENT",
  ],
  ["Creative Specialist", "creative", "CREATIVE_SPECIALIST", "TEAM_MEMBER", "CREATIVE"],
  ["Ads and Reporting Specialist", "ads", "ADS_SPECIALIST", "TEAM_MEMBER", "PAID_MEDIA"],
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const passwordHash = await hash(password, 12);

  let created = 0;
  let existing = 0;

  for (const [name, local, teamRole, role, department] of seats) {
    const email = `${local}@theexaltedmedia.com`;

    const found = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (found) {
      existing += 1;
      console.log(`  exists   ${email.padEnd(38)} left untouched`);
      continue;
    }

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        teamRole,
        department,
        jobTitle: name,
        weeklyCapacityHours: 40,
        isActive: true,
      },
    });

    created += 1;
    console.log(`  created  ${email.padEnd(38)} ${teamRole}`);
  }

  console.log(`\n[seats] ${created} created, ${existing} already existed.`);

  const all = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: { email: true, name: true, teamRole: true, role: true },
    orderBy: { teamRole: "asc" },
  });

  console.log(`\nEvery active account (${all.length}):`);
  for (const user of all) {
    console.log(`  ${user.email.padEnd(36)} ${user.name.padEnd(30)} ${user.teamRole} / ${user.role}`);
  }

  await prisma.$disconnect();
}

void main();
