"use client";

import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Clock,
  Mail,
  Phone,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo } from "react";

import {
  EmptyPanel,
  HealthBadge,
  MilestoneText,
  Monogram,
  WaitingBadge,
  money,
} from "@/components/clients/client-bits";
import { TabLink } from "@/components/clients/client-tabs";
import { Badge } from "@/components/ui/badge";
import {
  HEALTH_LABELS,
  attentionReasons,
  healthFromStatus,
  isWaitingOnClient,
  milestoneDayLabel,
  nextMilestone,
  relativeTime,
  type ClientRow,
} from "@/lib/clients/client-workspace";
import { formatEnumLabel } from "@/lib/utils";

export interface OverviewService {
  id: string;
  name: string;
  serviceType: string;
  status: string;
  ownerName: string | null;
  startDate: string | null;
}

export interface OverviewContact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  isApprover: boolean;
}

export interface OverviewActivity {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-0.5 break-words text-xs text-slate-800">{children}</div>
    </div>
  );
}

function day(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One client, at a glance.
 *
 * Answers the five questions somebody opens an account to ask: where it is,
 * what happens next, what is wrong, who is responsible, and what is running.
 * Deliberately no pipeline picture - the current stage, the next stage and the
 * Move Stage button say everything a graphic would, and Journey owns the rest.
 *
 * Every milestone and every attention item here belongs to this account. They
 * are derived from the same functions the dashboard uses, given one row instead
 * of all of them.
 */
export function ClientOverview({
  client,
  nextStageName,
  services,
  contacts,
  activity,
  teamNames,
  healthNote,
  canSeeFinance,
  serverNow,
}: {
  client: ClientRow;
  nextStageName: string | null;
  services: OverviewService[];
  contacts: OverviewContact[];
  activity: OverviewActivity[];
  teamNames: string[];
  healthNote: { assessedAt: string; assessedBy: string | null; summary: string | null } | null;
  canSeeFinance: boolean;
  serverNow: string;
}) {
  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const reasons = useMemo(() => attentionReasons(client, now), [client, now]);
  const next = useMemo(() => nextMilestone(client, now), [client, now]);

  const upcoming = useMemo(
    () =>
      [...client.milestones]
        .filter((milestone) => new Date(milestone.dueAt) >= new Date(now.toDateString()))
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        .slice(0, 8),
    [client.milestones, now],
  );

  const health = healthFromStatus(client.healthStatus, {
    hasBlocker: Boolean(client.currentBlocker?.trim()),
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
      {/* Account summary */}
      <section className="rounded-2xl border border-slate-200 bg-white xl:row-span-1">
        <header className="border-b border-slate-100 p-4">
          <h2 className="text-sm font-semibold text-slate-950">Account Summary</h2>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-4 sm:grid-cols-3">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Progress
            </p>
            <Field label="Current stage">
              <span className="font-semibold text-violet-700">{client.stageName}</span>
            </Field>
            <Field label="Next stage">
              <span className="flex items-center gap-1">
                {nextStageName ?? "End of the journey"}
                {nextStageName ? <ArrowRight className="h-3 w-3 text-slate-400" /> : null}
              </span>
            </Field>
            <Field label="Next milestone">
              <MilestoneText milestone={next} now={now} />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Next action
            </p>
            <Field label="Action">
              {client.nextAction?.trim() ? (
                client.nextAction
              ) : (
                <span className="text-amber-600">Not set</span>
              )}
            </Field>
            <Field label="Owner">{client.ownerName ?? "Unassigned"}</Field>
            <Field label="Due">{day(client.nextActionDueAt)}</Field>
            {/*
              Linked to the account's work rather than creating a task record to
              represent the next action - the two would drift immediately.
            */}
            <TabLink tab="tasks" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-800">
              Open work
              <ArrowRight className="h-3 w-3" />
            </TabLink>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Ownership &amp; account
            </p>
            <Field label="Account owner">
              <span className="flex items-center gap-1.5">
                <Monogram name={client.ownerName} />
                {client.ownerName ?? "Unassigned"}
              </span>
            </Field>
            <Field label="Assigned team">
              {teamNames.length ? (
                <span className="flex flex-wrap items-center gap-1">
                  {teamNames.slice(0, 4).map((name) => (
                    <Monogram key={name} name={name} />
                  ))}
                  {teamNames.length > 4 ? (
                    <span className="text-[11px] text-slate-400">+{teamNames.length - 4}</span>
                  ) : null}
                </span>
              ) : (
                <span className="text-slate-400">Nobody assigned yet</span>
              )}
            </Field>
            <Field label="Active services">{services.length || "None"}</Field>
            <Field label="Contract start">{day(client.contractStartDate)}</Field>
            <Field label="Renewal date">{day(client.renewalDate)}</Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-600">
            <CircleCheck className="h-3.5 w-3.5 text-slate-400" />
            Open work <span className="font-semibold text-slate-900">{client.openTaskCount}</span>
          </span>
          <span
            className={`flex items-center gap-1.5 ${
              client.overdueTaskCount > 0 ? "text-rose-600" : "text-slate-600"
            }`}
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            Overdue <span className="font-semibold">{client.overdueTaskCount}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            Current blocker{" "}
            <span className="truncate font-semibold text-slate-900">
              {client.currentBlocker?.trim() || "None"}
            </span>
          </span>
          <span
            className="flex items-center gap-1.5 text-slate-600"
            title={
              healthNote
                ? `Last assessed ${day(healthNote.assessedAt)}${
                    healthNote.assessedBy ? ` by ${healthNote.assessedBy}` : ""
                  }${healthNote.summary ? ` — ${healthNote.summary}` : ""}`
                : "No health assessment recorded yet"
            }
          >
            Account health <HealthBadge client={client} />
            {isWaitingOnClient(client) ? <WaitingBadge /> : null}
          </span>
        </div>
      </section>

      {/* Needs attention, for this account only. */}
      <Panel
        title="Needs Attention"
        action={
          reasons.length > 0 ? (
            <span className="text-[11px] text-slate-400">{reasons.length} to deal with</span>
          ) : null
        }
      >
        {reasons.length === 0 ? (
          <div className="p-4">
            <EmptyPanel>Nothing on this account needs attention.</EmptyPanel>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reasons.map((reason) => (
              <li key={reason.key} className="flex items-start gap-2.5 p-3">
                <span className="mt-0.5 shrink-0 rounded-lg bg-amber-50 p-1.5 text-amber-600">
                  <TriangleAlert className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-800">
                    {reason.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {reason.detail}
                  </span>
                </span>
                <TabLink tab={reason.tab} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">
                  {reason.key === "renewal-approaching" ? "Review" : "Open"}
                </TabLink>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* This client's milestones. Nobody else's. */}
      <Panel title="Upcoming Milestones">
        {upcoming.length === 0 ? (
          <div className="p-4">
            <EmptyPanel>Nothing scheduled on this account.</EmptyPanel>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((milestone) => {
              const at = new Date(milestone.dueAt);

              return (
                <li key={`${milestone.source}-${milestone.id}`}>
                  <TabLink tab={milestone.tab} className="flex items-start gap-3 p-3 transition hover:bg-slate-50">
                    <span className="w-14 shrink-0 text-[11px] font-semibold uppercase text-slate-500">
                      {milestoneDayLabel(milestone.dueAt, now)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                        <CalendarDays className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{milestone.name}</span>
                      </span>
                      {milestone.status ? (
                        <span className="text-[11px] text-slate-400">
                          {formatEnumLabel(milestone.status)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {milestone.hasTime
                        ? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                        : "All day"}
                    </span>
                  </TabLink>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Recent activity */}
      <Panel
        title="Recent Activity"
        action={
          <TabLink tab="activity" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700">
            View all activity
            <ArrowRight className="h-3.5 w-3.5" />
          </TabLink>
        }
      >
        {activity.length === 0 ? (
          <div className="p-4">
            <EmptyPanel>Nothing recorded on this account yet.</EmptyPanel>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.slice(0, 6).map((entry) => (
              <li key={entry.id} className="flex items-start gap-2.5 p-3">
                <Monogram name={entry.actorName} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-slate-800">{entry.action}</span>
                  <span className="block text-[11px] text-slate-400">
                    {entry.actorName ? `${entry.actorName} · ` : ""}
                    {relativeTime(entry.createdAt, now)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Active services */}
      <Panel
        title="Active Services"
        action={
          <TabLink tab="services" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700">
            Manage services
            <ArrowRight className="h-3.5 w-3.5" />
          </TabLink>
        }
      >
        {services.length === 0 ? (
          <div className="p-4">
            <EmptyPanel>
              No delivery projects yet. Each service the agency runs for this account is a
              project.
            </EmptyPanel>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {services.map((service) => (
              <li key={service.id} className="space-y-1.5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-semibold text-slate-900">
                    {service.name}
                  </p>
                  <Badge tone={service.status === "ACTIVE" ? "emerald" : "slate"}>
                    {formatEnumLabel(service.status)}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  {formatEnumLabel(service.serviceType)}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Monogram name={service.ownerName} />
                    {service.ownerName ?? "Unassigned"}
                  </span>
                  <span>Started {day(service.startDate)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canSeeFinance && client.monthlyValue ? (
          <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
            Account value{" "}
            <span className="font-semibold text-slate-800">{money(client.monthlyValue)}</span> a
            month. Per-service figures are not tracked separately.
          </p>
        ) : null}
      </Panel>

      {/* Key contacts */}
      <Panel
        title="Key Contacts"
        action={
          <TabLink tab="contacts" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700">
            Manage contacts
            <ArrowRight className="h-3.5 w-3.5" />
          </TabLink>
        }
      >
        {contacts.length === 0 ? (
          <div className="p-4">
            <EmptyPanel>
              Only the primary contact on the account record. Add the people who approve and
              pay.
            </EmptyPanel>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {contacts.slice(0, 5).map((contact) => (
              <li key={contact.id} className="flex items-start gap-2.5 p-3">
                <Monogram name={contact.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {contact.name}
                    </p>
                    {contact.isPrimary ? <Badge tone="sky">Primary</Badge> : null}
                    {contact.isDecisionMaker ? <Badge tone="violet">Decision Maker</Badge> : null}
                    {contact.isApprover ? <Badge tone="emerald">Approver</Badge> : null}
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {contact.role ?? "No role recorded"}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex min-w-0 items-center gap-1 hover:text-sky-700"
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </a>
                    ) : null}
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1 hover:text-emerald-700"
                      >
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Health detail, where the assessment system already has something to say. */}
      <Panel title="Account Health">
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <HealthBadge client={client} />
            <span className="text-xs text-slate-600">{HEALTH_LABELS[health]}</span>
          </div>

          {healthNote ? (
            <>
              {healthNote.summary ? (
                <p className="whitespace-pre-wrap text-xs text-slate-700">{healthNote.summary}</p>
              ) : null}
              <p className="text-[11px] text-slate-400">
                Last assessed {day(healthNote.assessedAt)}
                {healthNote.assessedBy ? ` by ${healthNote.assessedBy}` : ""}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              No health assessment recorded yet. Health falls back to the account status until
              somebody assesses it.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <TabLink tab="reports" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">
              <Users className="h-3 w-3" />
              Reports &amp; health
            </TabLink>
            <TabLink
              tab="journey"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Move stage
            </TabLink>
          </div>
        </div>
      </Panel>
    </div>
  );
}
