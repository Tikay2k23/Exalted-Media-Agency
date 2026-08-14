"use client";

import { ChevronDown, Mail, Phone, Plus, StickyNote, Workflow } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AddTaskDialog } from "@/components/clients/add-task-dialog";
import { HealthBadge, Monogram, money } from "@/components/clients/client-bits";
import { TabLink } from "@/components/clients/client-tabs";
import { Badge } from "@/components/ui/badge";
import type { ClientRow } from "@/lib/clients/client-workspace";
import { formatEnumLabel } from "@/lib/utils";

/** Just the fields the header shows. The full row lives on the Overview tab. */
export interface HeaderClient {
  id: string;
  companyName: string;
  clientName: string;
  contactEmail: string;
  contactPhone: string | null;
  stageName: string;
  serviceType: string;
  status: string;
  healthStatus: string;
  currentBlocker: string | null;
  ownerName: string | null;
  monthlyValue: number | null;
}

/**
 * The top of one client account.
 *
 * Who they are, where they are, who owns them and what they are worth - the
 * four things somebody checks before doing anything else. The actions beside it
 * go to the tab that performs them rather than opening a second copy of a form
 * that already exists further down the page.
 */
export function ClientHeader({
  client,
  canManage,
  canViewFinance,
  canAssignWork,
  assignees,
  statusControl,
}: {
  client: HeaderClient;
  canManage: boolean;
  canViewFinance: boolean;
  /** Whether this seat may put work on somebody. */
  canAssignWork: boolean;
  assignees: { id: string; name: string }[];
  statusControl: React.ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  // HealthBadge reads a full row; this is the part of one it actually uses.
  const healthShape = {
    healthStatus: client.healthStatus,
    currentBlocker: client.currentBlocker,
  } as ClientRow;

  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-4">
      {taskOpen ? (
        <AddTaskDialog
          clientId={client.id}
          companyName={client.companyName}
          assignees={assignees}
          onClose={() => setTaskOpen(false)}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link
          href="/clients"
          className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
        >
          ← Clients
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <TabLink
            tab="journey"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Workflow className="h-3.5 w-3.5" />
            Move Stage
          </TabLink>
          {canAssignWork ? (
            <button
              type="button"
              onClick={() => setTaskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Task
            </button>
          ) : null}
          <TabLink
            tab="contacts"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Add Note
          </TabLink>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              More
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {moreOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setMoreOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {/*
                    Everything here goes to a control that already exists.
                    Actions this person may not take are absent rather than
                    greyed out - a disabled button is an invitation to click
                    something that will fail.
                  */}
                  {[
                    ...(canManage
                      ? [
                          { label: "Edit account", tab: "contacts" as const },
                          { label: "Add contact", tab: "contacts" as const },
                          { label: "Change owner", tab: "contacts" as const },
                          { label: "Add service", tab: "services" as const },
                        ]
                      : []),
                    { label: "Files and access", tab: "files" as const },
                    { label: "QA and approvals", tab: "quality" as const },
                    { label: "Reports and health", tab: "reports" as const },
                    ...(canManage
                      ? [{ label: "Start offboarding", tab: "reports" as const }]
                      : []),
                    { label: "Integrations", tab: "integrations" as const },
                  ].map((item) => (
                    <TabLink
                      key={item.label}
                      tab={item.tab}
                      className="block rounded-lg px-2.5 py-2 text-xs text-slate-700 transition hover:bg-slate-50"
                    >
                      {item.label}
                    </TabLink>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Monogram name={client.companyName} size="lg" square />

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-950">
              {client.companyName}
            </h1>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="font-medium text-slate-700">{client.clientName}</span>
              <a
                href={`mailto:${client.contactEmail}`}
                className="flex min-w-0 items-center gap-1 hover:text-sky-700"
              >
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{client.contactEmail}</span>
              </a>
              {client.contactPhone ? (
                <a
                  href={`tel:${client.contactPhone}`}
                  className="flex items-center gap-1 hover:text-emerald-700"
                >
                  <Phone className="h-3 w-3" />
                  {client.contactPhone}
                </a>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="violet">{client.stageName}</Badge>
              <Badge tone="sky">{formatEnumLabel(client.serviceType)}</Badge>
              <Badge tone="slate">{formatEnumLabel(client.status)}</Badge>
              {/* Health, and only health. Stage and status sit beside it. */}
              <HealthBadge client={healthShape} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Account owner</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-900">
              <Monogram name={client.ownerName} size="md" />
              {client.ownerName ?? "Unassigned"}
            </p>
          </div>

          {canViewFinance ? (
            <div className="border-l border-slate-200 pl-6">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Monthly value</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {client.monthlyValue === null ? "—" : money(client.monthlyValue)}
              </p>
              <p className="text-[11px] text-slate-400">Recurring</p>
            </div>
          ) : null}

          <div className="border-l border-slate-200 pl-6">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Account status</p>
            <div className="mt-1">{statusControl}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
