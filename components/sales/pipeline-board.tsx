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
  ActivityIndicators,
  CustomTag,
  NextActionText,
  OwnerAvatar,
  SourceText,
  StageTag,
  money,
} from "@/components/sales/opportunity-bits";
import {
  BOARD_COLUMNS,
  buildBoard,
  dropTargetStageKey,
  isRealMove,
  opportunityValue,
  stageTag,
  type ColumnKey,
} from "@/lib/sales/pipeline-board";
import { followUpLabel, opportunityLabel, type SalesLead } from "@/lib/sales/sales-view";

/** A dot per column, matching the reference board's stage headers. */
const COLUMN_DOTS: Record<ColumnKey, string> = {
  "new-lead": "bg-sky-500",
  contacted: "bg-violet-500",
  "strategy-call": "bg-amber-500",
  qualified: "bg-emerald-500",
  proposal: "bg-indigo-500",
  negotiation: "bg-orange-500",
  won: "bg-teal-500",
};

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
  onOpen?: (id: string, section?: string) => void;
}) {
  const due = followUpLabel(lead.nextFollowUpAt, now);
  const tag = stageTag(lead);
  const value = opportunityValue(lead);

  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm transition ${
        dragging ? "border-sky-400 shadow-lg" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onOpen?.(lead.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13px] font-semibold text-slate-900">
            {opportunityLabel(lead)}
          </span>
          <span className="block truncate text-[11px] text-slate-500">{lead.businessName}</span>
          <span className="block truncate text-[11px] text-slate-400">{lead.contactName}</span>
        </button>

        <OwnerAvatar name={lead.ownerName} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <StageTag tag={tag} />
        {lead.tags.slice(0, 2).map((custom) => (
          <CustomTag key={custom} tag={custom} />
        ))}
        {lead.tags.length > 2 ? (
          <span className="text-[10px] text-slate-400">+{lead.tags.length - 2}</span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-sm font-semibold text-slate-900">
          {value ? money(value) : "No value"}
        </span>
        <SourceText source={lead.source} />
      </div>

      <p className="mt-2 text-[11px] leading-4 text-slate-600">
        <span className="font-medium text-slate-700">Next: </span>
        <NextActionText value={lead.nextAction} />
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
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

      <div className="mt-2.5 border-t border-slate-100 pt-2">
        <ActivityIndicators
          activity={lead.activity}
          onOpenSection={
            onOpen
              ? (key) =>
                  onOpen(
                    lead.id,
                    key === "calls" || key === "appointments"
                      ? "activity"
                      : key === "notes"
                        ? "notes"
                        : key === "tasks"
                          ? "tasks"
                          : "records",
                  )
              : undefined
          }
        />
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
  onOpen: (id: string, section?: string) => void;
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
            aria-label={`Move ${opportunityLabel(lead)}`}
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
      className={`flex w-[19rem] shrink-0 flex-col rounded-xl border transition ${
        isOver ? "border-sky-400 bg-sky-50/50" : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <div className="border-b border-slate-200/70 p-3">
        <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-900">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLUMN_DOTS[columnKey]}`} />
          {label}
        </p>
        <p className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
          <span>
            {count} {count === 1 ? "opportunity" : "opportunities"}
          </span>
          <span className="font-semibold text-slate-700">{money(value)}</span>
        </p>
      </div>

      <div className="flex-1 space-y-2 p-2">
        {children}
        {count === 0 ? (
          <p className="py-8 text-center text-[11px] text-slate-400">Nothing here</p>
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
 * Columns are a fixed 19rem and the board scrolls sideways inside its own
 * card. Squeezing seven readable columns into a laptop screen means cards that
 * cannot show a value, an owner and a next action at once, and a card that
 * cannot show those is not worth looking at. The scroller is on this element
 * and nowhere else, so the page itself never moves.
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
  onOpenLead: (id: string, section?: string) => void;
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
    <div className="space-y-2">
      {error ? (
        <p className="mx-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(event: DragStartEvent) => setDragging(event.active.id as string)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        {/*
          The one place in the application where horizontal scrolling is the
          right answer. A kanban with wrapped columns is not a kanban, and
          columns narrow enough to avoid the scrollbar cannot hold a readable
          card. The overflow is on this element, so the page never moves.
        */}
        <div className="overflow-x-auto px-4 pb-3">
          <div className="flex min-w-max gap-3">
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
            <div className="w-[18rem] rotate-2">
              <Card lead={draggingLead} now={now} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="px-4 pb-3 text-[11px] text-slate-400">
        {canMove
          ? "Drag a card by its handle to move it between stages. Click a card for the full opportunity."
          : "You can open an opportunity, but moving one is for its owner."}
      </p>
    </div>
  );
}
