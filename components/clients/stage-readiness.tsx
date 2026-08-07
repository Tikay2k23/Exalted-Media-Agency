import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { getRequirementRemedy } from "@/lib/journey/requirement-remedies";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";
import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * What this account needs before it can move to the next journey stage.
 *
 * Shown on the account itself rather than only inside the move dialog, so the
 * work needed is visible while somebody is actually editing the account.
 */
export async function StageReadiness({
  clientId,
  currentStagePosition,
}: {
  clientId: string;
  currentStagePosition: number;
}) {
  const nextStage = await prisma.pipelineStage.findFirst({
    where: {
      pipelineId: FULFILLMENT_PIPELINE_ID,
      isDeprecated: false,
      isTerminal: false,
      position: { gt: currentStagePosition },
    },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      requirements: {
        select: { requirementKey: true, label: true, isBlocking: true },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!nextStage) {
    return null;
  }

  const client = await loadClientForEvaluation(clientId);

  if (!client) {
    return null;
  }

  const gate = evaluateStageRequirements(client, nextStage.requirements);
  const outstanding = gate.evaluations.filter((evaluation) => !evaluation.satisfied);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Ready for {nextStage.name}?</CardTitle>
          {gate.passed ? (
            <Badge tone="emerald">Ready to move</Badge>
          ) : (
            <Badge tone="rose">
              {gate.blocking.length} thing{gate.blocking.length === 1 ? "" : "s"} needed
            </Badge>
          )}
        </div>
        <CardDescription>
          {gate.passed
            ? "Everything required for the next stage is in place."
            : "Each item below says what it means and how to sort it."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {outstanding.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <p className="text-sm text-emerald-900">
              Nothing outstanding. Use Move on the Client Journey page to advance it.
            </p>
          </div>
        ) : (
          outstanding
            .sort((a, b) => Number(b.isBlocking) - Number(a.isBlocking))
            .map((evaluation) => {
              const remedy = getRequirementRemedy(evaluation.key);

              return (
                <div
                  key={evaluation.key}
                  className={
                    evaluation.isBlocking
                      ? "rounded-2xl border border-rose-200 bg-white px-4 py-4"
                      : "rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4"
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {evaluation.isBlocking ? (
                      <CircleAlert className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                    ) : null}
                    <p className="text-sm font-semibold text-slate-900">
                      {evaluation.label}
                    </p>
                    {evaluation.isBlocking ? (
                      <Badge tone="rose">Blocks the move</Badge>
                    ) : (
                      <Badge tone="slate">Recommended</Badge>
                    )}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {remedy.whatItMeans}
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    <span className="font-medium">How to sort it: </span>
                    {remedy.howToFix}
                  </p>

                  {remedy.notBuiltYet ? (
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      There is no screen for this yet, which is why it does not block the
                      move.
                    </p>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-sky-700">
                      {evaluation.key === "contract_recorded"
                        || evaluation.key === "health_assessed"
                        || evaluation.key === "renewal_date_set"
                        || evaluation.key === "account_owner_assigned"
                        ? "Use the Account details form below"
                        : evaluation.key === "primary_contact_recorded"
                          || evaluation.key === "client_approver_recorded"
                          ? "Use the Client contacts panel below"
                          : (remedy.actionLabel ?? "See the guidance above")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </p>
                  )}
                </div>
              );
            })
        )}
      </CardContent>
    </Card>
  );
}
