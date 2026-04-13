"use client";

import { LoaderCircle, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const statusOptions = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE"];
const priorityOptions = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const categoryOptions = [
  "CONTENT_CALENDAR",
  "COPYWRITING",
  "CREATIVE_PRODUCTION",
  "PAID_MEDIA_OPTIMIZATION",
  "SEO_AUDIT",
  "EMAIL_CAMPAIGN",
  "CLIENT_REPORTING",
  "COMMUNITY_MANAGEMENT",
  "WEBSITE_UPDATE",
  "ANALYTICS_REVIEW",
  "INTERNAL_OPERATIONS",
];

function toneForStatus(status: string): "slate" | "sky" | "amber" | "rose" | "emerald" {
  switch (status) {
    case "IN_PROGRESS":
      return "sky";
    case "BLOCKED":
      return "rose";
    case "IN_REVIEW":
      return "amber";
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
  canManageTasks,
  currentUserId,
  summary,
}: {
  tasks: AgencyTask[];
  users: Option[];
  clients: { id: string; companyName: string }[];
  canManageTasks: boolean;
  currentUserId: string;
  summary: {
    openCount: number;
    dueSoonCount: number;
    totalEstimatedHours: number;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function createTask(formData: FormData) {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/employee-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: formData.get("title"),
          note: formData.get("note"),
          assignedToId: formData.get("assignedToId"),
          dueDate: formData.get("dueDate"),
          priority: formData.get("priority"),
          category: formData.get("category"),
          estimatedHours: formData.get("estimatedHours"),
          status: formData.get("status"),
          clientId: formData.get("clientId"),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Unable to assign task.");
        return;
      }

      setMessage("Marketing task assigned successfully.");
      router.refresh();
    });
  }

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
              Give a teammate a marketing deliverable with the right category, hours, and agency
              brief.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTask} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 xl:col-span-2">
                <span className="text-sm font-medium text-slate-600">Task title</span>
                <Input name="title" placeholder="Build monthly paid social insights deck" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Assign to</span>
                <Select name="assignedToId" defaultValue={users[0]?.id} required>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.department ? ` - ${user.department.replaceAll("_", " ")}` : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Due date</span>
                <Input
                  name="dueDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Priority</span>
                <Select name="priority" defaultValue="MEDIUM">
                  {priorityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Task category</span>
                <Select name="category" defaultValue="CONTENT_CALENDAR">
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Estimated hours</span>
                <Input
                  name="estimatedHours"
                  type="number"
                  min={1}
                  max={40}
                  defaultValue={2}
                  required
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Starting status</span>
                <Select name="status" defaultValue="TODO">
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-600">Client link</span>
                <Select name="clientId" defaultValue="">
                  <option value="">Internal / no client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-2 md:col-span-2 xl:col-span-4">
                <span className="text-sm font-medium text-slate-600">Agency note / brief</span>
                <Textarea
                  name="note"
                  placeholder="Add campaign context, deliverables, CTA, reporting expectations, blockers, and what approved work should look like."
                />
              </label>
              <div className="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3">
                <Button type="submit" className="gap-2" disabled={isPending}>
                  {isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Assign task
                </Button>
                {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              </div>
            </form>
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
