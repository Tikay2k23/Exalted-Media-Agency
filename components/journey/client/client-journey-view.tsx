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
  ScrollText,
  LifeBuoy,
  StickyNote,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TabLink, useClientTab } from "@/components/clients/client-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  MilestonesCard,
  StageRequirementsCard,
  StageFocusCard,
  WorkSummaryCard,
} from "@/components/journey/client/journey-cards";
import {
  AdvanceStageDialog,
  HealthDialog,
  AutomationLogDialog,
  RecoveryPlanDialog,
  StagePreviewDialog,
  JourneyFlagDialog,
} from "@/components/journey/client/journey-dialogs";
import {
  BlockerDrawer,
  BlockingRequirementsDrawer,
  DeliveryFocusCard,
  ProjectsDrawer,
  RequirementDetailDrawer,
  type WorkFilter,
} from "@/components/journey/client/delivery-focus";
import {
  ContactsToChaseDrawer,
  MissingInformationDrawer,
  OnboardingFocusCard,
  RequirementsDrawer,
} from "@/components/journey/client/onboarding-focus";
import {
  ClientInformationPanel,
  NeedsAttentionPanel,
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
import { type DeliveryActionKey } from "@/lib/journey/delivery-focus";
import { type BlockingRequirement } from "@/lib/journey/client-detail";
import { type FocusActionKey } from "@/lib/journey/onboarding-focus";
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
  owners = [],
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
  /**
   * Who a recovery plan can be given to. Empty by default so the standalone
   * journey page keeps working without it - the owner is optional on a plan,
   * and an empty list means the field simply offers nobody.
   */
  owners?: { id: string; name: string }[];
}) {
  const router = useRouter();
  /*
   * Switching tabs from inside a panel needs the controller, not a URL push.
   * client-tabs says why: App Router treats ?tab= as a soft navigation, so the
   * tab component re-renders with a new initial prop and is never remounted -
   * its useState keeps the old value and nothing moves. Null on the standalone
   * journey page, which has no tabs to switch.
   */
  const tabs = useClientTab();

  // Fixed for the render so the header, the stage card and the milestone rail
  // cannot disagree about what day it is.
  const [now] = useState(() => new Date(nowIso));

  const [menuOpen, setMenuOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [flagKind, setFlagKind] = useState<FlagKind | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [showAllRequirements, setShowAllRequirements] = useState(false);
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Which onboarding drawer is open, if any. */
  const [drawer, setDrawer] = useState<
    | "chase"
    | "missing"
    | "requirements"
    | "blocking"
    | "requirement"
    | "projects"
    | "blocker"
    | null
  >(null);

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
   * Whether onboarding is what this account is about right now.
   *
   * Always in the three onboarding stages. Past them, only while a form is
   * genuinely in flight - sent, and not yet read.
   *
   * The narrower second test is deliberate and was arrived at the hard way.
   * Taking over whenever the intake was merely "unfinished" put "Focus: Send
   * Intake" on a client sitting in Internal Quality Assurance, because nobody
   * had ever sent that account a form. Most accounts past onboarding are in
   * that position, so the card that was meant to stop stale onboarding advice
   * would have served stale onboarding advice to two thirds of the board -
   * and buried the defect and checklist guidance somebody in QA actually
   * needs. A form that was never sent to a client in QA is a gap for the
   * requirements table to raise, not a reason to replace the stage's card.
   */
  const onboardingLeads = useMemo(() => {
    const stageKey = journeyStageForStoredStage(
      account.stageKey,
      account.stagePosition,
    ).key;

    if (
      stageKey === "payment_received"
      || stageKey === "onboarding"
      || stageKey === "access_assets"
    ) {
      return true;
    }

    const state = detail.onboarding.focus.intakeState;

    return state === "SENT"
      || state === "OPENED"
      || state === "IN_PROGRESS"
      || state === "SUBMITTED";
  }, [account.stageKey, account.stagePosition, detail.onboarding.focus.intakeState]);

  /*
   * Whether the delivery card owns the focus slot.
   *
   * The build stage only, and only when onboarding is not already claiming it.
   * Scoped this tightly on purpose: the last card to take over the slot on a
   * looser test ended up putting onboarding advice on accounts in QA, and the
   * per-stage focus is genuinely the better card everywhere it still applies -
   * somebody in Internal QA wants defects and checklists, not a task count.
   */
  const deliveryLeads = useMemo(
    () =>
      journeyStageForStoredStage(account.stageKey, account.stagePosition).key
      === "build_implementation",
    [account.stageKey, account.stagePosition],
  );

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

  const openPause = detail.flags.find((flag) => flag.kind === "PAUSED" && !flag.resolvedAt) ?? null;

  /** Closing the pause period, which restarts the stage clock. */
  /*
   * Stable across renders, because the quick actions memo closes over it. A
   * fresh function each render would either break the memo or leave it holding
   * a stale one - and the stale one would resume the wrong pause after a
   * refresh.
   */
  const resumeJourney = useCallback(
    async (flagId: string) => {
      await fetch(`/api/clients/${account.id}/journey-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", flagId, note: "Journey resumed." }),
      });
  
      router.refresh();
    },
    [account.id, router],
  );

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

    /*
     * Only when the journey is actually in trouble. A recovery plan offered on
     * a healthy account is paperwork, and an action that is always there stops
     * meaning anything when it matters.
     */
    if (scored.status === "AT_RISK" || scored.status === "BLOCKED") {
      actions.push({
        key: "recovery",
        label: "Create recovery plan",
        icon: LifeBuoy,
        onSelect: () => setRecovering(true),
      });
    }

    actions.push({
      key: "note",
      label: "Add a note",
      icon: StickyNote,
      onSelect: () => router.push(`/clients/${account.id}?tab=activity`),
    });

    /*
     * These three live in the More menu on the standalone journey page, and
     * that menu sits inside the header the client tab hides - so embedding the
     * view quietly took them away. They belong in Quick Actions anyway: it is
     * the one place on the tab for acting on the journey.
     */
    if (detail.canManageFlags) {
      actions.push({
        key: "revisions",
        label: "Request revisions",
        icon: Repeat2,
        onSelect: () => setFlagKind("REVISIONS_REQUIRED"),
      });

      actions.push(
        openPause
          ? {
              key: "resume",
              label: "Resume journey",
              icon: PauseCircle,
              onSelect: () => void resumeJourney(openPause.id),
            }
          : {
              key: "pause",
              label: "Pause journey",
              icon: PauseCircle,
              onSelect: () => setFlagKind("PAUSED"),
            },
      );
    }

    actions.push({
      key: "automation",
      label: "View automation log",
      icon: ScrollText,
      onSelect: () => setLogOpen(true),
    });

    return actions;
  }, [
    detail,
    account.id,
    account.nextStageId,
    account.nextStageName,
    router,
    scored.status,
    openPause,
    resumeJourney,
  ]);

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

  /*
   * Recording that somebody chased a client dependency.
   *
   * Not a send. Nothing here sends email or SMS - that stays an explicit human
   * action in this application - so this records the chase, which is what makes
   * the age of a request mean anything. The server refuses a second one the
   * same day, so a double click cannot chase a client twice.
   */
  async function followUpOn(flagId: string) {
    if (busyCard) return;

    setBusyCard(`follow-${flagId}`);

    try {
      const response = await fetch(`/api/clients/${account.id}/journey-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow-up", flagId }),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => null);

        window.alert(failure?.error ?? "We could not record that follow-up.");
        return;
      }

      router.refresh();
    } finally {
      setBusyCard(null);
    }
  }


  /*
   * What a Needs Attention button does.
   *
   * Everything used to go to resolveFlag, which reads a flag id out of the
   * card key and returns quietly when there is not one - so the two cards
   * that are not flags had buttons that did nothing at all, which is worse
   * than having no button. Each card now goes where its own problem lives.
   */
  function actOnCard(card: AttentionCard) {
    if (card.key.startsWith("flag-")) {
      const flag = detail.flags.find(
        (candidate) => candidate.id === card.key.slice(5),
      );

      /*
       * A card reading "Send Follow-Up" must not resolve the thing.
       *
       * Every flag card came here and every one was resolved, so the waiting
       * card - whose button says Send Follow-Up - marked what the client owes
       * as done, and the account stopped waiting without the client having
       * answered. The other kinds do say Mark Resolved or Resume Journey, and
       * for those resolving is exactly right.
       */
      if (flag?.kind === "WAITING_ON_CLIENT") {
        setDrawer("chase");
        return;
      }

      void resolveFlag(card);
      return;
    }

    if (card.key === "overdue-tasks") {
      // Straight to the task itself where the card named one.
      const href = card.targetId
        ? `/clients/${account.id}?tab=tasks&task=${card.targetId}`
        : `/clients/${account.id}?tab=tasks`;

      /*
       * The push carries the task id so the Work tab knows which row to open;
       * the controller is what actually moves the user there.
       */
      router.push(href);
      tabs?.setTab("tasks", card.targetId ?? undefined);
      return;
    }

    if (card.key === "missing-access") {
      router.push(`/clients/${account.id}?tab=files`);
      tabs?.setTab("files");
      return;
    }

    // A card with no home is a card that should not have carried a button.
    console.warn(`[journey] No action wired for attention card: ${card.key}`);
  }

  /**
   * Where the focus card's buttons go.
   *
   * Three of them open a drawer here; the rest hand off to a screen that
   * already owns the job. Nothing in this switch sends an intake form or
   * reviews one - both live in Strategy, and this navigates to them rather
   * than growing a second copy that would have to be kept in step.
   *
   * `focusTarget` is how the Strategy tab knows what to do on arrival: every
   * panel on the client page is mounted before anybody clicks, so a URL
   * parameter cannot reach one. The tab controller carries it instead.
   */
  function goToStrategy(focusTarget: "intake" | "intake-workspace") {
    router.push(`/clients/${account.id}?tab=services`);
    tabs?.setTab("services", focusTarget);
  }

  /**
   * The Work tab, arriving filtered.
   *
   * The metric names are the Work tab's own filter cards, so the number
   * somebody clicked and the rows they land on are the same question asked
   * twice rather than two questions that happen to agree today.
   *
   * Deliberately no journey-stage filter. A task carries no stage - not one of
   * the client tasks on this database has even the template key stage
   * automation writes - so a link claiming to narrow by stage would show an
   * empty list and blame the client for having no work.
   */
  function openWork(metric?: WorkFilter) {
    router.push(`/clients/${account.id}?tab=tasks`);
    tabs?.setTab("tasks", metric ? `metric:${metric}` : undefined);
  }

  /** The requirement the View Requirement button opens: the one at the front. */
  const topRequirement: BlockingRequirement | null = detail.delivery.blocking[0] ?? null;

  /**
   * Where the delivery card's buttons go.
   *
   * Every key in DeliveryActionKey appears here, and the switch is exhaustive,
   * so adding a state with a new button stops compiling until it is wired.
   */
  function actOnDelivery(action: DeliveryActionKey) {
    switch (action) {
      case "view-blocker":
        setDrawer("blocker");
        return;

      case "review-overdue":
        openWork("overdue");
        return;

      case "contacts-to-chase":
        // The same drawer the onboarding card opens - one chase list.
        setDrawer("chase");
        return;

      case "tasks-and-delivery":
        openWork();
        return;

      case "projects":
        setDrawer("projects");
        return;

      case "complete-requirements":
        setDrawer("blocking");
        return;

      case "view-requirement":
        setDrawer(topRequirement ? "requirement" : "blocking");
        return;

      case "advance-stage":
        // The one transition path: the same dialog Move Stage opens, which
        // posts to /api/pipeline/move and runs the whole gate check server-side.
        setAdvancing(true);
        return;

      case "review-readiness":
        setShowAllRequirements(true);
        document.getElementById("stage-requirements")?.scrollIntoView({ block: "start" });
        return;

      default: {
        /*
         * Exhaustiveness, checked by the compiler.
         *
         * A new focus state carrying a new button will not build until it is
         * wired here. Without this the switch simply falls through and the
         * button does nothing at all, which is the failure this whole pass is
         * about and is invisible in review.
         */
        const unhandled: never = action;

        console.warn(`[journey] No action wired for delivery button: ${String(unhandled)}`);
      }
    }
  }

  /** Take somebody to the record that satisfies a gate. */
  function resolveRequirement(requirement: BlockingRequirement) {
    setDrawer(null);

    const { tab, metric } = requirement.route;

    router.push(`/clients/${account.id}?tab=${tab}`);
    tabs?.setTab(tab, metric ? `metric:${metric}` : undefined);
  }

  function actOnFocus(action: FocusActionKey) {
    switch (action) {
      case "go-to-strategy":
        goToStrategy("intake");
        return;

      case "open-onboarding-form":
      case "review-intake":
        // The existing intake workspace, opened where it already lives.
        goToStrategy("intake-workspace");
        return;

      case "preview-intake":
        // The read-only preview route that already exists. New tab, because
        // it is a reference rather than somewhere to work.
        window.open(`/clients/${account.id}/intake-preview`, "_blank", "noopener");
        return;

      case "contacts-to-chase":
        setDrawer("chase");
        return;

      case "view-missing-information":
        setDrawer("missing");
        return;

      case "view-requirements":
        setDrawer("requirements");
        return;

      case "view-journey":
        /*
         * Already on the journey when this card is embedded in the tab, so
         * scrolling to the timeline is the honest reading of "view journey".
         */
        if (embedded) {
          document
            .getElementById("journey-timeline")
            ?.scrollIntoView({ block: "start" });
          return;
        }

        router.push(`/clients/${account.id}?tab=journey`);
        return;

      default: {
        // Same compiler-checked exhaustiveness as the delivery dispatcher.
        const unhandled: never = action;

        console.warn(`[journey] No action wired for focus button: ${String(unhandled)}`);
      }
    }
  }

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

    /*
     * Chasing is not closing.
     *
     * This button reads "Send Follow-Up" and used to call resolveFlag, which
     * posts action: "resolve" - so the one button offered for an account
     * waiting on its client marked the thing the client owes as done, and the
     * waiting state disappeared without the client having answered. The chase
     * drawer is where a follow-up is actually recorded.
     */
    if (step.kind === "chase-client") {
      setDrawer("chase");
      return;
    }

    /*
     * Resolving a blocker takes a note, and this had none.
     *
     * The same immediate resolve, on a card where nobody had been shown what
     * they were clearing. The drawer names the blocker, carries the reason,
     * and records what cleared it. Where the blocker is a blocked task rather
     * than a raised flag there is no record to open, so the work itself is.
     */
    if (step.kind === "resolve-blocker") {
      if (detail.delivery.topBlocker) {
        setDrawer("blocker");
        return;
      }

      openWork("blocked");
      return;
    }

    /*
     * The requirements are the stage gate, not delivery work. Plenty of them -
     * "primary contact recorded" - have no task behind them at all, so the
     * task list somebody used to land on could hold nothing to do with what
     * was blocking. Complete Requirements opens every gate holding the next
     * stage, each with a route to the record that satisfies it.
     */
    if (step.kind === "complete-requirements") {
      setDrawer("blocking");
      return;
    }

    // What is left is delivery work, and that does live in the task system.
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
    /*
     * Pause and resume are the same control. Offering Pause to an account
     * already paused would open a second period against the first, and two
     * overlapping pauses make the stage clock impossible to reason about.
     */
    {
      label: "View Automation Log",
      icon: ScrollText,
      onSelect: () => setLogOpen(true),
    },
    openPause
      ? {
          label: "Resume Journey",
          icon: PauseCircle,
          onSelect: () => void resumeJourney(openPause.id),
        }
      : {
          label: "Pause Journey",
          icon: PauseCircle,
          onSelect: () => setFlagKind("PAUSED"),
        },
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
                    <TabLink
                      tab="tasks"
                      clientId={account.id}
                      className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Open All Tasks
                    </TabLink>
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
                  <TabLink
                    tab="overview"
                    clientId={account.id}
                    className="mt-0.5 inline-block text-[11px] font-semibold text-sky-700 hover:text-sky-800"
                  >
                    Assign Project Manager
                  </TabLink>
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
        <div id="journey-timeline" className="min-w-0 scroll-mt-24 space-y-4">
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
            onViewRequirement={() =>
              setDrawer(topRequirement ? "requirement" : "blocking")
            }
          />

          <div className="xl:hidden">
            <NeedsAttentionPanel cards={cards} busy={busyCard} onAct={actOnCard} />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div id="stage-requirements" className="min-w-0 scroll-mt-4">
            <StageRequirementsCard
              detail={detail}
              expanded={showAllRequirements}
              onToggle={() => setShowAllRequirements((open) => !open)}
            />
            </div>
            <WorkSummaryCard detail={detail} now={now} clientId={account.id} />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-3">
            <ClientDependenciesCard
              flags={detail.flags}
              now={now}
              canAct={detail.canManageFlags}
              onFollowUp={(flag) => void followUpOn(flag.id)}
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
            <NeedsAttentionPanel cards={cards} busy={busyCard} onAct={actOnCard} />
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

          {/*
            * Onboarding owns this slot while onboarding is what is happening.
            *
            * Past the onboarding stages the per-stage focus is the more useful
            * card - somebody looking at an account in Internal QA wants
            * defects and checklists, not a form that was signed off weeks ago.
            * Which is also what "stop emphasising intake once onboarding is
            * complete" asks for.
            */}
          {onboardingLeads ? (
            <OnboardingFocusCard detail={detail} onAct={actOnFocus} />
          ) : deliveryLeads ? (
            <DeliveryFocusCard
              detail={detail}
              onAct={actOnDelivery}
              onOpenWork={openWork}
            />
          ) : (
            <StageFocusCard detail={detail} />
          )}
          <ClientInformationPanel
            detail={detail}
            onOpenJourney={() => actOnFocus("view-journey")}
            onOpenTab={(tab) => {
              router.push(`/clients/${account.id}?tab=${tab}`);
              tabs?.setTab(tab);
            }}
          />
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

      {drawer === "chase" ? (
        <ContactsToChaseDrawer
          detail={detail}
          onClose={() => setDrawer(null)}
          onChanged={onRefresh}
        />
      ) : null}

      {drawer === "missing" ? (
        <MissingInformationDrawer
          detail={detail}
          onClose={() => setDrawer(null)}
          onOpenForm={() => {
            setDrawer(null);
            actOnFocus("open-onboarding-form");
          }}
        />
      ) : null}

      {drawer === "requirements" ? (
        <RequirementsDrawer
          detail={detail}
          onClose={() => setDrawer(null)}
          onChase={() => setDrawer("chase")}
        />
      ) : null}

      {drawer === "blocking" ? (
        <BlockingRequirementsDrawer
          detail={detail}
          onClose={() => setDrawer(null)}
          onResolve={resolveRequirement}
        />
      ) : null}

      {drawer === "requirement" && topRequirement ? (
        <RequirementDetailDrawer
          detail={detail}
          requirement={topRequirement}
          onClose={() => setDrawer(null)}
          onResolve={resolveRequirement}
        />
      ) : null}

      {drawer === "projects" ? (
        <ProjectsDrawer
          detail={detail}
          onClose={() => setDrawer(null)}
          onOpenProject={() => {
            setDrawer(null);
            openWork();
          }}
        />
      ) : null}

      {drawer === "blocker" && detail.delivery.topBlocker ? (
        <BlockerDrawer
          blocker={detail.delivery.topBlocker}
          companyName={account.companyName}
          canResolve={detail.canManageFlags}
          onClose={() => setDrawer(null)}
          onResolved={() => {
            setDrawer(null);
            onRefresh();
          }}
          clientId={account.id}
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

      {logOpen ? (
        <AutomationLogDialog clientId={account.id} onClose={() => setLogOpen(false)} />
      ) : null}

      {recovering ? (
        <RecoveryPlanDialog
          clientId={account.id}
          /* Seeded from what the score actually said, not a blank box. */
          seedProblem={scored.reasons.map((reason) => reason.text).join(" ")}
          owners={owners}
          defaultOwnerId={account.ownerId}
          onClose={() => setRecovering(false)}
          onSaved={() => router.refresh()}
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
