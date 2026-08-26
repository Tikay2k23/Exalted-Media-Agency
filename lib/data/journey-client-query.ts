import { type ServiceType } from "@prisma/client";

import {
  a2pInPlay,
  a2pReadiness,
  type A2PProfileShape,
} from "@/lib/a2p/a2p-readiness";
import { type AuthContext } from "@/lib/authz";
import {
  buildJourneyAccount,
  journeyAccountSelect,
  type StageForAccount,
  type StageRule,
} from "@/lib/data/journey-queries";
import { deriveIntakeProgress } from "@/lib/intake/question-catalogue";
import {
  type DetailContact,
  type DetailTask,
  type JourneyClientDetail,
  type JourneyFlag,
  type OnboardingDetail,
  type TimelineMilestone,
} from "@/lib/journey/client-detail";
import { contactsToChase } from "@/lib/journey/contacts-to-chase";
import {
  type JourneyAccount,
  type JourneyActivityEntry,
} from "@/lib/journey/journey-board";
import {
  onboardingFocus,
  sortOutstanding,
  type IntakeSnapshot,
} from "@/lib/journey/onboarding-focus";
import {
  collectOutstanding,
  waitingOnClient,
  type RequirementRow,
} from "@/lib/journey/onboarding-readiness";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * One client's journey page, in three queries.
 *
 * The account is built by the same function the board uses, from the same
 * selection, so a card saying 68% and this page saying 68% is guaranteed
 * rather than coincidental. Only the detail the board has no use for -
 * contacts, the task list itself, raised flags, the activity feed - is added
 * on top.
 */

export interface JourneyClientDetailResult {
  detail: JourneyClientDetail | null;
  /** True when the client exists but this user may not see it. */
  forbidden: boolean;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function activityKind(action: string): JourneyActivityEntry["kind"] {
  const text = action.toLowerCase();

  if (text.includes("overrid")) return "override";
  if (text.includes("moved") || text.includes("stage")) return "stage";
  if (text.includes("block")) return "blocker";
  if (text.includes("approv") || text.includes("review")) return "approval";
  if (text.includes("asset") || text.includes("access") || text.includes("upload")) {
    return "asset";
  }
  if (text.includes("milestone")) return "milestone";

  return "other";
}

export async function getJourneyClientDetail(
  actor: AuthContext,
  clientId: string,
): Promise<JourneyClientDetailResult> {
  const seesEverything = can(actor, "clients.view.all");
  /* One clock for the whole page, so nothing derived from it disagrees. */
  const now = new Date();

  try {
    const [stages, client] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { pipelineId: FULFILLMENT_PIPELINE_ID, isDeprecated: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          position: true,
          // So the upcoming-stage card can say what entering it will do.
          stageKey: true,
          requirements: {
            orderBy: { position: "asc" },
            select: { requirementKey: true, label: true, isBlocking: true },
          },
        },
      }),
      prisma.client.findFirst({
        where: {
          id: clientId,
          deletedAt: null,
          ...(seesEverything ? {} : { assignedUserId: actor.id }),
        },
        select: {
          /*
           * The board's selection, widened where this page needs more of the
           * same relation. Spreading rather than restating keeps the account
           * fields in one place; the overrides below are supersets, so every
           * stage-gate checker still gets what it reads.
           */
          ...journeyAccountSelect,
          /*
           * The onboarding picture, from the systems that already own it.
           *
           * Six relations, none of them new. The focus card, the chase list
           * and the readiness summary are all derived from these rows, so
           * there is no table anywhere recording what is outstanding - the
           * answer is recomputed from the records that decide it.
           */
          contactEmail: true,
          contactPhone: true,
          /* Seats, so the card can tell a project manager from a job title. */
          assignedUser: { select: { id: true, name: true, teamRole: true } },
          projects: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              serviceType: true,
              projectManagerId: true,
              targetLaunchDate: true,
              projectManager: { select: { name: true, teamRole: true } },
              milestones: {
                orderBy: { dueDate: "asc" },
                select: { id: true, name: true, dueDate: true, completedAt: true },
              },
            },
          },
          /* Supersets of the board's selection - same rows, more columns. */
          accessRecords: {
            select: {
              id: true,
              platform: true,
              platformLabel: true,
              status: true,
              isCritical: true,
              requestedAt: true,
            },
          },
          reviewCycles: {
            select: {
              id: true,
              roundNumber: true,
              status: true,
              sentAt: true,
              feedbackDeadline: true,
              approverContactId: true,
              project: { select: { name: true } },
            },
          },
          intakeForm: {
            select: {
              status: true,
              answers: true,
              sentAt: true,
              viewedAt: true,
              lastSavedAt: true,
              submittedAt: true,
              reviewedAt: true,
              reopenedAt: true,
              expiresAt: true,
              reviewNotes: true,
              reviewedBy: { select: { name: true } },
            },
          },
          assets: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              isRequired: true,
              requestedAt: true,
            },
          },
          a2pProfile: {
            include: { samples: { select: { category: true, body: true } } },
          },
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              isPrimary: true,
              isApprover: true,
              status: true,
            },
          },
          agencyTasks: {
            where: { deletedAt: null },
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              priority: true,
              assignedToId: true,
              dueDate: true,
              estimatedHours: true,
              actualHours: true,
              assignedTo: { select: { name: true } },
            },
          },
          journeyFlags: {
            /*
             * Open conditions, plus every pause whether it is over or not.
             *
             * The pause arm is not optional. pausedDaysInStage sums closed
             * periods as well as running ones, so filtering to resolvedAt:
             * null handed it only the pauses still in progress and this page
             * quietly reported fewer paused days than the board did for the
             * same account. The board's own selection takes every PAUSED row;
             * this is the same set, widened rather than narrowed.
             */
            where: { OR: [{ resolvedAt: null }, { kind: "PAUSED" }] },
            orderBy: { raisedAt: "desc" },
            select: {
              id: true,
              kind: true,
              contactId: true,
              reason: true,
              detail: true,
              responsibleParty: true,
              dueAt: true,
              round: true,
              raisedAt: true,
              lastFollowUpAt: true,
              followUpCount: true,
              receivedAt: true,
              resolvedAt: true,
              cancelledAt: true,
              severity: true,
              impact: true,
              expectedResolutionAt: true,
              requirementKey: true,
              raisedBy: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    if (!client) {
      return { detail: null, forbidden: false };
    }

    const requirementsByStageId = new Map<string, StageRule[]>(
      stages.map((stage) => [stage.id, stage.requirements]),
    );

    const liveStages: StageForAccount[] = stages;

    const account = buildJourneyAccount(client, requirementsByStageId, liveStages);
    const stageSteps = liveStages
      .map((stage) => ({ id: stage.id, name: stage.name, position: stage.position }))
      .sort((a, b) => a.position - b.position);

    const tasks: DetailTask[] = client.agencyTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate.toISOString(),
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      assigneeName: task.assignedTo?.name ?? null,
    }));

    const active = client.contacts.filter(
      // Deactivated contacts keep their history but are not people to ring.
      (contact) => contact.status === "ACTIVE",
    );

    /*
     * The account's own contact, where there is no contact record at all.
     *
     * Client.clientName, contactEmail and contactPhone are filled in when the
     * account is created; a ClientContact row is something somebody adds
     * afterwards, and plenty of accounts never get one. Reading only the rows
     * left this card showing the person's name - which falls back to
     * clientName - beside "not recorded" for the address printed in the header
     * a few inches above, and would have greyed out the chase buttons for a
     * client we can plainly reach.
     *
     * Not a contact record and not pretending to be one: the id says so, and
     * the stage requirement that wants a real primary contact on file is
     * evaluated from the rows and stays unmet, which is correct.
     */
    const ACCOUNT_CONTACT_ID = "account-contact";

    /*
     * Who the page will treat as the primary contact.
     *
     * The flag where somebody set it, and otherwise the first contact on the
     * account - which is what every card here already falls back to. Worked
     * out once, because the fallback below has to apply to the same person the
     * card names, and gating it on the flag alone left an account whose flag
     * was never set showing "not recorded" beside a header showing the
     * address, with the chase buttons greyed out for a client we can plainly
     * reach.
     */
    const effectivePrimaryId =
      (active.find((contact) => contact.isPrimary) ?? active[0])?.id ?? null;

    const contacts: DetailContact[] = active.length === 0
      ? [
          {
            id: ACCOUNT_CONTACT_ID,
            name: client.clientName,
            email: client.contactEmail,
            phone: client.contactPhone,
            role: null,
            isPrimary: true,
            isApprover: false,
          },
        ]
      : active.map((contact) => {
          /*
           * A row that repeats the account contact with the address left
           * blank borrows it, so the same person is not half-reachable.
           */
          const isEffectivePrimary = contact.id === effectivePrimaryId;

          return {
            id: contact.id,
            name: contact.name,
            email: contact.email ?? (isEffectivePrimary ? client.contactEmail : null),
            phone: contact.phone ?? (isEffectivePrimary ? client.contactPhone : null),
            role: contact.role,
            isPrimary: contact.isPrimary,
            isApprover: contact.isApprover,
          };
        });

    /*
     * Open conditions only.
     *
     * The selection above deliberately also fetches closed pauses, because the
     * stage clock needs them. Nothing else does, and a resolved flag in this
     * list would show up as a live problem on the page.
     */
    const flags: JourneyFlag[] = client.journeyFlags
      .filter((flag) => flag.resolvedAt === null)
      .map((flag) => ({
        id: flag.id,
        kind: flag.kind,
        reason: flag.reason,
        detail: flag.detail,
        responsibleParty: flag.responsibleParty,
        dueAt: iso(flag.dueAt),
        round: flag.round,
        raisedByName: flag.raisedBy?.name ?? null,
        raisedAt: flag.raisedAt.toISOString(),
        lastFollowUpAt: iso(flag.lastFollowUpAt),
        followUpCount: flag.followUpCount,
        receivedAt: iso(flag.receivedAt),
        resolvedAt: iso(flag.resolvedAt),
        cancelledAt: iso(flag.cancelledAt),
        severity: flag.severity,
        impact: flag.impact,
        expectedResolutionAt: iso(flag.expectedResolutionAt),
        requirementKey: flag.requirementKey,
        contactId: flag.contactId,
      }));

    /*
     * The milestone rail.
     *
     * Built from the account's own milestone list so the page and the board
     * agree on what is due. The current one is the earliest that is not yet
     * done - the thing the team is working towards, which is what the rail is
     * for.
     */
    const ordered = [...account.milestones].sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
    );
    const currentId = ordered.find((milestone) => !milestone.completed)?.id ?? null;

    const milestones: TimelineMilestone[] = ordered.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      dueAt: milestone.dueAt,
      completed: milestone.completed,
      isCurrent: milestone.id === currentId,
      source: milestone.source,
    }));

    const activityRows = await prisma.activityLog.findMany({
      where: { entityType: { in: ["PIPELINE", "CLIENT"] }, entityId: client.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    });

    const activity: JourneyActivityEntry[] = activityRows.map((row) => ({
      id: row.id,
      clientId: client.id,
      companyName: client.companyName,
      action: row.action,
      actorName: row.actor?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      kind: activityKind(row.action),
    }));

    const launch = client.projects
      .filter((project) => project.targetLaunchDate)
      .sort(
        (a, b) =>
          (a.targetLaunchDate?.getTime() ?? 0) - (b.targetLaunchDate?.getTime() ?? 0),
      )[0];

    const onboarding = buildOnboardingDetail({
      client,
      account,
      contacts,
      flags,
      milestones,
      canEdit: can(actor, "clients.edit"),
      now,
    });

    return {
      detail: {
        account,
        onboarding,
        stages: stageSteps,
        flags,
        tasks,
        contacts,
        milestones,
        activity,
        projectStartDate: iso(client.contractStartDate),
        targetLaunchDate: iso(launch?.targetLaunchDate),
        renewalDate: iso(client.renewalDate) ?? iso(client.contractEndDate),
        canMove: can(actor, "journey.move"),
        canOverride: can(actor, "journey.override"),
        // Raising and clearing a secondary status is delivery coordination,
        // which is what clients.edit already covers.
        canManageFlags: can(actor, "clients.edit"),
      },
      forbidden: false,
    };
  } catch (error) {
    console.error("[journey-client-query] Failed to load the client journey.", error);
    return { detail: null, forbidden: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Review cycles the client has been sent and has not answered.
 *
 * The two statuses that mean the ball is in their court. Anything else is
 * either not out yet or already back, and neither is something to chase them
 * about.
 */
const AWAITING_CLIENT = new Set(["SENT", "AWAITING_FEEDBACK"]);

/**
 * Seats that can hold an account.
 *
 * A project's projectManager column is what the stage gate checks, and it will
 * accept anybody - on at least one live account it holds a creative
 * specialist. Naming that person the project manager is how a card ends up
 * answering "who owns this" with a job title nobody would recognise as an
 * owner, so the seat is checked before the name is used.
 */
const MANAGER_SEATS = new Set(["PROJECT_MANAGER", "AGENCY_OWNER"]);

function projectManagerFor(client: {
  assignedUser: { name: string | null; teamRole: string } | null;
  projects: { projectManager: { name: string | null; teamRole: string } | null }[];
}) {
  /*
   * The account assignment first. That is the ownership record - who the
   * agency says runs this client - and the project column is a per-project
   * detail that may name a specialist doing the building.
   */
  const assigned = client.assignedUser;

  if (assigned?.name && MANAGER_SEATS.has(assigned.teamRole)) {
    return { name: assigned.name, seat: assigned.teamRole };
  }

  const managed = client.projects.find(
    (project) =>
      project.projectManager?.name && MANAGER_SEATS.has(project.projectManager.teamRole),
  )?.projectManager;

  if (managed?.name) return { name: managed.name, seat: managed.teamRole };

  // Nobody holding the seat. "Not assigned" is what prompts somebody to fix it.
  return null;
}

/** Only what the onboarding derivation reads. */
interface OnboardingSource {
  serviceType: ServiceType;
  contactEmail: string;
  assignedUser: { name: string | null; teamRole: string } | null;
  projects: { projectManager: { name: string | null; teamRole: string } | null }[];
  intakeForm: {
    status: string;
    answers: unknown;
    sentAt: Date | null;
    viewedAt: Date | null;
    lastSavedAt: Date | null;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    reopenedAt: Date | null;
    expiresAt: Date | null;
    reviewNotes: string | null;
    reviewedBy: { name: string | null } | null;
  } | null;
  accessRecords: {
    id: string;
    platform: string;
    platformLabel: string | null;
    status: string;
    isCritical: boolean;
    requestedAt: Date | null;
  }[];
  assets: {
    id: string;
    name: string;
    type: string;
    status: string;
    isRequired: boolean;
    requestedAt: Date | null;
  }[];
  reviewCycles: {
    id: string;
    roundNumber: number;
    status: string;
    sentAt: Date | null;
    feedbackDeadline: Date | null;
    approverContactId: string | null;
    project: { name: string } | null;
  }[];
  a2pProfile: (A2PProfileShape & { samples: { category: string; body: string }[] }) | null;
}

/**
 * The whole onboarding picture, from records that already exist.
 *
 * Assembled server-side and handed down whole. The alternative - each card
 * fetching its own slice - is how the focus card ends up claiming three
 * outstanding items while the drawer it opens lists four, because they ran
 * their counts a second apart against different queries.
 */
function buildOnboardingDetail(input: {
  client: OnboardingSource;
  account: JourneyAccount;
  contacts: DetailContact[];
  flags: JourneyFlag[];
  milestones: TimelineMilestone[];
  canEdit: boolean;
  now: Date;
}): OnboardingDetail {
  const { client, account, contacts, flags, milestones, canEdit, now } = input;
  const form = client.intakeForm;
  const answers =
    form?.answers && typeof form.answers === "object" && !Array.isArray(form.answers)
      ? (form.answers as Record<string, unknown>)
      : null;

  const progress = deriveIntakeProgress(client.serviceType, answers);

  const intake: IntakeSnapshot = {
    exists: form !== null,
    status: form?.status ?? null,
    sentAt: iso(form?.sentAt),
    viewedAt: iso(form?.viewedAt),
    lastSavedAt: iso(form?.lastSavedAt),
    submittedAt: iso(form?.submittedAt),
    reviewedAt: iso(form?.reviewedAt),
    reopenedAt: iso(form?.reopenedAt),
    reviewedByName: form?.reviewedBy?.name ?? null,
    reviewNotes: form?.reviewNotes ?? null,
    expiresAt: iso(form?.expiresAt),
    percent: progress.percent,
    answered: progress.answered,
    total: progress.total,
    missingRequired: progress.missingRequiredQuestions,
    recipientEmail: client.contactEmail,
  };

  /*
   * A2P, only where it is in play.
   *
   * The same test the A2P page and the strategy card use - the client asked
   * for text messaging, or somebody has already started a profile. A client
   * who never asked is never shown a registration they do not need.
   */
  const readiness = a2pInPlay(answers, client.a2pProfile !== null)
    ? a2pReadiness({
        ...(client.a2pProfile ?? {}),
        samples: client.a2pProfile?.samples ?? [],
        documents: client.assets
          .filter((asset) => ["RECEIVED", "APPROVED"].includes(asset.status))
          .map((asset) => asset.type),
      })
    : null;

  /*
   * Both gates, deduplicated.
   *
   * requirements holds what the stage the client is in demands; exitCriteria
   * holds what the next one demands before they can enter it. Readiness means
   * both - counting only the first told a client with an unmet blocking exit
   * criterion that onboarding was complete, while the requirements table two
   * cards away listed the thing that was missing.
   */
  const gates = new Map<string, RequirementRow>();

  for (const requirement of [...account.requirements, ...account.exitCriteria]) {
    const existing = gates.get(requirement.key);

    // An unmet copy wins: if either gate still wants it, it is outstanding.
    if (existing && existing.satisfied === false) continue;

    gates.set(requirement.key, {
      key: requirement.key,
      label: requirement.label,
      isBlocking: requirement.isBlocking,
      satisfied: requirement.satisfied,
      owner: requirement.owner,
    });
  }

  const outstanding = sortOutstanding(
    collectOutstanding({
      requirements: [...gates.values()],
      flags: flags.map((flag) => ({
        id: flag.id,
        reason: flag.reason,
        detail: flag.detail,
        contactId: flag.contactId,
        requirementKey: flag.requirementKey,
        kind: flag.kind,
        dueAt: flag.dueAt,
        raisedAt: flag.raisedAt,
        lastFollowUpAt: flag.lastFollowUpAt,
        followUpCount: flag.followUpCount,
        receivedAt: flag.receivedAt,
        resolvedAt: flag.resolvedAt,
        cancelledAt: flag.cancelledAt,
        severity: flag.severity,
        impact: flag.impact,
        expectedResolutionAt: flag.expectedResolutionAt,
      })),
      access: client.accessRecords.map((record) => ({
        id: record.id,
        label: record.platformLabel ?? formatPlatform(record.platform),
        status: record.status,
        isCritical: record.isCritical,
        requestedAt: iso(record.requestedAt),
      })),
      assets: client.assets.map((record) => ({
        id: record.id,
        name: record.name,
        status: record.status,
        isRequired: record.isRequired,
        requestedAt: iso(record.requestedAt),
      })),
      approvals: client.reviewCycles
        .filter((cycle) => AWAITING_CLIENT.has(cycle.status))
        .map((cycle) => ({
          id: cycle.id,
          label: cycle.project
            ? `${cycle.project.name} - round ${cycle.roundNumber}`
            : `Client review round ${cycle.roundNumber}`,
          status: cycle.status,
          sentAt: iso(cycle.sentAt),
          feedbackDeadline: iso(cycle.feedbackDeadline),
          approverContactId: cycle.approverContactId,
        })),
      intake,
      a2p: readiness,
      /*
       * Once a form is reviewed its remaining gaps have been looked at and
       * accepted. Chasing a client for an answer the agency has already signed
       * off is how a chase list loses its credibility.
       */
      countIntakeAnswers: form?.reviewedAt === null || form?.reviewedAt === undefined,
      now,
    }),
  );

  const upcoming = milestones.find((milestone) => milestone.isCurrent) ?? null;
  const manager = projectManagerFor(client);

  return {
    intake,
    focus: onboardingFocus({
      intake,
      outstanding,
      a2p: readiness
        ? {
            percent: readiness.percent,
            complete: readiness.complete,
            total: readiness.total,
            headline: readiness.headline,
          }
        : null,
      stageName: account.stageName,
      nextStageName: account.nextStageName,
      nextMilestone: upcoming
        ? {
            name: upcoming.name,
            dueAt: upcoming.dueAt,
            owner: manager?.name ?? null,
          }
        : null,
      now,
    }),
    outstanding,
    chase: contactsToChase(outstanding, contacts, now),
    a2p: readiness
      ? {
          percent: readiness.percent,
          complete: readiness.complete,
          total: readiness.total,
          headline: readiness.headline,
        }
      : null,
    waitingOnClient: waitingOnClient(outstanding),
    projectManager: manager,
    /*
     * Reviewing an intake and clearing a dependency are both account
     * management, which clients.edit already covers. Checked again on the
     * server for every mutation - this only decides what to draw.
     */
    canReviewIntake: canEdit,
  };
}

/** "META_BUSINESS" reads as "Meta Business" wherever a platform is named. */
function formatPlatform(platform: string) {
  return platform
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
