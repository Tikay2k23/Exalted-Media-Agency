import "dotenv/config";

import { prisma } from "@/lib/prisma";

/**
 * What is actually in the database right now.
 *
 * Written before anything is deleted, so the clear-and-rebuild can report what
 * it removed rather than guessing.
 *
 * The model list is spelled out rather than read off the client: Prisma 7 does
 * not expose its delegates as enumerable keys, so iterating the client silently
 * finds nothing - which reads as an empty database rather than as a broken
 * script, and that is the worst possible failure right before a delete.
 */
const MODELS = [
  "accessRecord", "account", "activityLog", "approval", "assetRecord", "audit",
  "auditFinding", "client", "clientContact", "clientHandoff", "clientHealthAssessment",
  "clientReport", "clientStageHistory", "clientWorkstream", "complaint", "contract",
  "correctiveAction", "defect", "employeeTask", "employeeTaskEodEntry",
  "expansionOpportunity", "improvementRequest", "incident", "intakeForm", "invoice",
  "launch", "launchChecklistItem", "lead", "leadCallLog", "leadNote", "loginAttempt",
  "migrationLog", "milestone", "monitoringCheck", "notification", "offboardingRecord",
  "onboardingRecord", "optimization", "payment", "pipeline", "pipelineStage", "project",
  "qaPlan", "qaTest", "recoveryPlan", "referral", "renewal", "reviewCycle", "revisionItem",
  "savedView", "session", "socialMediaTask", "sop", "sopVersion", "stageRequirement",
  "strategyBrief", "taskComment", "taskDependency", "testimonial", "trainingRecord",
  "trainingSession", "user", "userPermissionOverride", "verificationToken", "weeklyReport",
  "workspaceSetting",
] as const;

export async function inventory() {
  const counts: Record<string, number> = {};

  for (const model of MODELS) {
    const delegate = (prisma as unknown as Record<string, { count: () => Promise<number> }>)[
      model
    ];

    if (typeof delegate?.count !== "function") {
      throw new Error(`No delegate for "${model}" - the model list is out of date.`);
    }

    counts[model] = await delegate.count();
  }

  return counts;
}

async function main() {
  const counts = await inventory();
  const populated = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  console.log("POPULATED TABLES");
  for (const [model, count] of populated) {
    console.log(`  ${model.padEnd(28)} ${count}`);
  }

  console.log(`\n${populated.length} of ${MODELS.length} tables hold rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
