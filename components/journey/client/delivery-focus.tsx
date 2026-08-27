"use client";

/**
 * The delivery card and the two requirement views behind it.
 *
 * The card is a rendering of a decision made on the server, so it holds no
 * opinion about what state the account is in. Its counters are buttons because
 * a number somebody cannot act on is a number they learn to skim.
 *
 * The requirement views are deliberately two different things:
 *
 *   Complete Requirements - every gate holding the next stage, each with a
 *     route to the record that satisfies it
 *   View Requirement - the single gate at the front of the queue, in full
 *
 * Neither offers a tick box. A requirement here is a condition evaluated
 * against real records - "production work complete" is true when the
 * production tasks are closed and in no other way - so the useful action is
 * the screen that owns the record, not a flag that would let the interface
 * disagree with the gate.
 */

import {
  ArrowRight,
  CircleAlert,
  Hammer,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { Card } from "@/components/journey/client/journey-cards";
import { Modal } from "@/components/journey/client/journey-dialogs";
import { Button } from "@/components/ui/button";
import { useState } from "react";

import type {
  BlockingRequirement,
  JourneyClientDetail,
  JourneyFlag,
} from "@/lib/journey/client-detail";
import type {
  CountTone,
  DeliveryActionKey,
  DeliveryCount,
} from "@/lib/journey/delivery-focus";
import { cn } from "@/lib/utils";

/** What a counter click asks the Work tab to show. */
export type WorkFilter = "active" | "overdue" | "blocked" | "needsReview";

const TONE_BOX: Record<CountTone, string> = {
  good: "border-emerald-100 bg-emerald-50/60",
  warn: "border-amber-100 bg-amber-50/60",
  bad: "border-rose-100 bg-rose-50/60",
  neutral: "border-slate-100 bg-slate-50",
};

const TONE_VALUE: Record<CountTone, string> = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
  neutral: "text-slate-800",
};

const TARGET_TONE = {
  ON_TRACK: "text-emerald-700",
  AT_RISK: "text-amber-700",
  DELAYED: "text-rose-700",
  UNKNOWN: "text-slate-500",
} as const;

const TARGET_LABEL = {
  ON_TRACK: "Production target on track",
  AT_RISK: "Production target at risk",
  DELAYED: "Production target passed",
  UNKNOWN: "No production target set",
} as const;

function Counter({
  count,
  onOpen,
}: {
  count: DeliveryCount;
  onOpen: (metric: WorkFilter) => void;
}) {
  const body = (
    <>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{count.label}</p>
      <p className={cn("mt-0.5 text-sm font-semibold", TONE_VALUE[count.tone])}>
        {count.value} {count.value === 1 ? count.unit : `${count.unit}s`}
      </p>
    </>
  );

  /*
   * Only a count the Work tab can actually reproduce becomes a button.
   * "Waiting on client" comes from the raised conditions rather than task
   * status, so there is no filter that would show the same set - and a button
   * landing on a different list than the number promised is worse than a
   * number that does not move.
   */
  if (!count.metric) {
    return (
      <div className={cn("rounded-xl border px-3 py-2", TONE_BOX[count.tone])}>{body}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(count.metric as WorkFilter)}
      className={cn(
        "rounded-xl border px-3 py-2 text-left transition hover:border-slate-300",
        TONE_BOX[count.tone],
      )}
    >
      {body}
    </button>
  );
}

export function DeliveryFocusCard({
  detail,
  onAct,
  onOpenWork,
}: {
  detail: JourneyClientDetail;
  onAct: (action: DeliveryActionKey) => void;
  onOpenWork: (metric: WorkFilter) => void;
}) {
  const { focus } = detail.delivery;
  const alarmed = focus.key === "RESOLVE_BLOCKER" || focus.key === "DELIVERY_RECOVERY";

  return (
    <Card
      icon={alarmed ? ShieldAlert : Hammer}
      title={focus.title}
      className={cn(focus.key === "RESOLVE_BLOCKER" && "border-rose-200")}
    >
      <p className="text-xs leading-5 text-slate-600">{focus.description}</p>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {focus.counts.map((count) => (
          <Counter key={count.label} count={count} onOpen={onOpenWork} />
        ))}
      </div>

      {/*
        * The target line was a fixed bullet reading "production target date
        * still realistic". It is now read from the project dates and the work.
        */}
      <p
        className={cn(
          "mt-3 flex items-start gap-1.5 text-[11px] leading-4",
          TARGET_TONE[focus.targetHealth],
        )}
      >
        {focus.targetHealth === "AT_RISK" || focus.targetHealth === "DELAYED" ? (
          <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />
        ) : null}
        <span>
          {TARGET_LABEL[focus.targetHealth]} - {focus.targetNote}
        </span>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {focus.actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            size="sm"
            variant={action.primary ? "primary" : "secondary"}
            className="gap-1.5"
            onClick={() => onAct(action.key)}
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Requirement views                                                          */
/* -------------------------------------------------------------------------- */

function RequirementBody({
  requirement,
  onResolve,
}: {
  requirement: BlockingRequirement;
  onResolve: (requirement: BlockingRequirement) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold text-slate-900">{requirement.label}</p>
        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700">
          Blocks {requirement.isBlocking ? "stage" : "milestone"}
        </span>
      </header>

      {requirement.description ? (
        <p className="mt-1 text-[11px] leading-4 text-slate-500">{requirement.description}</p>
      ) : null}

      <dl className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-slate-400">Owner</dt>
          <dd className="text-[11px] font-medium text-slate-700">{requirement.owner}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-slate-400">Status</dt>
          <dd className="text-[11px] font-medium text-amber-700">Not met</dd>
        </div>
      </dl>

      {/*
        * The checker's own words. A gate that says only "not met" makes
        * somebody go and work out which of five conditions failed.
        */}
      {requirement.reason ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-800">
          <CircleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />
          {requirement.reason}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] leading-4 text-slate-500">{requirement.route.how}</p>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-2 gap-1.5"
        onClick={() => onResolve(requirement)}
      >
        {requirement.route.action}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </section>
  );
}

/**
 * Everything holding the next stage.
 *
 * The list the advance button obeys, so a reader who clears this drawer can
 * move the client - and one who cannot see why the move is refused can see it
 * here rather than guessing.
 */
export function BlockingRequirementsDrawer({
  detail,
  onClose,
  onResolve,
}: {
  detail: JourneyClientDetail;
  onClose: () => void;
  onResolve: (requirement: BlockingRequirement) => void;
}) {
  const { blocking } = detail.delivery;
  const next = detail.account.nextStageName ?? "the next stage";

  return (
    <Modal
      eyebrow={detail.account.companyName}
      title={`Requirements blocking ${next}`}
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {blocking.length === 0 ? (
        <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-6 text-center text-xs text-emerald-700">
          All required exit criteria are complete.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-slate-600">
            {blocking.length} remaining. Each of these is checked against a record - open
            the record to satisfy it.
          </p>

          {blocking.map((requirement) => (
            <RequirementBody
              key={requirement.key}
              requirement={requirement}
              onResolve={onResolve}
            />
          ))}

          {/*
            * Said once, at the bottom, rather than beside every button. The
            * obvious question on opening this drawer is why nothing here can
            * simply be ticked off.
            */}
          <p className="text-[11px] leading-4 text-slate-400">
            These gates are evaluated from live records rather than stored as a checklist,
            so there is nothing to tick: each becomes complete when the record behind it
            does. Where a gate genuinely cannot be met, the stage move offers an override
            that records who decided and why.
          </p>
        </div>
      )}
    </Modal>
  );
}

/**
 * The one gate at the front of the queue.
 *
 * The lighter, read-first action. Same data, one requirement, no list to scan.
 */
export function RequirementDetailDrawer({
  detail,
  requirement,
  onClose,
  onResolve,
}: {
  detail: JourneyClientDetail;
  requirement: BlockingRequirement;
  onClose: () => void;
  onResolve: (requirement: BlockingRequirement) => void;
}) {
  return (
    <Modal
      eyebrow={detail.account.companyName}
      title={requirement.label}
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <RequirementBody requirement={requirement} onResolve={onResolve} />
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocker                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The blocker holding production, and the one button that clears it.
 *
 * Resolving posts to the journey-flag endpoint every other blocker control on
 * this page uses, so the permission check, the activity entry and the blocker
 * column sync all happen once in one place. Nothing is deleted: resolving sets
 * a timestamp, and the history stays answerable next quarter.
 */
export function BlockerDrawer({
  blocker,
  companyName,
  clientId,
  canResolve,
  onClose,
  onResolved,
}: {
  blocker: JourneyFlag;
  companyName: string;
  clientId: string;
  canResolve: boolean;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}/journey-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          flagId: blocker.id,
          note: note.trim() || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "That did not work. Try again.");
        return;
      }

      onResolved();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Severity", blocker.severity ?? "Not set"],
    ["Impact", blocker.impact ? blocker.impact.replaceAll("_", " ").toLowerCase() : "Not set"],
    ["Responsible", blocker.responsibleParty ?? "Not recorded"],
    ["Raised by", blocker.raisedByName ?? "Not recorded"],
    ["Raised", new Date(blocker.raisedAt).toLocaleDateString()],
    [
      "Expected resolution",
      blocker.expectedResolutionAt
        ? new Date(blocker.expectedResolutionAt).toLocaleDateString()
        : "Not set",
    ],
  ];

  return (
    <Modal
      eyebrow={companyName}
      title="Production blocker"
      onClose={onClose}
      footer={
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canResolve ? (
            <Button type="button" size="sm" disabled={busy} onClick={resolve}>
              {busy ? "Resolving..." : "Resolve Blocker"}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-900">{blocker.reason}</p>

        {blocker.detail ? (
          <p className="text-xs leading-5 text-slate-600">{blocker.detail}</p>
        ) : null}

        <dl className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="text-[11px] font-medium capitalize text-slate-700">{value}</dd>
            </div>
          ))}
        </dl>

        {canResolve ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">
              What cleared it? Recorded against the blocker.
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Client's host granted DNS access"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </label>
        ) : (
          <p className="text-[11px] text-slate-400">
            You do not have permission to resolve blockers on this account.
          </p>
        )}

        {error ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
            <TriangleAlert className="mt-px h-3 w-3 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The delivery workstreams, at project level.
 *
 * A different question from Tasks & Delivery, which is individual work. The
 * progress figure is the one the Work tab's own Projects section shows -
 * milestones complete over milestones total - rather than a second calculation
 * that would give one project two percentages.
 */
export function ProjectsDrawer({
  detail,
  onClose,
  onOpenProject,
}: {
  detail: JourneyClientDetail;
  onClose: () => void;
  onOpenProject: () => void;
}) {
  const { projects } = detail.delivery;

  return (
    <Modal
      eyebrow={detail.account.companyName}
      title="Delivery Projects"
      onClose={onClose}
      footer={
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {projects.length > 0 ? (
            <Button type="button" size="sm" onClick={onOpenProject}>
              Manage in Work
            </Button>
          ) : null}
        </>
      }
    >
      {projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
          No delivery projects are linked to this client.
        </p>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <section key={project.id} className="rounded-xl border border-slate-200 p-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {project.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Owner {project.ownerName ?? "unassigned"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                  {project.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </header>

              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-slate-700">
                  {project.progress}%
                </span>
              </div>

              <dl className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-100 pt-2">
                {[
                  { label: "Tasks", value: project.taskCount, tone: "text-slate-700" },
                  { label: "Done", value: project.completedTasks, tone: "text-emerald-700" },
                  { label: "Overdue", value: project.overdueTasks, tone: "text-rose-700" },
                  { label: "Blocked", value: project.blockedTasks, tone: "text-amber-700" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                      {stat.label}
                    </dt>
                    <dd className={cn("text-[11px] font-semibold", stat.tone)}>
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-2 text-[11px] text-slate-500">
                {project.nextMilestone
                  ? `Next milestone: ${project.nextMilestone.name}`
                  : "No milestone scheduled"}
              </p>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
