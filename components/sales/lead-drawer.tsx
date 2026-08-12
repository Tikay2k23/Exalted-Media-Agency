"use client";

import {
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  Mail,
  MessageSquare,
  Phone,
  Send,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  followUpLabel,
  isOpen,
  lastContactLabel,
  type SalesLead,
} from "@/lib/sales/sales-view";
import { formatEnumLabel } from "@/lib/utils";

type DrawerTab = "overview" | "activity" | "notes" | "follow-ups";

export interface LeadEvent {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
}

export interface LeadNote {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorRole: string | null;
}

export interface LeadCall {
  id: string;
  outcome: string;
  notes: string | null;
  durationMinutes: number | null;
  occurredAt: string;
  loggedByName: string | null;
}

const LOST_REASONS = [
  "NO_RESPONSE",
  "NO_BUDGET",
  "NOT_INTERESTED",
  "WENT_WITH_COMPETITOR",
  "BAD_FIT",
  "OUTSIDE_SERVICE_AREA",
  "TIMING",
  "DUPLICATE_LEAD",
  "OTHER",
];

function money(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function stamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

/**
 * One lead, opened over the page.
 *
 * Four tabs for four questions: what is this, what has happened to it, what
 * have we said internally, and when are we next speaking. The actions live on
 * the tab they belong to rather than in one long form - setting the next step
 * belongs beside the follow-up history, not beside the phone number.
 *
 * Rendered through a portal for the same reason as the task modal: Card carries
 * backdrop-blur, and an element with backdrop-filter becomes the containing
 * block for any fixed-position descendant.
 */
export function LeadDrawer({
  lead,
  now,
  canEdit,
  canConvert,
  onClose,
  onConvert,
}: {
  lead: SalesLead;
  now: Date;
  canEdit: boolean;
  canConvert: boolean;
  onClose: () => void;
  onConvert: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<DrawerTab>("overview");
  /*
   * One object keyed by the lead it belongs to, so "loading" is worked out from
   * what has arrived rather than tracked in its own flag. A flag has to be set
   * true and false in the right order from three places; this cannot get out of
   * step with the data it describes.
   */
  const [detail, setDetail] = useState<{
    leadId: string;
    activity: LeadEvent[];
    notes: LeadNote[];
    calls: LeadCall[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [noteDraft, setNoteDraft] = useState("");
  const [nextAction, setNextAction] = useState(lead.nextAction ?? "");
  const [nextFollowUp, setNextFollowUp] = useState(
    lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 16) : "",
  );
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("NO_RESPONSE");
  const [lostNote, setLostNote] = useState("");

  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const leadId = lead.id;

    fetch(`/api/leads/${leadId}/detail`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: { activity: LeadEvent[]; notes: LeadNote[]; calls: LeadCall[] }) => {
        if (cancelled) return;
        setDetail({ leadId, activity: data.activity, notes: data.notes, calls: data.calls });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this lead's history.");
      });

    return () => {
      cancelled = true;
    };
  }, [lead.id, reloads]);

  const loaded = detail?.leadId === lead.id ? detail : null;
  const loading = !loaded;
  const events = loaded?.activity ?? [];
  const notes = loaded?.notes ?? [];
  const calls = loaded?.calls ?? [];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previous = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  /** Every lead action goes through the one endpoint that enforces the rules. */
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/leads/${lead.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    setBusy(false);

    if (!response.ok) {
      setError(data?.error ?? "That didn't go through.");
      return false;
    }

    setReloads((count) => count + 1);
    startTransition(() => router.refresh());
    return true;
  }

  async function addNote() {
    if (!noteDraft.trim()) return;

    setBusy(true);
    setError(null);

    const response = await fetch(`/api/leads/${lead.id}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteDraft.trim() }),
    });

    const data = (await response.json().catch(() => null)) as
      | { error?: string; note?: LeadNote }
      | null;

    setBusy(false);

    if (!response.ok || !data?.note) {
      setError(data?.error ?? "That note didn't save.");
      return;
    }

    const added = data.note;
    setDetail((current) =>
      current && current.leadId === lead.id
        ? { ...current, notes: [added, ...current.notes] }
        : current,
    );
    setNoteDraft("");
  }

  const due = followUpLabel(lead.nextFollowUpAt, now);
  const live = isOpen(lead);

  const tabs: { value: DrawerTab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "activity", label: "Activity", count: events.length },
    { value: "notes", label: "Notes", count: notes.length },
    { value: "follow-ups", label: "Follow Ups", count: calls.length },
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Lead details"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/40"
        onClick={onClose}
        aria-label="Close lead details"
        tabIndex={-1}
      />

      <div className="relative flex max-h-full w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[min(46rem,90vh)] sm:max-w-xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 text-slate-950">
              {lead.contactName}
            </h2>
            <p className="text-xs text-slate-500">{lead.businessName}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="slate">{lead.stageName ?? formatEnumLabel(lead.status)}</Badge>
              {lead.wonAt ? <Badge tone="emerald">Won</Badge> : null}
              {lead.lostAt ? <Badge tone="rose">Lost</Badge> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-3">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`-mb-px border-b-2 px-2.5 py-2.5 text-xs font-semibold transition ${
                tab === item.value
                  ? "border-sky-500 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {item.label}
              {item.count ? ` (${item.count})` : ""}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "overview" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {lead.phone ? (
                  <a
                    href={`tel:${lead.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {lead.phone}
                  </a>
                ) : null}
                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {lead.email}
                  </a>
                ) : null}
              </div>

              <dl className="grid gap-x-8 sm:grid-cols-2">
                <div className="divide-y divide-slate-100">
                  <Pair label="Source">{formatEnumLabel(lead.source)}</Pair>
                  <Pair label="Owner">{lead.ownerName ?? "Unassigned"}</Pair>
                  <Pair label="Stage">{lead.stageName ?? "—"}</Pair>
                  <Pair label="Status">{formatEnumLabel(lead.status)}</Pair>
                  <Pair label="Created">{lead.createdAt.slice(0, 10)}</Pair>
                </div>
                <div className="divide-y divide-slate-100">
                  <Pair label="Estimated value">
                    {lead.finalValue ?? lead.proposalValue ?? lead.budgetAmount
                      ? money(lead.finalValue ?? lead.proposalValue ?? lead.budgetAmount ?? 0)
                      : "—"}
                  </Pair>
                  <Pair label="Last contact">
                    {lastContactLabel(lead.lastContactAt, now)}
                  </Pair>
                  <Pair label="Next follow up">
                    <span className={due.tone === "overdue" ? "text-rose-600" : undefined}>
                      {due.label}
                    </span>
                  </Pair>
                  <Pair label="Strategy call">
                    {lead.strategyCallAt
                      ? `${lead.strategyCallAt.slice(0, 10)}${
                          lead.strategyCallStatus
                            ? ` · ${formatEnumLabel(lead.strategyCallStatus)}`
                            : ""
                        }`
                      : "Not booked"}
                  </Pair>
                  <Pair label="Proposal sent">
                    {lead.proposalSentAt ? lead.proposalSentAt.slice(0, 10) : "Not sent"}
                  </Pair>
                </div>
              </dl>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-xs font-semibold text-slate-900">Next action</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {lead.nextAction ?? "Nobody has said what happens next."}
                </p>
              </div>

              {lead.notes ? (
                <div>
                  <p className="text-xs font-semibold text-slate-900">Qualification detail</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                    {lead.notes}
                  </p>
                </div>
              ) : null}

              {lead.lostReasonCode ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs font-semibold text-rose-800">
                    Lost: {formatEnumLabel(lead.lostReasonCode)}
                  </p>
                </div>
              ) : null}

              {lead.convertedClientId ? (
                <Link
                  href={`/clients/${lead.convertedClientId}`}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  <Users className="h-3.5 w-3.5" />
                  Open the client account
                </Link>
              ) : null}
            </div>
          ) : null}

          {tab === "activity" ? (
            loading ? (
              <p className="text-xs text-slate-500">Loading the timeline…</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing recorded against this lead yet.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <div className="min-w-0">
                      <p className="text-xs leading-5 text-slate-800">{event.action}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {event.actorName ?? "System"} · {stamp(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )
          ) : null}

          {tab === "notes" ? (
            <div className="space-y-3">
              {/*
                Internal only, and deliberately apart from anything the client
                sees. Mixing the two is how a note meant for the team ends up in
                an email.
              */}
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                Internal notes. Nothing here is sent to the client.
              </p>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void addNote();
                }}
                className="space-y-2"
              >
                <Textarea
                  rows={3}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="What did they say?"
                />
                <Button type="submit" size="sm" disabled={busy || !noteDraft.trim()}>
                  {busy ? (
                    <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Add note
                </Button>
              </form>

              {loading ? (
                <p className="text-xs text-slate-500">Loading notes…</p>
              ) : notes.length === 0 ? (
                <p className="text-xs text-slate-500">No notes on this lead yet.</p>
              ) : (
                notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">
                        {note.authorName}
                        {note.authorRole ? (
                          <span className="ml-1.5 font-normal text-slate-500">
                            {formatEnumLabel(note.authorRole)}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-500">{stamp(note.createdAt)}</p>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {note.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {tab === "follow-ups" ? (
            <div className="space-y-4">
              {canEdit && live ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold text-slate-900">Next step</p>

                  <Field label="What happens next">
                    <Input
                      className="h-9 text-xs"
                      placeholder="Call the decision maker"
                      value={nextAction}
                      onChange={(event) => setNextAction(event.target.value)}
                    />
                  </Field>

                  <Field label="When">
                    <Input
                      type="datetime-local"
                      className="h-9 text-xs"
                      value={nextFollowUp}
                      onChange={(event) => setNextFollowUp(event.target.value)}
                    />
                  </Field>

                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "next-step",
                        nextAction: nextAction.trim() || null,
                        nextFollowUpAt: nextFollowUp
                          ? new Date(nextFollowUp).toISOString()
                          : null,
                      })
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save next step
                  </Button>

                  <div className="flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">
                    {(["CALL", "EMAIL", "SMS", "MEETING"] as const).map((channel) => (
                      <Button
                        key={channel}
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void act({ action: "log-contact", channel })}
                      >
                        Log {channel.toLowerCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="text-xs font-semibold text-slate-900">Upcoming</p>
                <p className="mt-1 text-xs text-slate-600">
                  {lead.nextAction ? `${lead.nextAction} — ` : ""}
                  <span className={due.tone === "overdue" ? "text-rose-600" : undefined}>
                    {due.label}
                  </span>
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-900">Previous contact</p>
                {loading ? (
                  <p className="mt-1 text-xs text-slate-500">Loading…</p>
                ) : calls.length === 0 ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    No calls logged. Contact by other channels appears on the Activity tab.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {calls.map((call) => (
                      <li key={call.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <Badge tone="slate">{formatEnumLabel(call.outcome)}</Badge>
                          <p className="text-[11px] text-slate-500">
                            {stamp(call.occurredAt)}
                          </p>
                        </div>
                        {call.notes ? (
                          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                            {call.notes}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-slate-400">
                          {call.loggedByName ?? "Unknown"}
                          {call.durationMinutes ? ` · ${call.durationMinutes} min` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Outcome actions */}
        {canEdit && live ? (
          <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 p-3">
            {error ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            ) : null}

            {lostOpen ? (
              <div className="space-y-2">
                <Select
                  className="h-9 text-xs"
                  value={lostReason}
                  onChange={(event) => setLostReason(event.target.value)}
                  aria-label="Lost reason"
                >
                  {LOST_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {formatEnumLabel(reason)}
                    </option>
                  ))}
                </Select>
                <Textarea
                  rows={2}
                  value={lostNote}
                  onChange={(event) => setLostNote(event.target.value)}
                  placeholder={
                    lostReason === "OTHER"
                      ? "Describe it — required for Other."
                      : "Anything worth remembering (optional)."
                  }
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setLostOpen(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy || (lostReason === "OTHER" && !lostNote.trim())}
                    onClick={async () => {
                      const done = await act({
                        action: "mark-lost",
                        reason: lostReason,
                        note: lostNote.trim() || null,
                      });
                      if (done) onClose();
                    }}
                  >
                    Mark lost
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void act({ action: "proposal-sent" })}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Proposal sent
                </Button>

                {/*
                  Convert opens the existing handoff form, which creates the
                  client account and its onboarding work. Mark won is the
                  lighter path for an account the agency already has.
                */}
                {canConvert ? (
                  <Button size="sm" disabled={busy} onClick={onConvert}>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Convert to client
                  </Button>
                ) : null}

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:bg-rose-50"
                  disabled={busy}
                  onClick={() => setLostOpen(true)}
                >
                  <TriangleAlert className="mr-1.5 h-3.5 w-3.5" />
                  Mark lost
                </Button>
              </div>
            )}
          </div>
        ) : error ? (
          <div className="border-t border-slate-100 p-3">
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
