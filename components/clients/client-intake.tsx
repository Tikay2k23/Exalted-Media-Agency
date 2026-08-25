"use client";

import { Copy, LoaderCircle, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatEnumLabel } from "@/lib/utils";

export interface IntakeAnswerGroup {
  title: string;
  answers: { label: string; value: string | null }[];
}

export interface IntakeState {
  exists: boolean;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNotes: string | null;
  expiresAt: string | null;
  percent: number;
  missingRequired: string[];
  groups: IntakeAnswerGroup[];
}

const STATUS_TONE: Record<string, "slate" | "amber" | "sky" | "emerald"> = {
  NOT_SENT: "slate",
  SENT: "sky",
  VIEWED: "sky",
  PARTIALLY_COMPLETED: "amber",
  SUBMITTED: "emerald",
  REVIEWED: "emerald",
};

/** The trail, in the order it happens, so "where are we" needs no explaining. */
const TRAIL = [
  { key: "sentAt", label: "Sent" },
  { key: "viewedAt", label: "Opened" },
  { key: "submittedAt", label: "Submitted" },
  { key: "reviewedAt", label: "Reviewed" },
] as const;

export function ClientIntake({
  clientId,
  canManage,
  intake,
}: {
  clientId: string;
  canManage: boolean;
  intake: IntakeState;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [isPending, startTransition] = useTransition();

  function post(body: unknown, onDone?: (data: { token?: string }) => void) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; token?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "That could not be done.");
        return;
      }

      onDone?.(data ?? {});
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Client intake</CardTitle>
          <CardDescription>
            The questions the client answers before work starts. Only the ones their
            service needs are asked.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[intake.status] ?? "slate"}>
            {formatEnumLabel(intake.status)}
          </Badge>
          {intake.exists && !intake.submittedAt ? (
            <Badge tone="slate">{intake.percent}% filled in</Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm leading-6 text-rose-700">{error}</p>
          </div>
        ) : null}

        {!intake.exists ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            Not sent yet. This is usually the first thing to do after the welcome —
            most of onboarding waits on these answers.
          </p>
        ) : (
          <ol className="flex flex-wrap items-center gap-2">
            {TRAIL.map((step) => {
              const at = intake[step.key];

              return (
                <li
                  key={step.key}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    at ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                  }`}
                  title={at ? formatDateTime(new Date(at)) : "Not yet"}
                >
                  {step.label}
                  {at ? ` · ${formatDateTime(new Date(at))}` : ""}
                </li>
              );
            })}
          </ol>
        )}

        {intake.exists && !intake.submittedAt && intake.missingRequired.length ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              Still waiting on the client for
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {intake.missingRequired.slice(0, 6).map((item) => (
                <li key={item} className="text-sm leading-6 text-amber-800">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {link ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
            <p className="text-sm font-semibold text-sky-900">
              Send this link to the client
            </p>
            <p className="mt-1 text-sm leading-6 text-sky-800">
              The system does not email it — paste it into whatever you normally write
              from. It expires, and re-sending replaces it.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input readOnly value={link} className="min-w-64 flex-1" />
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  setCopied(true);
                }}
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}

        {intake.submittedAt && intake.groups.length ? (
          <div className="space-y-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setShowAnswers((current) => !current)}
            >
              {showAnswers ? "Hide answers" : "Read what they sent"}
            </Button>

            {showAnswers
              ? intake.groups.map((group) => (
                  <div
                    key={group.title}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">{group.title}</p>
                    <dl className="mt-2 space-y-2">
                      {group.answers.map((answer) => (
                        <div key={answer.label}>
                          <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            {answer.label}
                          </dt>
                          <dd className="mt-0.5 text-sm leading-6 text-slate-700">
                            {answer.value ?? (
                              <span className="text-slate-400">Not answered</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))
              : null}
          </div>
        ) : null}

        {intake.reviewNotes ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Review note: {intake.reviewNotes}
            {intake.reviewedByName ? ` — ${intake.reviewedByName}` : ""}
          </p>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {!intake.submittedAt ? (
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                className="gap-2"
                onClick={() =>
                  post({ action: "send" }, (data) => {
                    if (data.token) {
                      setLink(`${window.location.origin}/intake/${data.token}`);
                      setCopied(false);
                    }
                  })
                }
              >
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {intake.exists ? "Send a fresh link" : "Send intake form"}
              </Button>
            ) : null}

            {intake.submittedAt && !intake.reviewedAt ? (
              reviewing ? (
                <form
                  action={(formData) =>
                    post(
                      {
                        action: "review",
                        notes: String(formData.get("notes") ?? "").trim(),
                      },
                      () => setReviewing(false),
                    )
                  }
                  className="w-full space-y-2 rounded-2xl border border-slate-200 p-3"
                >
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-600">
                      Anything worth flagging from their answers?
                    </span>
                    <Input name="notes" placeholder="No Meta account yet — needs creating" />
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={isPending}>
                      Mark reviewed
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setReviewing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button type="button" size="sm" onClick={() => setReviewing(true)}>
                  I have read this
                </Button>
              )
            ) : null}

            {/*
              * Reopening, for when the questions moved on rather than the answers
              * being wrong. The client gets their own form back with what they
              * already wrote still in it, and what they sent stays recorded.
              */}
            {intake.submittedAt ? (
              reopening ? (
                <div className="w-full space-y-2 rounded-2xl border border-slate-200 p-3">
                  <p className="text-sm text-slate-600">
                    This hands the form back with their answers still in it, so they can fill
                    in anything added since. What they already sent stays recorded, and the
                    current link stops working.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        post({ action: "reopen" }, (data) => {
                          setReopening(false);
                          if (data.token) {
                            setLink(`${window.location.origin}/intake/${data.token}`);
                            setCopied(false);
                          }
                        })
                      }
                    >
                      Reopen the form
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setReopening(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => setReopening(true)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Ask for more detail
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
