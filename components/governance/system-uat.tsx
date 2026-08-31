"use client";

/**
 * System UAT, inside SOPs & Audits.
 *
 * Not a new top-level area and not a third audit system: the test cases and
 * their runs are their own tables because an audit finding has nowhere to keep
 * a second attempt, but everything around them is reused - the task system for
 * corrective work, the permission model, this page.
 *
 * The readiness verdict is computed from the rows every time it is shown. It
 * is not a field anybody can set, which is the point: nobody can mark this
 * ready while a P0 is open.
 */

import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import {
  UAT_READINESS_LABELS,
  UAT_SEVERITY_LABELS,
  UAT_STATUS_LABELS,
  type UatCase,
  type UatSeverity,
  type UatStatus,
  gatesBeta,
  openSeverity,
  uatCaseStatus,
  uatReadiness,
  uatSummary,
} from "@/lib/governance/uat";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS_TONE: Record<UatStatus, string> = {
  PASSED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-rose-50 text-rose-700",
  BLOCKED: "bg-amber-50 text-amber-800",
  RETEST_REQUIRED: "bg-sky-50 text-sky-700",
  TESTING: "bg-slate-100 text-slate-600",
  NOT_TESTED: "bg-slate-100 text-slate-500",
};

const SEVERITY_TONE: Record<UatSeverity, string> = {
  P0: "bg-rose-600 text-white",
  P1: "bg-rose-50 text-rose-700",
  P2: "bg-amber-50 text-amber-800",
  P3: "bg-slate-100 text-slate-600",
};

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold text-slate-900", tone)}>{value}</p>
    </div>
  );
}

export function SystemUat({
  cases,
  canSignOff,
}: {
  cases: UatCase[];
  canSignOff: boolean;
}) {
  const [area, setArea] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<{ ok: boolean; message: string } | null>(null);

  const summary = useMemo(() => uatSummary(cases), [cases]);
  const verdict = useMemo(() => uatReadiness(cases), [cases]);
  /* The subset that actually gates the release, counted on its own. */
  const beta = useMemo(() => cases.filter(gatesBeta), [cases]);
  const betaSummary = useMemo(() => uatSummary(beta), [beta]);

  const modules = useMemo(
    () => [...new Set(cases.map((c) => c.module))].sort(),
    [cases],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return cases.filter((c) => {
      if (area !== "all" && c.module !== area) return false;
      if (status !== "all" && uatCaseStatus(c) !== status) return false;
      if (needle && !`${c.reference} ${c.name}`.toLowerCase().includes(needle)) return false;

      return true;
    });
  }, [cases, area, status, query]);

  const ready = verdict.state === "READY_FOR_LIMITED_BETA";

  async function signOff() {
    if (signing) return;

    setSigning(true);
    setSignResult(null);

    try {
      const response = await fetch("/api/governance/uat/sign-off", { method: "POST" });
      const data = await response.json().catch(() => ({}));

      setSignResult({
        ok: response.ok,
        message: response.ok
          ? "Approved for Limited Beta."
          : [data.error, ...(data.blockers ?? [])].filter(Boolean).join(" "),
      });
    } catch {
      setSignResult({ ok: false, message: "Could not reach the server." });
    } finally {
      setSigning(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">System UAT</h2>
        <p className="text-xs text-slate-500">
          What has been tested, what failed, and whether that adds up to a release.
        </p>
      </header>

      <div className="space-y-4 p-4">
        {/* ----------------------------------------------------- the numbers */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Tile label="Test cases" value={String(summary.total)} />
          <Tile label="Passed" value={String(summary.passed)} tone="text-emerald-700" />
          <Tile
            label="Failed"
            value={String(summary.failed)}
            tone={summary.failed > 0 ? "text-rose-700" : undefined}
          />
          <Tile
            label="Blocked"
            value={String(summary.blocked)}
            tone={summary.blocked > 0 ? "text-amber-700" : undefined}
          />
          <Tile label="Retest" value={String(summary.retestRequired)} />
          <Tile label="Not tested" value={String(summary.notTested)} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(["P0", "P1", "P2", "P3"] as UatSeverity[]).map((severity) => (
            <Tile
              key={severity}
              label={`${severity} open`}
              value={String(summary.open[severity])}
              tone={
                summary.open[severity] > 0 && (severity === "P0" || severity === "P1")
                  ? "text-rose-700"
                  : undefined
              }
            />
          ))}
          {/*
            * Coverage, not the pass rate.
            *
            * "100%" against eight of forty-three is true and useless - it is
            * 100% of a very small amount of testing. The fraction cannot be
            * read that way, so it is the one shown large.
            */}
          <Tile label="Executed" value={`${summary.passed + summary.failed + summary.retestRequired} / ${summary.total}`} />
        </div>

        {/* ------------------------------------------- the gate that matters */}
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            Limited Beta gate
          </p>
          <p className="mt-1 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">
              {betaSummary.passed + betaSummary.failed + betaSummary.retestRequired} of{" "}
              {betaSummary.total}
            </span>{" "}
            required tests executed, {betaSummary.passed} passed, {betaSummary.failed} failed,{" "}
            {betaSummary.blocked} blocked, {betaSummary.notTested} not yet run.
          </p>
          {cases.length > betaSummary.total ? (
            <p className="mt-0.5 text-[11px] text-slate-400">
              {cases.length - betaSummary.total} further case
              {cases.length - betaSummary.total === 1 ? "" : "s"} are scoped to production or
              to a later release and are counted separately.
            </p>
          ) : null}
        </div>

        {/* --------------------------------------------------- the verdict */}
        <div
          className={cn(
            "rounded-xl border p-3",
            ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className={cn(
                "flex items-center gap-1.5 text-sm font-semibold",
                ready ? "text-emerald-900" : "text-amber-900",
              )}
            >
              {ready ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              ) : (
                <ShieldAlert className="h-4 w-4" aria-hidden />
              )}
              {UAT_READINESS_LABELS[verdict.state]}
            </p>

            {canSignOff ? (
              <button
                type="button"
                onClick={signOff}
                disabled={!ready || signing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {signing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Approve for Limited Beta
              </button>
            ) : null}
          </div>

          {/*
            * Reasons, not a greyed-out button. "You cannot ship" is useless
            * without "because two P1s are open and Journey has never been run".
            */}
          {verdict.blockers.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {verdict.blockers.map((blocker) => (
                <li
                  key={blocker}
                  className="flex items-start gap-1.5 text-[11px] leading-4 text-amber-900"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {blocker}
                </li>
              ))}
            </ul>
          ) : null}

          {signResult ? (
            <p
              className={cn(
                "mt-2 rounded-lg px-2.5 py-2 text-[11px]",
                signResult.ok ? "bg-emerald-100 text-emerald-900" : "bg-rose-50 text-rose-700",
              )}
            >
              {signResult.message}
            </p>
          ) : null}
        </div>

        {/* ---------------------------------------------------- the filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="all">Every area</option>
            {modules.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="all">Any status</option>
            {(Object.keys(UAT_STATUS_LABELS) as UatStatus[]).map((value) => (
              <option key={value} value={value}>
                {UAT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reference or name"
            className="min-w-48 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"
          />
        </div>

        {/* ------------------------------------------------------ the cases */}
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
            {cases.length === 0
              ? "No test cases have been written yet."
              : "Nothing matches that."}
          </p>
        ) : (
          <ol className="space-y-1.5">
            {shown.map((testCase) => {
              const caseStatus = uatCaseStatus(testCase);
              const severity = openSeverity(testCase);
              const expanded = openCase === testCase.id;

              return (
                <li key={testCase.id} className="rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setOpenCase(expanded ? null : testCase.id)}
                    className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left"
                  >
                    <span className="font-mono text-[10px] text-slate-400">
                      {testCase.reference}
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-medium text-slate-800">
                      {testCase.name}
                    </span>
                    <span className="text-[10px] text-slate-400">{testCase.module}</span>
                    {severity ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          SEVERITY_TONE[severity],
                        )}
                      >
                        {severity}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        STATUS_TONE[caseStatus],
                      )}
                    >
                      {UAT_STATUS_LABELS[caseStatus]}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="border-t border-slate-100 px-3 py-2.5">
                      {testCase.runs.length === 0 ? (
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <CircleDashed className="h-3 w-3" aria-hidden />
                          Never run. Severity if it fails: {UAT_SEVERITY_LABELS[testCase.severity]}.
                        </p>
                      ) : (
                        <ol className="space-y-2">
                          {/*
                            * Every attempt, newest first. A case that failed
                            * twice before passing is the record that makes the
                            * fix auditable, so nothing here is replaced.
                            */}
                          {testCase.runs.map((run) => (
                            <li key={run.id} className="border-l-2 border-slate-100 pl-2.5">
                              <p className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400">
                                  Run {run.runNumber}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                    STATUS_TONE[run.status],
                                  )}
                                >
                                  {UAT_STATUS_LABELS[run.status]}
                                </span>
                                {run.severity ? (
                                  <span
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                      SEVERITY_TONE[run.severity],
                                    )}
                                  >
                                    {run.severity}
                                  </span>
                                ) : null}
                                <span className="text-[10px] text-slate-400">
                                  {run.testerName ?? "Unknown"} - {formatDateTime(new Date(run.testedAt))}
                                </span>
                              </p>

                              {run.actualResult ? (
                                <p className="mt-1 text-[11px] leading-4 text-slate-600">
                                  {run.actualResult}
                                </p>
                              ) : null}

                              {run.blockedReason ? (
                                <p className="mt-1 text-[11px] leading-4 text-amber-800">
                                  Blocked: {run.blockedReason}
                                </p>
                              ) : null}

                              {run.taskId ? (
                                <a
                                  href={`/work?task=${run.taskId}`}
                                  className="mt-1 inline-block text-[11px] font-semibold text-sky-700 hover:underline"
                                >
                                  Fix: {run.taskTitle ?? "open task"}
                                  {run.taskStatus ? ` (${run.taskStatus.toLowerCase()})` : ""}
                                </a>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
