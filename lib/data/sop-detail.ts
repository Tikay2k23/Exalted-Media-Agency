import { sopNumber } from "@/lib/governance/sop-document";
import { isSopReviewOverdue } from "@/lib/governance/sop-service";
import { prisma } from "@/lib/prisma";

/**
 * Everything one SOP's detail page needs.
 *
 * Deliberately does not load every version body. History can run to dozens of
 * versions of a document that is thousands of words long, and the page shows
 * exactly one of them - the current text. The rest are listed by version,
 * date, author and change note, and only fetched when somebody opens one.
 */

/** The version list, without the text of each version. */
export interface SopVersionSummary {
  id: string;
  version: string;
  changeNote: string | null;
  publishedAt: string;
  authorId: string | null;
  authorName: string | null;
  /** True for the version the SOP currently points at. */
  isCurrent: boolean;
}

export interface SopNeighbour {
  reference: string;
  title: string;
  status: string;
}

export interface SopGovernanceEvent {
  id: string;
  action: string;
  actorName: string | null;
  at: string;
}

export async function getSopDetail(reference: string) {
  const sop = await prisma.sop.findUnique({
    where: { reference },
    select: {
      id: true,
      reference: true,
      title: true,
      summary: true,
      status: true,
      currentVersion: true,
      effectiveDate: true,
      lastReviewedAt: true,
      nextReviewAt: true,
      approvedAt: true,
      owner: { select: { id: true, name: true, teamRole: true, jobTitle: true } },
      approvedBy: { select: { id: true, name: true } },
      versions: {
        orderBy: { publishedAt: "desc" },
        /* Metadata only - see the note at the top of this file. */
        select: {
          id: true,
          version: true,
          changeNote: true,
          publishedAt: true,
          authorId: true,
          author: { select: { name: true } },
        },
      },
    },
  });

  if (!sop) return null;

  /*
   * The procedure before this one, for its completion criteria.
   *
   * The ten SOPs are the client lifecycle in order, so what the previous one
   * completes on is what has to be true before this one starts. That is a real
   * entry condition rather than a guess, and reading it from that document
   * keeps it in one place: change SOP-02's completion and SOP-03's entry
   * criteria change with it.
   */
  const number = sopNumber(sop.reference);
  const previousReference =
    number !== null && number > 1 ? `SOP-${String(number - 1).padStart(2, "0")}` : null;

  const [currentVersion, neighbours, events, previous] = await Promise.all([
    /*
     * The text, fetched on its own so the version list above stays cheap.
     * Newest rather than "the one matching currentVersion": publishing writes
     * the version row and updates the pointer in one transaction, so they
     * agree, and ordering by date is the same answer without a second lookup.
     */
    prisma.sopVersion.findFirst({
      where: { sopId: sop.id },
      orderBy: { publishedAt: "desc" },
      select: { id: true, version: true, content: true, publishedAt: true },
    }),

    /* Ten rows with no bodies: cheap enough to read whole for the rail. */
    prisma.sop.findMany({
      orderBy: { reference: "asc" },
      select: { reference: true, title: true, status: true },
    }),

    /*
     * Approvals and reviews, which are recorded as activity rather than in a
     * table of their own. That is where recordSopReview and activateSop
     * already write, so reading it here keeps one history rather than
     * starting a second one that would immediately disagree.
     */
    prisma.activityLog.findMany({
      where: { entityType: "SYSTEM", entityId: sop.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),

    previousReference
      ? prisma.sopVersion.findFirst({
          where: { sop: { reference: previousReference } },
          orderBy: { publishedAt: "desc" },
          select: { content: true },
        })
      : Promise.resolve(null),
  ]);

  const versions: SopVersionSummary[] = sop.versions.map((version, index) => ({
    id: version.id,
    version: version.version,
    changeNote: version.changeNote,
    publishedAt: version.publishedAt.toISOString(),
    authorId: version.authorId,
    authorName: version.author?.name ?? null,
    isCurrent: index === 0,
  }));

  return {
    id: sop.id,
    reference: sop.reference,
    title: sop.title,
    summary: sop.summary,
    status: sop.status,
    currentVersion: sop.currentVersion,
    effectiveDate: sop.effectiveDate?.toISOString() ?? null,
    lastReviewedAt: sop.lastReviewedAt?.toISOString() ?? null,
    nextReviewAt: sop.nextReviewAt?.toISOString() ?? null,
    /* Derived here rather than in the view: the rule lives in
       sop-service, and a component reading the clock during render is
       both impure and a second opinion about what overdue means. */
    reviewOverdue: isSopReviewOverdue(sop),
    approvedAt: sop.approvedAt?.toISOString() ?? null,
    ownerName: sop.owner?.name ?? null,
    ownerRole: sop.owner?.jobTitle ?? sop.owner?.teamRole ?? null,
    approvedByName: sop.approvedBy?.name ?? null,
    content: currentVersion?.content ?? "",
    /* The previous procedure's text, only for its completion section. */
    previousReference,
    previousContent: previous?.content ?? null,
    versions,
    versionCount: versions.length,
    neighbours: neighbours as SopNeighbour[],
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      actorName: event.actor?.name ?? null,
      at: event.createdAt.toISOString(),
    })) as SopGovernanceEvent[],
  };
}

export type SopDetail = NonNullable<Awaited<ReturnType<typeof getSopDetail>>>;

/** One historical version's text, loaded only when somebody opens it. */
export async function getSopVersionContent(sopId: string, versionId: string) {
  return prisma.sopVersion.findFirst({
    where: { id: versionId, sopId },
    select: {
      id: true,
      version: true,
      content: true,
      changeNote: true,
      publishedAt: true,
      author: { select: { name: true } },
    },
  });
}
