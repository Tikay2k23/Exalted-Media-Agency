/**
 * Creates one active account per seat on the six-person team.
 *
 * Run with: npm run db:seed-team
 *
 * This is a convenience for setting up and demonstrating a workspace. It is
 * kept out of the required seed on purpose, so `npm run db:seed` never invents
 * staff in a live workspace.
 *
 * Every account is created with the same development password, which is only
 * usable outside production. Real accounts should be created through
 * Users -> New user so each person sets their own.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const isProduction =
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV);

if (isProduction) {
  console.error(
    "[seed-team] Refusing to run against a production environment. "
      + "Create real accounts through the Users page instead.",
  );
  process.exit(1);
}

const connectionString =
  process.env.DIRECT_URL
  ?? process.env.PRISMA_DATABASE_URL
  ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[seed-team] No database connection string configured.");
  process.exit(1);
}

const password = process.env.TEAM_SEED_PASSWORD?.trim() || "ExaltedLocal123!";

/** name, email local part, seat, access tier, department */
const team = [
  ["Agency Owner", "owner", "AGENCY_OWNER", "OWNER", "OPERATIONS"],
  ["Sales Representative", "sales", "SALES_REP", "TEAM_MEMBER", "SALES"],
  ["Project Manager", "pm", "PROJECT_MANAGER", "MANAGER", "OPERATIONS"],
  ["Automation Specialist", "automation", "AUTOMATION_SPECIALIST", "TEAM_MEMBER", "WEB_DEVELOPMENT"],
  ["Creative Specialist", "creative", "CREATIVE_SPECIALIST", "TEAM_MEMBER", "CREATIVE"],
  ["Ads and Reporting Specialist", "ads", "ADS_SPECIALIST", "TEAM_MEMBER", "PAID_MEDIA"],
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const passwordHash = await hash(password, 12);
  let created = 0;
  let existing = 0;

  for (const [name, local, teamRole, role, department] of team) {
    const email = `${local}@theexaltedmedia.com`;

    const found = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (found) {
      // Never reset a password or reassign a seat on an account that is
      // already in use.
      existing += 1;
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

  console.log(
    `\n[seed-team] ${created} account(s) created, ${existing} already existed.`,
  );

  if (created > 0) {
    console.log(`[seed-team] Every new account signs in with: ${password}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
