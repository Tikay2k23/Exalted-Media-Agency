import { AccessPlatform, AccessStatus, InvoiceStatus, OffboardingStatus } from "@prisma/client";

import { loadAuthContext, type AuthContext } from "@/lib/authz";
import { createProject } from "@/lib/delivery/project-service";
import { moveClientStage } from "@/lib/journey/transition";
import { prisma } from "@/lib/prisma";
import { approveBrief, saveBrief, submitBriefForReview } from "@/lib/strategy/brief-service";
import { OFFBOARDING_STEPS, saveOffboarding } from "@/lib/success/offboarding-service";
import { createClient } from "@/lib/workflow/client-intake-service";

/**
 * The accounts Human UAT is carried out against.
 *
 * Created through createClient, the same service the Add Client form calls, so
 * each account arrives with the workstreams, onboarding work and ownership a
 * real one would have. Nothing here writes a client row by hand.
 *
 * Where an account needs to sit further along the journey it is moved with
 * moveClientStage and its gates are satisfied for real - a contract, a paid
 * invoice, tested access, an approved brief. No overrides. An account parked
 * at a stage whose gates are unmet shows a wall of red on the Journey page,
 * and testers reasonably report that as a defect.
 *
 * Nothing is advanced past In Production, deliberately. The gates after it -
 * QA, client approval, launch - are the test cases. Walking an account through
 * them here would spend the transitions the testers are meant to execute, and
 * UAT-0043 exists precisely so a human drives the whole lifecycle once.
 *
 * Idempotent: an account that already exists is left exactly as it is.
 */

const MARKER = "UAT";

/*
 * .invalid can never resolve - RFC 2606 reserves it. The application has no
 * mailer, which was verified rather than assumed, but an address that cannot
 * reach a real person is worth having anyway: it survives somebody adding one.
 */
const emailFor = (slug: string) => `${slug}@uat.invalid`;

interface Account {
  slug: string;
  company: string;
  contact: string;
  service: "SEO" | "WEBSITE_SUPPORT" | "SOCIAL_MEDIA_MANAGEMENT";
  monthlyValue: number;
  goal: string;
  /** How far along the journey this account should sit. */
  target: "payment_received" | "in_production";
  /** Commercial records, for the billing module. */
  commercial?: boolean;
  /** Offboarded and ready for the archive case, UAT-0044. */
  offboard?: boolean;
  purpose: string;
}

const ACCOUNTS: Account[] = [
  {
    slug: "northwind",
    company: `${MARKER} Northwind Trading`,
    contact: "Alice Northwind",
    service: "SEO",
    monthlyValue: 2400,
    goal: "Rank for the twelve commercial terms that actually convert.",
    target: "payment_received",
    purpose: "A new account at the start. Onboarding, intake, access, early journey.",
  },
  {
    slug: "fabrikam",
    company: `${MARKER} Fabrikam Interiors`,
    contact: "Ben Fabrikam",
    service: "WEBSITE_SUPPORT",
    monthlyValue: 3200,
    goal: "A site that loads quickly and can be updated without a developer.",
    target: "in_production",
    purpose: "Mid-journey. Work, EOD, strategy, QA and the approach to approvals.",
  },
  {
    slug: "contoso",
    company: `${MARKER} Contoso Wellness`,
    contact: "Carla Contoso",
    service: "SOCIAL_MEDIA_MANAGEMENT",
    monthlyValue: 1800,
    goal: "A content calendar the clinic can sustain without us writing every post.",
    target: "in_production",
    commercial: true,
    purpose: "Mid-journey with billing history. Reports and health, billing, renewal.",
  },
  {
    slug: "adventure-works",
    company: `${MARKER} Adventure Works`,
    contact: "Dan Adventure",
    service: "SEO",
    monthlyValue: 2000,
    goal: "Wind the engagement down cleanly and hand everything back.",
    target: "payment_received",
    offboard: true,
    purpose: "Offboarding complete, ready to archive. UAT-0044.",
  },
];

/** Fulfillment stages in order, so an account can be walked one hop at a time. */
async function journeyStages() {
  return prisma.pipelineStage.findMany({
    where: { pipeline: { kind: "FULFILLMENT" }, isDeprecated: false },
    orderBy: { position: "asc" },
    select: { id: true, stageKey: true, name: true, position: true },
  });
}

/**
 * Satisfies the gates on the way to In Production, using the real services
 * where they exist.
 *
 * Written as the records themselves rather than as a stage assignment: the
 * gate reads a paid invoice, so there is a paid invoice.
 */
async function satisfyProductionGates(
  account: Account,
  clientId: string,
  owner: AuthContext,
  pm: AuthContext,
) {
  const done: string[] = [];

  /* primary_contact_recorded */
  const hasPrimary = await prisma.clientContact.findFirst({
    where: { clientId, isPrimary: true },
    select: { id: true },
  });

  if (!hasPrimary) {
    await prisma.clientContact.create({
      data: {
        clientId,
        name: account.contact,
        email: emailFor(account.slug),
        isPrimary: true,
        isApprover: true,
        role: "Owner",
      },
    });

    done.push("primary contact");
  }

  /* contract_recorded - start date and monthly value on the account itself */
  await prisma.client.update({
    where: { id: clientId },
    data: {
      contractStartDate: new Date(Date.now() - 30 * 86_400_000),
      monthlyValue: account.monthlyValue,
    },
  });

  done.push("contract");

  /* payment_confirmed - one paid invoice */
  const paid = await prisma.invoice.findFirst({
    where: { clientId, status: InvoiceStatus.PAID },
    select: { id: true },
  });

  if (!paid) {
    await prisma.invoice.create({
      data: {
        clientId,
        invoiceNumber: `UAT-${account.slug.toUpperCase()}-001`,
        amountDue: account.monthlyValue,
        amountPaid: account.monthlyValue,
        status: InvoiceStatus.PAID,
        issuedAt: new Date(Date.now() - 28 * 86_400_000),
        dueAt: new Date(Date.now() - 14 * 86_400_000),
        paidAt: new Date(Date.now() - 20 * 86_400_000),
      },
    });

    done.push("paid invoice");
  }

  /* critical_access_collected and critical_access_tested */
  const access = await prisma.accessRecord.count({ where: { clientId, isCritical: true } });

  if (!access) {
    for (const platform of [AccessPlatform.GOOGLE_ANALYTICS, AccessPlatform.WEBSITE_ADMIN]) {
      await prisma.accessRecord.create({
        data: {
          clientId,
          platform,
          isCritical: true,
          status: AccessStatus.TESTED,
          testedAt: new Date(Date.now() - 10 * 86_400_000),
        },
      });
    }

    done.push("critical access, tested");
  }

  /* onboarding_tasks_complete - close the work createClient generated */
  const closed = await prisma.employeeTask.updateMany({
    where: { clientId, status: { notIn: ["DONE", "CANCELLED"] } },
    data: { status: "DONE", completedAt: new Date() },
  });

  if (closed.count) done.push(`${closed.count} onboarding item(s) closed`);

  /* project_exists and project_manager_assigned */
  const existingProject = await prisma.project.findFirst({
    where: { clientId },
    select: { id: true },
  });

  if (!existingProject) {
    const project = await createProject({
      actor: owner,
      clientId,
      data: {
        name: `${account.company} delivery`,
        serviceType: account.service,
        projectManagerId: pm.id,
      },
    });

    if (!project.ok) throw new Error(`createProject failed: ${project.message}`);

    done.push("project with a manager");
  }

  /*
   * work_assigned - at least one item exists. Every open item having an owner
   * is guaranteed by the schema rather than by this script: assignedToId is
   * not nullable, so an unowned task cannot be created in the first place.
   */
  const anyTask = await prisma.employeeTask.count({ where: { clientId } });

  if (!anyTask) {
    await prisma.employeeTask.create({
      data: {
        title: `${account.company}: first production task`,
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        dueDate: new Date(Date.now() + 5 * 86_400_000),
        assignedToId: pm.id,
        createdById: owner.id,
        clientId,
        estimatedHours: 4,
        weekStartDate: new Date(),
      },
    });

    done.push("production work");
  }

  /*
   * strategy_brief_approved.
   *
   * createClient already opens a brief, authored by whoever created the
   * account - so the author here is the owner, and approveBrief refuses to let
   * an author approve their own work. That is the rule working, not an
   * obstacle to route around, so the approver is chosen to be somebody else
   * rather than the check being avoided.
   */
  const brief = await prisma.strategyBrief.findUnique({
    where: { clientId },
    select: { status: true, authorId: true },
  });

  const approver = brief?.authorId === owner.id ? pm : owner;

  if (brief?.status !== "APPROVED") {
    const author = brief?.authorId === owner.id ? owner : pm;

    const saved = await saveBrief({
      actor: author,
      clientId,
      /* The six REQUIRED_BRIEF_FIELDS, or submitForReview refuses it. */
      data: {
        primaryGoal: account.goal,
        successMetrics: "Agreed at kickoff and reviewed monthly.",
        targetAudience: "Owners and managers of local businesses.",
        mainOffer: "The retained service this account signed up for.",
        agencyResponsibilities: "Delivery, reporting and the monthly review.",
        clientResponsibilities: "Access, approvals and answering questions promptly.",
      },
    });

    if (!saved.ok) throw new Error(`saveBrief failed: ${saved.message}`);

    const submitted = await submitBriefForReview({ actor: author, clientId });

    if (!submitted.ok) throw new Error(`submitBriefForReview failed: ${submitted.message}`);

    const approved = await approveBrief({ actor: approver, clientId });

    if (!approved.ok) throw new Error(`approveBrief failed: ${approved.message}`);

    done.push("strategy brief approved by a second pair of eyes");
  }

  return done;
}

/** Walks an account forward one stage at a time, refusing to override. */
async function advanceTo(clientId: string, actor: AuthContext, targetKey: string) {
  const stages = await journeyStages();
  const hops: string[] = [];

  for (;;) {
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { currentStageId: true },
    });

    const current = stages.find((stage) => stage.id === client.currentStageId);
    const target = stages.find((stage) => stage.stageKey === targetKey);

    if (!current || !target) throw new Error("stage not found");
    if (current.position >= target.position) return hops;

    const next = stages.find((stage) => stage.position > current.position);

    if (!next) return hops;

    /*
     * Close whatever the last hop generated before attempting the next one.
     *
     * Moving a stage creates that stage's work, so onboarding_tasks_complete
     * is satisfied at the moment it is checked and unsatisfied again one hop
     * later. Doing this once before the walk is not enough.
     */
    await prisma.employeeTask.updateMany({
      where: { clientId, status: { notIn: ["DONE", "CANCELLED"] } },
      data: { status: "DONE", completedAt: new Date() },
    });

    const moved = await moveClientStage({ actor, clientId, targetStageId: next.id });

    if (!moved.ok) {
      /* The failure carries the blocking requirements; say which, not how many. */
      const detail =
        moved.code === "BLOCKED" && moved.blocking?.length
          ? moved.blocking
              .map((requirement) => `${requirement.key} (${requirement.reason ?? "unmet"})`)
              .join("; ")
          : moved.message;

      throw new Error(`blocked moving to ${next.stageKey}: ${detail}`);
    }

    hops.push(next.stageKey ?? next.name);
  }
}

async function main() {
  const target = (process.env.DATABASE_URL ?? "").toLowerCase();

  if (!target.includes("uat")) {
    console.error("[uat-clients] Refusing: DATABASE_URL is not a UAT database.");
    process.exit(1);
  }

  const ownerUser = await prisma.user.findFirstOrThrow({
    where: { teamRole: "AGENCY_OWNER", isActive: true },
    select: { id: true },
  });
  const pmUser = await prisma.user.findFirstOrThrow({
    where: { teamRole: "PROJECT_MANAGER", isActive: true },
    select: { id: true },
  });

  const owner = await loadAuthContext(ownerUser.id);
  const pm = await loadAuthContext(pmUser.id);

  if (!owner || !pm) throw new Error("could not load the owner or project manager");

  for (const account of ACCOUNTS) {
    console.log(`\n--- ${account.company}`);

    const existing = await prisma.client.findFirst({
      where: { companyName: account.company },
      select: { id: true },
    });

    /*
     * Resumed rather than skipped. Skipping on the name alone leaves an
     * account that failed halfway through sitting there half built, and the
     * second run reports success over it. Every step below decides for itself
     * whether it has already been done.
     */
    if (existing) {
      console.log("    already present, continuing from where it stopped");
    }

    const created = existing ? null : await createClient({
      actor: owner,
      companyName: account.company,
      contactName: account.contact,
      contactEmail: emailFor(account.slug),
      serviceType: account.service,
      monthlyValue: account.monthlyValue,
      mainGoal: account.goal,
      projectManagerId: pmUser.id,
    });

    if (created && !created.ok) throw new Error(`createClient failed: ${created.message}`);

    const clientId = created && created.ok ? created.client.id : existing!.id;

    if (created) console.log("    created at the first fulfillment stage");

    /*
     * Only touch the gates if the account still has somewhere to go.
     *
     * Satisfying them closes every open work item, which is right on the way
     * to production and badly wrong afterwards: run this again a week into
     * UAT and it would mark a tester's in-progress work as done. Whether the
     * account has already arrived is the thing that decides it.
     */
    const stages = await journeyStages();
    const now = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { currentStageId: true },
    });
    const currentStage = stages.find((stage) => stage.id === now.currentStageId);
    const targetStage = stages.find((stage) => stage.stageKey === account.target);
    const arrived = Boolean(
      currentStage && targetStage && currentStage.position >= targetStage.position,
    );

    if (account.target === "in_production" && !arrived) {
      const satisfied = await satisfyProductionGates(account, clientId, owner, pm);

      console.log(`    gates satisfied: ${satisfied.join(", ")}`);

      const hops = await advanceTo(clientId, owner, "in_production");

      console.log(`    advanced through: ${hops.join(" -> ")}`);
    } else if (account.target === "in_production") {
      console.log(`    already at ${currentStage?.name ?? "its target stage"}, left alone`);
    }

    const openInvoice = account.commercial
      ? await prisma.invoice.findFirst({
          where: { clientId, invoiceNumber: `UAT-${account.slug.toUpperCase()}-002` },
          select: { id: true },
        })
      : null;

    if (account.commercial && !openInvoice) {
      await prisma.invoice.create({
        data: {
          clientId,
          invoiceNumber: `UAT-${account.slug.toUpperCase()}-002`,
          amountDue: account.monthlyValue,
          status: InvoiceStatus.SENT,
          issuedAt: new Date(Date.now() - 3 * 86_400_000),
          dueAt: new Date(Date.now() + 11 * 86_400_000),
        },
      });

      console.log("    added an open invoice for the billing module");
    }

    const offboarded = account.offboard
      ? await prisma.offboardingRecord.findFirst({
          where: { clientId, status: OffboardingStatus.COMPLETE },
          select: { id: true },
        })
      : null;

    if (account.offboard && !offboarded) {
      const started = await saveOffboarding({
        actor: owner,
        clientId,
        reason: "CONTRACT_ENDED",
        status: OffboardingStatus.IN_PROGRESS,
        remainingWork: "None outstanding",
        completeSteps: OFFBOARDING_STEPS.map((step) => step.key),
      });

      if (!started.ok) throw new Error(`saveOffboarding failed: ${started.message}`);

      const completed = await saveOffboarding({
        actor: owner,
        clientId,
        status: OffboardingStatus.COMPLETE,
      });

      if (!completed.ok) throw new Error(`completing offboarding failed: ${completed.message}`);

      console.log("    offboarding complete, ready for the archive case");
    }

    console.log(`    purpose: ${account.purpose}`);
  }

  console.log("\n=== accounts now on the workspace ===");

  const all = await prisma.client.findMany({
    orderBy: { companyName: "asc" },
    select: {
      companyName: true,
      serviceType: true,
      currentStage: { select: { name: true } },
      archivedAt: true,
    },
  });

  for (const client of all) {
    console.log(
      `  ${client.companyName.padEnd(26)} ${String(client.serviceType).padEnd(24)} `
        + `${client.currentStage?.name ?? "-"}${client.archivedAt ? "  (archived)" : ""}`,
    );
  }
}

main().finally(() => prisma.$disconnect());
