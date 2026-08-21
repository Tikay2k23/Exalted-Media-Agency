"use client";

import { KeyRound, LoaderCircle, Plus, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatEnumLabel } from "@/lib/utils";

export interface AccessRow {
  id: string;
  platform: string;
  platformLabel: string | null;
  accountName: string | null;
  status: string;
  permissionLevel: string | null;
  isCritical: boolean;
  twoFactorEnabled: boolean | null;
  credentialLocation: string | null;
  missingPermissions: string | null;
}

const PLATFORMS = [
  "GOHIGHLEVEL", "WEBSITE_ADMIN", "HOSTING", "DOMAIN_REGISTRAR", "DNS",
  "META_BUSINESS", "GOOGLE_ADS", "GOOGLE_ANALYTICS", "GOOGLE_TAG_MANAGER",
  "GOOGLE_SEARCH_CONSOLE", "GOOGLE_BUSINESS_PROFILE", "EMAIL_PLATFORM",
  "CALENDAR", "STRIPE", "ZAPIER", "MAKE", "N8N", "FILE_STORAGE",
  "PROJECT_MANAGEMENT", "COMMUNICATION", "PASSWORD_MANAGER",
  "SOCIAL_INSTAGRAM", "SOCIAL_FACEBOOK", "SOCIAL_LINKEDIN", "SOCIAL_TIKTOK",
  "SOCIAL_YOUTUBE", "OTHER",
] as const;

const STATUSES: { value: string; label: string }[] = [
  { value: "NOT_REQUESTED", label: "Not requested yet" },
  { value: "REQUESTED", label: "Requested" },
  { value: "PENDING_CLIENT", label: "Waiting on the client" },
  { value: "GRANTED", label: "Granted, not tested" },
  { value: "TESTED", label: "Granted and tested" },
  { value: "INSUFFICIENT_PERMISSIONS", label: "Not enough permissions" },
  { value: "FAILED", label: "Failed" },
  { value: "REVOKED", label: "Removed" },
  { value: "NOT_APPLICABLE", label: "Not needed" },
];

function statusTone(status: string) {
  switch (status) {
    case "TESTED":
      return "emerald" as const;
    case "GRANTED":
      return "sky" as const;
    case "REQUESTED":
    case "PENDING_CLIENT":
      return "amber" as const;
    case "FAILED":
    case "INSUFFICIENT_PERMISSIONS":
      return "rose" as const;
    default:
      return "slate" as const;
  }
}

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function ClientAccess({
  clientId,
  records,
  canEdit,
}: {
  clientId: string;
  records: AccessRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const critical = records.filter((record) => record.isCritical);
  const notUsable = critical.filter(
    (record) => record.status !== "GRANTED" && record.status !== "TESTED",
  );
  const untested = critical.filter((record) => record.status !== "TESTED");

  function submit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: String(formData.get("platform") ?? "OTHER"),
          platformLabel: String(formData.get("platformLabel") ?? "").trim(),
          accountName: String(formData.get("accountName") ?? "").trim(),
          status: String(formData.get("status") ?? "NOT_REQUESTED"),
          permissionLevel: String(formData.get("permissionLevel") ?? "").trim(),
          isCritical: formData.get("isCritical") === "on",
          credentialLocation: String(formData.get("credentialLocation") ?? "").trim(),
          notes: String(formData.get("notes") ?? "").trim(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't save this access record.");
        return;
      }

      setAdding(false);
      router.refresh();
    });
  }

  function changeStatus(recordId: string, status: string) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/access-records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't update this record.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Platform access</CardTitle>
          <CardDescription>
            Whether we can get into each platform, and where the credential is kept.
            Never record the password itself.
          </CardDescription>
        </div>
        {canEdit && !adding ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add platform
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {critical.length > 0 && (notUsable.length > 0 || untested.length > 0) ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {notUsable.length > 0
              ? `${notUsable.length} critical platform${notUsable.length === 1 ? " is" : "s are"} not accessible yet, which blocks production. `
              : ""}
            {notUsable.length === 0 && untested.length > 0
              ? `${untested.length} critical platform${untested.length === 1 ? " has" : "s have"} not been logged into and verified.`
              : ""}
          </p>
        ) : null}

        {records.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            No platforms tracked yet. Add each one the work depends on and mark the
            essential ones as critical.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {records.map((record) => (
              <li key={record.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {record.platformLabel || formatEnumLabel(record.platform)}
                    {record.isCritical ? (
                      <Badge tone="violet" className="ml-2">
                        Critical
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[
                      record.accountName,
                      record.permissionLevel,
                      record.credentialLocation ? `Held in ${record.credentialLocation}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No details recorded"}
                  </p>
                  {record.missingPermissions ? (
                    <p className="mt-1 text-sm text-rose-700">
                      Missing: {record.missingPermissions}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(record.status)}>
                    {STATUSES.find((option) => option.value === record.status)?.label
                      ?? formatEnumLabel(record.status)}
                  </Badge>
                  {canEdit ? (
                    <select
                      value={record.status}
                      disabled={isPending}
                      onChange={(event) => changeStatus(record.id, event.target.value)}
                      aria-label={`Access status for ${formatEnumLabel(record.platform)}`}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700"
                    >
                      {STATUSES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form action={submit} className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2">
            <Field label="Platform">
              <select name="platform" defaultValue="GOHIGHLEVEL" className={fieldClass}>
                {PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {formatEnumLabel(platform)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue="REQUESTED" className={fieldClass}>
                {STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account name" hint="The account or property, not a login.">
              <Input name="accountName" placeholder="e.g. Acme Ltd Ads account" />
            </Field>
            <Field label="Permission level">
              <Input name="permissionLevel" placeholder="e.g. Admin, Editor" />
            </Field>
            <Field label="Specific property" hint="Only when the platform above is not specific enough.">
              <Input name="platformLabel" placeholder="e.g. Instagram - second brand" />
            </Field>
            <Field
              label="Where the credential is held"
              hint="A location, never the credential. e.g. Client 1Password vault."
            >
              <Input name="credentialLocation" placeholder="Client 1Password vault" />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Notes">
                <Input name="notes" placeholder="Anything the team needs to know" />
              </Field>
            </div>

            <label className="flex items-center gap-2.5 sm:col-span-2">
              <input type="checkbox" name="isCritical" className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm text-slate-700">
                Critical — production cannot start without this
              </span>
            </label>

            <div className="flex items-start gap-2.5 rounded-xl bg-slate-100/70 px-3 py-2 sm:col-span-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <p className="text-sm leading-6 text-slate-600">
                Passwords, API keys, and tokens are rejected here. Keep them in the
                client&apos;s password manager and record only where they live.
              </p>
            </div>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Save platform
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)} disabled={isPending}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {error && !adding ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
