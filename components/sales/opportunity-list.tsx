"use client";

import {
  CustomTag,
  FollowUpText,
  NextActionText,
  OwnerAvatar,
  OwnerChip,
  money,
} from "@/components/sales/opportunity-bits";
import { RowMenu, type RowMenuItem } from "@/components/work/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  dealValue,
  lastContactLabel,
  opportunityLabel,
  proposalAgeDays,
  type SalesLead,
} from "@/lib/sales/sales-view";
import { formatEnumLabel } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50];

/**
 * The list view.
 *
 * The same opportunities the board shows, in the shape you want when there are
 * more of them than fit on a board: one row each, scannable down a column, with
 * the two fields that decide what happens today - next action and next follow
 * up - given real width rather than being pushed into a drawer.
 *
 * table-fixed with percentage columns and no min-width, so the table is exactly
 * as wide as its card. The lowest-priority columns drop out below 2xl instead
 * of pushing the rest sideways; both of them are in the drawer, so nothing
 * becomes unreachable.
 */
export function OpportunityList({
  leads,
  now,
  page,
  pageSize,
  selected,
  openLeadId,
  agingDays,
  onOpen,
  onPageChange,
  onPageSizeChange,
  onToggleSelected,
  onToggleAll,
  menuItemsFor,
}: {
  leads: SalesLead[];
  now: Date;
  page: number;
  pageSize: number;
  selected: Set<string>;
  openLeadId: string | null;
  agingDays: number;
  onOpen: (id: string, section?: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onToggleSelected: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  menuItemsFor: (lead: SalesLead) => RowMenuItem[];
}) {
  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = leads.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleIds = visible.map((lead) => lead.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <>
      <div className="hidden md:block">
        <table className="w-full table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[2.25rem]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="hidden w-[8%] 2xl:table-column" />
            <col className="hidden w-[8%] 2xl:table-column" />
            <col className="w-[16%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
            <col className="w-[2.5rem]" />
          </colgroup>
          <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select every opportunity on this page"
                  checked={allSelected}
                  onChange={(event) => onToggleAll(visibleIds, event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
                />
              </th>
              <th className="px-2 py-2.5 font-semibold">Opportunity / Lead</th>
              <th className="px-3 py-2.5 font-semibold">Company</th>
              <th className="px-3 py-2.5 font-semibold">Owner</th>
              <th className="px-3 py-2.5 font-semibold">Stage</th>
              <th className="hidden px-3 py-2.5 font-semibold 2xl:table-cell">Source</th>
              <th className="hidden px-3 py-2.5 font-semibold 2xl:table-cell">Last Contact</th>
              <th className="px-3 py-2.5 font-semibold">Next Action</th>
              <th className="px-3 py-2.5 font-semibold">Next Follow Up</th>
              <th className="px-3 py-2.5 text-right font-semibold">Value</th>
              <th className="px-2 py-2.5 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((lead) => {
              const age = proposalAgeDays(lead, now);
              const value = dealValue(lead);

              return (
                <tr
                  key={lead.id}
                  onClick={() => onOpen(lead.id)}
                  className={`cursor-pointer align-top transition hover:bg-slate-50/60 ${
                    openLeadId === lead.id ? "bg-sky-50/50" : ""
                  }`}
                >
                  {/*
                    The checkbox and the menu stop the click going through to
                    the row, or selecting three rows would open three drawers.
                  */}
                  <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${opportunityLabel(lead)}`}
                      checked={selected.has(lead.id)}
                      onChange={() => onToggleSelected(lead.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
                    />
                  </td>

                  <td className="px-2 py-3">
                    <div className="flex items-start gap-2">
                      <OwnerAvatar name={lead.contactName} size="md" />
                      <div className="min-w-0">
                        <span className="block break-words font-medium text-slate-900">
                          {lead.contactName}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {lead.email ?? lead.phone ?? "No contact details"}
                        </span>
                        {/*
                          Only shown when it says something the company column
                          does not. A deal named after its own account twice on
                          one row is noise.
                        */}
                        {lead.opportunityName
                        && lead.opportunityName !== lead.businessName ? (
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                            {lead.opportunityName}
                          </span>
                        ) : null}
                        {lead.tags.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {lead.tags.slice(0, 2).map((tag) => (
                              <CustomTag key={tag} tag={tag} />
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 text-slate-600">
                    <span className="block truncate" title={lead.businessName}>
                      {lead.businessName}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <OwnerChip name={lead.ownerName} />
                  </td>

                  <td className="px-3 py-3">
                    <Badge tone="slate" className="whitespace-nowrap">
                      {lead.stageName ?? formatEnumLabel(lead.status)}
                    </Badge>
                    {age !== null && age >= agingDays ? (
                      <p className="mt-1 whitespace-nowrap text-[11px] text-rose-600">
                        {age} days waiting
                      </p>
                    ) : null}
                  </td>

                  <td className="hidden px-3 py-3 text-slate-600 2xl:table-cell">
                    <span className="block truncate">{formatEnumLabel(lead.source)}</span>
                  </td>

                  <td className="hidden whitespace-nowrap px-3 py-3 text-slate-600 2xl:table-cell">
                    {lastContactLabel(lead.lastContactAt, now)}
                  </td>

                  <td className="px-3 py-3 text-slate-700">
                    <NextActionText value={lead.nextAction} />
                  </td>

                  <td className="px-3 py-3">
                    <FollowUpText value={lead.nextFollowUpAt} now={now} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-slate-800">
                    {value ? money(value) : "—"}
                  </td>

                  <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                    <RowMenu
                      label={`Actions for ${opportunityLabel(lead)}`}
                      items={menuItemsFor(lead)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cards below the table breakpoint. */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {visible.map((lead) => (
          <li key={lead.id} className="space-y-2 p-4">
            <button
              type="button"
              onClick={() => onOpen(lead.id)}
              className="flex w-full items-start gap-2 text-left"
            >
              <OwnerAvatar name={lead.contactName} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">
                  {lead.contactName}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {lead.businessName}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-slate-800">
                {dealValue(lead) ? money(dealValue(lead)) : "—"}
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="slate">{lead.stageName ?? formatEnumLabel(lead.status)}</Badge>
              <FollowUpText value={lead.nextFollowUpAt} now={now} className="text-[11px]" />
              <OwnerChip name={lead.ownerName} />
            </div>

            <p className="text-xs text-slate-600">
              <span className="font-medium text-slate-800">Next: </span>
              <NextActionText value={lead.nextAction} />
            </p>

            <div className="flex justify-end">
              <RowMenu
                label={`Actions for ${opportunityLabel(lead)}`}
                items={menuItemsFor(lead)}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <p className="text-xs text-slate-600">
          Showing {(currentPage - 1) * pageSize + 1} to{" "}
          {Math.min(currentPage * pageSize, leads.length)} of {leads.length} opportunities
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-slate-600">
            {currentPage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            Next
          </Button>
          <Select
            className="h-9 w-auto text-xs"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </Select>
        </div>
      </div>
    </>
  );
}
