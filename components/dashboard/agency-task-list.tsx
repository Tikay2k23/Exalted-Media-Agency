import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export function AgencyTaskList({
  tasks,
}: {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    category: string;
    estimatedHours: number;
    dueDate: Date;
    note: string | null;
    assignedTo: {
      name: string;
      department: string;
    };
    client: {
      companyName: string;
    } | null;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketing Ops Queue</CardTitle>
        <CardDescription>
          Internal agency work across content, paid media, reporting, and account support.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.length ? (
          tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{task.title}</p>
                    <Badge tone="slate">{task.status.replaceAll("_", " ")}</Badge>
                    <Badge tone="amber">{task.priority.replaceAll("_", " ")}</Badge>
                    <Badge tone="sky">{task.category.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {task.assignedTo.name} / {task.assignedTo.department.replaceAll("_", " ")} /{" "}
                    {task.client?.companyName ?? "Internal"} / {task.estimatedHours}h / Due{" "}
                    {formatDate(task.dueDate)}
                  </p>
                </div>
              </div>
              {task.note ? (
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                  {task.note}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            No open agency tasks are scheduled in the current view.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
