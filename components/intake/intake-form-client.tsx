"use client";

import { Check, LoaderCircle, Save } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { questionApplies, type IntakeSection } from "@/lib/intake/question-catalogue";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50";

/**
 * The form the client fills in.
 *
 * Deliberately plain. This is somebody's Tuesday afternoon admin task, not a
 * product tour, and every extra flourish is one more thing between them and
 * finishing.
 */
export function IntakeFormClient({
  token,
  sections,
  initialAnswers,
}: {
  token: string;
  sections: IntakeSection[];
  initialAnswers: Record<string, string>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pinged = useRef(false);

  // Tell the server the client opened this, once. The page itself cannot do it:
  // a server component that writes during render may run more than once.
  useEffect(() => {
    if (pinged.current) {
      return;
    }

    pinged.current = true;
    void fetch(`/api/intake/${token}/viewed`, { method: "POST" }).catch(() => undefined);
  }, [token]);

  const total = sections.reduce((count, section) => count + section.questions.length, 0);
  const answered = Object.values(answers).filter((value) => value.trim()).length;

  function send(submit: boolean) {
    setError(null);
    setMissing([]);
    setSaved(false);

    startTransition(async () => {
      const response = await fetch(`/api/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, submit }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; fields?: string[]; missingRequired?: string[]; submitted?: boolean }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "We couldn't save that. Please try again.");
        setMissing(data?.fields ?? data?.missingRequired ?? []);
        return;
      }

      if (submit) {
        setSubmitted(true);
        return;
      }

      setSaved(true);
    });
  }

  if (submitted) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
        <h2 className="text-xl font-semibold text-emerald-900">Thank you</h2>
        <p className="mt-2 leading-7 text-emerald-800">
          That is everything we need to get started. Your account manager will be in
          touch shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 -mx-4 bg-white/90 px-4 py-3 backdrop-blur md:mx-0 md:rounded-2xl md:px-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            {answered} of {total} answered
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => send(false)}
              disabled={isPending}
              className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save for later
            </button>
            <button
              type="button"
              onClick={() => send(true)}
              disabled={isPending}
              className={`${buttonClass} bg-slate-950 text-white hover:bg-slate-800`}
            >
              <Check className="h-4 w-4" />
              Done
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-sky-500 transition-all"
            style={{ width: `${total ? Math.round((answered / total) * 100) : 0}%` }}
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm leading-6 text-rose-800">{error}</p>
          {missing.length ? (
            <ul className="mt-1.5 space-y-0.5">
              {missing.map((item) => (
                <li key={item} className="text-sm leading-6 text-rose-700">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {saved && !isPending ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
          Saved. You can close this and come back to the same link.
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section.id} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              {section.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{section.description}</p>
          </div>

          <div className="space-y-4">
            {section.questions
              .filter((question) => questionApplies(question, answers))
              .map((question) => (
              <label key={question.id} className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  {question.label}
                  {question.required ? (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                      required
                    </span>
                  ) : null}
                </span>
                {question.kind === "boolean" ? (
                  <select
                    className={inputClass}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Please choose</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : question.kind === "choice" ? (
                  <select
                    className={inputClass}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Please choose</option>
                    {(question.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : question.kind === "multi" ? (
                  /* Stored as the chosen values joined by a comma, so the
                     answers stay the flat string map everything else reads. */
                  <span className="block space-y-1.5 rounded-xl border border-slate-200 p-3">
                    {(question.options ?? []).map((option) => {
                      const chosen = (answers[question.id] ?? "")
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean);

                      return (
                        <span key={option.value} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={chosen.includes(option.value)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...chosen, option.value]
                                : chosen.filter((value) => value !== option.value);

                              setAnswers((current) => ({
                                ...current,
                                [question.id]: next.join(","),
                              }));
                            }}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="text-sm text-slate-700">{option.label}</span>
                        </span>
                      );
                    })}
                  </span>
                ) : question.kind === "long" ? (
                  <textarea
                    rows={3}
                    className={inputClass}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <input
                    type={
                      question.kind === "email"
                        ? "email"
                        : question.kind === "phone"
                          ? "tel"
                          : question.kind === "money"
                            ? "number"
                            : "text"
                    }
                    className={inputClass}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                  />
                )}
                {question.help ? (
                  <span className="block text-xs leading-5 text-slate-500">
                    {question.help}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-6">
        <button
          type="button"
          onClick={() => send(false)}
          disabled={isPending}
          className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Save for later
        </button>
        <button
          type="button"
          onClick={() => send(true)}
          disabled={isPending}
          className={`${buttonClass} bg-slate-950 text-white hover:bg-slate-800`}
        >
          <Check className="h-4 w-4" />
          I&rsquo;m done
        </button>
      </div>
    </div>
  );
}
