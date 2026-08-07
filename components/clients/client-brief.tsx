"use client";

import { CheckCircle2, LoaderCircle, Save, Send, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface BriefValues {
  [key: string]: string | null;
}

export interface BriefState {
  exists: boolean;
  status: string;
  authorName: string | null;
  authorId: string | null;
  approvedByName: string | null;
  values: BriefValues;
  missing: string[];
  answered: number;
  total: number;
}

/**
 * Required questions are marked so the person filling it in knows which ones
 * actually gate production, rather than treating all eighteen as equal.
 */
const SECTIONS: { title: string; fields: { key: string; label: string; required?: boolean }[] }[] = [
  {
    title: "What we are trying to achieve",
    fields: [
      { key: "primaryGoal", label: "Primary business goal", required: true },
      { key: "successMetrics", label: "How success will be measured", required: true },
      { key: "targetAudience", label: "Target audience", required: true },
      { key: "mainOffer", label: "The offer", required: true },
      { key: "serviceArea", label: "Service area" },
      { key: "callToAction", label: "Main call to action" },
    ],
  },
  {
    title: "How we will do it",
    fields: [
      { key: "customerJourney", label: "Customer journey" },
      { key: "funnelStrategy", label: "Funnel strategy" },
      { key: "crmStrategy", label: "CRM strategy" },
      { key: "advertisingStrategy", label: "Advertising strategy" },
      { key: "trackingStrategy", label: "Tracking strategy" },
      { key: "contentStrategy", label: "Content strategy" },
      { key: "technicalArchitecture", label: "Technical setup" },
    ],
  },
  {
    title: "Who does what, and what could go wrong",
    fields: [
      { key: "agencyResponsibilities", label: "What the agency will do", required: true },
      { key: "clientResponsibilities", label: "What the client must do", required: true },
      { key: "risks", label: "Risks" },
      { key: "dependencies", label: "Dependencies" },
      { key: "timelineSummary", label: "Timeline" },
    ],
  },
];

const STATUS_LABEL: Record<string, { label: string; tone: "slate" | "amber" | "emerald" | "rose" }> = {
  DRAFT: { label: "Draft", tone: "slate" },
  IN_REVIEW: { label: "Waiting for approval", tone: "amber" },
  APPROVED: { label: "Approved", tone: "emerald" },
  NEEDS_REVISION: { label: "Needs changes", tone: "rose" },
  ARCHIVED: { label: "Archived", tone: "slate" },
};

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50";

export function ClientBrief({
  clientId,
  brief,
  currentUserId,
  canEdit,
}: {
  clientId: string;
  brief: BriefState;
  currentUserId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!brief.exists || brief.status !== "APPROVED");
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const status = STATUS_LABEL[brief.status] ?? { label: brief.status, tone: "slate" as const };
  const isAuthor = brief.authorId !== null && brief.authorId === currentUserId;

  function save(formData: FormData) {
    setError(null);
    setMissing([]);
    setSaved(false);

    const payload: Record<string, string> = {};
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        payload[field.key] = String(formData.get(field.key) ?? "").trim();
      }
    }

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/brief`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't save the brief.");
        return;
      }

      setSaved(true);
      router.refresh();
    });
  }

  function review(body: unknown, onDone?: () => void) {
    setError(null);
    setMissing([]);

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/brief/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string; missing?: string[] }
          | null;
        setError(data?.error ?? "That could not be saved.");
        setMissing(data?.missing ?? []);
        return;
      }

      onDone?.();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Strategy brief</CardTitle>
          <CardDescription>
            The agreed plan. Production cannot start until somebody other than the author
            has approved it.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {brief.exists ? (
            <Badge tone={brief.missing.length ? "amber" : "slate"}>
              {brief.answered} of {brief.total} required answers
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {brief.status === "APPROVED" ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <p className="text-sm leading-6 text-emerald-900">
              Approved{brief.approvedByName ? ` by ${brief.approvedByName}` : ""}. Editing
              it now sends it back for approval, because production is gated on this.
            </p>
          </div>
        ) : null}

        {brief.exists && brief.missing.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              Still needed before this can be approved
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {brief.missing.map((item) => (
                <li key={item} className="text-sm leading-6 text-amber-800">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!brief.exists ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            No brief yet. Six answers are needed before anyone can approve it; the rest
            are useful but optional.
          </p>
        ) : null}

        {!open ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Show the brief
          </Button>
        ) : (
          <form action={save} className="space-y-5">
            {SECTIONS.map((section) => (
              <div key={section.title} className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">{section.title}</p>
                <div className="grid gap-3">
                  {section.fields.map((field) => (
                    <label key={field.key} className="block space-y-1.5">
                      <span className="text-sm font-medium text-slate-600">
                        {field.label}
                        {field.required ? (
                          <span className="ml-1.5 text-xs font-normal text-amber-700">
                            required to approve
                          </span>
                        ) : null}
                      </span>
                      <textarea
                        name={field.key}
                        rows={2}
                        defaultValue={brief.values[field.key] ?? ""}
                        disabled={!canEdit}
                        className={areaClass}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-sm text-rose-700">{error}</p>
                {missing.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {missing.map((item) => (
                      <li key={item} className="text-sm leading-6 text-rose-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!canEdit || isPending} className="gap-2">
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save brief
              </Button>

              {canEdit && brief.exists && brief.status !== "IN_REVIEW" && brief.status !== "APPROVED" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => review({ action: "submit" })}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  Send for approval
                </Button>
              ) : null}

              {canEdit && brief.status === "IN_REVIEW" ? (
                isAuthor ? (
                  <span className="inline-flex items-start gap-2 text-sm leading-6 text-amber-800">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    You wrote this, so somebody else has to approve it.
                  </span>
                ) : (
                  <>
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => review({ action: "approve" })}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => setRejecting(true)}
                    >
                      Ask for changes
                    </Button>
                  </>
                )
              ) : null}

              {saved && !isPending ? (
                <span className="text-sm text-emerald-600">Saved.</span>
              ) : null}
              {brief.authorName ? (
                <span className="text-sm text-slate-400">Written by {brief.authorName}</span>
              ) : null}
            </div>
          </form>
        )}

        {rejecting ? (
          <form
            action={(formData) =>
              review(
                {
                  action: "requestRevision",
                  reason: String(formData.get("reason") ?? "").trim(),
                },
                () => setRejecting(false),
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">
                What needs changing?
              </span>
              <Input
                name="reason"
                required
                placeholder="The success metrics are not measurable"
              />
            </label>
            <div className="flex gap-3">
              <Button type="submit" size="sm" disabled={isPending}>
                Send back
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setRejecting(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
