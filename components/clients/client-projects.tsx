"use client";

import { Check, FolderPlus, LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";

export interface MilestoneRow {
  id: string;
  name: string;
  dueDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  riskLevel: string;
  managerName: string | null;
  targetLaunchDate: string | null;
  percentComplete: number;
  currentMilestone: string | null;
  nextMilestone: string | null;
  overdueMilestones: number;
  milestones: MilestoneRow[];
}

const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  IN_PRODUCTION: "In production",
  INTERNAL_QA: "Internal QA",
  CLIENT_REVIEW: "Client review",
  REVISIONS: "Revisions",
  READY_FOR_LAUNCH: "Ready for launch",
  LIVE: "Live",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function ClientProjects({
  clientId,
  projects,
  managers,
  canEdit,
}: {
  clientId: string;
  projects: ProjectRow[];
  managers: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [addingMilestoneTo, setAddingMilestoneTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function post(url: string, body: unknown, onDone: () => void) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "That could not be saved.");
        return;
      }

      onDone();
      router.refresh();
    });
  }

  function toggleMilestone(milestoneId: string, completed: boolean) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "That milestone could not be updated.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Delivery projects</CardTitle>
          <CardDescription>
            Production work hangs off a project. Progress is worked out from the
            milestones, not typed in.
          </CardDescription>
        </div>
        {canEdit && !creating ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setCreating(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New project
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {projects.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            No project yet. Production cannot start without one, so create it and name a
            project manager.
          </p>
        ) : (
          <ul className="space-y-4">
            {projects.map((project) => (
              <li key={project.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {project.managerName ? (
                        `Run by ${project.managerName}`
                      ) : (
                        <span className="text-amber-700">No project manager assigned</span>
                      )}
                      {project.targetLaunchDate
                        ? ` · launch ${formatDate(project.targetLaunchDate)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="sky">{STATUS_LABEL[project.status] ?? project.status}</Badge>
                    {project.overdueMilestones > 0 ? (
                      <Badge tone="rose">
                        {project.overdueMilestones} milestone
                        {project.overdueMilestones === 1 ? "" : "s"} overdue
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {project.milestones.length === 0
                        ? "No milestones yet"
                        : `${project.percentComplete}% complete`}
                    </span>
                    {project.currentMilestone ? (
                      <span className="text-slate-500">
                        Now: {project.currentMilestone}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all"
                      style={{ width: `${project.percentComplete}%` }}
                    />
                  </div>
                </div>

                {project.milestones.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {project.milestones.map((milestone) => (
                      <li key={milestone.id} className="flex items-start gap-2.5">
                        <button
                          type="button"
                          disabled={!canEdit || isPending}
                          onClick={() =>
                            toggleMilestone(milestone.id, !milestone.completedAt)
                          }
                          aria-label={
                            milestone.completedAt
                              ? `Reopen ${milestone.name}`
                              : `Complete ${milestone.name}`
                          }
                          className={cn(
                            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
                            milestone.completedAt
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-slate-300 hover:border-slate-400",
                            !canEdit && "cursor-not-allowed opacity-60",
                          )}
                        >
                          {milestone.completedAt ? <Check className="h-3 w-3" /> : null}
                        </button>
                        <span
                          className={cn(
                            "text-sm",
                            milestone.completedAt
                              ? "text-slate-400 line-through"
                              : milestone.isOverdue
                                ? "font-medium text-rose-700"
                                : "text-slate-700",
                          )}
                        >
                          {milestone.name}
                          {milestone.dueDate ? (
                            <span className="ml-2 text-xs text-slate-400">
                              {formatDate(milestone.dueDate)}
                              {milestone.isOverdue && !milestone.completedAt
                                ? " — overdue"
                                : ""}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {canEdit ? (
                  addingMilestoneTo === project.id ? (
                    <form
                      action={(formData) =>
                        post(
                          `/api/projects/${project.id}/milestones`,
                          {
                            name: String(formData.get("name") ?? "").trim(),
                            dueDate: String(formData.get("dueDate") ?? ""),
                          },
                          () => setAddingMilestoneTo(null),
                        )
                      }
                      className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto_auto]"
                    >
                      <Input name="name" placeholder="Milestone name" required />
                      <Input name="dueDate" type="date" />
                      <Button type="submit" size="sm" disabled={isPending}>
                        Add
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setAddingMilestoneTo(null)}
                      >
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingMilestoneTo(project.id)}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add milestone
                    </button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <form
            action={(formData) =>
              post(
                `/api/clients/${clientId}/projects`,
                {
                  name: String(formData.get("name") ?? "").trim(),
                  projectManagerId: String(formData.get("projectManagerId") ?? ""),
                  targetLaunchDate: String(formData.get("targetLaunchDate") ?? ""),
                },
                () => setCreating(false),
              )
            }
            className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
          >
            <Field label="Project name">
              <Input name="name" placeholder="e.g. Website and funnel build" required />
            </Field>
            <Field label="Project manager">
              <select name="projectManagerId" defaultValue="" className={fieldClass}>
                <option value="">Nobody yet</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target launch date">
              <Input name="targetLaunchDate" type="date" />
            </Field>
            <div className="flex items-end gap-3">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderPlus className="h-4 w-4" />
                )}
                Create project
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreating(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
