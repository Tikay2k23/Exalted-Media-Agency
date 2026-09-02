import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileText,
  GitBranch,
  ShieldCheck,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SopDetailActions } from "@/components/governance/sop-detail-actions";
import { SopProcedurePanel } from "@/components/governance/sop-procedure-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SopDetail } from "@/lib/data/sop-detail";
import {
  parseSopDocument,
  purposeLine,
  referencedSops,
  routeForHeading,
  sectionForSlot,
  sectionsForTab,
  sopNumber,
  type SopSection,
  type SopTab,
} from "@/lib/governance/sop-document";
import { parseProcedureSteps, procedureExceptions } from "@/lib/governance/sop-procedure";
import { SOP_HOW_TO, SOP_SYSTEM_GUIDE } from "@/lib/governance/sop-system-guide";
import { NAVIGATION } from "@/lib/navigation";
import { formatDate, formatEnumLabel } from "@/lib/utils";

/*
 * Short labels, for the reason client-tabs.tsx already found the hard way: the
 * full names - "Quality & Exit Criteria", "Roles & Responsibilities" - need
 * 874px of strip in a column that is 617px wide on a 1280 laptop, so two tabs
 * sat off the edge behind a scroll nobody would think to try. Each panel
 * carries the full name as its own heading.
 */
const TABS: { key: SopTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "procedure", label: "Procedure" },
  { key: "system", label: "System Guide" },
  { key: "quality", label: "Quality & Exit" },
  { key: "roles", label: "Roles" },
  { key: "resources", label: "Resources" },
  { key: "history", label: "Versions" },
];

const STATUS_TONE: Record<string, "emerald" | "amber" | "slate" | "sky"> = {
  ACTIVE: "emerald",
  DRAFT: "slate",
  IN_REVIEW: "sky",
  SUPERSEDED: "amber",
  RETIRED: "slate",
};

/* --- small shared pieces --- */

function MetaItem({
  icon,
  label,
  value,
  children,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        {/* Never a bare dash for a date that does not exist: say what is missing. */}
        <div className="truncate text-sm font-medium text-slate-900">
          {children ?? value ?? <span className="text-slate-400">Not recorded</span>}
        </div>
      </div>
    </div>
  );
}

function PanelCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-2xl shadow-none">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
        <div className="mt-3">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * A tab with nothing behind it.
 *
 * Says which heading would fill it rather than apologising. The documents are
 * the source, so the fix is always to write that section - and somebody who
 * can edit is told exactly what to write.
 */
function EmptyPanel({
  title,
  what,
  heading,
  canEdit,
}: {
  title: string;
  what: string;
  heading?: string;
  canEdit: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{what}</p>
      {heading && canEdit ? (
        <p className="mx-auto mt-3 max-w-md text-xs leading-5 text-slate-500">
          Add a <code className="rounded bg-white px-1 py-0.5 text-slate-700">## {heading}</code>{" "}
          section to the procedure and it will appear here. Editing publishes a new version.
        </p>
      ) : null}
    </div>
  );
}

/** One `##` section of the document, rendered the way it was written. */
function DocumentSection({ section, index }: { section: SopSection; index?: number }) {
  return (
    <section className="space-y-2">
      {section.heading ? (
        <h4 className="text-sm font-semibold text-slate-900">
          {index !== undefined ? `${index}. ` : ""}
          {section.heading}
        </h4>
      ) : null}

      {section.paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-sm leading-6 text-slate-600">
          {paragraph}
        </p>
      ))}

      {section.items.length ? (
        section.ordered ? (
          <ol className="space-y-1.5">
            {section.items.map((item, position) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {position + 1}
                </span>
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="space-y-1.5">
            {section.items.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-700">
                <CircleCheck className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {section.subsections.map((sub) => (
        <div key={sub.heading} className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {sub.heading}
          </p>
          {sub.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-1 text-sm leading-6 text-slate-600">
              {paragraph}
            </p>
          ))}
          {sub.items.length ? (
            <ul className="mt-1.5 space-y-1">
              {sub.items.map((item) => (
                <li key={item} className="text-sm leading-6 text-slate-700">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}

/**
 * Where this procedure's work actually happens, as a short list of links.
 *
 * Built from the system guide rather than written again, and labelled from the
 * navigation, so a renamed area renames itself here. Deduplicated by href: five
 * guide entries for one procedure often point at two screens.
 */
function quickActionsFor(reference: string) {
  const labels = new Map(
    NAVIGATION.flatMap((group) => group.items).map((item) => [item.href, item.label]),
  );
  const seen = new Set<string>();

  return (SOP_SYSTEM_GUIDE[reference] ?? []).flatMap((step) => {
    const label = step.href ? labels.get(step.href) : undefined;

    if (!step.href || !label || seen.has(step.href)) return [];

    seen.add(step.href);

    return [{ href: step.href, label }];
  });
}

/* --- the page --- */

export function SopDetailView({
  sop,
  tab,
  canManage,
  viewerId,
}: {
  sop: SopDetail;
  tab: SopTab;
  canManage: boolean;
  viewerId: string;
}) {
  const document = parseSopDocument(sop.content);
  const purpose = purposeLine(document, sop.summary);
  const number = sopNumber(sop.reference);
  const systemGuide = SOP_SYSTEM_GUIDE[sop.reference] ?? [];
  const howTo = SOP_HOW_TO[sop.reference] ?? [];
  const quickActions = quickActionsFor(sop.reference);

  /*
   * Related procedures, all derived rather than stored.
   *
   * The ten SOPs are the client lifecycle in order, so the one before and the
   * one after are a real relationship rather than a guess. Anything the text
   * actually names is listed separately, because "mentioned in this document"
   * and "next in the sequence" are different claims and collapsing them would
   * invent a curation nobody did.
   */
  const referenced = referencedSops(sop.content, sop.reference);
  const neighbourOf = (offset: number) =>
    number === null
      ? null
      : (sop.neighbours.find((entry) => sopNumber(entry.reference) === number + offset) ?? null);
  const previous = neighbourOf(-1);
  const next = neighbourOf(1);
  /* Named in the text, minus the neighbours that already have their own row. */
  const mentioned = sop.neighbours.filter(
    (entry) =>
      referenced.includes(entry.reference)
      && entry.reference !== next?.reference
      && entry.reference !== previous?.reference,
  );
  const typicalOutcome = sectionForSlot(document, "typicalOutcome");

  /*
   * Entry criteria this procedure does not state for itself.
   *
   * Only consulted when nothing is written: a procedure that names its own
   * preconditions is the authority on them, and the inherited version is
   * always labelled with where it came from so nobody mistakes it for
   * something written here.
   */
  const inheritedEntry =
    sop.previousContent && previous
      ? {
          reference: previous.reference,
          title: previous.title,
          section: sectionForSlot(parseSopDocument(sop.previousContent), "completion"),
        }
      : null;

  return (
    <div className="space-y-5">
      {/* --- breadcrumb --- */}
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/governance" className="font-medium text-sky-700 hover:underline">
          SOP Library
        </Link>
        <span className="px-1.5 text-slate-400">›</span>
        <span className="text-slate-500">{sop.reference}</span>
      </nav>

      {/* --- header --- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {sop.reference} — {sop.title}
          </h1>
          {purpose ? (
            <p className="mt-2 leading-7 text-slate-600">{purpose}</p>
          ) : (
            <p className="mt-2 leading-7 text-slate-400">
              No purpose recorded on this procedure yet.
            </p>
          )}
        </div>

        <SopDetailActions
          sopId={sop.id}
          reference={sop.reference}
          nextVersionLabel={sop.currentVersion}
          canManage={canManage}
          status={sop.status}
          isAuthorOfCurrent={sop.versions[0]?.authorId === viewerId}
        />
      </div>

      {/* --- metadata --- */}
      <div className="grid grid-cols-2 divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
        <MetaItem
          icon={<UserRound className="h-4 w-4" aria-hidden />}
          label="Owner"
          value={sop.ownerRole ? formatEnumLabel(sop.ownerRole) : sop.ownerName}
        />
        <MetaItem
          icon={<FileText className="h-4 w-4" aria-hidden />}
          label="Version"
          value={`${sop.currentVersion} of ${sop.versionCount}`}
        />
        <MetaItem icon={<GitBranch className="h-4 w-4" aria-hidden />} label="Status">
          <Badge tone={STATUS_TONE[sop.status] ?? "slate"} className="px-2 py-0.5 text-[11px]">
            {formatEnumLabel(sop.status)}
          </Badge>
        </MetaItem>
        <MetaItem icon={<CalendarClock className="h-4 w-4" aria-hidden />} label="Next review">
          {sop.nextReviewAt ? (
            <span className={sop.reviewOverdue ? "text-amber-700" : undefined}>
              {formatDate(sop.nextReviewAt)}
              {sop.reviewOverdue ? " · overdue" : ""}
            </span>
          ) : (
            <span className="text-slate-400">Not scheduled</span>
          )}
        </MetaItem>
        <MetaItem
          icon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          label="Approved by"
          value={sop.approvedByName}
        />
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="min-w-0 flex-1">
          {/* --- tabs --- */}
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((entry) => (
              <Link
                key={entry.key}
                href={`?tab=${entry.key}`}
                scroll={false}
                aria-current={entry.key === tab ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-2 py-2.5 text-sm font-medium transition ${
                  entry.key === tab
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {entry.label}
              </Link>
            ))}
          </div>

          {tab === "overview" ? (
            <OverviewPanel
              document={document}
              purpose={purpose}
              canManage={canManage}
              inheritedEntry={inheritedEntry}
            />
          ) : null}

          {tab === "procedure" ? (
            <ProcedurePanel document={document} canManage={canManage} nextSop={next} />
          ) : null}

          {tab === "system" ? (
            <SystemPanel document={document} steps={systemGuide} canManage={canManage} />
          ) : null}

          {tab === "quality" ? (
            <QualityPanel document={document} canManage={canManage} />
          ) : null}

          {tab === "roles" ? <RolesPanel document={document} canManage={canManage} /> : null}

          {tab === "resources" ? (
            <ResourcesPanel document={document} howTo={howTo} canManage={canManage} />
          ) : null}

          {tab === "history" ? <HistoryPanel sop={sop} /> : null}
        </div>

        {/* --- the rail --- */}
        <aside className="w-full shrink-0 lg:w-64">
          <Card className="rounded-2xl shadow-none">
            <CardContent className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-slate-950">About this SOP</h2>

              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Primary owner
                </p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {sectionForSlot(document, "roles")?.paragraphs[0]
                    ?? sop.ownerName
                    ?? "Not recorded"}
                </p>
              </div>

              {number !== null ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Position in lifecycle
                  </p>
                  <p className="mt-0.5 text-sm text-slate-700">
                    Step {number} of {sop.neighbours.length} in the client lifecycle
                  </p>
                  {/*
                    The whole lifecycle as one row, so somebody can see where
                    they are and jump. Every pill is a real procedure - the row
                    is built from the library rather than from a count, so it
                    cannot offer a step that does not exist.
                  */}
                  <ol className="mt-2 flex flex-wrap gap-1">
                    {sop.neighbours.map((entry) => {
                      const step = sopNumber(entry.reference);
                      const isCurrent = step === number;

                      return (
                        <li key={entry.reference}>
                          <Link
                            href={`/governance/sops/${encodeURIComponent(entry.reference)}`}
                            aria-current={isCurrent ? "page" : undefined}
                            title={`${entry.reference} — ${entry.title}`}
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition ${
                              isCurrent
                                ? "bg-sky-600 text-white"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            }`}
                          >
                            {step ?? "?"}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}

              {typicalOutcome ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Typical outcome
                  </p>
                  <p className="mt-0.5 text-sm text-slate-700">
                    {typicalOutcome.paragraphs.join(" ") || typicalOutcome.items.join(", ")}
                  </p>
                </div>
              ) : null}

              {/*
                The next procedure gets its own heading rather than sitting in
                a list of related ones. It is where the account actually goes
                next, which is a stronger claim than "related".
              */}
              {next ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Next in lifecycle
                  </p>
                  <Link
                    href={`/governance/sops/${encodeURIComponent(next.reference)}`}
                    className="mt-1 flex items-start gap-1.5 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-50"
                  >
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      {next.reference} — {next.title}
                    </span>
                  </Link>
                </div>
              ) : null}

              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Related SOPs</p>
                <ul className="mt-1 space-y-1">
                  {previous ? (
                    <li>
                      <Link
                        href={`/governance/sops/${encodeURIComponent(previous.reference)}`}
                        className="flex items-start gap-1.5 text-sm text-sky-700 hover:underline"
                      >
                        <ArrowLeft className="mt-1 h-3 w-3 shrink-0" aria-hidden />
                        <span>
                          {previous.reference} — {previous.title}
                        </span>
                      </Link>
                    </li>
                  ) : null}

                  {/*
                    Procedures this document actually names, which is the only
                    relationship there is a record of. Nothing is listed here
                    because it seemed related.
                  */}
                  {mentioned.map((entry) => (
                    <li key={entry.reference}>
                      <Link
                        href={`/governance/sops/${encodeURIComponent(entry.reference)}`}
                        className="flex items-start gap-1.5 text-sm text-sky-700 hover:underline"
                      >
                        <ArrowRight className="mt-1 h-3 w-3 shrink-0 rotate-45" aria-hidden />
                        <span>
                          {entry.reference} — {entry.title}
                        </span>
                      </Link>
                    </li>
                  ))}

                  {!previous && !mentioned.length ? (
                    <li className="text-sm text-slate-400">
                      None beyond the next step.
                    </li>
                  ) : null}
                </ul>
              </div>

              <Link
                href="/governance"
                className="block rounded-xl border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                View all SOPs
              </Link>
            </CardContent>
          </Card>

          {/*
            Quick actions, on the Procedure tab only.

            Somebody reading the workflow is the one about to go and do it, and
            these are the places the System Guide already names for this
            procedure - deduplicated and labelled from the navigation, so a
            renamed section renames itself here too. They navigate, nothing
            more: reading a procedure must never move a lead.
          */}
          {tab === "procedure" && quickActions.length ? (
            <Card className="mt-4 rounded-2xl shadow-none">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-slate-950">Quick actions</h2>
                <ul className="mt-2 space-y-1">
                  {quickActions.map((action) => (
                    <li key={action.href}>
                      <Link
                        href={action.href}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-sky-700 transition hover:bg-sky-50"
                      >
                        Open {action.label}
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/* --- panels --- */

/**
 * A numbered card on the Overview, with the icon that marks it.
 *
 * The numbers are the reading order: why this exists, what it produces, what
 * has to be true first, and what cannot be ignored. Somebody who reads only
 * this tab should be able to stop after four cards.
 */
function OverviewCard({
  index,
  title,
  icon,
  children,
}: {
  index: number;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-2xl shadow-none">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            {icon}
          </span>
          <h3 className="text-sm font-semibold text-slate-950">
            {index}. {title}
          </h3>
        </div>
        <div className="mt-4 min-w-0 flex-1">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * One line where a section is missing.
 *
 * A reader is told plainly that nothing is recorded. The markdown heading to
 * add is shown only to somebody who can actually publish a version - to
 * everybody else it is noise about a system they cannot reach.
 */
function MissingLine({
  what,
  heading,
  canManage,
}: {
  what: string;
  heading: string;
  canManage: boolean;
}) {
  return (
    <p className="mt-1 text-sm leading-6 text-slate-400">
      No {what} recorded yet.
      {canManage ? (
        <span className="text-slate-500">
          {" "}
          Add a <code className="rounded bg-slate-100 px-1 text-slate-600">## {heading}</code>{" "}
          section in a new version.
        </span>
      ) : null}
    </p>
  );
}

/** A labelled block inside the first card. */
function OverviewField({
  label,
  section,
  canManage,
  heading,
}: {
  label: string;
  section: SopSection | null;
  canManage: boolean;
  heading: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">{label}</p>
      {section ? (
        <div className="mt-1">
          <DocumentSection section={{ ...section, heading: "" }} />
        </div>
      ) : (
        <MissingLine what={label.toLowerCase()} heading={heading} canManage={canManage} />
      )}
    </div>
  );
}

function OverviewPanel({
  document,
  purpose,
  canManage,
  inheritedEntry,
}: {
  document: ReturnType<typeof parseSopDocument>;
  purpose: string | null;
  canManage: boolean;
  inheritedEntry: {
    reference: string;
    title: string;
    section: SopSection | null;
  } | null;
}) {
  const trigger = sectionForSlot(document, "trigger");
  const scope = sectionForSlot(document, "scope");
  const outcomes = sectionForSlot(document, "outcomes");
  const entry = sectionForSlot(document, "entry");
  const standard = sectionForSlot(document, "agencyStandard");

  return (
    <div className="space-y-4">
      {/*
        Three across only from 2xl. This application spends 208px on the
        sidebar and 256px on the rail, so a 1280 laptop leaves 629px for this
        row - three cards of 197px, where every outcome wraps onto three lines
        and the row runs to 840px tall. Two columns until there is genuinely
        room for three.

        items-stretch so the row reads as one band rather than three cards of
        different heights; it is still only as tall as its longest card.
      */}
      <div className="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <OverviewCard
          index={1}
          title="Purpose, Trigger & Scope"
          icon={<Target className="h-3.5 w-3.5" aria-hidden />}
        >
          <div className="space-y-3.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                Purpose
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {purpose ?? <span className="text-slate-400">No purpose recorded yet.</span>}
              </p>
            </div>

            <OverviewField
              label="Trigger"
              section={trigger}
              canManage={canManage}
              heading="Trigger"
            />

            <OverviewField label="Scope" section={scope} canManage={canManage} heading="Scope" />
          </div>
        </OverviewCard>

        <OverviewCard
          index={2}
          title="Outcomes"
          icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
        >
          {outcomes ? (
            <DocumentSection section={{ ...outcomes, heading: "" }} />
          ) : (
            <MissingLine what="outcomes" heading="Outcomes" canManage={canManage} />
          )}
        </OverviewCard>

        <OverviewCard
          index={3}
          title="Entry Criteria"
          icon={<ClipboardCheck className="h-3.5 w-3.5" aria-hidden />}
        >
          {entry ? (
            <DocumentSection section={{ ...entry, heading: "" }} />
          ) : inheritedEntry?.section ? (
            <div className="space-y-2">
              <DocumentSection section={{ ...inheritedEntry.section, heading: "" }} />
              <p className="border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">
                Not stated here. These are what{" "}
                <Link
                  href={`/governance/sops/${encodeURIComponent(inheritedEntry.reference)}`}
                  className="font-medium text-sky-700 hover:underline"
                >
                  {inheritedEntry.reference}
                </Link>{" "}
                completes on, which is the step before this one.
              </p>
            </div>
          ) : (
            <MissingLine what="entry criteria" heading="Entry Criteria" canManage={canManage} />
          )}
        </OverviewCard>
      </div>

      {/*
        Full width, below the row. These are the rules somebody is held to
        rather than a description of the work, so they get their own band - but
        a band, not a warning box: a red panel on all ten procedures would stop
        registering as important at all.
      */}
      {standard ? (
        <OverviewCard
          index={4}
          title="Agency Standard (Critical Rules)"
          icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
        >
          {standard.paragraphs.length ? (
            <p className="max-w-4xl text-sm font-medium leading-6 text-slate-800">
              {standard.paragraphs.join(" ")}
            </p>
          ) : null}

          {standard.items.length ? (
            <ul className="mt-3 space-y-1.5">
              {standard.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-6 text-slate-700">
                  <CircleCheck className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/*
            The `###` rules under the standard, side by side. Divided rather
            than boxed: four bordered cards inside a bordered card is a lot of
            lines for four sentences.
          */}
          {standard.subsections.length ? (
            <div className="mt-4 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-slate-100">
              {standard.subsections.map((rule, position) => (
                <div key={rule.heading} className={`min-w-0 ${position > 0 ? "lg:pl-6" : ""}`}>
                  <p className="text-sm font-semibold text-sky-800">{rule.heading}</p>
                  {rule.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="mt-1 text-sm leading-6 text-slate-600">
                      {paragraph}
                    </p>
                  ))}
                  {rule.items.length ? (
                    <ul className="mt-1 space-y-1">
                      {rule.items.map((item) => (
                        <li key={item} className="text-sm leading-6 text-slate-600">
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </OverviewCard>
      ) : (
        <OverviewCard
          index={4}
          title="Agency Standard (Critical Rules)"
          icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
        >
          <MissingLine what="critical rules" heading="Agency Standard" canManage={canManage} />
        </OverviewCard>
      )}
    </div>
  );
}

function ProcedurePanel({
  document,
  canManage,
  nextSop,
}: {
  document: ReturnType<typeof parseSopDocument>;
  canManage: boolean;
  nextSop: { reference: string; title: string } | null;
}) {
  const steps = parseProcedureSteps(document);
  const standards = sectionsForTab(document, "procedure").filter(
    (section) => routeForHeading(section.heading).slot === "standard",
  );
  const completion = sectionForSlot(document, "completion");

  if (!steps.length) {
    return (
      <EmptyPanel
        title="No procedure has been documented for this SOP yet"
        what="Nothing here says what the agency actually does, or in what order."
        heading="Main Process"
        canEdit={canManage}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/*
        Parsed on the server and handed over whole. The panel needs to be a
        client component to open and close a step, but that is no reason to ship
        the markdown and a parser to the browser as well.
      */}
      <SopProcedurePanel
        steps={steps}
        exceptions={procedureExceptions(document)}
        completion={completion?.paragraphs.join(" ") || completion?.items.join("; ") || null}
        nextSop={nextSop}
      />

      {/*
        Not titled "Agency standard": that is the Overview's fourth card, and
        two cards of the same name on different tabs of one document is a way to
        lose an argument about which one is the rule.
      */}
      {standards.length ? (
        <PanelCard
          title="Definitions and local rules"
          hint="Named sections this procedure depends on."
        >
          <div className="space-y-4">
            {standards.map((section) => (
              <DocumentSection key={section.heading} section={section} />
            ))}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}

function SystemPanel({
  document,
  steps,
  canManage,
}: {
  document: ReturnType<typeof parseSopDocument>;
  steps: { area: string; where: string; detail: string; href?: string }[];
  canManage: boolean;
}) {
  const written = sectionForSlot(document, "guide");

  if (!steps.length && !written) {
    return (
      <EmptyPanel
        title="No system guide for this procedure"
        what="Nothing maps this procedure onto a screen yet."
        heading="System Guide"
        canEdit={canManage}
      />
    );
  }

  return (
    <div className="space-y-4">
      {steps.length ? (
        <PanelCard
          title="Where this happens"
          hint="The screens this procedure is carried out on. The procedure itself is on the Procedure tab."
        >
          <ul className="space-y-2.5">
            {steps.map((step) => (
              <li
                key={step.area}
                className="rounded-xl border border-slate-200 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{step.area}</p>
                  {step.href ? (
                    <Link
                      href={step.href}
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{step.where}</p>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{step.detail}</p>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}

      {written ? (
        <PanelCard title={written.heading} hint="Written into the procedure itself.">
          <DocumentSection section={{ ...written, heading: "" }} />
        </PanelCard>
      ) : null}
    </div>
  );
}

function QualityPanel({
  document,
  canManage,
}: {
  document: ReturnType<typeof parseSopDocument>;
  canManage: boolean;
}) {
  const sections = sectionsForTab(document, "quality");

  if (!sections.length) {
    return (
      <EmptyPanel
        title="No completion rule written"
        what="Nothing says when this procedure is finished."
        heading="Completion"
        canEdit={canManage}
      />
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <PanelCard
          key={section.heading}
          title={section.heading || "Completion"}
          hint={
            routeForHeading(section.heading).slot === "completion"
              ? "The account does not leave this stage until these are true."
              : undefined
          }
        >
          <DocumentSection section={{ ...section, heading: "" }} />
        </PanelCard>
      ))}

      <p className="px-1 text-xs leading-5 text-slate-500">
        These are the policy. Whether an account actually met them is recorded on its
        journey requirements, not here — the SOP says what has to be true, the account&rsquo;s
        own records say whether it was.
      </p>
    </div>
  );
}

function RolesPanel({
  document,
  canManage,
}: {
  document: ReturnType<typeof parseSopDocument>;
  canManage: boolean;
}) {
  const sections = sectionsForTab(document, "roles");

  if (!sections.length) {
    return (
      <EmptyPanel
        title="No roles written"
        what="Nobody is named as responsible for this procedure."
        heading="Primary Owner"
        canEdit={canManage}
      />
    );
  }

  return (
    <PanelCard title="Who is responsible" hint="As named in the procedure.">
      <dl className="divide-y divide-slate-100">
        {sections.map((section) => (
          <div key={section.heading} className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm font-semibold text-slate-900">{section.heading}</dt>
            <dd className="text-sm leading-6 text-slate-600 sm:col-span-2">
              {section.paragraphs.join(" ") || section.items.join(", ") || "Not recorded"}
            </dd>
          </div>
        ))}
      </dl>
    </PanelCard>
  );
}

function ResourcesPanel({
  document,
  howTo,
  canManage,
}: {
  document: ReturnType<typeof parseSopDocument>;
  howTo: { title: string; where: string; href?: string }[];
  canManage: boolean;
}) {
  const written = sectionsForTab(document, "resources");

  if (!howTo.length && !written.length) {
    return (
      <EmptyPanel
        title="No resources linked"
        what="Nothing is linked to this procedure yet."
        heading="Resources"
        canEdit={canManage}
      />
    );
  }

  return (
    <div className="space-y-4">
      {howTo.length ? (
        <PanelCard
          title="How-to guides"
          hint="Where each task is done. Kept out of the procedure so the procedure survives a change to the software."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {howTo.map((guide) => (
              <li key={guide.title}>
                {guide.href ? (
                  <Link
                    href={guide.href}
                    className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2.5 transition hover:bg-slate-50"
                  >
                    <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">
                        {guide.title}
                      </span>
                      <span className="block text-xs text-slate-500">{guide.where}</span>
                    </span>
                  </Link>
                ) : (
                  <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                    <span className="block text-sm font-medium text-slate-900">
                      {guide.title}
                    </span>
                    <span className="block text-xs text-slate-500">{guide.where}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}

      {written.map((section) => (
        <PanelCard key={section.heading} title={section.heading}>
          <DocumentSection section={{ ...section, heading: "" }} />
        </PanelCard>
      ))}
    </div>
  );
}

function HistoryPanel({ sop }: { sop: SopDetail }) {
  return (
    <div className="space-y-4">
      <PanelCard
        title="Versions"
        hint="Every version is kept, so an audit is judged against the procedure that applied at the time."
      >
        <ol className="space-y-2">
          {sop.versions.map((version) => (
            <li
              key={version.id}
              className={`rounded-xl border px-4 py-3 ${
                version.isCurrent ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Version {version.version}
                </p>
                <Badge
                  tone={version.isCurrent ? "emerald" : "slate"}
                  className="px-2 py-0.5 text-[11px]"
                >
                  {version.isCurrent ? formatEnumLabel(sop.status) : "Superseded"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Published {formatDate(version.publishedAt)}
                {version.authorName ? ` by ${version.authorName}` : ""}
                {version.isCurrent && sop.approvedByName
                  ? ` · approved by ${sop.approvedByName}`
                  : ""}
              </p>
              {version.changeNote ? (
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{version.changeNote}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </PanelCard>

      {sop.events.length ? (
        <PanelCard
          title="Approvals and reviews"
          hint="Recorded as it happened. A review confirms the procedure is still right without publishing a new version."
        >
          <ol className="space-y-1.5">
            {sop.events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-x-2 text-sm leading-6">
                <span className="text-slate-400">{formatDate(event.at)}</span>
                <span className="min-w-0 text-slate-700">{event.action}</span>
                {event.actorName ? (
                  <span className="text-slate-400">· {event.actorName}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </PanelCard>
      ) : null}
    </div>
  );
}
