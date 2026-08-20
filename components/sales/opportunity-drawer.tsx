"use client";

import {
  Banknote,
  CalendarDays,
  ClipboardList,
  History,
  Layers,
  LoaderCircle,
  Mail,
  Phone,
  Plus,
  Rocket,
  SquareCheckBig,
  StickyNote,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";

import { HandoffPanel } from "@/components/sales/handoff-panel";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  ActivityIndicators,
  CustomTag,
  FollowUpText,
  OwnerAvatar,
  StageTag,
  money,
} from "@/components/sales/opportunity-bits";
import { StageProgress } from "@/components/sales/stage-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { stageStatusLabel, stageTag } from "@/lib/sales/pipeline-board";
import {
  dealValue,
  lastContactLabel,
  opportunityLabel,
  type SalesLead,
} from "@/lib/sales/sales-view";
import { formatEnumLabel } from "@/lib/utils";

/**
 * Something the drawer wants the workspace to open a dialog for.
 *
 * A shape rather than an encoded string, because a stage pick carries which
 * stage - and "stage:strategy_call_booked:Strategy Call" parsed back out at the
 * other end is a bug waiting for the first label with a colon in it.
 */
export interface DrawerAction {
  kind: string;
  targetStage?: { stageKey: string; label: string };
}

export type DrawerSection =
  | "details"
  | "qualification"
  | "proposal"
  | "onboarding"
  | "appointment"
  | "tasks"
  | "notes"
  | "payments"
  | "records"
  | "activity";

const SECTIONS: { key: DrawerSection; label: string; icon: typeof Target }[] = [
  { key: "details", label: "Opportunity Details", icon: Layers },
  { key: "qualification", label: "Lead Qualification", icon: Target },
  { key: "proposal", label: "Proposal and Sales", icon: TrendingUp },
  { key: "onboarding", label: "Client Onboarding", icon: Rocket },
  { key: "appointment", label: "Book / Update Appointment", icon: CalendarDays },
  { key: "tasks", label: "Tasks", icon: SquareCheckBig },
  { key: "notes", label: "Notes", icon: StickyNote },
  { key: "payments", label: "Payments", icon: Banknote },
  { key: "records", label: "Associated Records", icon: ClipboardList },
  { key: "activity", label: "Activity", icon: History },
];

interface DetailPayload {
  activity: { id: string; action: string; createdAt: string; actorName: string | null }[];
  notes: {
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    authorRole: string | null;
  }[];
  calls: {
    id: string;
    outcome: string;
    notes: string | null;
    durationMinutes: number | null;
    occurredAt: string;
    loggedByName: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: string;
    assigneeName: string | null;
  }[];
  followers: { id: string; name: string }[];
  client: {
    id: string;
    companyName: string;
    status: string;
    stageName: string | null;
    stageEnteredAt: string;
    onboardingStatus: string | null;
    onboardingCompletedAt: string | null;
  } | null;
  invoices: {
    id: string;
    invoiceNumber: string;
    amountDue: number;
    amountPaid: number;
    status: string;
    issuedAt: string | null;
    dueAt: string | null;
  }[];
  siblings: { id: string; name: string; stageName: string | null; status: string; value: number }[];
}

function when(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function day(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A label over a value, the shape every read-only field in here takes. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 break-words text-xs text-slate-800">{children ?? "—"}</div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
      {children}
    </p>
  );
}

/**
 * One opportunity, in full.
 *
 * The same component behind a board card and a list row. Two detail panels for
 * one record is how a field comes to be editable in one place and stale in the
 * other, so there is deliberately only this one.
 *
 * Sections down the left rather than tabs across the top: there are ten of
 * them, tabs would wrap, and the left rail can say which ones have anything in
 * them. Everything the drawer needs arrives in a single request when it opens.
 */
export function OpportunityDrawer({
  lead,
  now,
  section,
  owners,
  canEdit,
  canAssign,
  canConfirmPayment,
  canRetryHandoff,
  onSection,
  onClose,
  onAction,
}: {
  lead: SalesLead;
  now: Date;
  section: DrawerSection;
  owners: { id: string; name: string }[];
  canEdit: boolean;
  canAssign: boolean;
  canConfirmPayment: boolean;
  canRetryHandoff: boolean;
  onSection: (section: DrawerSection) => void;
  onClose: () => void;
  onAction: (action: DrawerAction, lead: SalesLead) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [detail, setDetail] = useState<{ id: string; data: DetailPayload } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState({ title: "", dueDate: "", assignedToId: "" });
  const [showTaskForm, setShowTaskForm] = useState(false);

  /*
   * Loading is derived from whether the data on hand belongs to the lead that
   * is open, rather than a flag set in an effect. A flag gets out of step the
   * moment somebody opens a second opportunity before the first has answered.
   */
  const loading = detail?.id !== lead.id;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/leads/${lead.id}/detail`);

      if (cancelled) return;

      if (!response.ok) {
        setError("Could not load this opportunity's history.");
        return;
      }

      const data = (await response.json()) as DetailPayload;

      if (!cancelled) setDetail({ id: lead.id, data });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [lead.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const data = detail?.id === lead.id ? detail.data : null;
  const tag = stageTag(lead);
  const value = dealValue(lead);

  /** Sections worth a badge, counted from what actually came back. */
  const counts = useMemo(
    () =>
      ({
        tasks: data?.tasks.length ?? lead.activity.tasks,
        notes: data?.notes.length ?? lead.activity.notes,
        payments: data?.invoices.length ?? 0,
        records: data?.siblings.length ?? 0,
        activity: data?.activity.length ?? 0,
      }) as Partial<Record<DrawerSection, number>>,
    [data, lead.activity.notes, lead.activity.tasks],
  );

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/leads/${lead.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setBusy(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "That didn't save.");
      return false;
    }

    // Refresh rather than patching local state: the server row is what every
    // count on the page is derived from, so it has to be the thing that moves.
    setDetail(null);
    startTransition(() => router.refresh());
    return true;
  }

  async function addNote() {
    const body = noteDraft.trim();

    if (!body) return;

    setBusy(true);
    setError(null);

    const response = await fetch(`/api/leads/${lead.id}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    setBusy(false);

    if (!response.ok) {
      setError("That note didn't save.");
      return;
    }

    setNoteDraft("");
    setDetail(null);
    startTransition(() => router.refresh());
  }

  async function addTag() {
    const tagValue = tagDraft.trim();

    if (!tagValue) return;
    if (lead.tags.includes(tagValue)) {
      setTagDraft("");
      return;
    }

    if (await post({ action: "set-tags", tags: [...lead.tags, tagValue] })) {
      setTagDraft("");
    }
  }

  async function addTask() {
    if (!taskDraft.title.trim() || !taskDraft.dueDate) {
      setError("A task needs a title and a due date.");
      return;
    }

    const saved = await post({
      action: "add-task",
      title: taskDraft.title.trim(),
      dueDate: taskDraft.dueDate,
      assignedToId: taskDraft.assignedToId || null,
    });

    if (saved) {
      setTaskDraft({ title: "", dueDate: "", assignedToId: "" });
      setShowTaskForm(false);
    }
  }

  const body = (
    /*
     * Portalled to the body. Every card on this page carries a backdrop blur,
     * and backdrop-filter makes a containing block for position:fixed - so a
     * drawer rendered in place would be trapped inside whichever card it came
     * from rather than covering the window.
     */
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/50"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Opportunity ${opportunityLabel(lead)}`}
        className="relative flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <OwnerAvatar name={lead.contactName} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="truncate text-base font-semibold text-slate-950">
                {opportunityLabel(lead)}
              </h2>
              <StageTag tag={tag} />
              <Badge tone="slate">{stageStatusLabel(lead)}</Badge>
            </div>
            <p className="truncate text-xs text-slate-500">
              {lead.businessName} · {lead.contactName}
              {value ? ` · ${money(value)}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {lead.phone ? (
              <a
                href={`tel:${lead.phone}`}
                aria-label={`Call ${lead.contactName}`}
                className="rounded-lg border border-slate-200 p-2 text-emerald-600 transition hover:bg-slate-50"
              >
                <Phone className="h-4 w-4" />
              </a>
            ) : null}
            {lead.email ? (
              <a
                href={`mailto:${lead.email}`}
                aria-label={`Email ${lead.contactName}`}
                className="rounded-lg border border-slate-200 p-2 text-sky-600 transition hover:bg-slate-50"
              >
                <Mail className="h-4 w-4" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error ? (
          <p className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1">
          {/* Left navigation. Scrolls on its own so a long section cannot push it away. */}
          <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-100 p-2 sm:block">
            {SECTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onSection(key)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                  section === key
                    ? "bg-slate-950 font-semibold text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {counts[key] ? (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold ${
                      section === key ? "bg-white/20" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {counts[key]}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          {/* The same list as a select, where there is no room for a rail. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-slate-100 p-3 sm:hidden">
              <Select
                value={section}
                onChange={(event) => onSection(event.target.value as DrawerSection)}
                aria-label="Section"
                className="h-9 text-xs"
              >
                {SECTIONS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {section === "details" ? (
                <div className="space-y-6">
                  {/*
                    * First in the drawer once a deal is won: what happened to
                    * it matters more than the contact details somebody already
                    * knows by then.
                    */}
                  <HandoffPanel
                    leadId={lead.id}
                    handoffState={lead.handoffState}
                    clientId={lead.handoffClientId ?? lead.convertedClientId}
                    canConfirmPayment={canConfirmPayment}
                    canRetry={canRetryHandoff}
                  />

                  <Section title="Contact">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Primary contact">{lead.contactName}</Field>
                      <Field label="Business">{lead.businessName}</Field>
                      <Field label="Email">{lead.email ?? "—"}</Field>
                      <Field label="Phone">{lead.phone ?? "—"}</Field>
                      <Field label="Source">{formatEnumLabel(lead.source)}</Field>
                      <Field label="Campaign">{lead.campaign ?? "—"}</Field>
                    </div>
                  </Section>

                  <Section
                    title="Opportunity"
                    hint={
                      canEdit
                        ? "Name, value and expected close save as you leave the field."
                        : undefined
                    }
                  >
                    {/*
                      The three fields that change most often are editable here
                      rather than only behind Edit, because a value that has
                      moved is the reason somebody opened the drawer. They save
                      on blur, so nothing needs a Save button beside it.
                    */}
                    {canEdit ? (
                      <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                            Opportunity name
                          </span>
                          <Input
                            className="h-9 text-xs"
                            defaultValue={lead.opportunityName ?? ""}
                            placeholder={lead.businessName}
                            disabled={busy}
                            onBlur={(event) => {
                              const next = event.target.value.trim() || null;
                              if (next === (lead.opportunityName ?? null)) return;
                              void post({ action: "set-opportunity", opportunityName: next });
                            }}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                            Opportunity value
                          </span>
                          <Input
                            type="number"
                            min={0}
                            className="h-9 text-xs"
                            defaultValue={lead.opportunityValue ?? ""}
                            disabled={busy}
                            onBlur={(event) => {
                              const raw = event.target.value;
                              const next = raw === "" ? null : Number(raw);
                              if (next === (lead.opportunityValue ?? null)) return;
                              void post({ action: "set-opportunity", opportunityValue: next });
                            }}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                            Expected close
                          </span>
                          <Input
                            type="date"
                            className="h-9 text-xs"
                            defaultValue={lead.expectedCloseAt?.slice(0, 10) ?? ""}
                            disabled={busy}
                            onBlur={(event) => {
                              const next = event.target.value || null;
                              if (next === (lead.expectedCloseAt?.slice(0, 10) ?? null)) return;
                              void post({ action: "set-opportunity", expectedCloseAt: next });
                            }}
                          />
                        </label>
                      </div>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Name">{opportunityLabel(lead)}</Field>
                      <Field label="Pipeline">The Exalted Media – Sales</Field>
                      <Field label="Stage">{lead.stageName ?? "—"}</Field>
                      <Field label="Status">{formatEnumLabel(lead.status)}</Field>
                      <Field label="Value">{value ? money(value) : "Not set"}</Field>
                      <Field label="Service">
                        {lead.serviceInterest ? formatEnumLabel(lead.serviceInterest) : "—"}
                      </Field>
                      <Field label="Expected close">{day(lead.expectedCloseAt)}</Field>
                      <Field label="Last contact">
                        {lastContactLabel(lead.lastContactAt, now)}
                      </Field>
                      <Field label="Next follow up">
                        <FollowUpText value={lead.nextFollowUpAt} now={now} />
                      </Field>
                      <Field label="Next action">{lead.nextAction ?? "Not set"}</Field>
                      <Field label="Created by">{lead.createdByName ?? "—"}</Field>
                      <Field label="Created">{when(lead.createdAt)}</Field>
                      <Field label="Last updated">{when(lead.updatedAt)}</Field>
                    </div>
                  </Section>

                  <Section
                    title="Owner and followers"
                    hint="One owner is answerable for the deal. Followers are told what happens."
                  >
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Owner
                        </p>
                        {canAssign ? (
                          <Select
                            className="mt-1 h-9 w-56 text-xs"
                            value={lead.ownerId ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              void post({
                                action: "set-owner",
                                ownerId: event.target.value || null,
                              })
                            }
                            aria-label="Opportunity owner"
                          >
                            <option value="">Unassigned</option>
                            {owners.map((owner) => (
                              <option key={owner.id} value={owner.id}>
                                {owner.name}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-800">
                            <OwnerAvatar name={lead.ownerName} />
                            {lead.ownerName ?? "Unassigned"}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">
                          Followers
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {(data?.followers ?? []).map((follower) => (
                            <span
                              key={follower.id}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-[11px] text-slate-700"
                            >
                              <OwnerAvatar name={follower.name} />
                              {follower.name}
                              {canEdit ? (
                                <button
                                  type="button"
                                  aria-label={`Remove ${follower.name}`}
                                  disabled={busy}
                                  onClick={() =>
                                    void post({
                                      action: "set-followers",
                                      userIds: (data?.followers ?? [])
                                        .filter((row) => row.id !== follower.id)
                                        .map((row) => row.id),
                                    })
                                  }
                                  className="text-slate-400 transition hover:text-rose-600"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              ) : null}
                            </span>
                          ))}

                          {canEdit ? (
                            <Select
                              className="h-8 w-44 text-xs"
                              value=""
                              disabled={busy}
                              onChange={(event) => {
                                if (!event.target.value) return;

                                void post({
                                  action: "set-followers",
                                  userIds: [
                                    ...(data?.followers ?? []).map((row) => row.id),
                                    event.target.value,
                                  ],
                                });
                              }}
                              aria-label="Add a follower"
                            >
                              <option value="">Add a follower…</option>
                              {owners
                                .filter(
                                  (owner) =>
                                    !(data?.followers ?? []).some((row) => row.id === owner.id),
                                )
                                .map((owner) => (
                                  <option key={owner.id} value={owner.id}>
                                    {owner.name}
                                  </option>
                                ))}
                            </Select>
                          ) : null}

                          {!canEdit && (data?.followers ?? []).length === 0 ? (
                            <span className="text-xs text-slate-400">Nobody yet</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Tags"
                    hint="The stage tag is derived from the stage, so it cannot be removed by hand or fall out of step."
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StageTag tag={tag} />
                      {lead.tags.map((custom) => (
                        <span key={custom} className="inline-flex items-center gap-1">
                          <CustomTag tag={custom} />
                          {canEdit ? (
                            <button
                              type="button"
                              aria-label={`Remove tag ${custom}`}
                              disabled={busy}
                              onClick={() =>
                                void post({
                                  action: "set-tags",
                                  tags: lead.tags.filter((row) => row !== custom),
                                })
                              }
                              className="text-slate-300 transition hover:text-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </span>
                      ))}
                      {lead.tags.length === 0 ? (
                        <span className="text-xs text-slate-400">No custom tags</span>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <div className="flex gap-2">
                        <Input
                          className="h-9 max-w-xs text-xs"
                          placeholder="Add a tag…"
                          value={tagDraft}
                          maxLength={40}
                          onChange={(event) => setTagDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void addTag();
                            }
                          }}
                          aria-label="New tag"
                        />
                        <Button size="sm" variant="secondary" disabled={busy} onClick={addTag}>
                          Add
                        </Button>
                      </div>
                    ) : null}
                  </Section>

                  <Section
                    title="Sales progress"
                    hint={
                      canEdit
                        ? "Click a stage to move this opportunity. Status and tag follow it."
                        : "Where this opportunity has got to."
                    }
                  >
                    <StageProgress
                      lead={lead}
                      canMove={canEdit}
                      size="md"
                      onPick={(column, stageKey, label) =>
                        onAction(
                          column === "won"
                            ? { kind: "won" }
                            : { kind: "stage", targetStage: { stageKey, label } },
                          lead,
                        )
                      }
                    />
                  </Section>

                  <Section title="What has happened">
                    <ActivityIndicators activity={lead.activity} onOpenSection={undefined} />
                  </Section>
                </div>
              ) : null}

              {section === "qualification" ? (
                <Section
                  title="Lead Qualification"
                  hint="Captured when the lead came in, and editable from Edit on the opportunity menu."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Main problem">{lead.mainProblem ?? "Not captured"}</Field>
                    <Field label="Goal">{lead.goal ?? "Not captured"}</Field>
                    <Field label="Current solution">
                      {lead.currentSolution ?? "Not captured"}
                    </Field>
                    <Field label="Budget">
                      {lead.budgetRange
                        ?? (lead.budgetAmount ? money(lead.budgetAmount) : "Not captured")}
                    </Field>
                    <Field label="Timeline">{lead.timeline ?? "Not captured"}</Field>
                    <Field label="Decision maker">
                      {lead.isDecisionMaker === null
                        ? "Unknown"
                        : lead.isDecisionMaker
                          ? "Yes"
                          : "No"}
                    </Field>
                    <Field label="Qualification score">
                      {lead.score === null ? "Not scored" : `${lead.score} / 100`}
                    </Field>
                  </div>

                  <Field label="Qualification notes">
                    {lead.qualificationNotes ? (
                      <span className="whitespace-pre-wrap">{lead.qualificationNotes}</span>
                    ) : (
                      "Nothing captured."
                    )}
                  </Field>

                  <Field label="Notes">
                    {lead.notes ? (
                      <span className="whitespace-pre-wrap">{lead.notes}</span>
                    ) : (
                      "Nothing captured."
                    )}
                  </Field>
                </Section>
              ) : null}

              {section === "proposal" ? (
                <Section
                  title="Proposal and Sales"
                  hint="The proposal clock runs from the date it went out."
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Proposal sent">{day(lead.proposalSentAt)}</Field>
                    <Field label="Proposal value">
                      {lead.proposalValue ? money(lead.proposalValue) : "—"}
                    </Field>
                    <Field label="Expected close">{day(lead.expectedCloseAt)}</Field>
                    <Field label="Won">{day(lead.wonAt)}</Field>
                    <Field label="Won by">{lead.wonByName ?? "—"}</Field>
                    <Field label="Final value">
                      {lead.finalValue ? money(lead.finalValue) : "—"}
                    </Field>
                    <Field label="Lost">{day(lead.lostAt)}</Field>
                    <Field label="Lost reason">
                      {lead.lostReasonCode ? formatEnumLabel(lead.lostReasonCode) : "—"}
                    </Field>
                    <Field label="Nurture until">{day(lead.nurtureUntil)}</Field>
                  </div>

                  {canEdit && !lead.wonAt && !lead.lostAt ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="secondary" onClick={() => onAction({ kind: "proposal" }, lead)}>
                        Record proposal sent
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => onAction({ kind: "won" }, lead)}>
                        Mark won
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onAction({ kind: "lost" }, lead)}>
                        Mark lost
                      </Button>
                    </div>
                  ) : null}
                </Section>
              ) : null}

              {section === "onboarding" ? (
                <Section
                  title="Client Onboarding"
                  hint="Onboarding belongs to the client account. This reads it rather than keeping a sales-side copy."
                >
                  {loading ? (
                    <Empty>Loading…</Empty>
                  ) : data?.client ? (
                    <div className="space-y-3">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Client">{data.client.companyName}</Field>
                        <Field label="Account status">
                          {formatEnumLabel(data.client.status)}
                        </Field>
                        <Field label="Journey stage">{data.client.stageName ?? "—"}</Field>
                        <Field label="In stage since">{day(data.client.stageEnteredAt)}</Field>
                        <Field label="Onboarding">
                          {data.client.onboardingStatus
                            ? formatEnumLabel(data.client.onboardingStatus)
                            : "Not started"}
                        </Field>
                        <Field label="Onboarding completed">
                          {day(data.client.onboardingCompletedAt)}
                        </Field>
                      </div>
                      <Link
                        href={`/clients/${data.client.id}`}
                        className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Open the client account
                      </Link>
                    </div>
                  ) : (
                    <Empty>
                      Onboarding starts when this opportunity is marked won and handed to a
                      client account.
                    </Empty>
                  )}
                </Section>
              ) : null}

              {section === "appointment" ? (
                <Section
                  title="Book / Update Appointment"
                  hint="The strategy call is the appointment this pipeline books."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Strategy call">{when(lead.strategyCallAt)}</Field>
                    <Field label="Outcome">
                      {lead.strategyCallStatus
                        ? formatEnumLabel(lead.strategyCallStatus)
                        : "Not recorded"}
                    </Field>
                  </div>

                  {canEdit ? (
                    <Button size="sm" variant="secondary" onClick={() => onAction({ kind: "call" }, lead)}>
                      {lead.strategyCallAt ? "Update the call" : "Book a strategy call"}
                    </Button>
                  ) : null}

                  <div className="pt-2">
                    <p className="mb-2 text-xs font-semibold text-slate-700">Call history</p>
                    {loading ? (
                      <Empty>Loading…</Empty>
                    ) : data?.calls.length ? (
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {data.calls.map((call) => (
                          <li key={call.id} className="p-3">
                            <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-800">
                              {formatEnumLabel(call.outcome)}
                              <span className="font-normal text-slate-400">
                                {when(call.occurredAt)}
                              </span>
                              {call.durationMinutes ? (
                                <span className="font-normal text-slate-400">
                                  {call.durationMinutes} min
                                </span>
                              ) : null}
                            </p>
                            {call.notes ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
                                {call.notes}
                              </p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-slate-400">
                              {call.loggedByName ?? "Unknown"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty>No calls logged against this opportunity yet.</Empty>
                    )}
                  </div>
                </Section>
              ) : null}

              {section === "tasks" ? (
                <Section
                  title="Tasks"
                  hint="These are ordinary agency tasks, so they appear in the assignee's own work and reports."
                >
                  {canEdit ? (
                    showTaskForm ? (
                      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                        <Input
                          className="h-9 text-xs"
                          placeholder="What needs doing?"
                          value={taskDraft.title}
                          onChange={(event) =>
                            setTaskDraft((draft) => ({ ...draft, title: event.target.value }))
                          }
                          aria-label="Task title"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Input
                            type="date"
                            className="h-9 w-44 text-xs"
                            value={taskDraft.dueDate}
                            onChange={(event) =>
                              setTaskDraft((draft) => ({ ...draft, dueDate: event.target.value }))
                            }
                            aria-label="Due date"
                          />
                          <Select
                            className="h-9 w-48 text-xs"
                            value={taskDraft.assignedToId}
                            onChange={(event) =>
                              setTaskDraft((draft) => ({
                                ...draft,
                                assignedToId: event.target.value,
                              }))
                            }
                            aria-label="Assign to"
                          >
                            <option value="">Assign to me</option>
                            {owners.map((owner) => (
                              <option key={owner.id} value={owner.id}>
                                {owner.name}
                              </option>
                            ))}
                          </Select>
                          <Button size="sm" disabled={busy} onClick={addTask}>
                            Add task
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowTaskForm(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setShowTaskForm(true)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add task
                      </Button>
                    )
                  ) : null}

                  {loading ? (
                    <Empty>Loading…</Empty>
                  ) : data?.tasks.length ? (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {data.tasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-slate-800">
                              {task.title}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {task.assigneeName ?? "Unassigned"} · due {day(task.dueDate)}
                            </p>
                          </div>
                          <Badge tone="slate">{formatEnumLabel(task.status)}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>No tasks against this opportunity yet.</Empty>
                  )}
                </Section>
              ) : null}

              {section === "notes" ? (
                <Section title="Notes" hint="Internal only. Nothing here is shown to the client.">
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      className="text-xs"
                      placeholder="Add an internal note…"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      aria-label="New note"
                    />
                    <Button size="sm" disabled={busy || !noteDraft.trim()} onClick={addNote}>
                      {busy ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Add note
                    </Button>
                  </div>

                  {loading ? (
                    <Empty>Loading…</Empty>
                  ) : data?.notes.length ? (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {data.notes.map((note) => (
                        <li key={note.id} className="p-3">
                          <p className="whitespace-pre-wrap text-xs text-slate-700">{note.body}</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {note.authorName} · {when(note.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>No notes yet.</Empty>
                  )}
                </Section>
              ) : null}

              {section === "payments" ? (
                <Section
                  title="Payments"
                  hint="Invoices belong to the client account. Sales reads them rather than keeping a second set of figures."
                >
                  {loading ? (
                    <Empty>Loading…</Empty>
                  ) : data?.invoices.length ? (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {data.invoices.map((invoice) => (
                        <li
                          key={invoice.id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-slate-800">
                              {invoice.invoiceNumber}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Issued {day(invoice.issuedAt)} · due {day(invoice.dueAt)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-800">
                              {money(invoice.amountDue)}
                            </p>
                            <Badge tone="slate">{formatEnumLabel(invoice.status)}</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>
                      {data?.client
                        ? "No invoices on this account yet."
                        : "Invoicing starts once this opportunity is won and linked to a client."}
                    </Empty>
                  )}
                </Section>
              ) : null}

              {section === "records" ? (
                <Section
                  title="Associated Records"
                  hint="Everything else attached to this contact."
                >
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-700">
                        Other opportunities for this contact
                      </p>
                      {loading ? (
                        <Empty>Loading…</Empty>
                      ) : data?.siblings.length ? (
                        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                          {data.siblings.map((sibling) => (
                            <li
                              key={sibling.id}
                              className="flex flex-wrap items-center justify-between gap-2 p-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium text-slate-800">
                                  {sibling.name}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {sibling.stageName ?? formatEnumLabel(sibling.status)}
                                </p>
                              </div>
                              <p className="text-xs font-semibold text-slate-700">
                                {sibling.value ? money(sibling.value) : "—"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Empty>This is the only opportunity for this contact.</Empty>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-700">Client account</p>
                      {lead.convertedClientId ? (
                        <Link
                          href={`/clients/${lead.convertedClientId}`}
                          className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          Open {data?.client?.companyName ?? lead.businessName}
                        </Link>
                      ) : (
                        <Empty>Not linked to a client account yet.</Empty>
                      )}
                    </div>
                  </div>
                </Section>
              ) : null}

              {section === "activity" ? (
                <Section
                  title="Activity"
                  hint="Who did what, and when. Written by the system, not editable."
                >
                  {loading ? (
                    <Empty>Loading…</Empty>
                  ) : data?.activity.length ? (
                    <ol className="space-y-2 border-l border-slate-200 pl-4">
                      {data.activity.map((entry) => (
                        <li key={entry.id} className="relative">
                          <span className="absolute -left-[1.32rem] top-1.5 h-1.5 w-1.5 rounded-full bg-slate-300" />
                          <p className="text-xs text-slate-800">{entry.action}</p>
                          <p className="text-[11px] text-slate-400">
                            {entry.actorName ?? "System"} · {when(entry.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <Empty>Nothing recorded yet.</Empty>
                  )}
                </Section>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );

  return createPortal(body, document.body);
}
