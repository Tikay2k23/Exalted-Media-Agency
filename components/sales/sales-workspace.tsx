"use client";

import { ArrowRight, CalendarClock, Flame, Pencil, Phone, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LeadConvertDialog, LeadFormDialog } from "@/components/sales/lead-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LeadRow } from "@/lib/data/sales-queries";
import { cn, formatDate, formatEnumLabel } from "@/lib/utils";

function scoreBand(score: number | null) {
  if (score === null) return { label: "Unscored", tone: "slate" as const };
  if (score >= 70) return { label: "Hot", tone: "rose" as const };
  if (score >= 50) return { label: "Warm", tone: "amber" as const };
  if (score >= 30) return { label: "Cool", tone: "sky" as const };
  return { label: "Cold", tone: "slate" as const };
}

function statusTone(status: string) {
  switch (status) {
    case "CONVERTED":
      return "emerald" as const;
    case "QUALIFIED":
      return "sky" as const;
    case "LOST":
    case "DISQUALIFIED":
      return "rose" as const;
    case "NURTURE":
      return "violet" as const;
    case "ABANDONED":
      return "slate" as const;
    default:
      return "amber" as const;
  }
}

const FILTERS = [
  { key: "OPEN", label: "Open" },
  { key: "ALL", label: "All" },
  { key: "FOLLOW_UP", label: "Follow-up due" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "CONVERTED", label: "Converted" },
  { key: "LOST", label: "Lost" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const OPEN_STATUSES = ["NEW", "ATTEMPTING_CONTACT", "CONTACTED", "QUALIFIED", "NURTURE"];

export function SalesWorkspace({
  leads,
  assignableUsers,
  canCreate,
  canEdit,
  canConvert,
  canAssign,
}: {
  leads: LeadRow[];
  assignableUsers: { id: string; name: string }[];
  canCreate: boolean;
  canEdit: boolean;
  canConvert: boolean;
  canAssign: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("OPEN");
  const [editing, setEditing] = useState<LeadRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<LeadRow | null>(null);

  const visible = leads.filter((lead) => {
    switch (filter) {
      case "OPEN":
        return OPEN_STATUSES.includes(lead.status);
      case "FOLLOW_UP":
        return lead.isFollowUpOverdue;
      case "QUALIFIED":
        return lead.status === "QUALIFIED";
      case "CONVERTED":
        return lead.status === "CONVERTED";
      case "LOST":
        return lead.status === "LOST" || lead.status === "DISQUALIFIED";
      default:
        return true;
    }
  });

  return (
    <>
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Leads</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                aria-pressed={filter === option.key}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm font-medium transition",
                  filter === option.key
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {option.label}
              </button>
            ))}
            {canCreate ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => setCreating(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                New lead
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {visible.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Flame className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
              <p className="mt-4 text-base font-semibold text-slate-900">
                {leads.length === 0 ? "No leads yet" : "No leads match this filter"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                {leads.length === 0
                  ? "Leads you create or that are assigned to you will appear here, ordered by follow-up date and qualification score."
                  : "Try a different filter to see the rest of the pipeline."}
              </p>
              {canCreate && leads.length === 0 ? (
                <Button
                  type="button"
                  className="mt-6 gap-1.5"
                  onClick={() => setCreating(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Create the first lead
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200">
                    <tr className="text-left">
                      <th className="px-6 py-3 font-semibold text-slate-600">Lead</th>
                      <th className="px-6 py-3 font-semibold text-slate-600">Stage</th>
                      <th className="px-6 py-3 font-semibold text-slate-600">Score</th>
                      <th className="px-6 py-3 font-semibold text-slate-600">Value</th>
                      <th className="px-6 py-3 font-semibold text-slate-600">Owner</th>
                      <th className="px-6 py-3 font-semibold text-slate-600">Follow-up</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((lead) => {
                      const band = scoreBand(lead.score);

                      return (
                        <tr key={lead.id} className="align-top">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-950">
                              {lead.businessName}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                              {lead.contactName}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge tone={statusTone(lead.status)}>
                                {formatEnumLabel(lead.status)}
                              </Badge>
                              <Badge tone="slate">{formatEnumLabel(lead.source)}</Badge>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {lead.stageName ? (
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: lead.stageColor ?? "#94a3b8" }}
                                  aria-hidden
                                />
                                <span className="text-slate-800">{lead.stageName}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-slate-900">
                              {lead.score ?? "—"}
                            </span>
                            <Badge tone={band.tone} className="ml-2">
                              {band.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-700">
                            {lead.proposalValue ?? lead.budgetAmount
                              ? `${(lead.proposalValue ?? lead.budgetAmount)!.toLocaleString()}`
                              : "—"}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {lead.ownerName ?? (
                              <span className="text-amber-700">Unassigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {lead.nextFollowUpAt ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 text-sm",
                                  lead.isFollowUpOverdue
                                    ? "font-semibold text-rose-700"
                                    : "text-slate-600",
                                )}
                              >
                                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                                {formatDate(lead.nextFollowUpAt)}
                                {lead.isFollowUpOverdue ? " — overdue" : null}
                              </span>
                            ) : (
                              <span className="text-slate-400">Not scheduled</span>
                            )}
                            <p className="mt-1 text-xs text-slate-400">
                              <Phone className="mr-1 inline h-3 w-3" aria-hidden />
                              {lead.callCount} call{lead.callCount === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              {lead.convertedClientId ? (
                                <Link href={`/clients/${lead.convertedClientId}`}>
                                  <Button type="button" variant="secondary" size="sm">
                                    View account
                                  </Button>
                                </Link>
                              ) : (
                                <>
                                  {canEdit ? (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="gap-1.5"
                                      onClick={() => setEditing(lead)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Edit
                                    </Button>
                                  ) : null}
                                  {canConvert ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="gap-1.5"
                                      onClick={() => setConverting(lead)}
                                    >
                                      <ArrowRight className="h-3.5 w-3.5" />
                                      Convert
                                    </Button>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-slate-100 lg:hidden">
                {visible.map((lead) => {
                  const band = scoreBand(lead.score);

                  return (
                    <li key={lead.id} className="space-y-3 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">{lead.businessName}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                            {lead.contactName}
                          </p>
                        </div>
                        <Badge tone={band.tone}>
                          {lead.score ?? "—"} {band.label}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone(lead.status)}>
                          {formatEnumLabel(lead.status)}
                        </Badge>
                        {lead.stageName ? (
                          <Badge tone="slate">{lead.stageName}</Badge>
                        ) : null}
                      </div>

                      <p className="text-sm text-slate-600">
                        Owner: {lead.ownerName ?? "Unassigned"}
                      </p>

                      {lead.nextFollowUpAt ? (
                        <p
                          className={cn(
                            "text-sm",
                            lead.isFollowUpOverdue
                              ? "font-semibold text-rose-700"
                              : "text-slate-600",
                          )}
                        >
                          Follow-up {formatDate(lead.nextFollowUpAt)}
                          {lead.isFollowUpOverdue ? " — overdue" : null}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {lead.convertedClientId ? (
                          <Link href={`/clients/${lead.convertedClientId}`} className="flex-1">
                            <Button type="button" variant="secondary" size="sm" className="w-full">
                              View account
                            </Button>
                          </Link>
                        ) : (
                          <>
                            {canEdit ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="flex-1"
                                onClick={() => setEditing(lead)}
                              >
                                Edit
                              </Button>
                            ) : null}
                            {canConvert ? (
                              <Button
                                type="button"
                                size="sm"
                                className="flex-1"
                                onClick={() => setConverting(lead)}
                              >
                                Convert
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {creating ? (
        <LeadFormDialog
          lead={null}
          assignableUsers={assignableUsers}
          canAssign={canAssign}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {editing ? (
        <LeadFormDialog
          lead={editing}
          assignableUsers={assignableUsers}
          canAssign={canAssign}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {converting ? (
        <LeadConvertDialog
          lead={converting}
          assignableUsers={assignableUsers}
          canAssign={canAssign}
          onClose={() => setConverting(null)}
        />
      ) : null}
    </>
  );
}
