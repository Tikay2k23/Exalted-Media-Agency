import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  ClipboardList,
  ExternalLink,
  FileText,
  GitBranch,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { SopDetailActions } from "@/components/governance/sop-detail-actions";
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
import { SOP_HOW_TO, SOP_SYSTEM_GUIDE } from "@/lib/governance/sop-system-guide";
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
  const mentioned = sop.neighbours.filter((entry) => referenced.includes(entry.reference));

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
                className={`whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm font-medium transition ${
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
            <ProcedurePanel document={document} canManage={canManage} />
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
                    Position
                  </p>
                  <p className="mt-0.5 text-sm text-slate-700">
                    Step {number} of {sop.neighbours.length} in the client lifecycle
                  </p>
                </div>
              ) : null}

              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Related procedures
                </p>
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
                  {next ? (
                    <li>
                      <Link
                        href={`/governance/sops/${encodeURIComponent(next.reference)}`}
                        className="flex items-start gap-1.5 text-sm text-sky-700 hover:underline"
                      >
                        <ArrowRight className="mt-1 h-3 w-3 shrink-0" aria-hidden />
                        <span>
                          {next.reference} — {next.title}
                        </span>
                      </Link>
                    </li>
                  ) : null}
                  {!previous && !next ? (
                    <li className="text-sm text-slate-400">None</li>
                  ) : null}
                </ul>
              </div>

              {mentioned.length ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Named in this procedure
                  </p>
                  <ul className="mt-1 space-y-1">
                    {mentioned.map((entry) => (
                      <li key={entry.reference}>
                        <Link
                          href={`/governance/sops/${encodeURIComponent(entry.reference)}`}
                          className="text-sm text-sky-700 hover:underline"
                        >
                          {entry.reference} — {entry.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Link
                href="/governance"
                className="block rounded-xl border border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                View all SOPs
              </Link>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* --- panels --- */

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

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <PanelCard title="Purpose, trigger and scope">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Purpose
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {purpose ?? <span className="text-slate-400">Not recorded.</span>}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Trigger
            </p>
            {trigger ? (
              <DocumentSection section={{ ...trigger, heading: "" }} />
            ) : (
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Not written down. {canManage ? "Add a ## Trigger section." : ""}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Scope
            </p>
            {scope ? (
              <DocumentSection section={{ ...scope, heading: "" }} />
            ) : (
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Not written down. {canManage ? "Add a ## Scope section." : ""}
              </p>
            )}
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Outcomes" hint="What is true once this procedure has been followed.">
        {outcomes ? (
          <DocumentSection section={{ ...outcomes, heading: "" }} />
        ) : (
          <EmptyPanel
            title="No outcomes written"
            what="This procedure does not list its outcomes separately."
            heading="Outcomes"
            canEdit={canManage}
          />
        )}
      </PanelCard>

      <PanelCard title="Entry criteria" hint="What must already be true before this starts.">
        {entry ? (
          <DocumentSection section={{ ...entry, heading: "" }} />
        ) : inheritedEntry?.section ? (
          <div className="space-y-2">
            <DocumentSection section={{ ...inheritedEntry.section, heading: "" }} />
            <p className="border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">
              This procedure does not state its own entry criteria. These are what{" "}
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
          <EmptyPanel
            title="No entry criteria written"
            what="Nothing is recorded about what has to be true first."
            heading="Entry Criteria"
            canEdit={canManage}
          />
        )}
      </PanelCard>
    </div>
  );
}

function ProcedurePanel({
  document,
  canManage,
}: {
  document: ReturnType<typeof parseSopDocument>;
  canManage: boolean;
}) {
  const steps = sectionForSlot(document, "steps");
  const standards = sectionsForTab(document, "procedure").filter(
    (section) => routeForHeading(section.heading).slot === "standard",
  );

  return (
    <div className="space-y-4">
      <PanelCard
        title={steps?.heading ?? "Procedure"}
        hint="What the agency does. Where it is done in the software is on the System Guide tab."
      >
        {steps ? (
          <DocumentSection section={{ ...steps, heading: "" }} />
        ) : (
          <EmptyPanel
            title="No procedure written"
            what="This SOP has no numbered process."
            heading="Main Process"
            canEdit={canManage}
          />
        )}
      </PanelCard>

      {standards.length ? (
        <PanelCard
          title="Agency standard"
          hint="Rules and definitions this procedure depends on."
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
