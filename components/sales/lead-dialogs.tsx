"use client";

import { ArrowRight, LoaderCircle, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LEAD_SOURCES = [
  "WEBSITE_FORM",
  "PAID_ADS",
  "ORGANIC_SEARCH",
  "SOCIAL_MEDIA",
  "REFERRAL",
  "OUTBOUND",
  "PARTNER",
  "EVENT",
  "REPEAT_CLIENT",
  "OTHER",
] as const;

export const SERVICE_TYPES = [
  "SOCIAL_MEDIA_MANAGEMENT",
  "CONTENT_PRODUCTION",
  "PAID_ADVERTISING",
  "BRAND_STRATEGY",
  "WEBSITE_SUPPORT",
  "FUNNEL_BUILD",
  "CRM_AUTOMATION",
  "SEO",
  "EMAIL_MARKETING",
  "FULL_SERVICE_RETAINER",
] as const;

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  footer,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-slate-200 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      </div>
    </div>
  );
}

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({ label: text, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{text}</span>
      {children}
    </label>
  );
}

/**
 * What the dialogs actually read off a lead.
 *
 * Deliberately narrower than any query's row type: the forms need nine fields,
 * and naming those nine means any shape carrying them can be edited here.
 */
export interface LeadDialogRow {
  id: string;
  contactName: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  source: string;
  ownerId: string | null;
  budgetAmount: number | null;
  proposalValue: number | null;
}

export function LeadFormDialog({
  lead,
  assignableUsers,
  canAssign,
  onClose,
}: {
  lead: LeadDialogRow | null;
  assignableUsers: { id: string; name: string }[];
  canAssign: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEditing = Boolean(lead);

  function submit(formData: FormData) {
    setError(null);

    const budgetRaw = String(formData.get("budgetAmount") ?? "").trim();
    const decisionMakerRaw = String(formData.get("isDecisionMaker") ?? "");

    const body = {
      contactName: String(formData.get("contactName") ?? "").trim(),
      businessName: String(formData.get("businessName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      source: String(formData.get("source") ?? "WEBSITE_FORM"),
      serviceInterest: String(formData.get("serviceInterest") ?? "") || null,
      budgetAmount: budgetRaw ? Number(budgetRaw) : null,
      timeline: String(formData.get("timeline") ?? "").trim(),
      isDecisionMaker:
        decisionMakerRaw === "" ? null : decisionMakerRaw === "yes",
      mainProblem: String(formData.get("mainProblem") ?? "").trim(),
      goal: String(formData.get("goal") ?? "").trim(),
      nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      ...(canAssign ? { assignedToId: String(formData.get("assignedToId") ?? "") } : {}),
    };

    startTransition(async () => {
      const response = await fetch(
        isEditing ? `/api/leads/${lead!.id}` : "/api/leads",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't save this lead.");
        return;
      }

      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog
      eyebrow="Leads and sales"
      title={isEditing ? `Edit ${lead!.businessName}` : "New lead"}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="lead-form" disabled={isPending} className="gap-2">
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {isEditing ? "Save lead" : "Create lead"}
          </Button>
        </>
      }
    >
      <form id="lead-form" action={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name">
          <Input name="contactName" defaultValue={lead?.contactName ?? ""} required />
        </Field>
        <Field label="Business name">
          <Input name="businessName" defaultValue={lead?.businessName ?? ""} required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={lead?.email ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={lead?.phone ?? ""} />
        </Field>

        <Field label="Lead source">
          <select name="source" defaultValue={lead?.source ?? "WEBSITE_FORM"} className={fieldClass}>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {label(source)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Service interest">
          <select name="serviceInterest" defaultValue="" className={fieldClass}>
            <option value="">Not specified</option>
            {SERVICE_TYPES.map((service) => (
              <option key={service} value={service}>
                {label(service)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Budget">
          <Input
            name="budgetAmount"
            type="number"
            min="0"
            step="100"
            defaultValue={lead?.budgetAmount ?? ""}
            placeholder="Monthly or project budget"
          />
        </Field>
        <Field label="Timeline">
          <Input name="timeline" placeholder="e.g. ASAP, next month, Q3" />
        </Field>

        <Field label="Decision maker">
          <select name="isDecisionMaker" defaultValue="" className={fieldClass}>
            <option value="">Unknown</option>
            <option value="yes">Yes, speaking to the decision maker</option>
            <option value="no">No, needs someone else to approve</option>
          </select>
        </Field>
        <Field label="Next follow-up">
          <Input name="nextFollowUpAt" type="date" />
        </Field>

        {canAssign ? (
          <Field label="Assigned representative">
            <select
              name="assignedToId"
              defaultValue={lead?.ownerId ?? ""}
              className={fieldClass}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="sm:col-span-2">
          <Field label="Main problem">
            <textarea name="mainProblem" rows={2} className={areaClass} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Goal">
            <textarea name="goal" rows={2} className={areaClass} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea name="notes" rows={2} className={areaClass} />
          </Field>
        </div>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">
            {error}
          </p>
        ) : null}

        <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
          The qualification score is calculated from budget, authority, timeline, source,
          and how much discovery has been captured. It is recalculated on every save.
        </p>
      </form>
    </Dialog>
  );
}

export function LeadConvertDialog({
  lead,
  assignableUsers,
  canAssign,
  onClose,
}: {
  lead: LeadDialogRow;
  assignableUsers: { id: string; name: string }[];
  canAssign: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);

    const monthlyRaw = String(formData.get("monthlyValue") ?? "").trim();

    startTransition(async () => {
      const response = await fetch(`/api/leads/${lead.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceType: String(formData.get("serviceType") ?? ""),
          assignedUserId: String(formData.get("assignedUserId") ?? ""),
          monthlyValue: monthlyRaw ? Number(monthlyRaw) : null,
          notes: String(formData.get("notes") ?? "").trim(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; clientId?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "We couldn't convert this lead.");
        return;
      }

      router.refresh();
      onClose();

      if (data?.clientId) {
        window.location.assign(`/clients/${data.clientId}`);
      }
    });
  }

  return (
    <Dialog
      eyebrow="Sales handoff"
      title={`Convert ${lead.businessName}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="convert-form" disabled={isPending} className="gap-2">
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Convert to client
          </Button>
        </>
      }
    >
      <form id="convert-form" action={submit} className="space-y-4">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
          <p className="text-sm font-semibold text-sky-900">What this does</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-sky-800">
            <li>Creates a client account for {lead.businessName}.</li>
            <li>Opens it at the first stage of the client journey.</li>
            <li>Generates that stage&apos;s onboarding work automatically.</li>
            <li>Closes this lead as Won. It cannot be edited afterwards.</li>
          </ul>
        </div>

        <Field label="Service package">
          <select name="serviceType" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Select the service being delivered...
            </option>
            {SERVICE_TYPES.map((service) => (
              <option key={service} value={service}>
                {label(service)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Monthly value">
          <Input
            name="monthlyValue"
            type="number"
            min="0"
            step="100"
            defaultValue={lead.proposalValue ?? lead.budgetAmount ?? ""}
          />
        </Field>

        {canAssign ? (
          <Field label="Account owner">
            <select
              name="assignedUserId"
              defaultValue={lead.ownerId ?? ""}
              className={fieldClass}
            >
              <option value="">Keep the current lead owner</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Handoff notes">
          <textarea
            name="notes"
            rows={3}
            className={areaClass}
            placeholder="Anything delivery needs to know that is not already on the lead."
          />
        </Field>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
