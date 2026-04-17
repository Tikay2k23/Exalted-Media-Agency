import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatEnumLabel } from "@/lib/utils";

function toneForStatus(status: string): "sky" | "amber" | "rose" | "emerald" {
  switch (status) {
    case "AT_RISK":
      return "rose";
    case "ON_HOLD":
      return "amber";
    case "COMPLETED":
      return "emerald";
    default:
      return "sky";
  }
}

export function PipelineOverview({
  stages,
  attentionClients,
}: {
  stages: Array<{
    id: string;
    name: string;
    color: string;
    count: number;
  }>;
  attentionClients: Array<{
    id: string;
    companyName: string;
    status: string;
    stageName: string;
    assignedUserName: string | null;
  }>;
}) {
  const totalAccounts = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Snapshot</CardTitle>
          <CardDescription>
            Live account distribution across the client lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stages.map((stage) => {
            const width = totalAccounts ? Math.max((stage.count / totalAccounts) * 100, stage.count ? 8 : 0) : 0;

            return (
              <div key={stage.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                    <p className="font-semibold text-slate-900">{stage.name}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-500">{stage.count}</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white">
                  <div
                    className={cn("h-2 rounded-full transition-all", stage.count ? "" : "opacity-0")}
                    style={{ width: `${width}%`, backgroundColor: stage.color }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts Needing Attention</CardTitle>
          <CardDescription>
            At-risk, on-hold, or unassigned accounts that may need manager review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {attentionClients.length ? (
            attentionClients.map((client) => (
              <div key={client.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{client.companyName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {client.assignedUserName ?? "No account lead assigned"} / {client.stageName}
                    </p>
                  </div>
                  <Badge tone={toneForStatus(client.status)}>{formatEnumLabel(client.status)}</Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No flagged accounts right now. The live book looks healthy.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
