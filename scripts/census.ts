import "dotenv/config";

import { prisma } from "@/lib/prisma";

/**
 * A count of everything a test suite could leave behind.
 *
 * Run before and after `npm test`: the two must match. A suite that cleans up
 * after itself is the difference between a database that stays usable and one
 * that accumulates fixtures until somebody has to sort it out by hand.
 */
async function main() {
  const census = {
    contacts: await prisma.contact.count(),
    leads: await prisma.lead.count(),
    clients: await prisma.client.count(),
    users: await prisma.user.count(),
    tasks: await prisma.employeeTask.count(),
    projects: await prisma.project.count(),
    sops: await prisma.sop.count(),
    notifications: await prisma.notification.count(),
    activity: await prisma.activityLog.count(),
    uatCases: await prisma.uatTestCase.count(),
    uatRuns: await prisma.uatTestRun.count(),
  };

  console.log(JSON.stringify(census));
}

main().finally(() => prisma.$disconnect());
