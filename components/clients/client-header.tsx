"use client";

import { ChevronDown, Mail, Phone, Plus, StickyNote, Workflow } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AddTaskDialog } from "@/components/clients/add-task-dialog";
import {
  ClientRecordDialog,
  DeleteClientDialog,
  type ClientRecordValues,
} from "@/components/clients/client-record-editors";
import {
  StageMoveDialog,
  type StageOption,
} from "@/components/journey/stage-move-dialog";
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
  /** Needed by the stage gate, which starts from where the client is. */
  currentStageId: string;
  serviceType: string;
  status: string;
  healthStatus: string;
  currentBlocker: string | null;
  ownerName: string | null;
  /** The seat they hold, so "Mark Angelo Yakit" reads as a role not a name. */
  ownerRole: string | null;
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
  stages,
  canMoveStage,
  canOverrideStage,
  record,
  canDelete,
}: {
  client: HeaderClient;
  canManage: boolean;
  canViewFinance: boolean;
  /** Whether this seat may put work on somebody. */
  canAssignWork: boolean;
  assignees: { id: string; name: string }[];
  statusControl: React.ReactNode;
  stages: StageOption[];
  canMoveStage: boolean;
  canOverrideStage: boolean;
  /** Everything the client-record editor needs but does not itself edit. */
  record: {
    values: ClientRecordValues;
    passthrough: {
      assignedUserId: string | null;
      status: string;
      currentStageId: string;
      notes: string | null;
    };
    serviceTypes: string[];
  };
  canDelete: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // HealthBadge reads a full row; this is the part of one it actually uses.
  const healthShape = {
    healthStatus: client.healthStatus,
    currentBlocker: client.currentBlocker,
  } as ClientRow;

  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-4">
      {stageOpen ? (
        <StageMoveDialog
          clientId={client.id}
          companyName={client.companyName}
          currentStageId={client.currentStageId}
          stages={stages}
          canOverride={canOverrideStage}
          onClose={() => setStageOpen(false)}
        />
      ) : null}

      {recordOpen ? (
        <ClientRecordDialog
          clientId={client.id}
          values={record.values}
          passthrough={record.passthrough}
          serviceTypes={record.serviceTypes}
          onClose={() => setRecordOpen(false)}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteClientDialog
          clientId={client.id}
          companyName={client.companyName}
          onClose={() => setDeleteOpen(false)}
        />
      ) : null}

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
          {/*
            * Opens the gate, rather than jumping to the Journey tab.
            *
            * This used to be a link. Moving a client is the one action on this
            * header that can be wrong in a way nobody notices for a week, and
            * the dialog that checks it already exists - it evaluates the
            * current stage's requirements, refuses on blocking ones, and takes
            * an override reason from anybody entitled to give one.
            */}
          {canMoveStage ? (
            <button
              type="button"
              onClick={() => setStageOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Workflow className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Move Stage</span>
            </button>
          ) : null}
          {canAssignWork ? (
            <button
              type="button"
              onClick={() => setTaskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Task</span>
            </button>
          ) : null}
          {/*
            * Goes to Activity & Notes, which is where notes actually are.
            * It pointed at Contacts, which is a different tab entirely.
            */}
          <TabLink
            tab="activity"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <StickyNote className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Note</span>
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
                  {/*
                    * The two that open a dialog rather than a tab.
                    *
                    * The client record and deleting the account had no home
                    * after the Account tab was rebuilt to cards - the form and
                    * the danger zone that held them were dropped. This menu is
                    * where rarely-used account actions belong.
                    */}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setRecordOpen(true);
                      }}
                      className="block w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                    >
                      Edit client record
                    </button>
                  ) : null}

                  {[
                    ...(canManage
                      ? [
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

                  {canDelete ? (
                    <>
                      <span className="my-1 block border-t border-slate-100" />
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          setDeleteOpen(true);
                        }}
                        className="block w-full rounded-lg px-2.5 py-2 text-left text-xs text-rose-600 transition hover:bg-rose-50"
                      >
                        Delete client
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Monogram name={client.companyName} size="md" square />

          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
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

            {/* What they buy, whether they are live, and where they are -
                in that order, which is how somebody reads the account. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="violet">{formatEnumLabel(client.serviceType)}</Badge>
              <Badge tone={client.status === "ACTIVE" ? "emerald" : "slate"}>
                {formatEnumLabel(client.status)}
              </Badge>
              <Badge tone="amber">{client.stageName}</Badge>
              {/* Health, and only health. Stage and status sit beside it. */}
              <HealthBadge client={healthShape} />
            </div>
          </div>
        </div>

        {/*
          A divider drawn with border-l only reads as a divider while the items
          are on one line. Once they wrap - which they do on any phone - each
          becomes a stray vertical rule floating beside a block. The separator
          is horizontal below sm and vertical from sm up, where the row holds.
        */}
        <div className="flex w-full flex-col gap-3 divide-y divide-slate-200 sm:w-auto sm:flex-row sm:flex-wrap sm:items-start sm:gap-6 sm:divide-y-0">
          <div className="pt-3 first:pt-0 sm:pt-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Account owner</p>
            <div className="mt-1 flex items-center gap-2">
              <Monogram name={client.ownerName} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {client.ownerName ?? "Unassigned"}
                </p>
                {client.ownerRole ? (
                  <p className="truncate text-[11px] text-slate-400">{client.ownerRole}</p>
                ) : null}
              </div>
            </div>
          </div>

          {canViewFinance ? (
            <div className="pt-3 first:pt-0 sm:border-l sm:border-slate-200 sm:pl-6 sm:pt-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Monthly value</p>
              <p className="mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">
                {client.monthlyValue === null ? "—" : money(client.monthlyValue)}
              </p>
              <p className="text-[11px] text-slate-400">Recurring</p>
            </div>
          ) : null}

          <div className="pt-3 first:pt-0 sm:border-l sm:border-slate-200 sm:pl-6 sm:pt-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Account status</p>
            <div className="mt-1">{statusControl}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
