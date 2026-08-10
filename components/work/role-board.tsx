"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/utils";

export interface BoardCard {
  id: string;
  stage: string;
  blockedReason: string | null;
  ownerId: string | null;
  ownerName: string | null;
  clientId: string;
  companyName: string;
  serviceLabel: string;
  journeyStage: string;
  health: string;
}

export interface BoardColumnView {
  stage: string;
  label: string;
  hint: string;
  waiting?: boolean;
}

const HEALTH_TONE: Record<string, "emerald" | "amber" | "rose" | "slate"> = {
  GREEN: "emerald",
  YELLOW: "amber",
  RED: "rose",
  NOT_ASSESSED: "slate",
};

/**
 * One seat's pipeline.
 *
 * A column list rather than drag-and-drop: moving a card is a decision with
 * consequences - it can advance the whole account - so it is a deliberate
 * choice from a menu, not something that happens because a mouse slipped.
 */
export function RoleBoard({
  columns,
  cards,
  seatHolders,
  canAssign,
}: {
  columns: BoardColumnView[];
  cards: BoardCard[];
  seatHolders: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<{ id: string; stage: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(id: string, body: unknown, onDone?: () => void) {
    setError(null);
    setNote(null);

    startTransition(async () => {
      const response = await fetch(`/api/workstreams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            journeyMoved?: {
              stageKey: string;
              reason: string;
              moved: boolean;
              blockedBy?: string[];
              awaitingApproval?: boolean;
            } | null;
          }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "That could not be saved.");
        return;
      }

      // Tell the person what their move did to the account, rather than letting
      // them discover it on another page.
      const sync = data?.journeyMoved;

      if (sync?.moved) {
        setNote(
          `The account moved to ${sync.stageKey.replaceAll("_", " ")}. ${sync.reason}`,
        );
      } else if (sync?.awaitingApproval) {
        setNote(
          `${sync.reason} The project manager has been told it is ready to move to `
          + `${sync.stageKey.replaceAll("_", " ")}.`,
        );
      } else if (sync && sync.blockedBy?.length) {
        setNote(
          `Ready to move to ${sync.stageKey.replaceAll("_", " ")}, but the journey is `
          + `blocked on: ${sync.blockedBy.join(", ")}.`,
        );
      }

      onDone?.();
      router.refresh();
    });
  }

  function move(card: BoardCard, stage: string) {
    const column = columns.find((item) => item.stage === stage);

    if (column?.waiting) {
      setBlocking({ id: card.id, stage });
      return;
    }

    patch(card.id, { action: "move", stage });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm leading-6 text-rose-700">{error}</p>
        </div>
      ) : null}

      {note ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm leading-6 text-sky-900">{note}</p>
        </div>
      ) : null}

      {blocking ? (
        <form
          action={(formData) =>
            patch(
              blocking.id,
              {
                action: "move",
                stage: blocking.stage,
                blockedReason: String(formData.get("reason") ?? "").trim(),
              },
              () => setBlocking(null),
            )
          }
          className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-amber-900">
              What are you waiting for?
            </span>
            <Input name="reason" required placeholder="Meta Business Manager access" />
            <span className="block text-xs leading-5 text-amber-800">
              This tells the project manager exactly what to chase.
            </span>
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              Park it
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setBlocking(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {columns.map((column) => {
            const inColumn = cards.filter((card) => card.stage === column.stage);

            return (
              <section
                key={column.stage}
                className={`w-72 shrink-0 rounded-2xl border p-3 ${
                  column.waiting
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-slate-200 bg-slate-50/60"
                }`}
              >
                <header className="mb-2 px-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">{column.label}</h2>
                    <span className="text-xs text-slate-400">{inColumn.length}</span>
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{column.hint}</p>
                </header>

                <div className="space-y-2">
                  {inColumn.map((card) => (
                    <article
                      key={card.id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <Link
                        href={`/clients/${card.clientId}`}
                        className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                      >
                        {card.companyName}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {card.serviceLabel} · {card.journeyStage}
                      </p>

                      {card.blockedReason ? (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {card.blockedReason}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={HEALTH_TONE[card.health] ?? "slate"}>
                          {formatEnumLabel(card.health)}
                        </Badge>
                        <span className="text-xs text-slate-400">
                          {card.ownerName ?? "unstaffed"}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1.5">
                        <Select
                          aria-label={`Move ${card.companyName}`}
                          value={card.stage}
                          disabled={isPending}
                          onChange={(event) => move(card, event.target.value)}
                          className="h-8 text-xs"
                        >
                          {columns.map((option) => (
                            <option key={option.stage} value={option.stage}>
                              {option.label}
                            </option>
                          ))}
                        </Select>

                        {canAssign ? (
                          <Select
                            aria-label={`Assign ${card.companyName}`}
                            value={card.ownerId ?? ""}
                            disabled={isPending}
                            onChange={(event) =>
                              patch(card.id, {
                                action: "assign",
                                ownerId: event.target.value,
                              })
                            }
                            className="h-8 text-xs"
                          >
                            <option value="">Nobody yet</option>
                            {seatHolders.map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.name}
                              </option>
                            ))}
                          </Select>
                        ) : null}
                      </div>
                    </article>
                  ))}

                  {inColumn.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-slate-400">Nothing here.</p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Saving…
        </p>
      ) : null}
    </div>
  );
}
