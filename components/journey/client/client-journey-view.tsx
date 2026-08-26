"use client";

import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Clock,
  ExternalLink,
  Gauge,
  MoreVertical,
  PauseCircle,
  Repeat2,
  UserRound,
  MailQuestion,
  Plus,
  StickyNote,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  CurrentStageCard,
  MilestonesCard,
  StageRequirementsCard,
  JourneyTimelineCard,
  StageFocusCard,
  NextBestActionCard,
  WorkSummaryCard,
} from "@/components/journey/client/journey-cards";
import {
  AdvanceStageDialog,
  HealthDialog,
  StagePreviewDialog,
  JourneyFlagDialog,
} from "@/components/journey/client/journey-dialogs";
import {
  ClientInformationPanel,
  NeedsAttentionPanel,
  RecentActivityPanel,
} from "@/components/journey/client/journey-panels";
import { Button } from "@/components/ui/button";
import {
  type AttentionCard,
  FLAG_LABELS,
  type FlagKind,
  type JourneyClientDetail,
  attentionCards,
  formatDay,
  requirementGroups,
  isReadyToAdvance,
  nextStep,
  stageClock,
} from "@/lib/journey/client-detail";
import { getStageTaskTemplates } from "@/lib/automation/stage-automation";
import { journeyHealth } from "@/lib/journey/journey-health";
import {
  ClientDependenciesCard,
  JourneyHealthCard,
  type QuickAction,
  QuickActionsCard,
  UpcomingStageCard,
} from "./journey-rail";
import {
  JourneyCard,
  JourneyFooter,
  JourneyHealthPanel,
  StageDetailsPanel,
  StageHistoryStrip,
  type TimelineStep,
} from "./journey-reference";
import {
  HEALTH_COLORS,
  HEALTH_LABELS,
  deriveProgress,
  explainHealth,
} from "@/lib/journey/journey-board";
import {
  TOTAL_JOURNEY_STAGES,
  journeyStageForStoredStage,
} from "@/lib/journey/phases";
import { cn, formatEnumLabel } from "@/lib/utils";

/**
 * One client's journey, as a single guided page.
 *
 * The order is the order a project manager asks the questions: where are we,
 * what happens next, what is stopping us, who owns it, are the requirements
 * done, can we advance. There are no tabs on the main path because every
 * answer above was previously a click away in a different one, and the whole
 * complaint about the old drawer was having to hunt.
 */
export function ClientJourneyView({
  detail,
  embedded = false,
  nowIso,
}: {
  detail: JourneyClientDetail;
  nowIso: string;
  /**
   * Rendered inside the client record's Journey tab rather than on its own
   * page. The tab already carries the client header and the tab strip, so the
   * view drops its own header and back link rather than showing the company
   * name twice and offering a way out of a page nobody navigated to.
   */
  embedded?: boolean;
}) {
  const router = useRouter();

  // Fixed for the render so the header, the stage card and the milestone rail
  // cannot disagree about what day it is.
  const [now] = useState(() => new Date(nowIso));

  const [menuOpen, setMenuOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [flagKind, setFlagKind] = useState<FlagKind | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [showAllRequirements, setShowAllRequirements] = useState(false);
  const [showFullJourney, setShowFullJourney] = useState(false);
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /*
   * Refetch on the server rather than reload the browser: the point is fresh
   * numbers, not a fresh page.
   */
  function onRefresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 600);
  }

  const menuRef = useRef<HTMLDivElement | null>(null);

  const { account } = detail;

  const step = useMemo(() => nextStep(detail), [detail]);
  const cards = useMemo(() => attentionCards(detail, now), [detail, now]);
  const clock = useMemo(() => stageClock(account, now), [account, now]);

  /*
   * The score behind the health label.
   *
   * explainHealth already decides what to call this account, and that label
   * is what the board and the header show - this adds how well it is going
   * and what moved the number, so the figure can be taken apart rather than
   * asserted. Two names for the same state would be worse than none.
   */
  const scored = useMemo(() => {
    const waiting = detail.flags
      .filter((flag) => flag.kind === "WAITING_ON_CLIENT")
      .map((flag) => new Date(flag.raisedAt).getTime())
      .sort((a, b) => a - b)[0];

    return journeyHealth({
      requirements: account.requirements,
      flags: detail.flags,
      tasks: detail.tasks.map((task) => ({
        status: task.status,
        dueDate: task.dueDate,
      })),
      dayInStage: clock.day,
      targetDays: clock.targetDays,
      waitingDays:
        waiting === undefined
          ? null
          : Math.max(1, Math.round((now.getTime() - waiting) / 86_400_000)),
      now,
    });
  }, [account.requirements, detail.flags, detail.tasks, clock, now]);

  /*
   * What this stage offers, given what is actually true of it.
   *
   * Context-aware rather than a fixed list: an account nobody is waiting on
   * is not offered a chase, and a viewer who cannot move the journey is not
   * shown a button that would refuse them. Advancing leads when the gate is
   * open, because that is the whole point of the page.
   */
  const quickActions = useMemo<QuickAction[]>(() => {
    const actions: QuickAction[] = [];
    const ready = isReadyToAdvance(detail);

    if (detail.canMove && account.nextStageId) {
      actions.push({
        key: "advance",
        label: ready ? `Advance to ${account.nextStageName}` : "Advance stage",
        icon: ArrowUpRight,
        primary: ready,
        onSelect: () => setAdvancing(true),
      });
    }

    if (detail.canManageFlags) {
      const waiting = detail.flags.some((flag) => flag.kind === "WAITING_ON_CLIENT");

      actions.push({
        key: "waiting",
        label: waiting ? "Update what the client owes" : "Record what the client owes",
        icon: MailQuestion,
        onSelect: () => setFlagKind("WAITING_ON_CLIENT"),
      });

      actions.push({
        key: "blocked",
        label: detail.flags.some((flag) => flag.kind === "BLOCKED")
          ? "Update the blocker"
          : "Add a blocker",
        icon: Plus,
        onSelect: () => setFlagKind("BLOCKED"),
      });
    }

    actions.push({
      key: "note",
      label: "Add a note",
      icon: StickyNote,
      onSelect: () => router.push(`/clients/${account.id}?tab=activity`),
    });

    return actions;
  }, [detail, account.id, account.nextStageId, account.nextStageName, router]);

  const groups = useMemo(
    () => requirementGroups(account.requirements),
    [account.requirements],
  );

  /*
   * The stepper, from the stages this client actually travels.
   *
   * Past stages take their date from the move that entered them, which is the
   * only real record of when it happened - a stage with no recorded move shows
   * no date rather than a guessed one.
   */
  const steps = useMemo<TimelineStep[]>(() => {
    const entered = new Map<string, string>();

    for (const move of account.history) {
      if (!entered.has(move.toStageName)) entered.set(move.toStageName, move.changedAt);
    }

    return detail.stages.map((stage) => {
      const state =
        stage.position < account.stagePosition
          ? ("done" as const)
          : stage.position === account.stagePosition
            ? ("current" as const)
            : ("future" as const);

      return {
        id: stage.id,
        name: stage.name,
        state,
        enteredAt:
          state === "current"
            ? account.stageEnteredAt
            : state === "done"
              ? (entered.get(stage.name) ?? null)
              : null,
      };
    });
  }, [detail.stages, account.history, account.stagePosition, account.stageEnteredAt]);

  /* The oldest open wait, which is what the rail dates from. */
  const waitingSince = useMemo(() => {
    const open = detail.flags
      .filter((flag) => flag.kind === "WAITING_ON_CLIENT")
      .map((flag) => flag.raisedAt)
      .sort();

    return open[0] ?? null;
  }, [detail.flags]);

  const secondaryStatus = detail.flags[0] ? FLAG_LABELS[detail.flags[0].kind] : null;

  const historyEntries = useMemo(
    () =>
      detail.activity.slice(0, 4).map((entry) => ({
        id: entry.id,
        label: entry.action,
        at: entry.createdAt,
        actorName: entry.actorName,
      })),
    [detail.activity],
  );
  const health = useMemo(() => explainHealth(account, now), [account, now]);
  const progress = deriveProgress(account);
  /*
   * Stages behind the client, not including the one they are in. Read from
   * the twelve-stage progression rather than a stored counter so it cannot
   * disagree with the timeline directly above it.
   */
  const stagesCompleted = Math.max(
    0,
    journeyStageForStoredStage(account.stageKey, account.stagePosition).position - 1,
  );

  useEffect(() => {
    if (!menuOpen) return;

    function onClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function resolveFlag(card: AttentionCard) {
    const flagId = card.key.startsWith("flag-") ? card.key.slice(5) : null;

    if (!flagId) return;

    setBusyCard(card.key);

    try {
      await fetch(`/api/clients/${account.id}/journey-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", flagId }),
      });

      router.refresh();
    } finally {
      setBusyCard(null);
    }
  }

  function onPrimary() {
    if (step.kind === "ready-to-advance") {
      setAdvancing(true);
      return;
    }

    if (step.kind === "resolve-blocker" || step.kind === "chase-client") {
      const card = cards.find((candidate) => candidate.key.startsWith("flag-"));

      if (card) {
        void resolveFlag(card);
        return;
      }
    }

    // Everything else is work, and the work lives in the task system.
    router.push(`/clients/${account.id}?tab=tasks`);
  }

  const menuItems: { label: string; icon: typeof UserRound; onSelect: () => void }[] = [
    {
      label: "Mark Waiting on Client",
      icon: Clock,
      onSelect: () => setFlagKind("WAITING_ON_CLIENT"),
    },
    { label: "Add Blocker", icon: CircleAlert, onSelect: () => setFlagKind("BLOCKED") },
    {
      label: "Request Revisions",
      icon: Repeat2,
      onSelect: () => setFlagKind("REVISIONS_REQUIRED"),
    },
    { label: "Pause Journey", icon: PauseCircle, onSelect: () => setFlagKind("PAUSED") },
  ];

  return (
    <div className="space-y-4">
      {!embedded ? (
      <Link
        href="/journey"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Journey
      </Link>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      {!embedded ? (
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                {account.companyName}
              </h1>
              <span
                className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  backgroundColor: `${account.stageColor}1a`,
                  color: account.stageColor,
                }}
              >
                {account.stageName}
              </span>
              <span
                className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  backgroundColor: `${HEALTH_COLORS[health.health]}1a`,
                  color: HEALTH_COLORS[health.health],
                }}
              >
                {HEALTH_LABELS[health.health]}
              </span>
              {detail.flags.map((flag) => (
                <span
                  key={flag.id}
                  className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600"
                >
                  {FLAG_LABELS[flag.kind]}
                </span>
              ))}
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {account.services.map((service) => formatEnumLabel(service)).join(", ")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/clients/${account.id}`}>
              <Button size="sm" variant="secondary" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Open Client Profile</span>
                <span className="sm:hidden">Profile</span>
              </Button>
            </Link>

            {detail.canMove && account.nextStageId ? (
              <Button size="sm" className="gap-1.5" onClick={() => setAdvancing(true)}>
                Advance Stage
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}

            {detail.canManageFlags ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  aria-label="More actions"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {menuOpen ? (
                  <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {menuItems.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          item.onSelect();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                      >
                        <item.icon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {item.label}
                      </button>
                    ))}
                    <Link
                      href={`/clients/${account.id}?tab=tasks`}
                      className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Open All Tasks
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/*
          * The operational summary, read left to right: where the client is,
          * whose desk it is on, how long it has sat there, where it goes next,
          * and how far through the journey it is. Five cells rather than three
          * because "which stage" and "what next" are the two questions asked
          * most often, and putting them anywhere else means scrolling for them.
          */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              Current Stage
            </p>
            <p className="truncate text-sm font-semibold text-slate-950">
              {account.stageName}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              Entered {formatDay(account.stageEnteredAt)}
            </p>
          </div>

          <div className="flex min-w-0 items-start gap-2">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Stage Owner
              </p>
              {account.projectManagerName ? (
                <>
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {account.projectManagerName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Project Manager</p>
                </>
              ) : (
                <>
                  <p className="truncate text-sm font-semibold text-rose-600">
                    Not assigned
                  </p>
                  {/*
                    * No project manager is the single most common reason an
                    * account sits still, so the fix is offered right here
                    * rather than only inside Needs Attention.
                    */}
                  <Link
                    href={`/clients/${account.id}?tab=overview`}
                    className="mt-0.5 inline-block text-[11px] font-semibold text-sky-700 hover:text-sky-800"
                  >
                    Assign Project Manager
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex min-w-0 items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Days in Stage
              </p>
              <p
                className={cn(
                  "truncate text-sm font-semibold",
                  clock.isOverTarget ? "text-rose-600" : "text-slate-950",
                )}
              >
                {clock.label}
              </p>
              {clock.remainingLabel ? (
                <p
                  className={cn(
                    "mt-0.5 truncate text-[11px]",
                    clock.isOverTarget ? "text-rose-500" : "text-slate-400",
                  )}
                >
                  {clock.remainingLabel}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 items-start gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Next Stage
              </p>
              <p className="truncate text-sm font-semibold text-slate-950">
                {account.nextStageName ?? "Journey complete"}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-start gap-2">
            <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Overall Progress
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-800">{progress}%</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {stagesCompleted} of {TOTAL_JOURNEY_STAGES} stages completed
              </p>
            </div>
          </div>
        </div>
      </header>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Body                                                              */}
      {/* ---------------------------------------------------------------- */}
      {/*
        * The reference layout.
        *
        * The timeline and the summary beneath it are one card, because they
        * answer one question together - where is this account, and how close
        * is it to leaving. The rail runs alongside from the top and holds what
        * you read rather than operate. History sits underneath, where somebody
        * goes looking for it.
        */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0 space-y-4">
          <JourneyCard
            account={account}
            steps={steps}
            clock={clock}
            groups={groups}
            step={step}
            secondaryStatus={secondaryStatus}
            description={null}
            canChangeOwner={false}
            onChangeOwner={() => router.push(`/clients/${account.id}?tab=contacts`)}
            onPrimary={onPrimary}
            onViewRequirement={() => setShowAllRequirements(true)}
          />

          <div className="xl:hidden">
            <NeedsAttentionPanel cards={cards} busy={busyCard} onAct={resolveFlag} />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <StageRequirementsCard
              detail={detail}
              expanded={showAllRequirements}
              onToggle={() => setShowAllRequirements((open) => !open)}
            />
            <WorkSummaryCard detail={detail} now={now} clientId={account.id} />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-3">
            <ClientDependenciesCard
              flags={detail.flags}
              now={now}
              canAct={detail.canManageFlags}
              onFollowUp={() => setFlagKind("WAITING_ON_CLIENT")}
            />
            <MilestonesCard milestones={detail.milestones} />
            <UpcomingStageCard
              nextStageName={account.nextStageName}
              nextStageKey={account.nextStageKey}
              onPreview={() => setPreviewing(true)}
            />
          </div>

          <StageHistoryStrip
            entries={historyEntries}
            onViewAll={() => router.push(`/journey/${account.id}/history`)}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="hidden xl:block">
            <NeedsAttentionPanel cards={cards} busy={busyCard} onAct={resolveFlag} />
          </div>

          <StageDetailsPanel
            account={account}
            clock={clock}
            groups={groups}
            secondaryStatus={secondaryStatus}
            healthLabel={HEALTH_LABELS[health.health]}
            waitingSince={waitingSince}
            now={now}
          />

          <QuickActionsCard actions={quickActions} />

          <JourneyHealthPanel
            health={scored}
            statusLabel={HEALTH_LABELS[health.health]}
            onAssess={() => setHealthOpen(true)}
            onDetails={() => setHealthOpen(true)}
          />

          <StageFocusCard detail={detail} />
          <ClientInformationPanel detail={detail} />
        </div>
      </div>

      <JourneyFooter
        timezone={null}
        updatedAt={nowIso}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      {advancing && account.nextStageId ? (
        <AdvanceStageDialog detail={detail} onClose={() => setAdvancing(false)} />
      ) : null}

      {flagKind ? (
        <JourneyFlagDialog
          clientId={account.id}
          kind={flagKind}
          onClose={() => setFlagKind(null)}
        />
      ) : null}

      {healthOpen ? (
        <HealthDialog
          score={scored.score}
          factors={scored.factors}
          label={HEALTH_LABELS[health.health]}
          color={HEALTH_COLORS[health.health]}
          reasons={health.reasons}
          onClose={() => setHealthOpen(false)}
        />
      ) : null}

      {previewing && account.nextStageName ? (
        <StagePreviewDialog
          stageName={account.nextStageName}
          entryActions={
            account.nextStageKey
              ? getStageTaskTemplates(account.nextStageKey).map((template) => ({
                  title: template.title,
                  note: template.note,
                }))
              : []
          }
          onClose={() => setPreviewing(false)}
        />
      ) : null}
    </div>
  );
}
