"use client";

import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Crosshair,
  FileText,
  Flag,
  FolderOpen,
  Gem,
  Pencil,
  Plus,
  Route,
  StickyNote,
  Target,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ClientOverviewFooter } from "@/components/clients/client-overview-footer";
import { TabLink } from "@/components/clients/client-tabs";
import { EmptyPanel, Monogram } from "@/components/clients/client-bits";
import {
  AudienceDialog,
  GoalsDialog,
  NoteDialog,
  ValuePropDialog,
  type AudienceValues,
  type GoalValues,
  type ValuePropValues,
} from "@/components/clients/strategy-editors";
import { Badge } from "@/components/ui/badge";
import {
  ROADMAP_PHASES,
  SECTION_BY_KEY,
  type RoadmapStatus,
  type SectionStatus,
  type StrategyProgress,
  type StrategySectionKey,
} from "@/lib/strategy/strategy-sections";
import { cn, formatEnumLabel } from "@/lib/utils";

/**
 * Clients → open a client → Strategy.
 *
 * What this client is trying to do, who for, why anybody would choose them,
 * what we have collected, and how far the thinking has got. The written brief
 * still lives under it; this is the part somebody reads to know what to do next.
 *
 * The progress figure is the piece that has to stay honest. It counts only the
 * sections this client's services require, so a website account is never marked
 * down for having no paid media strategy - and every number on the page comes
 * from a record rather than a field somebody typed a percentage into.
 */

export interface StrategySectionRow {
  key: StrategySectionKey;
  status: SectionStatus;
  ownerName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
}

export interface StrategyRoadmapRow {
  key: string;
  status: RoadmapStatus;
  ownerName: string | null;
  targetDate: string | null;
  completedAt: string | null;
}

export interface StrategyAssetRow {
  id: string;
  name: string;
  type: string;
  status: string;
  fileUrl: string | null;
}

export interface StrategyNoteRow {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface StrategyIntake {
  exists: boolean;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  submittedAt: string | null;
  percent: number;
  missingRequired: string[];
  recipientEmail: string;
}

/* -------------------------------------------------------------------------- */
/* Furniture                                                                  */
/* -------------------------------------------------------------------------- */

function Card({
  title,
  icon,
  action,
  children,
  footer,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 px-5 pt-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon}
          <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2>
        </div>
        {action}
      </header>

      <div className="min-h-0 flex-1 px-5 py-4">{children}</div>

      {footer ? <div className="px-5 pb-4">{footer}</div> : null}
    </section>
  );
}

function CardIcon({
  tone,
  children,
}: {
  tone: "violet" | "sky" | "emerald" | "amber" | "rose" | "indigo";
  children: React.ReactNode;
}) {
  const tones = {
    violet: "bg-violet-50 text-violet-600",
    sky: "bg-sky-50 text-sky-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    indigo: "bg-indigo-50 text-indigo-600",
  } as const;

  return (
    <span
      aria-hidden
      className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tones[tone])}
    >
      {children}
    </span>
  );
}

function EditButton({ label = "Edit", icon, onClick }: { label?: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
    >
      {icon ?? <Pencil className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  );
}

/** The blue "View details →" at the foot of the middle-row cards. */
function CardLink({ tab, children }: { tab: Parameters<typeof TabLink>[0]["tab"]; children: React.ReactNode }) {
  return (
    <TabLink
      tab={tab}
      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 transition hover:text-sky-700"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </TabLink>
  );
}

function shortDate(value: string | null) {
  if (!value) return null;

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysAway(value: string | null, now: Date) {
  if (!value) return null;

  const days = Math.round(
    (new Date(value).getTime() - now.getTime()) / 86_400_000,
  );

  if (days === 0) return "today";
  if (days < 0) return `${Math.abs(days)} days ago`;

  return `in ${days} days`;
}

/* -------------------------------------------------------------------------- */
/* Progress ring                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The percentage, as a ring.
 *
 * A conic gradient rather than a charting dependency: it is one number, and
 * the page should not pull a renderer to draw it.
 */
function ProgressRing({ percent }: { percent: number }) {
  const filled = Math.max(0, Math.min(100, percent));

  return (
    <div
      className="relative h-14 w-14 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(#6366f1 ${filled * 3.6}deg, #e2e8f0 ${filled * 3.6}deg)`,
      }}
      role="img"
      aria-label={`${filled}% complete`}
    >
      <div className="absolute inset-[6px] flex items-center justify-center rounded-full bg-white">
        <span className="text-xs font-semibold text-slate-950">{filled}%</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Roadmap strip                                                              */
/* -------------------------------------------------------------------------- */

const ROADMAP_TONE: Record<RoadmapStatus, { dot: string; label: string; text: string }> = {
  COMPLETE: { dot: "bg-emerald-500 text-white", label: "Complete", text: "text-emerald-600" },
  IN_PROGRESS: { dot: "bg-sky-500 text-white", label: "In Progress", text: "text-sky-600" },
  BLOCKED: { dot: "bg-rose-500 text-white", label: "Blocked", text: "text-rose-600" },
  PENDING: { dot: "bg-slate-200 text-slate-500", label: "Pending", text: "text-slate-400" },
};

function RoadmapStrip({ phases }: { phases: StrategyRoadmapRow[] }) {
  const byKey = new Map(phases.map((phase) => [phase.key, phase]));

  return (
    <ol className="flex items-start gap-0">
      {ROADMAP_PHASES.map((definition, index) => {
        const phase = byKey.get(definition.key);
        const status: RoadmapStatus = phase?.status ?? "PENDING";
        const tone = ROADMAP_TONE[status];
        const isLast = index === ROADMAP_PHASES.length - 1;

        return (
          <li key={definition.key} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* Half-width rails either side of the dot, so the line joins
                  neighbouring steps and stops at the ends of the strip. */}
              <span
                aria-hidden
                className={cn(
                  "h-0.5 flex-1",
                  index === 0 ? "bg-transparent" : status === "PENDING" ? "bg-slate-200" : "bg-emerald-500",
                )}
              />
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  tone.dot,
                )}
              >
                {status === "COMPLETE" ? "✓" : index + 1}
              </span>
              <span
                aria-hidden
                className={cn(
                  "h-0.5 flex-1",
                  isLast ? "bg-transparent" : status === "COMPLETE" ? "bg-emerald-500" : "bg-slate-200",
                )}
              />
            </div>

            <p className="mt-2 text-center text-[11px] font-medium leading-4 text-slate-700">
              {definition.label}
            </p>
            <p className={cn("text-center text-[11px]", tone.text)}>{tone.label}</p>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

const INTAKE_TONE: Record<string, "slate" | "sky" | "amber" | "emerald"> = {
  NOT_SENT: "slate",
  SENT: "sky",
  VIEWED: "sky",
  PARTIALLY_COMPLETED: "amber",
  SUBMITTED: "emerald",
  REVIEWED: "emerald",
};

export function ClientStrategy({
  clientId,
  companyName,
  progress,
  sections,
  goals,
  audiences,
  valueProp,
  roadmap,
  assets,
  notes,
  intake,
  users,
  briefWorkspace,
  projectsWorkspace,
  briefUpdatedAt,
  briefAuthorName,
  nextMilestone,
  canEdit,
  serverNow,
  timezone,
  intakeWorkspace,
}: {
  clientId: string;
  companyName: string;
  progress: StrategyProgress;
  sections: StrategySectionRow[];
  goals: GoalValues[];
  audiences: AudienceValues[];
  valueProp: ValuePropValues;
  roadmap: StrategyRoadmapRow[];
  assets: StrategyAssetRow[];
  notes: StrategyNoteRow[];
  intake: StrategyIntake;
  users: { id: string; name: string }[];
  briefUpdatedAt: string | null;
  briefAuthorName: string | null;
  nextMilestone: { name: string; dueAt: string } | null;
  canEdit: boolean;
  serverNow: string;
  timezone: string | null;
  /** The existing intake workspace, rendered whole when somebody opens it. */
  intakeWorkspace: React.ReactNode;
  /**
   * The written brief and the services list, both of which lived on this tab
   * before it was rebuilt. The cards above summarise; these still do the work,
   * so they are kept rather than dropped - folded away by default so the page
   * opens as the design intends.
   */
  briefWorkspace: React.ReactNode;
  projectsWorkspace: React.ReactNode;
}) {
  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const [editing, setEditing] = useState<null | "goals" | "audience" | "valueProp" | "note">(null);
  const [showIntake, setShowIntake] = useState(false);

  const primary = audiences.filter((audience) => audience.tier === "PRIMARY");
  const secondary = audiences.filter((audience) => audience.tier === "SECONDARY");
  const latestNote = notes[0] ?? null;

  return (
    <div className="space-y-4">
      {editing === "goals" ? (
        <GoalsDialog
          clientId={clientId}
          companyName={companyName}
          goals={goals}
          users={users}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === "audience" ? (
        <AudienceDialog
          clientId={clientId}
          companyName={companyName}
          audiences={audiences}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === "valueProp" ? (
        <ValuePropDialog
          clientId={clientId}
          companyName={companyName}
          values={valueProp}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {editing === "note" ? (
        <NoteDialog clientId={clientId} companyName={companyName} onClose={() => setEditing(null)} />
      ) : null}

      {/* ------------------------------------------------- row 1 */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-2">
        <Card
          title="Strategy Overview"
          icon={
            <CardIcon tone="violet">
              <Crosshair className="h-4.5 w-4.5" />
            </CardIcon>
          }
        >
          <p className="text-xs leading-5 text-slate-600">
            Define the client&rsquo;s business goals, target audience, positioning, brand
            foundation, acquisition strategy and execution roadmap.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 divide-slate-100 sm:grid-cols-3 sm:divide-x">
            <div className="flex items-start gap-2.5">
              <CardIcon tone="sky">
                <CalendarDays className="h-4 w-4" />
              </CardIcon>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500">Last updated</p>
                <p className="truncate text-xs font-semibold text-slate-950">
                  {shortDate(briefUpdatedAt) ?? "Not yet"}
                </p>
                {briefAuthorName ? (
                  <p className="truncate text-[11px] text-slate-400">by {briefAuthorName}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-start gap-2.5 sm:pl-4">
              <ProgressRing percent={progress.percent} />
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500">Strategy progress</p>
                <p className="text-xs font-semibold text-slate-950">
                  {progress.completed} of {progress.total} sections
                </p>
                <p className="text-[11px] text-slate-400">completed</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 sm:pl-4">
              <CardIcon tone="indigo">
                <Flag className="h-4 w-4" />
              </CardIcon>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500">Next milestone</p>
                {nextMilestone ? (
                  <>
                    <p className="truncate text-xs font-semibold text-slate-950">
                      {nextMilestone.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {shortDate(nextMilestone.dueAt)} ({daysAway(nextMilestone.dueAt, now)})
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Nothing scheduled</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* ---- intake, whose sending is the existing functionality ---- */}
        <Card
          title="Client Intake Form"
          icon={
            <CardIcon tone="rose">
              <ClipboardList className="h-4.5 w-4.5" />
            </CardIcon>
          }
          action={
            <Badge tone={INTAKE_TONE[intake.status] ?? "slate"}>
              {formatEnumLabel(intake.status)}
            </Badge>
          }
        >
          <p className="text-xs leading-5 text-slate-600">
            The intake form collects the information needed to build the right strategy and
            deliver the work.
          </p>

          {intake.status === "NOT_SENT" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">
                    Intake form has not been sent yet.
                  </p>
                  <p className="text-[11px] text-slate-600">
                    Send it to {intake.recipientEmail} to gather their information.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">
                  {intake.percent}% answered
                </p>
                <p className="text-[11px] text-slate-500">
                  {intake.submittedAt
                    ? `Submitted ${shortDate(intake.submittedAt)}`
                    : intake.viewedAt
                      ? `Opened ${shortDate(intake.viewedAt)}`
                      : `Sent ${shortDate(intake.sentAt)}`}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${intake.percent}%` }}
                />
              </div>
              {intake.missingRequired.length > 0 ? (
                <p className="text-[11px] text-amber-600">
                  {intake.missingRequired.length} required answer
                  {intake.missingRequired.length === 1 ? "" : "s"} still missing
                </p>
              ) : null}
            </div>
          )}

          {/*
            * Sending, resending and reviewing all live in the intake workspace
            * that already exists. This opens it rather than reimplementing any
            * of it - there is one send path in the application and this is not
            * a second one.
            */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowIntake((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {intake.status === "NOT_SENT" ? "Send Intake Form" : "Open intake workspace"}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", showIntake && "rotate-180")}
                aria-hidden
              />
            </button>

            <a
              href={`/clients/${clientId}/intake-preview`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Preview Intake Form
            </a>
          </div>
        </Card>
      </div>

      {/* The existing intake workspace, unchanged, revealed on demand. */}
      {showIntake ? <div>{intakeWorkspace}</div> : null}

      {/* ------------------------------------------------- row 2 */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          title="Business Goals"
          icon={
            <CardIcon tone="emerald">
              <Target className="h-4.5 w-4.5" />
            </CardIcon>
          }
          action={canEdit ? <EditButton onClick={() => setEditing("goals")} /> : null}
          footer={goals.length > 0 ? <CardLink tab="reports">View details</CardLink> : null}
        >
          {goals.length === 0 ? (
            <EmptyPanel>No business goals documented yet.</EmptyPanel>
          ) : (
            <ul className="space-y-2.5">
              {goals.slice(0, 4).map((goal) => (
                <li key={goal.id ?? goal.title} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
                      goal.status === "ACHIEVED" ? "bg-emerald-500" : "bg-emerald-400/70",
                    )}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 text-xs leading-5 text-slate-700">{goal.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Target Audience"
          icon={
            <CardIcon tone="sky">
              <Users className="h-4.5 w-4.5" />
            </CardIcon>
          }
          action={canEdit ? <EditButton onClick={() => setEditing("audience")} /> : null}
          footer={audiences.length > 0 ? <CardLink tab="reports">View details</CardLink> : null}
        >
          {audiences.length === 0 ? (
            <EmptyPanel>Target audience has not been defined.</EmptyPanel>
          ) : (
            <div className="space-y-3">
              {primary.length > 0 ? (
                <div>
                  <p className="text-[11px] text-slate-500">Primary Audience</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-800">
                    {primary.map((a) => a.name).join(", ")}
                  </p>
                </div>
              ) : null}
              {secondary.length > 0 ? (
                <div>
                  <p className="text-[11px] text-slate-500">Secondary Audience</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-800">
                    {secondary.map((a) => a.name).join(", ")}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card
          title="Value Proposition"
          icon={
            <CardIcon tone="indigo">
              <Gem className="h-4.5 w-4.5" />
            </CardIcon>
          }
          action={canEdit ? <EditButton onClick={() => setEditing("valueProp")} /> : null}
          footer={valueProp.statement ? <CardLink tab="reports">View details</CardLink> : null}
        >
          {!valueProp.statement && valueProp.differentiators.length === 0 ? (
            <EmptyPanel>No value proposition documented.</EmptyPanel>
          ) : (
            <div className="space-y-3">
              {valueProp.statement ? (
                <p className="text-xs italic leading-5 text-slate-700">
                  &ldquo;{valueProp.statement}&rdquo;
                </p>
              ) : null}
              {valueProp.differentiators.length > 0 ? (
                <div>
                  <p className="text-[11px] font-medium text-slate-500">Key Differentiators</p>
                  <ul className="mt-1 space-y-1">
                    {valueProp.differentiators.slice(0, 4).map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card
          title="Brand Assets"
          icon={
            <CardIcon tone="amber">
              <FolderOpen className="h-4.5 w-4.5" />
            </CardIcon>
          }
          /* Files & Access owns assets. This opens it rather than growing a
             second uploader on a card whose job is to say what is missing. */
          action={
            <TabLink
              tab="files"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden />
              Manage
            </TabLink>
          }
          footer={<CardLink tab="files">View all assets</CardLink>}
        >
          {assets.length === 0 ? (
            <EmptyPanel>No brand assets received yet.</EmptyPanel>
          ) : (
            <ul className="space-y-2.5">
              {assets.slice(0, 4).map((asset) => {
                const received = asset.status === "RECEIVED" || asset.status === "APPROVED";

                return (
                  <li key={asset.id} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                        received ? "bg-emerald-500 text-white" : "border border-slate-300 text-transparent",
                      )}
                    >
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-slate-800">
                        {asset.name}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {formatEnumLabel(asset.status)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------- row 3 */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,57fr)_minmax(0,43fr)]">
        <Card
          title="Strategy Roadmap"
          icon={
            <CardIcon tone="violet">
              <Route className="h-4.5 w-4.5" />
            </CardIcon>
          }
          action={<CardLink tab="journey">View full roadmap</CardLink>}
        >
          {/*
            * Always drawn, even before any phase has a row.
            *
            * The five phases are a fixed catalogue, so "not started" is simply
            * all of them pending - and the strip showing that says more about
            * what happens next than a sentence saying nothing has happened.
            */}
          <div className="pt-2">
            <RoadmapStrip phases={roadmap} />
          </div>
        </Card>

        <Card
          title="Strategy Notes"
          icon={
            <CardIcon tone="amber">
              <StickyNote className="h-4.5 w-4.5" />
            </CardIcon>
          }
          action={
            canEdit ? (
              <EditButton
                label="Add Note"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setEditing("note")}
              />
            ) : null
          }
          footer={notes.length > 0 ? <CardLink tab="activity">View all notes</CardLink> : null}
        >
          {!latestNote ? (
            <EmptyPanel>No strategy notes yet.</EmptyPanel>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5">
              <Monogram name={latestNote.authorName} />
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-5 text-slate-800">{latestNote.body}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {latestNote.authorName ?? "Unknown"} ·{" "}
                  {new Date(latestNote.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* The section list behind the progress figure, so the number is
          auditable rather than something the page asserts. */}
      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-950">
          <span className="inline-flex items-center gap-2">
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
            Strategy sections ({progress.completed} of {progress.total} complete)
          </span>
        </summary>

        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {sections.map((section) => {
            const definition = SECTION_BY_KEY.get(section.key);

            return (
              <li key={section.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-900">
                    {definition?.label ?? section.key}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {definition?.description}
                  </span>
                </span>
                {section.ownerName ? (
                  <span className="text-[11px] text-slate-400">{section.ownerName}</span>
                ) : null}
                <Badge
                  tone={
                    section.status === "APPROVED"
                      ? "emerald"
                      : section.status === "READY_FOR_REVIEW"
                        ? "sky"
                        : section.status === "IN_PROGRESS"
                          ? "amber"
                          : "slate"
                  }
                >
                  {formatEnumLabel(section.status)}
                </Badge>
              </li>
            );
          })}
        </ul>
      </details>

      {/*
        * The written brief and the services list.
        *
        * Both were on this tab before it was rebuilt and both still do work the
        * cards only summarise - the brief is the narrative the structured
        * sections sit beside, and projects are where milestones live. Folded
        * away so the page opens as the design intends, rather than deleted.
        */}
      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-950">
          <span className="inline-flex items-center gap-2">
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
            Strategy brief
          </span>
        </summary>
        <div className="border-t border-slate-100 p-4">{briefWorkspace}</div>
      </details>

      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-950">
          <span className="inline-flex items-center gap-2">
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
            Services &amp; delivery projects
          </span>
        </summary>
        <div className="border-t border-slate-100 p-4">{projectsWorkspace}</div>
      </details>

      <ClientOverviewFooter loadedAt={serverNow} timezone={timezone} />
    </div>
  );
}
