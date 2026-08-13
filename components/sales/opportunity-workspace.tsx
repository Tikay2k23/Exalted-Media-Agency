"use client";

import {
  ArrowUpDown,
  Columns3,
  Download,
  Filter,
  LayoutList,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { AddLeadDialog } from "@/components/sales/add-lead-dialog";
import { LeadFormDialog } from "@/components/sales/lead-dialogs";
import { LeadImportDialog } from "@/components/sales/lead-import-dialog";
import {
  OpportunityActionDialog,
  type ActionKind,
} from "@/components/sales/opportunity-actions";
import { OpportunityDrawer, type DrawerSection } from "@/components/sales/opportunity-drawer";
import { OpportunityList } from "@/components/sales/opportunity-list";
import { PipelineBoard } from "@/components/sales/pipeline-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { RowMenuItem } from "@/components/work/row-menu";
import type { SalesStage } from "@/lib/data/sales-workspace-query";
import {
  EMPTY_SALES_FILTERS,
  FOLLOW_UP_STATUSES,
  SALES_SORTS,
  advancedFilterCount,
  applySalesFilters,
  dealValue,
  hasActiveFilters,
  isOpen,
  opportunityLabel,
  quickFilterChips,
  type FollowUpStatus,
  type SalesFilters,
  type SalesLead,
  type SalesSort,
} from "@/lib/sales/sales-view";
import { formatEnumLabel } from "@/lib/utils";

type ViewMode = "board" | "list";

/**
 * The opportunity workspace: one toolbar, two views, one drawer.
 *
 * Board and list read the same filtered array, so switching between them cannot
 * change which deals are on screen, and the filters survive the switch because
 * they live here rather than inside either view.
 *
 * The board deliberately ignores pagination - a kanban with a second page is
 * not a kanban - while the list pages, because a hundred rows is a scroll and a
 * hundred cards in a column is a wall.
 */
export function OpportunityWorkspace({
  leads,
  stages,
  owners,
  sources,
  tags,
  campaigns,
  now,
  agingDays,
  canCreate,
  canEdit,
  canAssign,
  canConvert,
  filters,
  onFilters,
  openLeadId,
  onOpenLead,
}: {
  leads: SalesLead[];
  stages: SalesStage[];
  owners: { id: string; name: string }[];
  sources: string[];
  tags: string[];
  campaigns: string[];
  now: Date;
  agingDays: number;
  canCreate: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canConvert: boolean;
  filters: SalesFilters;
  onFilters: (filters: SalesFilters) => void;
  openLeadId: string | null;
  onOpenLead: (id: string | null) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<ViewMode>("board");
  const [showMore, setShowMore] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [section, setSection] = useState<DrawerSection>("details");
  const [notice, setNotice] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const [newOpportunityFor, setNewOpportunityFor] = useState<SalesLead | null>(null);
  const [action, setAction] = useState<{ kind: ActionKind; leadId: string } | null>(null);

  const chips = useMemo(() => quickFilterChips(leads, now), [leads, now]);
  const filtered = useMemo(
    () => applySalesFilters(leads, filters, now, agingDays),
    [leads, filters, now, agingDays],
  );

  const openLead = leads.find((lead) => lead.id === openLeadId) ?? null;
  const editLead = leads.find((lead) => lead.id === editLeadId) ?? null;
  const actionLead = action ? leads.find((lead) => lead.id === action.leadId) ?? null : null;
  const advanced = advancedFilterCount(filters);

  function update<K extends keyof SalesFilters>(key: K, value: SalesFilters[K]) {
    onFilters({ ...filters, [key]: value });
    setPage(1);
  }

  function openDrawer(id: string, drawerSection?: string) {
    setSection((drawerSection as DrawerSection) ?? "details");
    onOpenLead(id);
  }

  /**
   * Only the actions that make sense here, now, for this person.
   *
   * A greyed-out Mark Won on a deal that is already won is an invitation to
   * click something that will fail, and "Convert to client" is deliberately
   * absent: the route to a client account is Mark Won, which finds the existing
   * account rather than making a second one.
   */
  function menuItemsFor(lead: SalesLead): RowMenuItem[] {
    const live = isOpen(lead);

    return [
      { label: "Open opportunity", onSelect: () => openDrawer(lead.id) },
      ...(canEdit ? [{ label: "Edit", onSelect: () => setEditLeadId(lead.id) }] : []),
      ...(canEdit && live
        ? [
            {
              label: "Set next action",
              onSelect: () => setAction({ kind: "next-step", leadId: lead.id }),
            },
            {
              label: "Schedule follow up",
              onSelect: () => setAction({ kind: "follow-up", leadId: lead.id }),
            },
            { label: "Add note", onSelect: () => openDrawer(lead.id, "notes") },
            { label: "Add task", onSelect: () => openDrawer(lead.id, "tasks") },
          ]
        : []),
      ...(canAssign && live
        ? [{ label: "Change owner", onSelect: () => openDrawer(lead.id, "details") }]
        : []),
      ...(canEdit && live
        ? [
            { label: "Move stage", onSelect: () => setAction({ kind: "stage", leadId: lead.id }) },
            {
              label: lead.strategyCallAt ? "Update strategy call" : "Book strategy call",
              onSelect: () => setAction({ kind: "call", leadId: lead.id }),
            },
            {
              label: lead.proposalSentAt ? "Update proposal" : "Record proposal sent",
              onSelect: () => setAction({ kind: "proposal", leadId: lead.id }),
            },
          ]
        : []),
      ...((canEdit || canConvert) && live && !lead.wonAt
        ? [{ label: "Mark won", onSelect: () => setAction({ kind: "won", leadId: lead.id }) }]
        : []),
      ...(canEdit && live && !lead.lostAt
        ? [
            {
              label: "Mark lost",
              onSelect: () => setAction({ kind: "lost", leadId: lead.id }),
              danger: true,
            },
            {
              label: "Move to nurture",
              onSelect: () => setAction({ kind: "nurture", leadId: lead.id }),
            },
          ]
        : []),
      ...(canCreate
        ? [
            {
              label: "Create another opportunity",
              onSelect: () => setNewOpportunityFor(lead),
            },
          ]
        : []),
      ...(lead.convertedClientId
        ? [{ label: "Open client", href: `/clients/${lead.convertedClientId}` }]
        : []),
    ];
  }

  /** Whatever is on screen, or whatever has been ticked. */
  function exportCsv(rows: SalesLead[], suffix: string) {
    const header = [
      "Opportunity ID",
      "Opportunity",
      "Contact",
      "Company",
      "Email",
      "Phone",
      "Source",
      "Campaign",
      "Owner",
      "Stage",
      "Status",
      "Tags",
      "Created",
      "Last Contact",
      "Next Action",
      "Next Follow Up",
      "Expected Close",
      "Strategy Call",
      "Proposal Sent",
      "Won",
      "Lost",
      "Lost Reason",
      "Value",
      "Final Value",
    ];

    const cell = (value: string | number | null) => {
      const text = value === null || value === undefined ? "" : String(value);
      // A leading =, + or - would be run as a formula when the file is opened.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;
    };

    const day = (value: string | null) => (value ? value.slice(0, 10) : "");

    const body = rows.map((lead) =>
      [
        lead.id,
        opportunityLabel(lead),
        lead.contactName,
        lead.businessName,
        lead.email,
        lead.phone,
        formatEnumLabel(lead.source),
        lead.campaign,
        lead.ownerName,
        lead.stageName,
        formatEnumLabel(lead.status),
        lead.tags.join(" | "),
        day(lead.createdAt),
        day(lead.lastContactAt),
        lead.nextAction,
        day(lead.nextFollowUpAt),
        day(lead.expectedCloseAt),
        day(lead.strategyCallAt),
        day(lead.proposalSentAt),
        day(lead.wonAt),
        day(lead.lostAt),
        lead.lostReasonCode ? formatEnumLabel(lead.lostReasonCode) : "",
        dealValue(lead) || "",
        lead.finalValue ?? "",
      ]
        .map(cell)
        .join(","),
    );

    const csv = [header.map(cell).join(","), ...body].join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `exalted-opportunities-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function bulk(body: Record<string, unknown>) {
    const ids = [...selected];

    setNotice(null);

    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/leads/${id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then((response) => response.ok),
      ),
    );

    const failed = results.filter((ok) => !ok).length;

    setSelected(new Set());
    setNotice(
      failed
        ? `${ids.length - failed} of ${ids.length} updated. ${failed} were not yours to change.`
        : `${ids.length} opportunit${ids.length === 1 ? "y" : "ies"} updated.`,
    );

    // Refresh rather than reload: a reload would throw away the filters and the
    // message that just explained what happened.
    startTransition(() => router.refresh());
  }

  const selectedLeads = filtered.filter((lead) => selected.has(lead.id));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-950">Sales Pipeline</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              The Exalted Media – Sales
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {filtered.length} of {leads.length} opportunities
            {view === "board"
              ? ". Drag a card to move it between stages."
              : ". Click a row to open it."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setView("board")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                view === "board" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Board
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                view === "list" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </button>
          </div>

          {canCreate ? (
            <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import
            </Button>
          ) : null}

          <Button size="sm" variant="secondary" onClick={() => exportCsv(filtered, "filtered")}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>

          {canCreate ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Lead
            </Button>
          ) : null}
        </div>
      </header>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => update("quick", chip.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              filters.quick === chip.key
                ? "bg-slate-950 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {chip.label}
            {chip.key !== "all" && chip.count > 0 ? (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold ${
                  filters.quick === chip.key ? "bg-white/20" : "bg-slate-100 text-slate-700"
                }`}
              >
                {chip.count}
              </span>
            ) : null}
          </button>
        ))}

        {hasActiveFilters(filters) ? (
          <button
            type="button"
            onClick={() => {
              onFilters(EMPTY_SALES_FILTERS);
              setPage(1);
            }}
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-900"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Filters */}
      <div className="space-y-2 border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Search name, company, email, phone, owner, tag…"
              value={filters.search}
              onChange={(event) => update("search", event.target.value)}
              aria-label="Search opportunities"
            />
          </div>

          <Select
            className="h-9 min-w-[8.5rem] text-xs"
            value={filters.stageId}
            onChange={(event) => update("stageId", event.target.value)}
            aria-label="Stage"
          >
            <option value="">All Stages</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </Select>

          <Select
            className="h-9 min-w-[8.5rem] text-xs"
            value={filters.ownerId}
            onChange={(event) => update("ownerId", event.target.value)}
            aria-label="Owner"
          >
            <option value="">All Owners</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </Select>

          <Select
            className="h-9 min-w-[8.5rem] text-xs"
            value={filters.source}
            onChange={(event) => update("source", event.target.value)}
            aria-label="Source"
          >
            <option value="">All Sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {formatEnumLabel(source)}
              </option>
            ))}
          </Select>

          <Select
            className="h-9 min-w-[9.5rem] text-xs"
            value={filters.followUp}
            onChange={(event) => update("followUp", event.target.value as FollowUpStatus | "")}
            aria-label="Follow up status"
          >
            {FOLLOW_UP_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Button
            size="sm"
            variant={showMore || advanced ? "secondary" : "ghost"}
            onClick={() => setShowMore((open) => !open)}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            More Filters
            {advanced ? (
              <span className="ml-1.5 rounded-full bg-slate-900 px-1.5 text-[10px] font-semibold text-white">
                {advanced}
              </span>
            ) : null}
          </Button>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <Select
              className="h-9 min-w-[10rem] text-xs"
              value={filters.sort}
              onChange={(event) => update("sort", event.target.value as SalesSort)}
              aria-label="Sort by"
            >
              {SALES_SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {showMore ? (
          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">Tag</span>
              <Select
                className="h-9 text-xs"
                value={filters.tag}
                onChange={(event) => update("tag", event.target.value)}
              >
                <option value="">Any tag</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">Campaign</span>
              <Select
                className="h-9 text-xs"
                value={filters.campaign}
                onChange={(event) => update("campaign", event.target.value)}
              >
                <option value="">Any campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign} value={campaign}>
                    {campaign}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">Status</span>
              <Select
                className="h-9 text-xs"
                value={filters.status}
                onChange={(event) => update("status", event.target.value)}
              >
                <option value="">Any status</option>
                {["NEW", "ATTEMPTING_CONTACT", "CONTACTED", "QUALIFIED", "NURTURE", "CONVERTED", "LOST"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {formatEnumLabel(status)}
                    </option>
                  ),
                )}
              </Select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Min value
                </span>
                <Input
                  type="number"
                  min={0}
                  className="h-9 text-xs"
                  value={filters.minValue}
                  onChange={(event) => update("minValue", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Max value
                </span>
                <Input
                  type="number"
                  min={0}
                  className="h-9 text-xs"
                  value={filters.maxValue}
                  onChange={(event) => update("maxValue", event.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Created from
                </span>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={filters.createdFrom}
                  onChange={(event) => update("createdFrom", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Created to
                </span>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={filters.createdTo}
                  onChange={(event) => update("createdTo", event.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Closing from
                </span>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={filters.closeFrom}
                  onChange={(event) => update("closeFrom", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">
                  Closing to
                </span>
                <Input
                  type="date"
                  className="h-9 text-xs"
                  value={filters.closeTo}
                  onChange={(event) => update("closeTo", event.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {notice ? (
        <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
          {notice}
        </p>
      ) : null}

      {/* Bulk actions, only once something is ticked. */}
      {view === "list" && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="text-xs font-semibold text-slate-700">
            {selected.size} selected
          </span>

          {canAssign ? (
            <Select
              className="h-8 w-44 text-xs"
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                void bulk({ action: "set-owner", ownerId: event.target.value });
              }}
              aria-label="Assign the selected opportunities"
            >
              <option value="">Assign owner…</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </Select>
          ) : null}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => exportCsv(selectedLeads, "selected")}
          >
            Export selected
          </Button>

          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      ) : null}

      {/* The views */}
      {filtered.length === 0 ? (
        <div className="p-10 text-center">
          {leads.length === 0 ? (
            <>
              <p className="text-sm font-medium text-slate-900">No opportunities yet.</p>
              <p className="mt-1 text-sm text-slate-600">
                Add your first lead, or import the list you already have.
              </p>
              {canCreate ? (
                <Button size="sm" className="mt-3" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Lead
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">
                Nothing matches these filters.
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Try a different stage, owner, source, or chip.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => onFilters(EMPTY_SALES_FILTERS)}
              >
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                Clear filters
              </Button>
            </>
          )}
        </div>
      ) : view === "board" ? (
        <PipelineBoard leads={filtered} now={now} canMove={canEdit} onOpenLead={openDrawer} />
      ) : (
        <OpportunityList
          leads={filtered}
          now={now}
          page={page}
          pageSize={pageSize}
          selected={selected}
          openLeadId={openLeadId}
          agingDays={agingDays}
          onOpen={openDrawer}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onToggleSelected={(id) =>
            setSelected((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onToggleAll={(ids, checked) =>
            setSelected((current) => {
              const next = new Set(current);
              for (const id of ids) {
                if (checked) next.add(id);
                else next.delete(id);
              }
              return next;
            })
          }
          menuItemsFor={menuItemsFor}
        />
      )}

      {openLead ? (
        <OpportunityDrawer
          lead={openLead}
          now={now}
          section={section}
          owners={owners}
          canEdit={canEdit}
          canAssign={canAssign}
          onSection={setSection}
          onClose={() => onOpenLead(null)}
          onAction={(kind, lead) => setAction({ kind: kind as ActionKind, leadId: lead.id })}
        />
      ) : null}

      {actionLead && action ? (
        <OpportunityActionDialog
          kind={action.kind}
          lead={actionLead}
          stages={stages}
          onClose={() => setAction(null)}
        />
      ) : null}

      {addOpen ? (
        <AddLeadDialog
          owners={owners}
          canAssign={canAssign}
          onClose={() => setAddOpen(false)}
          onCreated={(leadId, message) => {
            setAddOpen(false);
            setNotice(message);
            // Straight into the new opportunity, so the next thing they add
            // lands on the record they just made rather than on a search.
            if (leadId) openDrawer(leadId);
          }}
        />
      ) : null}

      {newOpportunityFor ? (
        <AddLeadDialog
          owners={owners}
          canAssign={canAssign}
          contact={
            newOpportunityFor.contactId
              ? {
                  id: newOpportunityFor.contactId,
                  name: newOpportunityFor.contactName,
                  businessName: newOpportunityFor.businessName,
                }
              : null
          }
          onClose={() => setNewOpportunityFor(null)}
          onCreated={(leadId, message) => {
            setNewOpportunityFor(null);
            setNotice(message);
            if (leadId) openDrawer(leadId);
          }}
        />
      ) : null}

      {editLead ? (
        <LeadFormDialog
          lead={editLead}
          assignableUsers={owners}
          canAssign={canAssign}
          onClose={() => setEditLeadId(null)}
        />
      ) : null}

      {importOpen ? (
        <LeadImportDialog owners={owners} onClose={() => setImportOpen(false)} />
      ) : null}
    </section>
  );
}
