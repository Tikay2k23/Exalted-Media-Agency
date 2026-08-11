"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AssignTaskForm } from "@/components/team/assign-task-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ALL_STATUSES } from "@/lib/tasks/task-catalogue";
import { formatDate } from "@/lib/utils";

type AgencyTask = {
  id: string;
  title: string;
  note: string | null;
  status: string;
  priority: string;
  category: string;
  estimatedHours: number;
  dueDate: Date;
  assignedToId: string;
  assignedTo: {
    id: string;
    name: string;
    role: string;
    department: string;
  };
  createdBy: {
    id: string;
    name: string;
    role: string;
    department: string;
  } | null;
  client: {
    id: string;
    companyName: string;
  } | null;
};

type Option = {
  id: string;
  name: string;
  role?: string;
  department?: string;
  jobTitle?: string | null;
  weeklyCapacityHours?: number;
};

/** The statuses the queue can switch a task to, from the one catalogue. */
const statusOptions = ALL_STATUSES.map((status) => status.value);

function toneForStatus(status: string): "slate" | "sky" | "amber" | "rose" | "emerald" {
  switch (status) {
    case "IN_PROGRESS":
      return "sky";
    case "BLOCKED":
    case "REVISION_REQUIRED":
      return "rose";
    case "WAITING_CLIENT":
    case "NEEDS_REVIEW":
      return "amber";
    case "APPROVED":
    case "DONE":
      return "emerald";
    default:
      return "slate";
  }
}

function toneForPriority(priority: string): "slate" | "sky" | "amber" | "rose" {
  switch (priority) {
    case "URGENT":
      return "rose";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "sky";
    default:
      return "slate";
  }
}

export function AgencyTaskPanel({
  tasks,
  users,
  clients,
  projects,
  sops,
  canManageTasks,
  currentUserId,
  summary,
}: {
  tasks: AgencyTask[];
  users: Option[];
  clients: { id: string; companyName: string }[];
  projects: { id: string; name: string; clientId: string }[];
  sops: { id: string; reference: string; title: string; status: string }[];
  canManageTasks: boolean;
  currentUserId: string;
  summary: {
    openCount: number;
    dueSoonCount: number;
    totalEstimatedHours: number;
  };
}) {
  const router = useRouter();
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateTaskStatus(taskId: string, status: string) {
    setSavingTaskId(taskId);

    startTransition(async () => {
      await fetch(`/api/employee-tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      setSavingTaskId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {canManageTasks ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign Marketing Task</CardTitle>
            <CardDescription>
              Create and assign a marketing task with all the details your team needs to
              deliver.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssignTaskForm
              users={users}
              clients={clients}
              projects={projects}
              sops={sops}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>{canManageTasks ? "Marketing Ops Queue" : "My Assigned Tasks"}</CardTitle>
            <CardDescription>
              {summary.openCount} open task{summary.openCount === 1 ? "" : "s"},{" "}
              {summary.dueSoonCount} due in the next 7 days, and {summary.totalEstimatedHours}h
              booked across the queue.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="slate">{tasks.length} total</Badge>
            <Badge tone="amber">{summary.dueSoonCount} due soon</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tasks.length ? (
            tasks.map((task) => {
              const canUpdate = canManageTasks || currentUserId === task.assignedToId;
              const saving = isPending && savingTaskId === task.id;

              return (
                <div
                  key={task.id}
                  className="rounded-3xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-950">{task.title}</h3>
                        <Badge tone={toneForStatus(task.status)}>
                          {task.status.replaceAll("_", " ")}
                        </Badge>
                        <Badge tone={toneForPriority(task.priority)}>
                          {task.priority.replaceAll("_", " ")}
                        </Badge>
                        <Badge tone="sky">{task.category.replaceAll("_", " ")}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                        <span>
                          Assigned to {task.assignedTo.name} /{" "}
                          {task.assignedTo.department.replaceAll("_", " ")}
                        </span>
                        <span>Assigned by {task.createdBy?.name ?? "System"}</span>
                        <span>{task.estimatedHours}h booked</span>
                        <span>Due {formatDate(task.dueDate)}</span>
                        <span>{task.client?.companyName ?? "Internal task"}</span>
                      </div>
                      <p className="max-w-4xl leading-7 text-slate-600">
                        {task.note ?? "No task note added."}
                      </p>
                    </div>

                    <div className="flex min-w-52 flex-col gap-3">
                      <Select
                        value={task.status}
                        disabled={!canUpdate || saving}
                        onChange={(event) => updateTaskStatus(task.id, event.target.value)}
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.replaceAll("_", " ")}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        {saving ? (
                          <>
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Saving update...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            {canUpdate ? "Status updates saved live" : "Read only"}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No marketing ops tasks yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
