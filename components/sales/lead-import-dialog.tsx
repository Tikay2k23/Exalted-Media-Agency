"use client";

import { CheckCircle2, LoaderCircle, TriangleAlert, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RowVerdict } from "@/lib/sales/lead-import";

interface PreviewRow {
  line: number;
  contactName: string;
  businessName: string;
  email: string | null;
  verdict: RowVerdict;
  detail: string | null;
}

interface Preview {
  summary: {
    total: number;
    new: number;
    duplicates: number;
    duplicatesInFile: number;
    invalid: number;
  };
  invalid: { line: number; reason: string }[];
  rows: PreviewRow[];
  truncated: boolean;
}

const VERDICT_TONES: Record<RowVerdict, "emerald" | "amber" | "slate" | "rose"> = {
  new: "emerald",
  duplicate: "amber",
  "duplicate-in-file": "slate",
  invalid: "rose",
};

const VERDICT_LABELS: Record<RowVerdict, string> = {
  new: "New",
  duplicate: "Already exists",
  "duplicate-in-file": "Repeated in file",
  invalid: "Cannot import",
};

const TEMPLATE = "Contact Name,Company,Email,Phone,Source,Budget,Notes";

/**
 * Importing a spreadsheet of leads.
 *
 * Two steps on purpose. The preview says exactly what will happen - how many
 * are new, how many the agency already has, how many the file repeats - and
 * nothing is written until somebody has seen those numbers and pressed the
 * second button.
 *
 * Duplicates are matched on email and default to being skipped. Overwriting a
 * lead a salesperson has been working, because a spreadsheet had the same
 * address in it, is the failure this whole flow exists to avoid.
 */
export function LeadImportDialog({
  owners,
  onClose,
}: {
  owners: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip");
  const [assignToId, setAssignToId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previous = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function send(mode: "preview" | "commit") {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csv,
        mode,
        onDuplicate,
        assignToId: assignToId || null,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | (Preview & { error?: string; created?: number; updated?: number; skipped?: number })
      | null;

    setBusy(false);

    if (!response.ok || !data) {
      setError(data?.error ?? "That file could not be read.");
      return;
    }

    if (mode === "preview") {
      setPreview(data);
      return;
    }

    setDone({
      created: data.created ?? 0,
      updated: data.updated ?? 0,
      skipped: data.skipped ?? 0,
    });

    startTransition(() => router.refresh());
  }

  function readFile(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setPreview(null);
      setError(null);
    };

    reader.onerror = () => setError("That file could not be read.");
    reader.readAsText(file);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Import leads"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/40"
        onClick={onClose}
        aria-label="Close import"
        tabIndex={-1}
      />

      <div className="relative flex max-h-full w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[min(46rem,90vh)] sm:max-w-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Import Leads</h2>
            <p className="text-xs text-slate-500">
              Paste a CSV or choose a file. Nothing is saved until you confirm.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {done ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                Import finished
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-emerald-800">
                <li>{done.created} added</li>
                {done.updated ? <li>{done.updated} updated</li> : null}
                {done.skipped ? (
                  <li>{done.skipped} skipped because they already existed</li>
                ) : null}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) readFile(file);
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Choose a file
                </Button>
                <span className="text-xs text-slate-500">or paste below</span>
              </div>

              <Textarea
                rows={6}
                value={csv}
                onChange={(event) => {
                  setCsv(event.target.value);
                  // The preview describes the old text once this changes.
                  setPreview(null);
                }}
                placeholder={`${TEMPLATE}\nJohn Smith,ABC Plumbing,john@abcplumbing.com,555-1234,Referral,3500,Wants a funnel`}
                className="font-mono text-[11px]"
              />

              <p className="text-[11px] leading-4 text-slate-500">
                Contact name and company are required. Everything else is optional.
                Column headings are matched loosely, so Email, E-Mail and Email Address
                all work.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">
                    If a lead already exists
                  </span>
                  <Select
                    className="h-9 text-xs"
                    value={onDuplicate}
                    onChange={(event) =>
                      setOnDuplicate(event.target.value as "skip" | "update")
                    }
                  >
                    <option value="skip">Skip it — change nothing</option>
                    <option value="update">Update the name, phone and notes</option>
                  </Select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-slate-700">Assign to</span>
                  <Select
                    className="h-9 text-xs"
                    value={assignToId}
                    onChange={(event) => setAssignToId(event.target.value)}
                  >
                    <option value="">Nobody yet</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              {onDuplicate === "update" ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
                  Updating fills gaps rather than wiping fields: an empty column in the
                  file leaves what is already on the lead alone. The stage, owner and
                  follow-up are never touched.
                </p>
              ) : null}

              {preview ? (
                <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-900">
                    {preview.summary.total} row{preview.summary.total === 1 ? "" : "s"} read
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="emerald">{preview.summary.new} new</Badge>
                    <Badge tone="amber">{preview.summary.duplicates} already exist</Badge>
                    {preview.summary.duplicatesInFile ? (
                      <Badge tone="slate">
                        {preview.summary.duplicatesInFile} repeated in the file
                      </Badge>
                    ) : null}
                    {preview.summary.invalid ? (
                      <Badge tone="rose">{preview.summary.invalid} cannot import</Badge>
                    ) : null}
                  </div>

                  {preview.invalid.length ? (
                    <ul className="space-y-0.5 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                      {preview.invalid.slice(0, 6).map((row) => (
                        <li key={row.line}>
                          Line {row.line}: {row.reason}
                        </li>
                      ))}
                      {preview.invalid.length > 6 ? (
                        <li>…and {preview.invalid.length - 6} more.</li>
                      ) : null}
                    </ul>
                  ) : null}

                  <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2.5 py-1.5 font-semibold">Line</th>
                          <th className="px-2.5 py-1.5 font-semibold">Name</th>
                          <th className="px-2.5 py-1.5 font-semibold">Company</th>
                          <th className="px-2.5 py-1.5 font-semibold">Email</th>
                          <th className="px-2.5 py-1.5 font-semibold">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {preview.rows.map((row) => (
                          <tr key={row.line}>
                            <td className="px-2.5 py-1.5 text-slate-500">{row.line}</td>
                            <td className="px-2.5 py-1.5 text-slate-800">
                              {row.contactName}
                            </td>
                            <td className="px-2.5 py-1.5 text-slate-600">
                              {row.businessName}
                            </td>
                            <td className="px-2.5 py-1.5 text-slate-600">
                              {row.email ?? "—"}
                            </td>
                            <td className="px-2.5 py-1.5">
                              <Badge tone={VERDICT_TONES[row.verdict]}>
                                {VERDICT_LABELS[row.verdict]}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {preview.truncated ? (
                    <p className="text-[11px] text-slate-500">
                      Showing the first 200 rows. All of them will be imported.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
          {done ? (
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || !csv.trim()}
                onClick={() => void send("preview")}
              >
                {busy && !preview ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Check the file
              </Button>
              <Button
                size="sm"
                // Nothing writes until the preview has been seen. A one-click
                // import is how somebody discovers the column mapping was wrong
                // after four hundred rows are already in.
                disabled={busy || !preview || preview.summary.new + preview.summary.duplicates === 0}
                onClick={() => void send("commit")}
              >
                {busy && preview ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Import {preview ? preview.summary.new : ""}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
