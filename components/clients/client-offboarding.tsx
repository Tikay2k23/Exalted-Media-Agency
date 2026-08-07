"use client";

import { CheckCircle2, Circle, LoaderCircle, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/utils";

export interface OffboardingStep {
  key: string;
  label: string;
  why: string;
  done: boolean;
}

export interface OffboardingState {
  exists: boolean;
  status: string;
  reason: string;
  reasonDetail: string | null;
  remainingWork: string | null;
  lessonsLearned: string | null;
  ownerName: string | null;
  steps: OffboardingStep[];
  outstanding: string[];
  complete: boolean;
}

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

/**
 * The lockout step. Ticking agency-access-removed before this one is refused by
 * the server, and the interface says why rather than letting somebody find out.
 */
const ADMIN_STEP = "clientAdminAccessConfirmedAt";
const REMOVAL_STEP = "agencyAccessRemovedAt";

export function ClientOffboarding({
  clientId,
  canManage,
  offboarding,
  reasons,
  owners,
}: {
  clientId: string;
  canManage: boolean;
  offboarding: OffboardingState;
  reasons: { value: string; label: string }[];
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(offboarding.exists);
  const [error, setError] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const adminConfirmed =
    offboarding.steps.find((step) => step.key === ADMIN_STEP)?.done ?? false;

  function put(body: unknown, onDone?: () => void) {
    setError(null);
    setOutstanding([]);

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/offboarding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string; outstanding?: string[] }
          | null;
        setError(data?.error ?? "That could not be saved.");
        setOutstanding(data?.outstanding ?? []);
        return;
      }

      onDone?.();
      router.refresh();
    });
  }

  function toggleStep(key: string, done: boolean) {
    put(done ? { clearSteps: [key] } : { completeSteps: [key] });
  }

  if (!offboarding.exists && !open) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Offboarding</CardTitle>
          <CardDescription>
            The end of the relationship, done in an order that cannot lock the client
            out of their own accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
              Start offboarding
            </Button>
          ) : (
            <p className="text-sm text-slate-500">Not offboarding.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Offboarding</CardTitle>
          <CardDescription>
            Everything below has to be true before the account can be closed. The order
            matters most around access.
          </CardDescription>
        </div>
        <Badge tone={offboarding.complete ? "emerald" : "amber"}>
          {formatEnumLabel(offboarding.status)}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm leading-6 text-rose-700">{error}</p>
            {outstanding.length ? (
              <ul className="mt-1.5 space-y-0.5">
                {outstanding.map((item) => (
                  <li key={item} className="text-sm leading-6 text-rose-700">
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {offboarding.exists ? (
          <ul className="space-y-2">
            {offboarding.steps.map((step) => {
              const blockedByOrder = step.key === REMOVAL_STEP && !adminConfirmed;

              return (
                <li
                  key={step.key}
                  className={`rounded-2xl border px-4 py-3 ${
                    step.done
                      ? "border-emerald-200 bg-emerald-50/50"
                      : blockedByOrder
                        ? "border-rose-200 bg-rose-50/50"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {step.done ? (
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                          aria-hidden
                        />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{step.label}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{step.why}</p>
                        {blockedByOrder ? (
                          <p className="mt-1.5 flex items-start gap-2 text-sm leading-6 text-rose-800">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            Confirm the client is an administrator first. Removing agency
                            access before that can leave nobody able to get back in.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {canManage && step.key !== "remainingWorkCleared" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isPending || (blockedByOrder && !step.done)}
                        onClick={() => toggleStep(step.key, step.done)}
                      >
                        {step.done ? "Undo" : "Mark done"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {canManage ? (
          <form
            action={(formData) =>
              put({
                status: String(formData.get("status") ?? "IN_PROGRESS"),
                reason: String(formData.get("reason") ?? "OTHER"),
                reasonDetail: String(formData.get("reasonDetail") ?? "").trim(),
                finalServiceDate: String(formData.get("finalServiceDate") ?? ""),
                supportEndsAt: String(formData.get("supportEndsAt") ?? ""),
                remainingWork: String(formData.get("remainingWork") ?? "").trim(),
                lessonsLearned: String(formData.get("lessonsLearned") ?? "").trim(),
                ownerId: String(formData.get("ownerId") ?? ""),
              })
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Why are they leaving?</span>
                <Select name="reason" defaultValue={offboarding.reason}>
                  {reasons.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Status</span>
                <Select
                  name="status"
                  defaultValue={offboarding.exists ? offboarding.status : "IN_PROGRESS"}
                >
                  {["REQUESTED", "IN_PROGRESS", "AWAITING_CLIENT", "COMPLETE", "CANCELLED"].map(
                    (status) => (
                      <option key={status} value={status}>
                        {formatEnumLabel(status)}
                      </option>
                    ),
                  )}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Final service date</span>
                <Input type="date" name="finalServiceDate" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Support ends</span>
                <Input type="date" name="supportEndsAt" />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-slate-600">Who is running it</span>
                <Select name="ownerId" defaultValue="">
                  <option value="">The account owner</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">In their words</span>
              <textarea
                name="reasonDetail"
                rows={2}
                className={areaClass}
                defaultValue={offboarding.reasonDetail ?? ""}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                What happened to the remaining work
              </span>
              <textarea
                name="remainingWork"
                rows={2}
                className={areaClass}
                placeholder="Nothing outstanding, or: the September landing page was cancelled and refunded"
                defaultValue={offboarding.remainingWork ?? ""}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                What we would do differently
              </span>
              <textarea
                name="lessonsLearned"
                rows={2}
                className={areaClass}
                defaultValue={offboarding.lessonsLearned ?? ""}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
