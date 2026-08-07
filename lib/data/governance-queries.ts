import { prisma } from "@/lib/prisma";

/**
 * Everything the Governance page needs, in one round trip per concern.
 *
 * Kept out of queries.ts because governance is agency-level rather than
 * per-client, and mixing the two would mean every client page paid for data it
 * never shows.
 */
export async function getGovernanceOverview() {
  const [sops, audits, correctiveActions, improvements, training, team] =
    await Promise.all([
      prisma.sop.findMany({
        orderBy: { reference: "asc" },
        include: {
          owner: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
          versions: {
            orderBy: { publishedAt: "desc" },
            take: 1,
            select: { version: true, publishedAt: true, authorId: true },
          },
          _count: { select: { versions: true } },
        },
      }),
      prisma.audit.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          auditor: { select: { id: true, name: true } },
          client: { select: { id: true, companyName: true } },
          findings: {
            orderBy: { createdAt: "desc" },
            include: { correctiveActions: { select: { id: true, status: true } } },
          },
        },
      }),
      prisma.correctiveAction.findMany({
        orderBy: [{ closedAt: "asc" }, { dueDate: "asc" }],
        take: 40,
        include: {
          owner: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
          finding: { select: { id: true, title: true } },
        },
      }),
      prisma.improvementRequest.findMany({
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 40,
        include: {
          owner: { select: { id: true, name: true } },
          raisedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.trainingRecord.findMany({
        orderBy: [{ certificationExpiresAt: "asc" }, { createdAt: "desc" }],
        include: {
          user: { select: { id: true, name: true, teamRole: true } },
          trainer: { select: { id: true, name: true } },
        },
      }),
      prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, teamRole: true },
      }),
    ]);

  return { sops, audits, correctiveActions, improvements, training, team };
}
