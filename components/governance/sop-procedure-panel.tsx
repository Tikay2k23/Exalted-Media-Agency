"use client";

import { ArrowRight, ChevronDown, CircleCheck, Info, ShieldAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useId, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { ProcedureStep } from "@/lib/governance/sop-procedure";

/**
 * The procedure as an ordered workflow.
 *
 * One renderer for all ten. What a step shows is whatever the document wrote:
 * a procedure with owners, inputs and results renders the full row, and one
 * still written as a flat numbered list renders as titles in the same timeline
 * rather than in a second layout maintained beside this one.
 *
 * Expansion is local state. Nothing here fetches, and nothing here writes - the
 * step navigator moves the reader around a document, it does not advance a lead
 * through a pipeline. That distinction is the reason this reads "10 Procedure
 * Steps" rather than showing progress: it is documentation, and a progress bar
 * on documentation invites somebody to tick it.
 */

interface ExceptionEntry {
  title: string;
  detail: string;
}

/** A short lead-in for the collapsed row. */
function summarise(step: ProcedureStep) {
  const first = step.what[0] ?? "";

  if (first.length <= 150) return first;

  const cut = first.slice(0, 150);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "));

  return `${cut.slice(0, lastStop > 80 ? lastStop : 150).trim()}…`;
}

function StepRow({
  step,
  open,
  onToggle,
}: {
  step: ProcedureStep;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = useId();
  const summary = summarise(step);

  return (
    <li id={`step-${step.number}`} className="relative scroll-mt-24">
      <div
        className={`rounded-xl border transition ${
          open ? "border-sky-200 bg-sky-50/30" : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        {/*
          A button, not a clickable div: this has to work from the keyboard and
          announce whether it is open. The whole header is the target so the hit
          area matches what looks clickable.
        */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          disabled={!step.hasDetail}
          className="flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-default"
        >
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              open ? "bg-sky-600 text-white" : "bg-slate-900 text-white"
            }`}
          >
            {step.number}
          </span>

          <span className="grid min-w-0 flex-1 gap-x-6 gap-y-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{step.title}</span>
              {summary ? (
                <span className="mt-0.5 block text-sm leading-6 text-slate-600">{summary}</span>
              ) : null}
            </span>

            <span className="min-w-0">
              {step.owner ? (
                <span className="flex items-start gap-1.5 text-sm text-slate-600">
                  <UserRound className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0">{step.owner}</span>
                </span>
              ) : null}
            </span>

            <span className="min-w-0">
              {step.result ? (
                <span className="flex items-start gap-1.5 text-sm leading-6 text-slate-600">
                  <CircleCheck className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                  <span className="min-w-0">{step.result}</span>
                </span>
              ) : null}
            </span>
          </span>

          {step.hasDetail ? (
            <ChevronDown
              aria-hidden
              className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
            />
          ) : null}
        </button>

        {open ? (
          <div
            id={panelId}
            className="space-y-3 border-t border-sky-100 px-4 py-3 pl-13 sm:pl-[3.25rem]"
          >
            {step.appliesWhen ? (
              <p className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                <Info className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                Applies when: {step.appliesWhen}
              </p>
            ) : null}

            {step.what.length ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  What to do
                </p>
                {step.what.map((paragraph) => (
                  <p key={paragraph} className="mt-1 text-sm leading-6 text-slate-700">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}

            {step.inputs.length ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Required information
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {step.inputs.map((input) => (
                    <li
                      key={input}
                      className="rounded-lg bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200"
                    >
                      {input}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {step.supporting ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Supporting role
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{step.supporting}</p>
              </div>
            ) : null}

            {/*
              Amber only where the document marked a rule. Every step styled as
              a warning is a page with no warnings on it.
            */}
            {step.rule ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                <ShieldAlert className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="font-semibold">Critical rule. </span>
                  {step.rule}
                </span>
              </p>
            ) : null}

            {step.evidence ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Evidence
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{step.evidence}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function SopProcedurePanel({
  steps,
  exceptions,
  completion,
  nextSop,
}: {
  steps: ProcedureStep[];
  exceptions: ExceptionEntry[];
  /** The document's own completion sentence, shown as the workflow's end. */
  completion: string | null;
  nextSop: { reference: string; title: string } | null;
}) {
  const [open, setOpen] = useState<number[]>([]);

  const toggle = useCallback((number: number) => {
    setOpen((current) =>
      current.includes(number)
        ? current.filter((entry) => entry !== number)
        : [...current, number],
    );
  }, []);

  /* The navigator opens the step and moves to it. Documentation, not progress. */
  const jump = useCallback((number: number) => {
    setOpen((current) => (current.includes(number) ? current : [...current, number]));
    document.getElementById(`step-${number}`)?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-none">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">
              {steps.length} procedure {steps.length === 1 ? "step" : "steps"}
            </h3>
            <p className="text-xs text-slate-500">
              What the agency does. Where to do it is on the System Guide tab.
            </p>
          </div>

          {/*
            The whole procedure at a glance. Buttons rather than anchors: they
            open a step on this page, they do not navigate.
          */}
          <nav aria-label="Procedure steps" className="mt-3 -mx-1 overflow-x-auto pb-1">
            <ol className="flex min-w-0 gap-1 px-1">
              {steps.map((step) => (
                <li key={step.number}>
                  <button
                    type="button"
                    onClick={() => jump(step.number)}
                    title={step.title}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 py-1 pl-1 pr-2.5 text-xs font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                      {step.number}
                    </span>
                    {step.short}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <ol className="mt-4 space-y-2">
            {steps.map((step) => (
              <StepRow
                key={step.number}
                step={step}
                open={open.includes(step.number)}
                onToggle={() => toggle(step.number)}
              />
            ))}
          </ol>
        </CardContent>
      </Card>

      {exceptions.length ? (
        <Card className="rounded-2xl shadow-none">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-slate-950">Exceptions and escalation</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              When the normal workflow does not fit.
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {exceptions.map((entry) => (
                <div key={entry.title} className="min-w-0">
                  <dt className="text-sm font-semibold text-slate-800">{entry.title}</dt>
                  {entry.detail ? (
                    <dd className="mt-0.5 text-sm leading-6 text-slate-600">{entry.detail}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {completion || nextSop ? (
        <Card className="rounded-2xl border-emerald-200 bg-emerald-50/40 shadow-none">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                Procedure complete
              </h3>
              {completion ? (
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-700">{completion}</p>
              ) : null}
            </div>

            {nextSop ? (
              <Link
                href={`/governance/sops/${encodeURIComponent(nextSop.reference)}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Continue to {nextSop.reference}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
