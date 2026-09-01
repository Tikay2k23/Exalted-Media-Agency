"use client";

import { Eye, EyeOff, KeyRound, LoaderCircle, Save, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UserRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  department: string;
  jobTitle: string | null;
  weeklyCapacityHours: number;
  isActive: boolean;
  createdAt: Date;
  assignedClients: { id: string }[];
  assignedAgencyTasks: { id: string; status: string; estimatedHours: number }[];
}

const departmentOptions = [
  "ACCOUNT_MANAGEMENT",
  "CONTENT",
  "CREATIVE",
  "DESIGN",
  "PAID_MEDIA",
  "SEO",
  "EMAIL_MARKETING",
  "WEB_DEVELOPMENT",
  "ANALYTICS",
  "OPERATIONS",
];

export function UserManagementPanel({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* The row whose password form is open, plus that form's own state. */
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetShow, setResetShow] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  function openReset(userId: string) {
    setResetUserId(userId);
    setResetValue("");
    setResetShow(false);
    setResetError(null);
    setResetMessage(null);
  }

  function closeReset() {
    setResetUserId(null);
    setResetValue("");
    setResetError(null);
  }

  async function submitReset(userId: string, userName: string) {
    if (resetBusy) return;

    if (resetValue.length < 8) {
      setResetError("A password must be at least 8 characters.");
      return;
    }

    setResetBusy(true);
    setResetError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetValue }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setResetError(data?.error ?? "Could not reset the password.");
        return;
      }

      closeReset();
      setResetMessage(`Password reset for ${userName}. Share it with them directly.`);
    } catch (resetRequestError) {
      console.error("[user-management-panel] Failed to reset password.", resetRequestError);
      setResetError("Could not reach the server. Nothing was changed.");
    } finally {
      setResetBusy(false);
    }
  }

  function handleCreate(formData: FormData) {
    setCreateError(null);
    setCreateMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          role: formData.get("role"),
          department: formData.get("department"),
          jobTitle: formData.get("jobTitle"),
          weeklyCapacityHours: formData.get("weeklyCapacityHours"),
          password: formData.get("password"),
          isActive: formData.get("isActive") === "true",
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setCreateError(data?.error ?? "Unable to create user.");
        return;
      }

      setCreateMessage("Employee profile created successfully.");
      router.refresh();
    });
  }

  function handleSave(userId: string, formData: FormData) {
    setSaveError(null);
    setSaveMessage(null);
    setActiveUserId(userId);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: userId,
            role: formData.get("role"),
            department: formData.get("department"),
            jobTitle: formData.get("jobTitle"),
            weeklyCapacityHours: formData.get("weeklyCapacityHours"),
            isActive: formData.get("isActive") === "true",
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          setSaveError(data?.error ?? "Unable to update team member.");
          setActiveUserId(null);
          return;
        }

        setSaveMessage("Team member updated successfully.");
        setActiveUserId(null);
        router.refresh();
      } catch (saveRequestError) {
        console.error("[user-management-panel] Failed to update team member.", saveRequestError);
        setSaveError("Unable to update team member.");
        setActiveUserId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Team Member</CardTitle>
          <CardDescription>
            Build employee profiles with department, role, and weekly capacity so the agency can
            plan work correctly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleCreate} className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Input name="name" placeholder="Full name" required />
            <Input
              name="email"
              type="email"
              placeholder="work email"
              required
            />
            <Select name="role" defaultValue="TEAM_MEMBER">
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="TEAM_MEMBER">Team Member</option>
            </Select>
            <Select name="department" defaultValue="CONTENT">
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
            <Input name="jobTitle" placeholder="Job title" />
            <Input
              name="weeklyCapacityHours"
              type="number"
              min={1}
              max={80}
              defaultValue={40}
              required
            />
            <Input
              name="password"
              type="password"
              placeholder="Temporary password"
              required
              className="xl:col-span-2"
            />
            <Select name="isActive" defaultValue="true">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
            <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center gap-3">
              <Button type="submit" className="gap-2" disabled={isPending}>
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Add employee
              </Button>
              {createMessage ? <p className="text-sm text-emerald-600">{createMessage}</p> : null}
              {createError ? <p className="text-sm text-rose-600">{createError}</p> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agency Team Directory</CardTitle>
          <CardDescription>
            Update role, department, title, and weekly capacity to keep staffing and workload
            planning aligned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {saveMessage ? <p className="text-sm text-emerald-600">{saveMessage}</p> : null}
            {saveError ? <p className="text-sm text-rose-600">{saveError}</p> : null}
            {resetMessage ? <p className="text-sm text-emerald-600">{resetMessage}</p> : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Client book</TableHead>
                <TableHead>Booked hours</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const saving = isPending && activeUserId === user.id;
                const isCurrentUser = user.id === currentUserId;
                const bookedHours = user.assignedAgencyTasks
                  .filter((task) => task.status !== "DONE")
                  .reduce((total, task) => total + task.estimatedHours, 0);

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar src={user.avatarUrl} fallback={user.name} alt={user.name} />
                        <div>
                          <p className="font-medium text-slate-950">{user.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                            {user.jobTitle ?? "No title"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <form
                        id={`user-${user.id}`}
                        action={(formData) => handleSave(user.id, formData)}
                        className="grid gap-3"
                      >
                        <Select name="role" defaultValue={user.role} disabled={isCurrentUser}>
                          <option value="ADMIN">Admin</option>
                          <option value="MANAGER">Manager</option>
                          <option value="TEAM_MEMBER">Team Member</option>
                        </Select>
                      </form>
                    </TableCell>
                    <TableCell>
                      <Select
                        form={`user-${user.id}`}
                        name="department"
                        defaultValue={user.department}
                      >
                        {departmentOptions.map((department) => (
                          <option key={department} value={department}>
                            {department.replaceAll("_", " ")}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        form={`user-${user.id}`}
                        name="jobTitle"
                        defaultValue={user.jobTitle ?? ""}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        form={`user-${user.id}`}
                        name="weeklyCapacityHours"
                        type="number"
                        min={1}
                        max={80}
                        defaultValue={user.weeklyCapacityHours}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        form={`user-${user.id}`}
                        name="isActive"
                        defaultValue={String(user.isActive)}
                        disabled={isCurrentUser}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </Select>
                    </TableCell>
                    <TableCell>{user.assignedClients.length}</TableCell>
                    <TableCell>
                      {bookedHours}h / {user.weeklyCapacityHours}h
                      {isCurrentUser ? (
                        <p className="mt-1 text-xs text-slate-400">Current session</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="submit"
                          form={`user-${user.id}`}
                          size="sm"
                          className="gap-2"
                          disabled={saving}
                        >
                          {saving ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            resetUserId === user.id ? closeReset() : openReset(user.id)
                          }
                        >
                          <KeyRound className="h-4 w-4" />
                          Password
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* The password form, opened under whichever row asked for it. */}
              {(() => {
                const target = users.find((candidate) => candidate.id === resetUserId);

                if (!target) return null;

                return (
                  <TableRow key={`${target.id}-reset`}>
                    <TableCell colSpan={10}>
                      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Set a new password for {target.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {target.email}. They sign in with this immediately. It is never shown
                            again, so copy it before you close this — hand it over directly, not by
                            email.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <Input
                              type={resetShow ? "text" : "password"}
                              value={resetValue}
                              onChange={(event) => setResetValue(event.target.value)}
                              placeholder="New password (min 8 characters)"
                              autoComplete="new-password"
                              className="w-72 pr-10"
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void submitReset(target.id, target.name);
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setResetShow((shown) => !shown)}
                              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                              aria-label={resetShow ? "Hide password" : "Show password"}
                            >
                              {resetShow ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            className="gap-2"
                            disabled={resetBusy}
                            onClick={() => void submitReset(target.id, target.name)}
                          >
                            {resetBusy ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <KeyRound className="h-4 w-4" />
                            )}
                            Set password
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={resetBusy}
                            onClick={closeReset}
                          >
                            Cancel
                          </Button>

                          {resetError ? (
                            <p className="text-sm text-rose-600">{resetError}</p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
