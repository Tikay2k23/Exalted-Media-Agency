"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface AccountDetailsValues {
  assignedUserId: string | null;
  monthlyValue: number | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  renewalDate: string | null;
  currentBlocker: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
}

const selectClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function AccountDetailsForm({
  clientId,
  values,
  users,
  canEdit,
}: {
  clientId: string;
  values: AccountDetailsValues;
  users: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);

    const monthly = String(formData.get("monthlyValue") ?? "").trim();

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedUserId: String(formData.get("assignedUserId") ?? ""),
          monthlyValue: monthly === "" ? null : Number(monthly),
          contractStartDate: String(formData.get("contractStartDate") ?? ""),
          contractEndDate: String(formData.get("contractEndDate") ?? ""),
          renewalDate: String(formData.get("renewalDate") ?? ""),
          currentBlocker: String(formData.get("currentBlocker") ?? "").trim(),
          nextAction: String(formData.get("nextAction") ?? "").trim(),
          nextActionDueAt: String(formData.get("nextActionDueAt") ?? ""),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't save these details.");
        return;
      }

      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account details</CardTitle>
        <CardDescription>
          Contract, ownership, and the next action. Several stage requirements read these
          fields, so filling them in here is what unblocks the journey.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Account owner" hint="Who at the agency owns this relationship.">
            <select
              name="assignedUserId"
              defaultValue={values.assignedUserId ?? ""}
              disabled={!canEdit}
              className={selectClass}
            >
              <option value="">Nobody yet</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Monthly value" hint="What this account pays each month.">
            <Input
              name="monthlyValue"
              type="number"
              min="0"
              step="50"
              defaultValue={values.monthlyValue ?? ""}
              disabled={!canEdit}
            />
          </Field>

          <Field label="Contract start date">
            <Input
              name="contractStartDate"
              type="date"
              defaultValue={values.contractStartDate ?? ""}
              disabled={!canEdit}
            />
          </Field>

          <Field label="Contract end date">
            <Input
              name="contractEndDate"
              type="date"
              defaultValue={values.contractEndDate ?? ""}
              disabled={!canEdit}
            />
          </Field>

          <Field label="Renewal date" hint="When the renewal conversation should start.">
            <Input
              name="renewalDate"
              type="date"
              defaultValue={values.renewalDate ?? ""}
              disabled={!canEdit}
            />
          </Field>

          <Field label="Next action" hint="The single next thing this account needs.">
            <Input
              name="nextAction"
              defaultValue={values.nextAction ?? ""}
              placeholder="e.g. Send the onboarding form"
              disabled={!canEdit}
            />
          </Field>

          <Field label="Next action due">
            <Input
              name="nextActionDueAt"
              type="date"
              defaultValue={values.nextActionDueAt ?? ""}
              disabled={!canEdit}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Current blocker"
              hint="Leave empty when nothing is blocking. This shows on dashboards."
            >
              <Input
                name="currentBlocker"
                defaultValue={values.currentBlocker ?? ""}
                placeholder="e.g. Waiting on brand assets from the client"
                disabled={!canEdit}
              />
            </Field>
          </div>

          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={!canEdit || isPending} className="gap-2">
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save details
            </Button>
            {saved && !isPending ? (
              <span className="text-sm text-emerald-600">Saved.</span>
            ) : null}
            {!canEdit ? (
              <span className="text-sm text-slate-500">
                You do not have permission to edit this account.
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
