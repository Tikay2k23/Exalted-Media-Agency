import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export function ActivityFeed({
  activities,
}: {
  activities: Array<{
    id: string;
    action: string;
    createdAt: Date;
    actor: {
      name: string;
      role: string;
    } | null;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest updates from client delivery and internal operations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.length ? (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">
                  {activity.actor?.name ?? "System"}
                </p>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  {formatDateTime(activity.createdAt)}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-600">{activity.action}</p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            Activity will appear here as the team updates accounts, tasks, and pipeline changes.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
