import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The single selection used to evaluate a stage gate.
 *
 * Kept in one place so the checker inputs, the move endpoint, and the preview
 * endpoint can never drift apart - a gate evaluated against a partial account
 * would silently pass requirements it should have failed.
 */
export const journeyEvaluationSelect = {
  id: true,
  companyName: true,
  assignedUserId: true,
  currentStageId: true,
  contractStartDate: true,
  monthlyValue: true,
  healthStatus: true,
  renewalDate: true,
  currentStage: { select: { id: true, name: true, pipelineId: true } },
  contacts: { select: { isPrimary: true, isApprover: true } },
  projects: {
    where: { deletedAt: null },
    select: { id: true, projectManagerId: true },
  },
  agencyTasks: {
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      category: true,
      priority: true,
      assignedToId: true,
    },
  },
  invoices: {
    where: { deletedAt: null },
    select: { status: true },
  },
  accessRecords: {
    select: { platform: true, isCritical: true, status: true },
  },
  strategyBrief: {
    select: {
      status: true,
      // The required answers, so the gate can confirm an approved brief is
      // actually filled in rather than trusting the status alone.
      primaryGoal: true,
      successMetrics: true,
      targetAudience: true,
      mainOffer: true,
      agencyResponsibilities: true,
      clientResponsibilities: true,
    },
  },
  defects: {
    select: { reference: true, severity: true, status: true },
  },
  approvals: {
    select: {
      type: true,
      // The gate re-derives whether an approval is one a launch may rest on,
      // rather than trusting that a row exists.
      status: true,
      approvedByName: true,
      evidenceUrl: true,
      notes: true,
    },
  },
  launches: {
    select: { backupVerifiedAt: true, rollbackPlan: true, ownerId: true },
  },
  offboarding: {
    select: { clientAdminAccessConfirmedAt: true, finalBillingSettledAt: true },
  },
} satisfies Prisma.ClientSelect;

export type JourneyEvaluationClient = Prisma.ClientGetPayload<{
  select: typeof journeyEvaluationSelect;
}>;

export async function loadClientForEvaluation(clientId: string) {
  return prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: journeyEvaluationSelect,
  });
}
