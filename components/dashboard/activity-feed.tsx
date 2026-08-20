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
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 truncate text-sm font-medium text-slate-800">
                  {activity.actor?.name ?? "System"}
                </p>
                {/*
                  * The wide letter-spacing is dropped below sm. A full date and
                  * time at 0.24em is wider than a phone, and it was pushing the
                  * timestamp onto its own overflowing line.
                  */}
                <p className="shrink-0 text-xs uppercase text-slate-400 sm:tracking-[0.24em]">
                  {formatDateTime(activity.createdAt)}
                </p>
              </div>
              {/* Log lines carry client names and URLs, which do not wrap on
                  their own. */}
              <p className="mt-2 break-words text-sm text-slate-600">{activity.action}</p>
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
