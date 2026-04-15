import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ActivityEntityType,
  ClientStatus,
  Department,
  EmployeeTaskStatus,
  PrismaClient,
  Role,
  ServiceType,
  SocialPlatform,
  SocialTaskStatus,
  TaskCategory,
  TaskPriority,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { addDays, startOfWeek, subDays } from "date-fns";

const connectionString =
  process.env.DIRECT_URL
  ?? process.env.PRISMA_DATABASE_URL
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL_NON_POOLING
  ?? process.env.DATABASE_URL
  ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "A database connection string is not configured for seeding. Set DIRECT_URL, PRISMA_DATABASE_URL, or another supported PostgreSQL URL.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const stageSeed = [
  { name: "New Client", slug: "new-client", color: "#0ea5e9", position: 1, isDefault: true },
  { name: "Onboarding", slug: "onboarding", color: "#8b5cf6", position: 2, isDefault: false },
  { name: "In Progress", slug: "in-progress", color: "#f59e0b", position: 3, isDefault: false },
  { name: "Waiting on Client", slug: "waiting-on-client", color: "#ef4444", position: 4, isDefault: false },
  { name: "Review", slug: "review", color: "#14b8a6", position: 5, isDefault: false },
  { name: "Completed", slug: "completed", color: "#22c55e", position: 6, isDefault: false },
];

async function main() {
  await prisma.activityLog.deleteMany();
  await prisma.employeeTaskEodEntry.deleteMany();
  await prisma.employeeTask.deleteMany();
  await prisma.socialMediaTask.deleteMany();
  await prisma.clientStageHistory.deleteMany();
  await prisma.client.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hash("Agency123!", 12);

  const [admin, manager, sarah, devon] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Ariana Blake",
        email: "admin@exaltedagency.com",
        passwordHash,
        role: Role.ADMIN,
        department: Department.OPERATIONS,
        jobTitle: "Agency Director",
        weeklyCapacityHours: 35,
        avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
      },
    }),
    prisma.user.create({
      data: {
        name: "Noah Carter",
        email: "manager@exaltedagency.com",
        passwordHash,
        role: Role.MANAGER,
        department: Department.ACCOUNT_MANAGEMENT,
        jobTitle: "Client Services Manager",
        weeklyCapacityHours: 38,
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
      },
    }),
    prisma.user.create({
      data: {
        name: "Sarah Kim",
        email: "sarah@exaltedagency.com",
        passwordHash,
        role: Role.TEAM_MEMBER,
        department: Department.CONTENT,
        jobTitle: "Content Strategist",
        weeklyCapacityHours: 40,
        avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80",
      },
    }),
    prisma.user.create({
      data: {
        name: "Devon Price",
        email: "devon@exaltedagency.com",
        passwordHash,
        role: Role.TEAM_MEMBER,
        department: Department.PAID_MEDIA,
        jobTitle: "Paid Media Specialist",
        weeklyCapacityHours: 42,
        avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80",
      },
    }),
  ]);

  const stages = await Promise.all(
    stageSeed.map((stage) =>
      prisma.pipelineStage.create({
        data: stage,
      }),
    ),
  );

  const stageBySlug = Object.fromEntries(stages.map((stage) => [stage.slug, stage]));

  const clients = await Promise.all([
    prisma.client.create({
      data: {
        clientName: "Leah Morgan",
        companyName: "Northstar Fitness",
        contactEmail: "hello@northstarfit.co",
        contactPhone: "+1 415 555 0140",
        assignedUserId: sarah.id,
        status: ClientStatus.ACTIVE,
        serviceType: ServiceType.SOCIAL_MEDIA_MANAGEMENT,
        currentStageId: stageBySlug["in-progress"].id,
        notes: "Weekly Instagram and TikTok content with monthly reporting.",
        dateAdded: subDays(new Date(), 24),
      },
    }),
    prisma.client.create({
      data: {
        clientName: "Marcus Hall",
        companyName: "Bloom & Beam Skincare",
        contactEmail: "marcus@bloomandbeam.com",
        contactPhone: "+1 212 555 0114",
        assignedUserId: sarah.id,
        status: ClientStatus.AT_RISK,
        serviceType: ServiceType.CONTENT_PRODUCTION,
        currentStageId: stageBySlug["review"].id,
        notes: "Waiting for brand approvals on spring launch assets.",
        dateAdded: subDays(new Date(), 12),
      },
    }),
    prisma.client.create({
      data: {
        clientName: "Tina Alvarez",
        companyName: "Harborstone Realty",
        contactEmail: "team@harborstonerealty.com",
        contactPhone: "+1 305 555 0198",
        assignedUserId: devon.id,
        status: ClientStatus.ACTIVE,
        serviceType: ServiceType.BRAND_STRATEGY,
        currentStageId: stageBySlug.onboarding.id,
        notes: "Brand refresh and LinkedIn content strategy.",
        dateAdded: subDays(new Date(), 7),
      },
    }),
    prisma.client.create({
      data: {
        clientName: "Owen Bennett",
        companyName: "Signal Peak AI",
        contactEmail: "owen@signalpeak.ai",
        contactPhone: "+1 512 555 0176",
        assignedUserId: devon.id,
        status: ClientStatus.ACTIVE,
        serviceType: ServiceType.PAID_ADVERTISING,
        currentStageId: stageBySlug["waiting-on-client"].id,
        notes: "Creative approved; waiting on landing page updates.",
        dateAdded: subDays(new Date(), 18),
      },
    }),
    prisma.client.create({
      data: {
        clientName: "Chloe Brooks",
        companyName: "Marlow Interiors",
        contactEmail: "studio@marlowinteriors.com",
        contactPhone: "+1 646 555 0162",
        assignedUserId: manager.id,
        status: ClientStatus.COMPLETED,
        serviceType: ServiceType.SOCIAL_MEDIA_MANAGEMENT,
        currentStageId: stageBySlug.completed.id,
        notes: "Q1 campaign completed with 118% fulfillment rate.",
        dateAdded: subDays(new Date(), 41),
      },
    }),
    prisma.client.create({
      data: {
        clientName: "Eric Lawson",
        companyName: "Summit Trails",
        contactEmail: "team@summittrails.io",
        contactPhone: "+1 720 555 0102",
        assignedUserId: manager.id,
        status: ClientStatus.ON_HOLD,
        serviceType: ServiceType.WEBSITE_SUPPORT,
        currentStageId: stageBySlug["new-client"].id,
        notes: "Proposal accepted; kickoff call scheduled for next week.",
        dateAdded: subDays(new Date(), 2),
      },
    }),
  ]);

  await prisma.socialMediaTask.createMany({
    data: [
      {
        clientId: clients[0].id,
        platform: SocialPlatform.INSTAGRAM,
        plannedPosts: 16,
        completedPosts: 13,
        dueDate: addDays(new Date(), 4),
        status: SocialTaskStatus.IN_PROGRESS,
        assignedUserId: sarah.id,
      },
      {
        clientId: clients[0].id,
        platform: SocialPlatform.TIKTOK,
        plannedPosts: 8,
        completedPosts: 8,
        dueDate: addDays(new Date(), 2),
        status: SocialTaskStatus.COMPLETED,
        assignedUserId: sarah.id,
      },
      {
        clientId: clients[1].id,
        platform: SocialPlatform.INSTAGRAM,
        plannedPosts: 10,
        completedPosts: 6,
        dueDate: addDays(new Date(), 6),
        status: SocialTaskStatus.REVIEW,
        assignedUserId: sarah.id,
      },
      {
        clientId: clients[2].id,
        platform: SocialPlatform.LINKEDIN,
        plannedPosts: 12,
        completedPosts: 7,
        dueDate: addDays(new Date(), 5),
        status: SocialTaskStatus.IN_PROGRESS,
        assignedUserId: devon.id,
      },
      {
        clientId: clients[3].id,
        platform: SocialPlatform.FACEBOOK,
        plannedPosts: 14,
        completedPosts: 9,
        dueDate: addDays(new Date(), 8),
        status: SocialTaskStatus.WAITING_ON_CLIENT,
        assignedUserId: devon.id,
      },
      {
        clientId: clients[4].id,
        platform: SocialPlatform.INSTAGRAM,
        plannedPosts: 18,
        completedPosts: 18,
        dueDate: subDays(new Date(), 1),
        status: SocialTaskStatus.COMPLETED,
        assignedUserId: manager.id,
      },
      {
        clientId: clients[5].id,
        platform: SocialPlatform.YOUTUBE,
        plannedPosts: 4,
        completedPosts: 1,
        dueDate: addDays(new Date(), 12),
        status: SocialTaskStatus.NOT_STARTED,
        assignedUserId: manager.id,
      },
    ],
  });

  const historyPayload = [
    [clients[0], stageBySlug.onboarding.id, stageBySlug["in-progress"].id, manager.id, "Kickoff completed and content calendar approved."],
    [clients[1], stageBySlug["in-progress"].id, stageBySlug.review.id, sarah.id, "Draft assets sent for approval."],
    [clients[2], stageBySlug["new-client"].id, stageBySlug.onboarding.id, manager.id, "Brand intake finalized."],
    [clients[3], stageBySlug["in-progress"].id, stageBySlug["waiting-on-client"].id, devon.id, "Awaiting updated landing page copy."],
    [clients[4], stageBySlug.review.id, stageBySlug.completed.id, manager.id, "Campaign delivered and approved."],
  ] as const;

  await Promise.all(
    historyPayload.map(([client, fromStageId, toStageId, changedById, note], index) =>
      prisma.clientStageHistory.create({
        data: {
          clientId: client.id,
          fromStageId,
          toStageId,
          changedById,
          note,
          changedAt: subDays(new Date(), index + 1),
        },
      }),
    ),
  );

  const employeeTasks = await Promise.all([
    prisma.employeeTask.create({
      data: (() => {
        const dueDate = addDays(new Date(), 2);

        return {
        title: "Prepare April content calendar",
        note: "Build the weekly rollout plan for Northstar Fitness and include Reel hooks for manager approval.",
        status: EmployeeTaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        category: TaskCategory.CONTENT_CALENDAR,
        estimatedHours: 6,
        weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
        dueDate,
        assignedToId: sarah.id,
        createdById: manager.id,
        clientId: clients[0].id,
        };
      })(),
    }),
    prisma.employeeTask.create({
      data: (() => {
        const dueDate = addDays(new Date(), 1);

        return {
        title: "Chase client feedback on launch assets",
        note: "Follow up with Bloom & Beam and summarize blockers if approvals do not land by end of day.",
        status: EmployeeTaskStatus.BLOCKED,
        priority: TaskPriority.URGENT,
        category: TaskCategory.CLIENT_REPORTING,
        estimatedHours: 3,
        weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
        dueDate,
        assignedToId: sarah.id,
        createdById: manager.id,
        clientId: clients[1].id,
        };
      })(),
    }),
    prisma.employeeTask.create({
      data: (() => {
        const dueDate = addDays(new Date(), 3);

        return {
        title: "Set up Harborstone onboarding board",
        note: "Create the kickoff doc, add asset requests, and leave internal notes for strategy handoff.",
        status: EmployeeTaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        category: TaskCategory.INTERNAL_OPERATIONS,
        estimatedHours: 4,
        weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
        dueDate,
        assignedToId: devon.id,
        createdById: admin.id,
        clientId: clients[2].id,
        };
      })(),
    }),
    prisma.employeeTask.create({
      data: (() => {
        const dueDate = addDays(new Date(), 4);

        return {
        title: "Review paid media QA checklist",
        note: "Confirm Signal Peak landing page changes match the ad copy before the campaign goes live.",
        status: EmployeeTaskStatus.IN_REVIEW,
        priority: TaskPriority.HIGH,
        category: TaskCategory.PAID_MEDIA_OPTIMIZATION,
        estimatedHours: 5,
        weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
        dueDate,
        assignedToId: devon.id,
        createdById: manager.id,
        clientId: clients[3].id,
        };
      })(),
    }),
    prisma.employeeTask.create({
      data: (() => {
        const dueDate = addDays(new Date(), 5);

        return {
        title: "Compile weekly delivery summary",
        note: "Send a short agency-style wrap-up covering wins, blockers, and tasks at risk across all accounts.",
        status: EmployeeTaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        category: TaskCategory.CLIENT_REPORTING,
        estimatedHours: 2,
        weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
        dueDate,
        assignedToId: manager.id,
        createdById: admin.id,
        };
      })(),
    }),
  ]);

  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  await prisma.employeeTaskEodEntry.createMany({
    data: [
      {
        taskId: employeeTasks[0].id,
        authorId: sarah.id,
        entryDate: addDays(currentWeekStart, 0),
        summary: "Outlined the April content pillars and drafted the first pass of the weekly Reel themes.",
        blockers: "Still waiting on final promo dates from the client.",
        nextSteps: "Finalize the cadence and send the board for manager review tomorrow.",
      },
      {
        taskId: employeeTasks[0].id,
        authorId: sarah.id,
        entryDate: addDays(currentWeekStart, 1),
        summary: "Updated the calendar with approved promo dates and added caption direction for priority posts.",
        blockers: "",
        nextSteps: "Package the board with hook ideas and internal notes for final sign-off.",
      },
      {
        taskId: employeeTasks[1].id,
        authorId: sarah.id,
        entryDate: addDays(currentWeekStart, 1),
        summary: "Followed up twice with Bloom & Beam and captured the missing approval points in the task note.",
        blockers: "No response yet from the client approver.",
        nextSteps: "Escalate through the account manager if nothing lands by tomorrow noon.",
      },
      {
        taskId: employeeTasks[3].id,
        authorId: devon.id,
        entryDate: addDays(currentWeekStart, 0),
        summary: "Ran the paid media QA checklist and matched most landing page sections to the live ad set.",
        blockers: "One CTA block still does not mirror approved ad copy.",
        nextSteps: "Recheck after the web team publishes the updated module.",
      },
      {
        taskId: employeeTasks[4].id,
        authorId: manager.id,
        entryDate: addDays(currentWeekStart, 2),
        summary: "Collected wins and blockers from content and paid teams for the weekly delivery wrap-up.",
        blockers: "",
        nextSteps: "Draft the final weekly summary and circulate it to leadership on Friday.",
      },
    ],
  });

  await prisma.activityLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: "Seeded workspace and baseline reporting metrics",
        entityType: ActivityEntityType.REPORT,
        entityId: "dashboard",
      },
      {
        actorId: manager.id,
        action: "Moved Northstar Fitness into In Progress",
        entityType: ActivityEntityType.PIPELINE,
        entityId: clients[0].id,
      },
      {
        actorId: sarah.id,
        action: "Updated Bloom & Beam posting progress",
        entityType: ActivityEntityType.SOCIAL_TASK,
        entityId: clients[1].id,
      },
      {
        actorId: devon.id,
        action: "Flagged Signal Peak AI as waiting on client",
        entityType: ActivityEntityType.CLIENT,
        entityId: clients[3].id,
      },
      {
        actorId: manager.id,
        action: "Assigned April content calendar work to Sarah Kim",
        entityType: ActivityEntityType.EMPLOYEE_TASK,
        entityId: employeeTasks[0].id,
      },
    ],
  });

  console.log("Seed complete. Demo logins:");
  console.log("admin@exaltedagency.com / Agency123!");
  console.log("manager@exaltedagency.com / Agency123!");
  console.log("sarah@exaltedagency.com / Agency123!");
  console.log("devon@exaltedagency.com / Agency123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
