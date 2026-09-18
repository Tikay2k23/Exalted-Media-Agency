"use client";

import { Check, Copy, Eye, LoaderCircle, PencilLine, Plus, UserRoundX, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AccountDialog, DialogField } from "@/components/clients/account-dialog";
import { downscaleImage } from "@/components/settings/profile-settings-form";
import {
  AssignTaskModal,
  type ProjectOption,
  type SopOption,
  type TeamOption,
} from "@/components/team/assign-task-form";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

/* --- shapes, as the server hands them over --- */

interface Workload {
  open: number;
  dueSoon: number;
  overdue: number;
  highPriority: number;
}

type MemberStatus = "ACTIVE" | "ON_LEAVE" | "INACTIVE";

interface DeptMember {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  employmentType: string;
  reportsToId: string | null;
  status: MemberStatus;
  lastLoginAt: string | null;
  workload: Workload;
}

interface DeptLeader {
  id: string;
  name: string;
  email: string;
  workload: Workload;
}

export interface DepartmentView {
  key: string;
  label: string;
  leaders: DeptLeader[];
  members: DeptMember[];
}

interface AssignOptions {
  users: TeamOption[];
  clients: { id: string; companyName: string }[];
  projects: ProjectOption[];
  sops: SopOption[];
}

const STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  INACTIVE: "Inactive",
};

const STATUS_TONE: Record<MemberStatus, "emerald" | "amber" | "slate"> = {
  ACTIVE: "emerald",
  ON_LEAVE: "amber",
  INACTIVE: "slate",
};

const EMPLOYMENT_OPTIONS = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "FREELANCER", label: "Freelancer" },
] as const;

/* --- the section --- */

/**
 * My department: the people under a leader, and how busy they are.
 *
 * A leader sees their own department; the agency owner sees all four. Added to
 * My Work below the task table rather than as a page of its own - My Work is
 * where the old Team page went, and where a leader already assigns work.
 */
export function DepartmentPanel({
  departments,
  canManageAll,
  assign,
}: {
  departments: DepartmentView[];
  canManageAll: boolean;
  /** The Assign Task form's lists, for the member row's "Assign task". */
  assign: AssignOptions | null;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [statusFor, setStatusFor] = useState<DeptMember | null>(null);
  const [invite, setInvite] = useState<{ name: string; url: string } | null>(null);

  const single = departments.length === 1 ? departments[0] : null;
  const assignableIds = new Set(assign?.users.map((user) => user.id) ?? []);

  return (
    <Card id="department" className="scroll-mt-24">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{single ? `${single.label} department` : "Departments"}</CardTitle>
          <CardDescription>
            {single
              ? "The people in your department and what is on their plate."
              : "Every department, its leader, its people and their workload."}
          </CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAdding(single?.key ?? departments[0]?.key ?? null)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add Team Member
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {invite ? (
          <InviteNotice invite={invite} onDismiss={() => setInvite(null)} />
        ) : null}

        {departments.map((dept) => (
          <section key={dept.key} aria-label={`${dept.label} department`}>
            {!single ? (
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {dept.label}
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setAdding(dept.key)}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                  Add to {dept.label}
                </Button>
              </div>
            ) : null}

            {dept.leaders.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                This department has no active leader yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Due soon</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">High priority</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dept.leaders.map((leader) => (
                    <TableRow key={leader.id}>
                      <TableCell>
                        <PersonCell name={leader.name} subtitle="Leader" avatarUrl={null} />
                      </TableCell>
                      <TableCell>
                        <Badge tone="sky" className="px-2 py-0.5 text-[11px]">
                          Leader
                        </Badge>
                      </TableCell>
                      <LoadCells load={leader.workload} />
                      <TableCell className="text-right">
                        {assign && assignableIds.has(leader.id) ? (
                          <AssignTaskModal {...assign} initialAssigneeId={leader.id} triggerLabel="Assign task" />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}

                  {dept.members.map((member) => (
                    <TableRow key={member.id} className={member.status === "INACTIVE" ? "opacity-60" : undefined}>
                      <TableCell>
                        <PersonCell
                          name={member.name}
                          subtitle={member.jobTitle ?? "Team member"}
                          avatarUrl={member.avatarUrl}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge tone={STATUS_TONE[member.status]} className="px-2 py-0.5 text-[11px]">
                          {STATUS_LABEL[member.status]}
                        </Badge>
                      </TableCell>
                      <LoadCells load={member.workload} />
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setViewing(member.id)}>
                            <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
                            View
                          </Button>
                          {assign && member.status !== "INACTIVE" && assignableIds.has(member.id) ? (
                            <AssignTaskModal {...assign} initialAssigneeId={member.id} triggerLabel="Assign task" />
                          ) : null}
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setEditing(member.id)}>
                            <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
                            onClick={() => setStatusFor(member)}
                          >
                            {member.status === "INACTIVE" ? (
                              <>
                                <UserRoundCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Reactivate
                              </>
                            ) : (
                              <>
                                <UserRoundX className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Deactivate
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {dept.leaders.length && !dept.members.length ? (
              <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
                No team members yet. Add your first team member to start assigning work to them.
              </p>
            ) : null}
          </section>
        ))}
      </CardContent>

      {adding ? (
        <MemberDialog
          mode="add"
          departments={departments}
          defaultDepartment={adding}
          canManageAll={canManageAll}
          onClose={() => setAdding(null)}
          onInvite={setInvite}
        />
      ) : null}

      {editing ? (
        <MemberDialog
          mode="edit"
          memberId={editing}
          departments={departments}
          defaultDepartment={null}
          canManageAll={canManageAll}
          onClose={() => setEditing(null)}
          onInvite={setInvite}
        />
      ) : null}

      {viewing ? <ProfileDialog memberId={viewing} onClose={() => setViewing(null)} /> : null}

      {statusFor ? (
        <StatusDialog
          member={statusFor}
          colleagues={
            departments
              .find((dept) => dept.members.some((m) => m.id === statusFor.id))
              ?.members.filter((m) => m.id !== statusFor.id && m.status !== "INACTIVE")
              .map((m) => ({ id: m.id, name: m.name }))
              .concat(
                departments
                  .find((dept) => dept.members.some((m) => m.id === statusFor.id))
                  ?.leaders.map((l) => ({ id: l.id, name: `${l.name} (leader)` })) ?? [],
              ) ?? []
          }
          onClose={() => setStatusFor(null)}
        />
      ) : null}
    </Card>
  );
}

function PersonCell({ name, subtitle, avatarUrl }: { name: string; subtitle: string; avatarUrl: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar src={avatarUrl} fallback={name} alt={name} className="h-8 w-8 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        <p className="truncate text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

/** Four numbers, the overdue and high-priority ones coloured only when non-zero. */
function LoadCells({ load }: { load: Workload }) {
  return (
    <>
      <TableCell className="text-right tabular-nums text-slate-700">{load.open}</TableCell>
      <TableCell className={`text-right tabular-nums ${load.dueSoon ? "text-amber-700" : "text-slate-400"}`}>
        {load.dueSoon}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${load.overdue ? "font-semibold text-rose-600" : "text-slate-400"}`}>
        {load.overdue}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${load.highPriority ? "text-slate-900" : "text-slate-400"}`}>
        {load.highPriority}
      </TableCell>
    </>
  );
}

/**
 * The invitation link, shown once after it is made.
 *
 * Said plainly that nothing was sent: this application has no email, so the
 * link has to be passed on by whoever made it.
 */
function InviteNotice({
  invite,
  onDismiss,
}: {
  invite: { name: string; url: string };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3">
      <p className="text-sm font-medium text-slate-900">Login invitation for {invite.name}</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-600">
        Nothing has been emailed - send this link to them yourself. It works once and expires in seven days.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
          {invite.url}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(invite.url);
              setCopied(true);
            } catch {
              /* clipboard blocked; the link is on screen to copy by hand */
            }
          }}
        >
          {copied ? <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> : <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

/* --- add / edit --- */

interface ProfileData {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  phone: string | null;
  timezone: string | null;
  workingHours: string | null;
  startDate: string | null;
  notes: string | null;
  employmentType: string;
  status: MemberStatus;
  department: string;
  departmentKey: string;
  reportsTo: string | null;
  reportsToId: string | null;
  counts: { assigned: number; completed: number; overdue: number };
  openTasks: { id: string; title: string; status: string; priority: string; dueDate: string; client: string | null }[];
  clients: string[];
  projects: string[];
  recentActivity: { id: string; action: string; at: string }[];
}

function useProfile(memberId: string | null) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;

    fetch(`/api/team/members/${memberId}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) {
          setError(data?.error ?? "Could not load that person.");
          return;
        }
        setProfile(data.profile as ProfileData);
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server.");
      });

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  return { profile, error };
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

function MemberDialog({
  mode,
  memberId,
  departments,
  defaultDepartment,
  canManageAll,
  onClose,
  onInvite,
}: {
  mode: "add" | "edit";
  memberId?: string;
  departments: DepartmentView[];
  defaultDepartment: string | null;
  canManageAll: boolean;
  onClose: () => void;
  onInvite: (invite: { name: string; url: string }) => void;
}) {
  const router = useRouter();
  const { profile, error: loadError } = useProfile(mode === "edit" ? (memberId ?? null) : null);
  const [departmentKey, setDepartmentKey] = useState(defaultDepartment ?? departments[0]?.key ?? "");
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  /* Editing: the department comes from the loaded profile, once. */
  const effectiveDept = mode === "edit" ? (profile?.departmentKey ?? departmentKey) : departmentKey;
  const dept = departments.find((d) => d.key === effectiveDept) ?? null;
  const browserZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  if (mode === "edit" && !profile && !loadError) {
    return (
      <AccountDialog title="Edit team member" isDirty={false} isSaving={false} error={null} onClose={onClose} onSubmit={() => {}}>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </p>
      </AccountDialog>
    );
  }

  const initial = profile ? splitName(profile.name) : { first: "", last: "" };

  async function submit(formData: FormData) {
    if (saving) return;
    setSaving(true);
    setError(null);

    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const body: Record<string, unknown> = {
      firstName: text("firstName"),
      lastName: text("lastName"),
      phone: text("phone"),
      jobTitle: text("jobTitle"),
      employmentType: text("employmentType"),
      timezone: text("timezone"),
      workingHours: text("workingHours"),
      startDate: text("startDate"),
      notes: text("notes"),
    };

    if (avatar !== undefined) body.avatarUrl = avatar ?? "";

    if (mode === "add") {
      body.email = text("email");
      body.departmentKey = departmentKey;
      body.status = text("status") || "ACTIVE";
      body.sendInvite = formData.get("sendInvite") === "on";
      if (canManageAll && text("reportsToId")) body.reportsToId = text("reportsToId");
    } else if (canManageAll) {
      body.departmentKey = text("departmentKey") || profile?.departmentKey;
      if (text("reportsToId")) body.reportsToId = text("reportsToId");
    }

    try {
      const response = await fetch(mode === "add" ? "/api/team/members" : `/api/team/members/${memberId}`, {
        method: mode === "add" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; invite?: { url: string } | null }
        | null;

      /* Failure keeps the dialog open with everything still typed in. */
      if (!response.ok) {
        setError(data?.error ?? "That did not save.");
        return;
      }

      if (data?.invite?.url) {
        onInvite({ name: `${body.firstName} ${body.lastName}`, url: data.invite.url });
      }

      router.refresh();
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function newInvite() {
    if (!memberId || inviting) return;
    setInviting(true);
    setError(null);
    try {
      const response = await fetch(`/api/team/members/${memberId}/invite`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as { error?: string; invite?: { url: string } } | null;
      if (!response.ok || !data?.invite) {
        setError(data?.error ?? "Could not make an invitation link.");
        return;
      }
      onInvite({ name: profile?.name ?? "this member", url: data.invite.url });
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <AccountDialog
      title={mode === "add" ? "Add team member" : `Edit ${profile?.name ?? "team member"}`}
      subtitle={
        mode === "add"
          ? "They will report to the department leader."
          : `${profile?.department ?? ""} department${profile?.reportsTo ? ` · reports to ${profile.reportsTo}` : ""}`
      }
      size="wide"
      isDirty={dirty}
      isSaving={saving}
      error={error ?? loadError}
      submitLabel={mode === "add" ? "Add team member" : "Save changes"}
      submittingLabel={mode === "add" ? "Adding…" : "Saving…"}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="space-y-4" onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <DialogField label="First name">
            <Input name="firstName" defaultValue={initial.first} required />
          </DialogField>
          <DialogField label="Last name">
            <Input name="lastName" defaultValue={initial.last} required />
          </DialogField>
          <DialogField label="Email" hint={mode === "edit" ? "Changed by an admin in Manage users." : undefined}>
            <Input
              name="email"
              type="email"
              defaultValue={profile?.email ?? ""}
              required={mode === "add"}
              disabled={mode === "edit"}
            />
          </DialogField>
          <DialogField label="Phone" hint="Optional">
            <Input name="phone" type="tel" defaultValue={profile?.phone ?? ""} />
          </DialogField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DialogField
            label="Department"
            hint={!canManageAll ? "You add people to your own department." : undefined}
          >
            {mode === "add" ? (
              <Select
                value={departmentKey}
                onChange={(event) => setDepartmentKey(event.target.value)}
                disabled={!canManageAll}
              >
                {departments.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Select name="departmentKey" defaultValue={profile?.departmentKey} disabled={!canManageAll}>
                {departments.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </Select>
            )}
          </DialogField>

          {/* Only an owner chooses a leader, and only when there is a choice. */}
          {canManageAll && dept && dept.leaders.length > 1 ? (
            <DialogField label="Reports to">
              <Select name="reportsToId" defaultValue={profile?.reportsToId ?? ""}>
                {dept.leaders.map((leader) => (
                  <option key={leader.id} value={leader.id}>
                    {leader.name}
                  </option>
                ))}
              </Select>
            </DialogField>
          ) : (
            <DialogField label="Reports to">
              <Input value={dept?.leaders[0]?.name ?? "No leader yet"} disabled readOnly />
            </DialogField>
          )}

          <DialogField label="Job title" hint="Any title - e.g. GHL Specialist, Automation Assistant.">
            <Input name="jobTitle" defaultValue={profile?.jobTitle ?? ""} maxLength={80} />
          </DialogField>
          <DialogField label="Employment type">
            <Select name="employmentType" defaultValue={profile?.employmentType ?? "FULL_TIME"}>
              {EMPLOYMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {profile?.employmentType === "AGENCY_PARTNER" ? (
                <option value="AGENCY_PARTNER">Agency partner</option>
              ) : null}
            </Select>
          </DialogField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <DialogField label="Timezone">
            <Input name="timezone" defaultValue={profile?.timezone ?? browserZone} placeholder="Asia/Manila" />
          </DialogField>
          <DialogField label="Working hours" hint="Optional">
            <Input name="workingHours" defaultValue={profile?.workingHours ?? ""} placeholder="9am-6pm, Mon-Fri" />
          </DialogField>
          <DialogField label="Start date">
            <Input name="startDate" type="date" defaultValue={profile?.startDate?.slice(0, 10) ?? ""} />
          </DialogField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DialogField label="Profile photo" hint="Optional">
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                  const resized = await downscaleImage(String(reader.result));
                  if (resized) setAvatar(resized);
                  else setError("That image could not be read.");
                };
                reader.readAsDataURL(file);
              }}
            />
          </DialogField>
          {mode === "add" ? (
            <DialogField label="Status">
              <Select name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On leave</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </DialogField>
          ) : null}
        </div>

        <DialogField label="Notes" hint="Optional">
          <Textarea name="notes" rows={3} defaultValue={profile?.notes ?? ""} />
        </DialogField>

        {mode === "add" ? (
          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5">
            <input
              type="checkbox"
              name="sendInvite"
              defaultChecked
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">Create a login invitation</span>
              <span className="block text-xs leading-5 text-slate-500">
                You get a one-time link to send them, where they choose their own password. Leave this off
                to add them without a login for now.
              </span>
            </span>
          </label>
        ) : profile && profile.status !== "INACTIVE" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
            <span className="text-xs text-slate-600">Need to (re)send their login link?</span>
            <Button type="button" size="sm" variant="secondary" onClick={newInvite} disabled={inviting}>
              {inviting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              New invitation link
            </Button>
          </div>
        ) : null}
      </div>
    </AccountDialog>
  );
}

/* --- view --- */

function ProfileDialog({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { profile, error } = useProfile(memberId);

  return (
    <AccountDialog
      title={profile?.name ?? "Team member"}
      subtitle={profile ? `${profile.jobTitle ?? "Team member"} · ${profile.department}` : undefined}
      size="wide"
      isDirty={false}
      isSaving={false}
      error={error}
      submitLabel="Close"
      onClose={onClose}
      onSubmit={onClose}
    >
      {!profile ? (
        error ? null : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </p>
        )
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Avatar src={profile.avatarUrl} fallback={profile.name} alt={profile.name} className="h-12 w-12" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                <Badge tone={STATUS_TONE[profile.status]} className="px-2 py-0.5 text-[11px]">
                  {STATUS_LABEL[profile.status]}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                {profile.department} department{profile.reportsTo ? ` · reports to ${profile.reportsTo}` : ""}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Assigned", value: profile.counts.assigned, tone: "text-slate-900" },
              { label: "Completed", value: profile.counts.completed, tone: "text-emerald-700" },
              { label: "Overdue", value: profile.counts.overdue, tone: profile.counts.overdue ? "text-rose-600" : "text-slate-400" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ["Email", profile.email],
              ["Phone", profile.phone],
              ["Timezone", profile.timezone],
              ["Working hours", profile.workingHours],
              ["Start date", profile.startDate ? new Date(profile.startDate).toLocaleDateString() : null],
              [
                "Employment",
                EMPLOYMENT_OPTIONS.find((o) => o.value === profile.employmentType)?.label
                  ?? (profile.employmentType === "AGENCY_PARTNER" ? "Agency partner" : null),
              ],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="min-w-0 truncate text-right text-slate-900">{value}</dd>
                </div>
              ))}
          </dl>

          {profile.clients.length || profile.projects.length ? (
            <div>
              <p className="text-xs font-semibold text-slate-900">Working on</p>
              <p className="mt-1 text-sm text-slate-600">
                {[...profile.clients, ...profile.projects].join(" · ")}
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold text-slate-900">Open tasks</p>
            {profile.openTasks.length ? (
              <ul className="mt-1.5 space-y-1">
                {profile.openTasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{task.title}</span>
                    <span
                      className={`shrink-0 text-xs ${new Date(task.dueDate) < new Date() ? "text-rose-600" : "text-slate-500"}`}
                    >
                      {new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-500">No tasks assigned yet.</p>
            )}
          </div>

          {profile.notes ? (
            <div>
              <p className="text-xs font-semibold text-slate-900">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{profile.notes}</p>
            </div>
          ) : null}

          {profile.recentActivity.length ? (
            <div>
              <p className="text-xs font-semibold text-slate-900">Recent activity</p>
              <ol className="mt-1.5 space-y-1">
                {profile.recentActivity.map((event) => (
                  <li key={event.id} className="text-xs leading-5 text-slate-600">
                    <span className="text-slate-400">{new Date(event.at).toLocaleDateString()}</span> · {event.action}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </AccountDialog>
  );
}

/* --- status --- */

function StatusDialog({
  member,
  colleagues,
  onClose,
}: {
  member: DeptMember;
  colleagues: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<MemberStatus>(member.status === "INACTIVE" ? "ACTIVE" : "INACTIVE");
  const [reassignTo, setReassignTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaving = status === "INACTIVE" || status === "ON_LEAVE";
  const open = member.workload.open;

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/team/members/${member.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reassignToId: leaving && reassignTo ? reassignTo : null }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "That did not save.");
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountDialog
      title={`${member.name}'s status`}
      subtitle="Nobody is deleted. Completed work, comments and history stay exactly as they are."
      isDirty={false}
      isSaving={saving}
      error={error}
      submitLabel="Save status"
      submittingLabel="Saving…"
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="space-y-4">
        <DialogField label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value as MemberStatus)}>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="INACTIVE">Inactive - can no longer log in</option>
          </Select>
        </DialogField>

        {leaving && open ? (
          <DialogField
            label={`Hand on their ${open} open task${open === 1 ? "" : "s"}?`}
            hint="Optional. Moves unfinished work to somebody else in the department."
          >
            <Select value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}>
              <option value="">Keep them where they are</option>
              {colleagues.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </DialogField>
        ) : null}

        {status === "INACTIVE" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Their login stops working immediately, and any unused invitation link is cancelled. You can
            reactivate them later.
          </p>
        ) : null}
      </div>
    </AccountDialog>
  );
}
