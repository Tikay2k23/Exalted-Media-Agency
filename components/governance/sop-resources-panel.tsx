"use client";

import {
  ArrowUpRight,
  Check,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/* --- shared types --- */

type ResourceType =
  | "HOW_TO_GUIDE"
  | "SCRIPT"
  | "TEMPLATE"
  | "CHECKLIST"
  | "REFERENCE_GUIDE"
  | "FILE"
  | "EXTERNAL_LINK";
type ResourceSource = "DOCUMENT" | "FILE" | "LINK";
type ResourceStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface ResourceRow {
  id: string;
  title: string;
  type: ResourceType;
  description: string | null;
  status: ResourceStatus;
  source: ResourceSource;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  externalUrl: string | null;
  ownerName: string | null;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  name: string;
}

const TYPE_LABEL: Record<ResourceType, string> = {
  HOW_TO_GUIDE: "How-To Guide",
  SCRIPT: "Script",
  TEMPLATE: "Template",
  CHECKLIST: "Checklist",
  REFERENCE_GUIDE: "Reference Guide",
  FILE: "File",
  EXTERNAL_LINK: "External Link",
};

/* The groups, in the order the reference lists them; FILE and LINK share one. */
const GROUPS: { heading: string; types: ResourceType[]; filter: string }[] = [
  { heading: "How-To Guides", types: ["HOW_TO_GUIDE"], filter: "HOW_TO_GUIDE" },
  { heading: "Scripts", types: ["SCRIPT"], filter: "SCRIPT" },
  { heading: "Templates", types: ["TEMPLATE"], filter: "TEMPLATE" },
  { heading: "Checklists", types: ["CHECKLIST"], filter: "CHECKLIST" },
  { heading: "Reference Guides", types: ["REFERENCE_GUIDE"], filter: "REFERENCE_GUIDE" },
  { heading: "Files & Links", types: ["FILE", "EXTERNAL_LINK"], filter: "FILES_LINKS" },
];

const FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "HOW_TO_GUIDE", label: "How-To Guides" },
  { key: "SCRIPT", label: "Scripts" },
  { key: "TEMPLATE", label: "Templates" },
  { key: "CHECKLIST", label: "Checklists" },
  { key: "REFERENCE_GUIDE", label: "Reference Guides" },
  { key: "FILES_LINKS", label: "Files & Links" },
];

const DOC_TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: "HOW_TO_GUIDE", label: "How-To Guide" },
  { value: "SCRIPT", label: "Script" },
  { value: "TEMPLATE", label: "Template" },
  { value: "CHECKLIST", label: "Checklist" },
  { value: "REFERENCE_GUIDE", label: "Reference Guide" },
];

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* --- portal shell --- */

/* Nothing to subscribe to: the snapshot never changes after hydration. This is
   how AccountDialog and the SOP dialogs detect the client without an effect. */
function subscribeToNothing() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const mounted = useMounted();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-950/60" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* --- field helpers --- */

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
    >
      {children}
    </select>
  );
}

/* --- the panel --- */

export function SopResourcesPanel({
  sopId,
  sopReference,
  initialResources,
  team,
  canManage,
}: {
  sopId: string;
  sopReference: string;
  initialResources: ResourceRow[];
  team: TeamMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [resources] = useState(initialResources);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      const group = GROUPS.find((g) => g.types.includes(r.type));
      const matchesFilter =
        filter === "ALL" || group?.filter === filter || r.type === filter;
      const matchesQuery =
        !q
        || r.title.toLowerCase().includes(q)
        || (r.description?.toLowerCase().includes(q) ?? false)
        || TYPE_LABEL[r.type].toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [resources, query, filter]);

  const counts = useMemo(() => {
    const by: Partial<Record<ResourceType, number>> = {};
    for (const r of resources) by[r.type] = (by[r.type] ?? 0) + 1;
    return by;
  }, [resources]);

  const countSummary = GROUPS.map((g) => {
    const n = g.types.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
    return n ? `${n} ${n === 1 ? g.heading.replace(/s$/, "") : g.heading}` : null;
  })
    .filter(Boolean)
    .join(" · ");

  const grouped = GROUPS.map((g) => ({
    ...g,
    items: filtered.filter((r) => g.types.includes(r.type)),
  })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">Resources</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Supporting guides, scripts, templates, checklists, and reference material for this SOP.
          </p>
        </div>
        {canManage ? (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add Resource
          </Button>
        ) : null}
      </div>

      {resources.length === 0 ? (
        <EmptyState canManage={canManage} onAdd={() => setAdding(true)} />
      ) : (
        <>
          {/* count */}
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              {resources.length} {resources.length === 1 ? "resource" : "resources"}
            </span>
            {countSummary ? <span className="text-slate-400"> · {countSummary}</span> : null}
          </div>

          {/* search + filters */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources…"
                className="pl-9"
                aria-label="Search resources"
              />
            </div>
            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="flex gap-1 px-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                    className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition ${
                      filter === f.key
                        ? "border-sky-300 bg-sky-50 text-sky-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* grouped list */}
          {grouped.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              No resources match that search.
            </p>
          ) : (
            <div className="space-y-5">
              {grouped.map((g) => (
                <section key={g.heading}>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {g.heading}
                  </h4>
                  <ul className="mt-2 space-y-2">
                    {g.items.map((r) => (
                      <ResourceRowItem
                        key={r.id}
                        resource={r}
                        sopId={sopId}
                        canManage={canManage}
                        onOpenDetail={() => setDetailId(r.id)}
                        onChanged={() => router.refresh()}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {adding ? (
        <AddResourceDialog
          sopId={sopId}
          sopReference={sopReference}
          team={team}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}

      {detailId ? (
        <ResourceDetailDrawer
          resourceId={detailId}
          sopId={sopId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function EmptyState({ canManage, onAdd }: { canManage: boolean; onAdd: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
        <ClipboardList className="h-5 w-5 text-slate-400" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">No resources added yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
        Add guides, scripts, templates, checklists, files, or reference materials that help your team
        follow this SOP.
      </p>
      {canManage ? (
        <Button type="button" size="sm" className="mt-4" onClick={onAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Add Resource
        </Button>
      ) : null}
    </div>
  );
}

/* --- one row --- */

function ResourceRowItem({
  resource,
  sopId,
  canManage,
  onOpenDetail,
  onChanged,
}: {
  resource: ResourceRow;
  sopId: string;
  canManage: boolean;
  onOpenDetail: () => void;
  onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copyScript() {
    setBusy(true);
    try {
      const res = await fetch(`/api/governance/resources/${resource.id}`);
      const data = await res.json();
      const content = data?.resource?.content ?? "";
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked or offline; the drawer still shows the text to copy by hand */
      onOpenDetail();
    } finally {
      setBusy(false);
    }
  }

  const primaryAction = () => {
    if (resource.source === "LINK" && resource.externalUrl) {
      return (
        <a
          href={resource.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
        >
          Open Resource
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      );
    }
    if (resource.source === "FILE" && resource.fileName) {
      return (
        <a
          href={`/api/governance/resources/${resource.id}/download`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download
        </a>
      );
    }
    /* document */
    if (resource.type === "SCRIPT") {
      return (
        <button
          type="button"
          onClick={copyScript}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline disabled:opacity-50"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy Script"}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onOpenDetail}
        className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
      >
        {resource.type === "HOW_TO_GUIDE" || resource.type === "REFERENCE_GUIDE" ? "Open Guide" : "Open"}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  };

  const Icon = resource.source === "FILE" ? FileText : resource.source === "LINK" ? Link2 : ClipboardList;

  return (
    <li className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenDetail}
            className="text-left text-sm font-semibold text-slate-900 hover:text-sky-700"
          >
            {resource.title}
          </button>
          {resource.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-slate-600">{resource.description}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <Badge tone="slate" className="px-2 py-0.5 text-[10px]">
              {TYPE_LABEL[resource.type]}
            </Badge>
            {resource.status === "DRAFT" ? (
              <Badge tone="amber" className="px-2 py-0.5 text-[10px]">
                Draft
              </Badge>
            ) : null}
            {resource.fileName ? <span>{resource.fileName} · {formatBytes(resource.fileSize)}</span> : null}
            <span>Updated {formatDate(resource.updatedAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {primaryAction()}
          {canManage ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Resource actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
              {menuOpen ? (
                <RowMenu
                  resource={resource}
                  sopId={sopId}
                  onClose={() => setMenuOpen(false)}
                  onOpenDetail={onOpenDetail}
                  onChanged={onChanged}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function RowMenu({
  resource,
  sopId,
  onClose,
  onOpenDetail,
  onChanged,
}: {
  resource: ResourceRow;
  sopId: string;
  onClose: () => void;
  onOpenDetail: () => void;
  onChanged: () => void;
}) {
  async function call(url: string, method: string, body?: unknown, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    onClose();
    if (res.ok) onChanged();
    else {
      const data = await res.json().catch(() => null);
      window.alert(data?.error ?? "That did not work.");
    }
  }

  const item = "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50";

  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-10 cursor-default" />
      <div
        role="menu"
        className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
      >
        <button type="button" role="menuitem" className={item} onClick={() => { onClose(); onOpenDetail(); }}>
          View details
        </button>
        <button type="button" role="menuitem" className={item} onClick={() => { onClose(); onOpenDetail(); }}>
          Edit resource details
        </button>
        <button type="button" role="menuitem" className={item} onClick={() => { onClose(); onOpenDetail(); }}>
          Manage SOP links
        </button>
        <div className="my-1 border-t border-slate-100" />
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() =>
            call(`/api/governance/resources/${resource.id}/link`, "DELETE", { sopId }, `Remove "${resource.title}" from this SOP? It stays available to any other SOP it is linked to.`)
          }
        >
          Remove from this SOP
        </button>
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => call(`/api/governance/resources/${resource.id}/archive`, "POST", undefined, `Archive "${resource.title}"?`)}
        >
          Archive resource
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-700 transition hover:bg-rose-50"
          onClick={() =>
            call(`/api/governance/resources/${resource.id}`, "DELETE", undefined, `Permanently delete "${resource.title}"? This removes it from every SOP and cannot be undone.`)
          }
        >
          Delete permanently
        </button>
      </div>
    </>
  );
}

/* --- add resource --- */

type AddChoice = null | "DOCUMENT" | "FILE" | "LINK" | "EXISTING";

function AddResourceDialog({
  sopId,
  sopReference,
  team,
  onClose,
  onAdded,
}: {
  sopId: string;
  sopReference: string;
  team: TeamMember[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [choice, setChoice] = useState<AddChoice>(null);

  const title =
    choice === null
      ? "Add Resource"
      : choice === "DOCUMENT"
        ? "Create document"
        : choice === "FILE"
          ? "Upload file"
          : choice === "LINK"
            ? "Add external link"
            : "Link existing resource";

  return (
    <Modal
      title={title}
      subtitle={choice === null ? "How would you like to add this resource?" : `For ${sopReference}`}
      onClose={onClose}
      wide={choice === "DOCUMENT"}
    >
      <div className="p-5">
        {choice === null ? (
          <div className="grid gap-2">
            <ChoiceButton
              icon={<FileText className="h-4 w-4" aria-hidden />}
              title="Create document"
              detail="Write a how-to guide, script, template, checklist, or reference in the app."
              onClick={() => setChoice("DOCUMENT")}
            />
            <ChoiceButton
              icon={<Upload className="h-4 w-4" aria-hidden />}
              title="Upload file"
              detail="Add an existing file — a DOCX, PDF, spreadsheet, or image."
              onClick={() => setChoice("FILE")}
            />
            <ChoiceButton
              icon={<Link2 className="h-4 w-4" aria-hidden />}
              title="Add external link"
              detail="Store a URL to a resource kept somewhere else."
              onClick={() => setChoice("LINK")}
            />
            <ChoiceButton
              icon={<Search className="h-4 w-4" aria-hidden />}
              title="Link existing resource"
              detail="Attach a resource already in the library to this SOP."
              onClick={() => setChoice("EXISTING")}
            />
          </div>
        ) : choice === "DOCUMENT" ? (
          <DocumentForm sopId={sopId} team={team} onBack={() => setChoice(null)} onAdded={onAdded} />
        ) : choice === "FILE" ? (
          <UploadForm sopId={sopId} team={team} onBack={() => setChoice(null)} onAdded={onAdded} />
        ) : choice === "LINK" ? (
          <LinkForm sopId={sopId} team={team} onBack={() => setChoice(null)} onAdded={onAdded} />
        ) : (
          <ExistingForm sopId={sopId} onBack={() => setChoice(null)} onAdded={onAdded} />
        )}
      </div>
    </Modal>
  );
}

function ChoiceButton({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50/40"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs leading-5 text-slate-500">{detail}</span>
      </span>
    </button>
  );
}

function OwnerStatusFields({
  team,
  ownerId,
  setOwnerId,
  status,
  setStatus,
}: {
  team: TeamMember[];
  ownerId: string;
  setOwnerId: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Owner / maintainer">
        <Select value={ownerId} onChange={setOwnerId}>
          <option value="">Unassigned</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={status} onChange={setStatus}>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>
    </div>
  );
}

function FormFooter({
  onBack,
  submitting,
  submitLabel,
  disabled,
}: {
  onBack: () => void;
  submitting: boolean;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
        Back
      </Button>
      <Button type="submit" disabled={submitting || disabled}>
        {submitting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}

function useSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { submitting, setSubmitting, error, setError };
}

function DocumentForm({
  sopId,
  team,
  onBack,
  onAdded,
}: {
  sopId: string;
  team: TeamMember[];
  onBack: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ResourceType>("HOW_TO_GUIDE");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const { submitting, setSubmitting, error, setError } = useSubmit();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/governance/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "DOCUMENT", sopId, title, type, description, content, ownerId, status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not create that resource.");
        return;
      }
      onAdded();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(v) => setType(v as ResourceType)}>
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Short description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Content" hint="Markdown: headings, lists, links and emphasis.">
        <Textarea value={content} rows={10} onChange={(e) => setContent(e.target.value)} className="font-mono text-xs" required />
      </Field>
      <OwnerStatusFields team={team} ownerId={ownerId} setOwnerId={setOwnerId} status={status} setStatus={setStatus} />
      {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
      <FormFooter onBack={onBack} submitting={submitting} submitLabel="Add resource" disabled={!title.trim() || !content.trim()} />
    </form>
  );
}

function UploadForm({
  sopId,
  team,
  onBack,
  onAdded,
}: {
  sopId: string;
  team: TeamMember[];
  onBack: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("FILE");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { submitting, setSubmitting, error, setError } = useSubmit();

  function pick(f: File | null) {
    setFile(f);
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sopId", sopId);
      form.set("title", title);
      form.set("type", type);
      form.set("description", description);
      form.set("ownerId", ownerId);
      form.set("status", status);
      const res = await fetch("/api/governance/resources/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "The upload did not work.");
        return;
      }
      onAdded();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver ? "border-sky-400 bg-sky-50" : "border-slate-300"
        }`}
      >
        <Upload className="mx-auto h-5 w-5 text-slate-400" aria-hidden />
        {file ? (
          <p className="mt-2 text-sm font-medium text-slate-800">
            {file.name} <span className="text-slate-400">· {formatBytes(file.size)}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Drag and drop your file here</p>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 text-xs font-semibold text-sky-700 hover:underline"
        >
          {file ? "Choose a different file" : "Choose file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.csv,.md,.png,.jpg,.jpeg"
        />
      </div>

      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Resource type">
          <Select value={type} onChange={setType}>
            <option value="FILE">File</option>
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Short description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <OwnerStatusFields team={team} ownerId={ownerId} setOwnerId={setOwnerId} status={status} setStatus={setStatus} />
      {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
      <FormFooter onBack={onBack} submitting={submitting} submitLabel="Add resource" disabled={!file || !title.trim()} />
    </form>
  );
}

function LinkForm({
  sopId,
  team,
  onBack,
  onAdded,
}: {
  sopId: string;
  team: TeamMember[];
  onBack: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [type, setType] = useState<string>("EXTERNAL_LINK");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const { submitting, setSubmitting, error, setError } = useSubmit();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/governance/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "LINK", sopId, title, externalUrl, type, description, ownerId, status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not add that link.");
        return;
      }
      onAdded();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="URL" hint="Stored as a link. The app does not embed the external service.">
        <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={setType}>
            <option value="EXTERNAL_LINK">External Link</option>
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Short description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <OwnerStatusFields team={team} ownerId={ownerId} setOwnerId={setOwnerId} status={status} setStatus={setStatus} />
      {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}
      <FormFooter onBack={onBack} submitting={submitting} submitLabel="Add resource" disabled={!title.trim() || !externalUrl.trim()} />
    </form>
  );
}

interface LinkableResult {
  id: string;
  title: string;
  type: ResourceType;
  status: ResourceStatus;
  description: string | null;
  _count: { sops: number };
}

function ExistingForm({
  sopId,
  onBack,
  onAdded,
}: {
  sopId: string;
  onBack: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Debounced server search: one request after typing settles, not per key. */
  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/governance/resources/search?excludeSopId=${encodeURIComponent(sopId)}&q=${encodeURIComponent(query)}`,
        );
        const data = await res.json().catch(() => null);
        setResults(data?.resources ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, sopId]);

  async function link(id: string) {
    setLinkingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/governance/resources/${id}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sopId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Could not link that resource.");
        return;
      }
      onAdded();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search existing resources…" className="pl-9" autoFocus />
      </div>

      {error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : null}

      <div className="min-h-[8rem] space-y-1.5">
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-400">Searching…</p>
        ) : results.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No resources available to link{query ? " for that search" : ""}.
          </p>
        ) : (
          results.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{r.title}</p>
                <p className="text-[11px] text-slate-400">
                  {TYPE_LABEL[r.type]} · linked to {r._count.sops} {r._count.sops === 1 ? "SOP" : "SOPs"}
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => link(r.id)} disabled={linkingId === r.id}>
                {linkingId === r.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Link"}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-start pt-1">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

/* --- detail drawer --- */

interface ResourceDetail {
  id: string;
  title: string;
  type: ResourceType;
  description: string | null;
  status: ResourceStatus;
  source: ResourceSource;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  externalUrl: string | null;
  updatedAt: string;
  owner: { name: string } | null;
  updatedBy: { name: string } | null;
  sops: { sop: { id: string; reference: string; title: string } }[];
}

function ResourceDetailDrawer({
  resourceId,
  sopId,
  canManage,
  onClose,
  onChanged,
}: {
  resourceId: string;
  sopId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ResourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Fetch on open, with a cancelled guard - the same shape useSopDetail uses.
     setState lives in the async callback, never synchronously in the effect. */
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/governance/resources/${resourceId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Could not load that resource.");
          return;
        }
        setDetail(data.resource as ResourceDetail);
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server.");
      });

    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  return (
    <Modal title={detail?.title ?? "Resource"} subtitle={detail ? TYPE_LABEL[detail.type] : undefined} onClose={onClose} wide>
      <div className="space-y-4 p-5">
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        {!detail && !error ? <p className="text-sm text-slate-400">Loading…</p> : null}

        {detail ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge tone={detail.status === "ACTIVE" ? "emerald" : detail.status === "DRAFT" ? "amber" : "slate"} className="px-2 py-0.5 text-[10px]">
                {detail.status[0] + detail.status.slice(1).toLowerCase()}
              </Badge>
              {detail.owner ? <span>Owner: {detail.owner.name}</span> : null}
              <span>Updated {formatDate(detail.updatedAt)}{detail.updatedBy ? ` by ${detail.updatedBy.name}` : ""}</span>
            </div>

            {detail.description ? <p className="text-sm leading-6 text-slate-700">{detail.description}</p> : null}

            {/* content by source */}
            {detail.source === "DOCUMENT" && detail.content ? (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Content</p>
                  <CopyButton text={detail.content} />
                </div>
                <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-sm leading-6 text-slate-800">
                  {detail.content}
                </pre>
              </div>
            ) : null}

            {detail.source === "FILE" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-800">{detail.fileName}</p>
                <p className="text-xs text-slate-400">{formatBytes(detail.fileSize)}{detail.fileMimeType ? ` · ${detail.fileMimeType}` : ""}</p>
                <a
                  href={`/api/governance/resources/${detail.id}/download`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download
                </a>
              </div>
            ) : null}

            {detail.source === "LINK" && detail.externalUrl ? (
              <a
                href={detail.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
              >
                {detail.externalUrl}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
            ) : null}

            {/* related SOPs */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Linked to {detail.sops.length} {detail.sops.length === 1 ? "SOP" : "SOPs"}
              </p>
              <ul className="mt-1 space-y-1">
                {detail.sops.map((s) => (
                  <li key={s.sop.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">
                      {s.sop.reference} — {s.sop.title}
                    </span>
                    {canManage && detail.sops.length > 1 && s.sop.id === sopId ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Remove from ${s.sop.reference}? It stays on its other SOPs.`)) return;
                          const res = await fetch(`/api/governance/resources/${detail.id}/link`, {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sopId }),
                          });
                          if (res.ok) {
                            onChanged();
                            onClose();
                          }
                        }}
                        className="shrink-0 text-xs font-medium text-slate-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
