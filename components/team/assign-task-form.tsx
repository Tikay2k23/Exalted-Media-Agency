"use client";

import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Plus,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORY_GUIDES,
  PLATFORM_OPTIONS,
  RECURRENCE_OPTIONS,
  STARTING_STATUSES,
  categoryGuide,
} from "@/lib/tasks/task-catalogue";

export interface TeamOption {
  id: string;
  name: string;
  teamRole?: string;
}

export interface ProjectOption {
  id: string;
  name: string;
  clientId: string;
}

export interface SopOption {
  id: string;
  reference: string;
  title: string;
  status: string;
}

const PRIORITIES = [
  { value: "LOW", label: "Low", dot: "bg-slate-300" },
  { value: "MEDIUM", label: "Medium", dot: "bg-amber-400" },
  { value: "HIGH", label: "High", dot: "bg-orange-500" },
  { value: "URGENT", label: "Urgent", dot: "bg-rose-500" },
  { value: "CRITICAL", label: "Critical", dot: "bg-rose-700" },
];

/** Labels for the seats, so the panel names a job rather than an enum. */
const ROLE_LABELS: Record<string, string> = {
  AGENCY_OWNER: "Agency Owner",
  SALES_REP: "Sales Representative",
  PROJECT_MANAGER: "Project Manager and Client Success",
  AUTOMATION_SPECIALIST: "GoHighLevel and Automation Specialist",
  CREATIVE_SPECIALIST: "Website, Funnel, Design and Copy Specialist",
  ADS_SPECIALIST: "Ads, Tracking and Reporting Specialist",
};

function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="text-sm font-medium text-slate-600">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

/**
 * Assigning work.
 *
 * The form collects what somebody needs in order to start without asking three
 * questions first, and the panel beside it says what this kind of work usually
 * involves. The panel is guidance, never a constraint: it suggests who normally
 * does this, and the person assigning is free to ignore it, because they know
 * things this table does not - like who is on leave.
 */
export function AssignTaskForm({
  users,
  clients,
  projects,
  sops,
}: {
  users: TeamOption[];
  clients: { id: string; companyName: string }[];
  projects: ProjectOption[];
  sops: SopOption[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>(CATEGORY_GUIDES[0].value);
  const [clientId, setClientId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const guide = categoryGuide(category as never);

  // Only campaigns belonging to the chosen client. A campaign from another
  // account would put the task on two clients at once.
  const availableProjects = useMemo(
    () => (clientId ? projects.filter((project) => project.clientId === clientId) : []),
    [clientId, projects],
  );

  // The SOPs this category points at, but only the ones that actually exist in
  // the library. Naming a document nobody can open is worse than naming none.
  const relatedSops = useMemo(() => {
    if (!guide) return [];
    return guide.sopReferences
      .map((reference) => sops.find((sop) => sop.reference === reference))
      .filter((sop): sop is SopOption => Boolean(sop));
  }, [guide, sops]);

  const suggested = guide
    ? users.filter((user) => user.teamRole === guide.specialist)
    : [];

  function submit(formData: FormData) {
    setError(null);
    setSuccess(null);

    const payload = {
      title: String(formData.get("title") ?? "").trim(),
      assignedToId: String(formData.get("assignedToId") ?? ""),
      dueDate: String(formData.get("dueDate") ?? ""),
      priority: String(formData.get("priority") ?? "MEDIUM"),
      category: String(formData.get("category") ?? ""),
      estimatedHours: Number(formData.get("estimatedHours") ?? 2),
      status: String(formData.get("status") ?? "TODO"),
      clientId: String(formData.get("clientId") ?? ""),
      projectId: String(formData.get("projectId") ?? ""),
      platform: String(formData.get("platform") ?? "") || null,
      objective: String(formData.get("objective") ?? "").trim(),
      completionCriteria: String(formData.get("completionCriteria") ?? "").trim(),
      reviewerId: String(formData.get("reviewerId") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      note: String(formData.get("note") ?? "").trim(),
      requiredAssets: String(formData.get("requiredAssets") ?? "").trim(),
      kpi: String(formData.get("kpi") ?? "").trim(),
      blocker: String(formData.get("blocker") ?? "").trim(),
      recurrence: String(formData.get("recurrence") ?? "NONE"),
    };

    if (!payload.title || !payload.assignedToId || !payload.dueDate || !payload.category) {
      setError("Task title, assignee, category and due date are all needed.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/employee-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; deduplicated?: boolean }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "We couldn't assign that task.");
        return;
      }

      const who = users.find((user) => user.id === payload.assignedToId)?.name ?? "the team";

      setSuccess(
        data?.deduplicated
          ? `Already assigned to ${who} — nothing was duplicated.`
          : `Assigned to ${who}. It is on their My Work page and in the queue below.`,
      );

      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <form action={submit} className="space-y-4">
        {/* Row 1 — what, who, when */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[2fr_1.5fr_1fr]">
          <Field label="Task title" required>
            <Input name="title" placeholder="Build monthly paid social insights deck" required />
          </Field>
          <Field label="Assign to" required>
            <Select
              name="assignedToId"
              required
              value={assignedToId}
              onChange={(event) => setAssignedToId(event.target.value)}
            >
              <option value="">Choose a teammate</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                  {user.teamRole ? ` — ${ROLE_LABELS[user.teamRole] ?? user.teamRole}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" required>
            <Input type="date" name="dueDate" required />
          </Field>
        </div>

        {/* Row 2 — how urgent, what kind, how long, where it starts */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-4">
          <Field label="Priority">
            <Select name="priority" defaultValue="MEDIUM">
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Task category" required>
            <Select
              name="category"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORY_GUIDES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated hours">
            <Input type="number" name="estimatedHours" min={1} max={40} defaultValue={2} />
          </Field>
          <Field label="Starting status">
            <Select name="status" defaultValue="TODO">
              {STARTING_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Row 3 — who it is for, and where */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-4">
          <Field label="Client / account">
            <Select
              name="clientId"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            >
              <option value="">Internal / no client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Campaign / project"
            hint={clientId ? undefined : "Pick a client first."}
          >
            <Select name="projectId" disabled={!clientId}>
              <option value="">Not campaign specific</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Platform / channel">
            <Select name="platform" defaultValue="">
              <option value="">Not platform specific</option>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Task objective">
            <Input name="objective" placeholder="Generate leads" />
          </Field>
        </div>

        {/* Row 4 — what done looks like, who checks it, when it starts */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[2fr_1.2fr_1fr]">
          <Field
            label="Deliverable / expected outcome"
            hint="What exactly should exist when this is finished?"
          >
            <Input
              name="completionCriteria"
              placeholder="Monthly paid social insights deck with performance analysis and recommendations."
            />
          </Field>
          <Field label="Reviewer / approver" hint="Naming somebody marks this as needing review.">
            <Select name="reviewerId" defaultValue="">
              <option value="">Nobody</option>
              {users
                .filter((user) => user.id !== assignedToId)
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" name="startDate" />
          </Field>
        </div>

        {/* Row 5 — the brief and what they need to do it */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <Field label="Agency brief / instructions">
            <Textarea
              name="note"
              rows={4}
              placeholder="Include key metrics (leads, CPL, CTR, spend), top performing ads, audience insights, and recommendations for next month."
            />
          </Field>
          <Field
            label="Required assets / links"
            hint="Links to drives, boards and docs. Never passwords — access is granted through the access register."
          >
            <Textarea
              name="requiredAssets"
              rows={4}
              placeholder="Google Drive folder, Meta Ads Manager access, last month report"
            />
          </Field>
        </div>

        {/* Row 6 — how success is judged, what is in the way, how often */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          <Field label="KPI / success metric">
            <Input name="kpi" placeholder="CPL below 30 and increase leads by 20%" />
          </Field>
          <Field label="Dependency / blocker">
            <Input name="blocker" placeholder="Waiting for latest ad spend confirmation" />
          </Field>
          <Field label="Recurring task">
            <Select name="recurrence" defaultValue="NONE">
              {RECURRENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {success}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending} className="gap-2">
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Assign task
          </Button>
          {isPending ? (
            <span className="text-sm text-slate-500">Saving…</span>
          ) : null}
        </div>
      </form>

      {/* Guidance. Below the form on smaller screens. */}
      <aside className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <p className="text-sm font-semibold text-slate-900">About this task</p>

        {guide ? (
          <>
            <section className="flex items-start gap-2.5">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                  Category
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">{guide.label}</p>
                <p className="mt-0.5 text-sm leading-6 text-slate-600">{guide.description}</p>
              </div>
            </section>

            <section className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                  Suggested specialist
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {ROLE_LABELS[guide.specialist] ?? guide.specialist}
                </p>
                <p className="mt-0.5 text-sm leading-6 text-slate-600">
                  {suggested.length
                    ? `${suggested.map((user) => user.name).join(", ")} holds this seat.`
                    : "Nobody holds this seat yet."}
                </p>
              </div>
            </section>

            <section className="flex items-start gap-2.5">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                  Typical deliverables
                </p>
                <ul className="mt-1 space-y-0.5">
                  {guide.deliverables.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-1.5 text-sm leading-6 text-slate-700"
                    >
                      <CheckCircle2
                        className="mt-1 h-3 w-3 shrink-0 text-emerald-500"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="flex items-start gap-2.5">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                  Related SOPs
                </p>
                {relatedSops.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {relatedSops.map((sop) => (
                      <li key={sop.id} className="text-sm leading-6 text-slate-700">
                        {sop.reference} — {sop.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-sm leading-6 text-slate-500">
                    None in the library yet.
                  </p>
                )}
              </div>
            </section>

            <Link
              href="/governance"
              className="block rounded-xl border border-slate-200 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View all SOPs
            </Link>
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            Choose a category to see who normally does this and what it usually involves.
          </p>
        )}
      </aside>
    </div>
  );
}
