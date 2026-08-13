"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, GripVertical, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  BOARD_COLUMNS,
  buildBoard,
  dropTargetStageKey,
  initialsOf,
  isRealMove,
  opportunityValue,
  stageTag,
  type ColumnKey,
} from "@/lib/sales/pipeline-board";
import { followUpLabel, type SalesLead } from "@/lib/sales/sales-view";
import { formatEnumLabel } from "@/lib/utils";

function money(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** One opportunity, as it reads on the board. */
function Card({
  lead,
  now,
  dragging,
  onOpen,
}: {
  lead: SalesLead;
  now: Date;
  dragging?: boolean;
  onOpen?: (id: string) => void;
}) {
  const due = followUpLabel(lead.nextFollowUpAt, now);
  const tag = stageTag(lead);

  return (
    <div
      className={`rounded-xl border bg-white p-2.5 shadow-sm transition ${
        dragging ? "border-sky-400 shadow-lg" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen?.(lead.id)}
            className="block w-full text-left"
          >
            <span className="block truncate text-xs font-semibold text-slate-900">
              {lead.contactName}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {lead.businessName}
            </span>
          </button>
        </div>

        {/* Initials until there is an avatar to show. */}
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600"
          title={lead.ownerName ?? "Unassigned"}
        >
          {initialsOf(lead.ownerName)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {tag ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
            {tag}
          </span>
        ) : null}
        <span className="text-xs font-semibold text-slate-900">
          {money(opportunityValue(lead))}
        </span>
      </div>

      <p className="mt-1.5 truncate text-[11px] text-slate-500">
        {formatEnumLabel(lead.source)}
      </p>

      {lead.nextAction ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">
          <span className="font-medium text-slate-700">Next: </span>
          {lead.nextAction}
        </p>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 text-[11px] ${
            due.tone === "overdue"
              ? "font-medium text-rose-600"
              : due.tone === "today" || due.tone === "soon"
                ? "text-amber-600"
                : "text-slate-400"
          }`}
        >
          <CalendarClock className="h-3 w-3" />
          {due.label}
        </span>

        {/* Only signals the data actually carries. */}
        {lead.lastContactAt ? null : (
          <span className="inline-flex items-center gap-1 text-[11px] text-violet-600">
            <TriangleAlert className="h-3 w-3" />
            Never contacted
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  lead,
  now,
  canMove,
  onOpen,
}: {
  lead: SalesLead;
  now: Date;
  canMove: boolean;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled: !canMove,
  });

  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : undefined}>
      <div className="relative">
        {canMove ? (
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={`Move ${lead.contactName}`}
            className="absolute right-1 top-1 z-10 cursor-grab rounded p-0.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <Card lead={lead} now={now} onOpen={onOpen} />
      </div>
    </div>
  );
}

function Column({
  columnKey,
  label,
  count,
  value,
  children,
}: {
  columnKey: ColumnKey;
  label: string;
  count: number;
  value: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-0 flex-col rounded-xl border transition ${
        isOver ? "border-sky-400 bg-sky-50/50" : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <div className="border-b border-slate-200/70 p-2.5">
        <p className="truncate text-xs font-semibold text-slate-900">{label}</p>
        <p className="text-[11px] text-slate-500">
          {count} {count === 1 ? "opportunity" : "opportunities"}
        </p>
        <p className="text-xs font-semibold text-slate-700">{money(value)}</p>
      </div>

      <div className="flex-1 space-y-2 p-2">
        {children}
        {count === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-400">Nothing here</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The opportunity board.
 *
 * Seven columns over the agency's thirteen sales stages, because the pipeline
 * it actually runs is finer-grained than a board can usefully show. Dropping a
 * card writes the earliest stage in the target column - dropping onto Strategy
 * Call means the call is booked, not that somebody already attended it.
 *
 * The move is optimistic: the card lands where it was dropped immediately, and
 * goes back if the server refuses. Waiting for a round trip before the card
 * moves makes a board feel broken even when it is working.
 */
export function PipelineBoard({
  leads,
  now,
  canMove,
  onOpenLead,
}: {
  leads: SalesLead[];
  now: Date;
  canMove: boolean;
  onOpenLead: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /*
   * Overrides rather than a copy of the list. The server rows stay the source
   * of truth and this only holds the moves not yet confirmed, so a refresh
   * cannot be overwritten by stale local state.
   */
  const [moved, setMoved] = useState<Record<string, ColumnKey>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A small distance before a drag starts, or clicking a card to open it would
  // register as a drag and nothing would ever open.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const shown = leads.map((lead) => {
    const override = moved[lead.id];

    if (!override) return lead;

    const column = BOARD_COLUMNS.find((candidate) => candidate.key === override);

    return column ? { ...lead, stageKey: column.dropStageKey, stageName: column.label } : lead;
  });

  const board = buildBoard(shown);
  const draggingLead = dragging ? shown.find((lead) => lead.id === dragging) ?? null : null;

  async function onDragEnd(event: DragEndEvent) {
    setDragging(null);

    const target = event.over?.id as ColumnKey | undefined;
    const leadId = event.active.id as string;

    if (!target) return;

    const lead = leads.find((candidate) => candidate.id === leadId);

    if (!lead) return;

    /*
     * Compared against what is on screen, not against the server row: if an
     * earlier drop is still in flight, the card is already showing its new
     * column and dropping it back there is a no-op.
     */
    const shownLead = shown.find((candidate) => candidate.id === leadId) ?? lead;

    if (!isRealMove(shownLead, target)) return;

    setError(null);
    setMoved((current) => ({ ...current, [leadId]: target }));

    const response = await fetch(`/api/leads/${leadId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move-stage", stageKey: dropTargetStageKey(target) }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      // Put it back. A card that stays where it was dropped after a failed save
      // is a lie about what the database holds.
      setMoved((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });

      setError(data?.error ?? "That move didn't save.");
      return;
    }

    // Once the server agrees, the refreshed rows carry the change and the
    // override is no longer needed.
    startTransition(() => {
      router.refresh();
      setMoved((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });
    });
  }

  return (
    <div className="space-y-2 p-4">
      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(event: DragStartEvent) => setDragging(event.active.id as string)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        {/*
          Seven columns that shrink to fit rather than forcing the page sideways.
          Below the widest breakpoints the board scrolls inside its own card,
          which is the one place horizontal scrolling is the right answer - a
          kanban with wrapped columns is not a kanban.
        */}
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="grid min-w-[64rem] grid-cols-7 gap-2 2xl:min-w-0">
            {board.map((cell) => (
              <Column
                key={cell.column.key}
                columnKey={cell.column.key}
                label={cell.column.label}
                count={cell.count}
                value={cell.value}
              >
                {cell.leads.map((lead) => (
                  <DraggableCard
                    key={lead.id}
                    lead={lead}
                    now={now}
                    canMove={canMove}
                    onOpen={onOpenLead}
                  />
                ))}
              </Column>
            ))}
          </div>
        </div>

        {/* The card follows the cursor rather than the column reflowing under it. */}
        <DragOverlay>
          {draggingLead ? (
            <div className="w-56 rotate-2">
              <Card lead={draggingLead} now={now} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="text-[11px] text-slate-400">
        {canMove
          ? "Drag a card by its handle to move it between stages."
          : "You can open an opportunity, but moving one is for its owner."}
      </p>
    </div>
  );
}
