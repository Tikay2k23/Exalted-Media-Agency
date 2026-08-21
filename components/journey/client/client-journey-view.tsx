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
  nextStep,
  stageClock,
} from "@/lib/journey/client-detail";
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
  nowIso,
}: {
  detail: JourneyClientDetail;
  nowIso: string;
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

  const menuRef = useRef<HTMLDivElement | null>(null);

  const { account } = detail;

  const step = useMemo(() => nextStep(detail), [detail]);
  const cards = useMemo(() => attentionCards(detail, now), [detail, now]);
  const clock = useMemo(() => stageClock(account, now), [account, now]);
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
      <Link
        href="/journey"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Journey
      </Link>

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
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

      {/* ---------------------------------------------------------------- */}
      {/* Body                                                              */}
      {/* ---------------------------------------------------------------- */}
      {/*
        * Two columns, roughly 65/35, matching how the page is actually used:
        * the left column is the work, the right column is the context you
        * glance at while doing it. On a phone this collapses to one column in
        * the order below, which puts Needs Attention directly under the action
        * card rather than beneath five cards of detail.
        */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <NextBestActionCard
            detail={detail}
            step={step}
            now={now}
            onPrimary={onPrimary}
            onAdvance={() => setAdvancing(true)}
          />

          <div className="xl:hidden">
            <NeedsAttentionPanel cards={cards} busy={busyCard} onAct={resolveFlag} />
          </div>

          <StageFocusCard detail={detail} />

          <StageRequirementsCard
            detail={detail}
            expanded={showAllRequirements}
            onToggle={() => setShowAllRequirements((open) => !open)}
          />

          <WorkSummaryCard detail={detail} now={now} clientId={account.id} />

          <JourneyTimelineCard
            detail={detail}
            now={now}
            expanded={showFullJourney}
            onToggle={() => setShowFullJourney((open) => !open)}
          />

          <CurrentStageCard
            detail={detail}
            now={now}
            onExplainHealth={() => setHealthOpen(true)}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="hidden xl:block">
            <NeedsAttentionPanel cards={cards} busy={busyCard} onAct={resolveFlag} />
          </div>

          <MilestonesCard milestones={detail.milestones} />
          <ClientInformationPanel detail={detail} />
          <RecentActivityPanel
            entries={detail.activity}
            now={now}
            clientId={account.id}
          />
        </div>
      </div>

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
          label={HEALTH_LABELS[health.health]}
          color={HEALTH_COLORS[health.health]}
          reasons={health.reasons}
          onClose={() => setHealthOpen(false)}
        />
      ) : null}
    </div>
  );
}
