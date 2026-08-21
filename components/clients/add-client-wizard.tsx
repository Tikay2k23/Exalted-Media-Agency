"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export interface ServiceOption {
  value: string;
  label: string;
  summary: string;
  /** Seats beyond sales and the project manager. */
  specialists: { role: string; label: string }[];
}

export interface TeamOption {
  id: string;
  name: string;
  teamRole: string;
}

const STEPS = [
  "Who they are",
  "What they bought",
  "What they want",
  "Who runs it",
  "Who builds it",
] as const;

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

/**
 * Guided client creation.
 *
 * Five steps rather than one long form, because the questions come from four
 * different conversations and a single wall of forty fields is why people gave
 * up and typed the company name into a note instead.
 */
export function AddClientWizard({
  services,
  team,
  onClose,
}: {
  services: ServiceOption[];
  team: TeamOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [values, setValues] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    website: "",
    serviceType: services[0]?.value ?? "",
    monthlyValue: "",
    contractStartDate: "",
    contractEndDate: "",
    targetLaunchDate: "",
    mainGoal: "",
    mainProblem: "",
    targetAudience: "",
    mainOffer: "",
    projectManagerId: "",
    notes: "",
  });
  const [specialistOwners, setSpecialistOwners] = useState<Record<string, string>>({});

  const service = services.find((option) => option.value === values.serviceType) ?? null;
  const projectManagers = team.filter((member) => member.teamRole === "PROJECT_MANAGER");

  // Escape closes, and the page behind stops scrolling while this is open -
  // otherwise the background moves under a dialog that fills the screen.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function set(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** What must be answered before the next step is worth showing. */
  function blockedReason(): string | null {
    if (step === 0) {
      if (!values.companyName.trim()) return "The business needs a name.";
      if (!values.contactName.trim()) return "Who is the main contact?";
      if (!values.contactEmail.trim()) return "An email address is needed to send them anything.";
    }

    if (step === 1 && !values.serviceType) {
      return "Choose what they bought — it decides who works on this account.";
    }

    return null;
  }

  function next() {
    const blocked = blockedReason();

    if (blocked) {
      setError(blocked);
      return;
    }

    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/clients/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          monthlyValue: values.monthlyValue ? Number(values.monthlyValue) : null,
          specialistOwners,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; clientId?: string }
        | null;

      if (!response.ok || !data?.clientId) {
        setError(data?.error ?? "We couldn't create this client.");
        return;
      }

      // Straight to the account, which now has its onboarding on it, rather
      // than back to a list where the user has to find what they just made.
      router.push(`/clients/${data.clientId}`);
      router.refresh();
    });
  }

  // This only ever renders after a click, so there is a document. The guard is
  // for safety rather than for a case that happens.
  if (typeof document === "undefined") {
    return null;
  }

  /*
   * Rendered into document.body rather than in place.
   *
   * Every Card in this app carries `backdrop-blur`, and an element with a
   * backdrop-filter becomes the containing block for `position: fixed`
   * descendants. In place, this dialog was positioned against the card that
   * holds the button rather than the viewport, so it was clipped to a strip
   * and scrolled inside it. A portal is the only reliable escape.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a client"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <div className="my-8 w-full max-w-2xl rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_40px_120px_-40px_rgba(15,23,42,0.5)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-600">
              Step {step + 1} of {STEPS.length}
            </p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-slate-950">
              {STEPS[step]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1.5 px-6 pt-4">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={`h-1.5 flex-1 rounded-full ${
                index <= step ? "bg-sky-500" : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        <div className="space-y-4 px-6 py-5">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-sm leading-6 text-rose-700">{error}</p>
            </div>
          ) : null}

          {step === 0 ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Business name">
                  <Input
                    value={values.companyName}
                    onChange={(event) => set("companyName", event.target.value)}
                    placeholder="Reyes Plumbing"
                    autoFocus
                  />
                </Field>
              </div>
              <Field label="Main contact">
                <Input
                  value={values.contactName}
                  onChange={(event) => set("contactName", event.target.value)}
                  placeholder="Dana Reyes"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={values.contactEmail}
                  onChange={(event) => set("contactEmail", event.target.value)}
                  placeholder="dana@reyesplumbing.com"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={values.contactPhone}
                  onChange={(event) => set("contactPhone", event.target.value)}
                />
              </Field>
              <Field label="Website">
                <Input
                  value={values.website}
                  onChange={(event) => set("website", event.target.value)}
                  placeholder="reyesplumbing.com"
                />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <Field
                label="What did they buy?"
                hint="This decides which specialists get a workstream on the account."
              >
                <Select
                  value={values.serviceType}
                  onChange={(event) => set("serviceType", event.target.value)}
                >
                  {services.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {service ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3">
                  <p className="text-sm leading-6 text-sky-900">{service.summary}</p>
                  <p className="mt-1.5 text-sm leading-6 text-sky-800">
                    {service.specialists.length
                      ? `Brings in: ${service.specialists.map((s) => s.label).join(", ")}.`
                      : "No specialists needed — the project manager runs this one."}
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <Field label="Monthly fee">
                  <Input
                    type="number"
                    min="0"
                    value={values.monthlyValue}
                    onChange={(event) => set("monthlyValue", event.target.value)}
                  />
                </Field>
                <Field label="Target launch">
                  <Input
                    type="date"
                    value={values.targetLaunchDate}
                    onChange={(event) => set("targetLaunchDate", event.target.value)}
                  />
                </Field>
                <Field label="Contract starts">
                  <Input
                    type="date"
                    value={values.contractStartDate}
                    onChange={(event) => set("contractStartDate", event.target.value)}
                  />
                </Field>
                <Field label="Contract ends">
                  <Input
                    type="date"
                    value={values.contractEndDate}
                    onChange={(event) => set("contractEndDate", event.target.value)}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                Anything here starts the strategy brief, so it does not have to be asked
                twice. All optional — the brief screen collects the rest.
              </p>
              <Field label="What do they want to achieve?">
                <textarea
                  rows={2}
                  className={areaClass}
                  value={values.mainGoal}
                  onChange={(event) => set("mainGoal", event.target.value)}
                  placeholder="Thirty booked jobs a month from paid search"
                />
              </Field>
              <Field label="What is going wrong today?">
                <textarea
                  rows={2}
                  className={areaClass}
                  value={values.mainProblem}
                  onChange={(event) => set("mainProblem", event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                <Field label="Who are their customers?">
                  <Input
                    value={values.targetAudience}
                    onChange={(event) => set("targetAudience", event.target.value)}
                  />
                </Field>
                <Field label="Their main offer">
                  <Input
                    value={values.mainOffer}
                    onChange={(event) => set("mainOffer", event.target.value)}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <Field
                label="Project manager"
                hint="They own the relationship and hold the client until production starts."
              >
                <Select
                  value={values.projectManagerId}
                  onChange={(event) => set("projectManagerId", event.target.value)}
                >
                  <option value="">Whoever has the fewest accounts</option>
                  {projectManagers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Anything the team should know">
                <textarea
                  rows={3}
                  className={areaClass}
                  value={values.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </Field>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              {service && service.specialists.length ? (
                <>
                  <p className="text-sm leading-6 text-slate-600">
                    {service.label} needs these seats. Leave one blank and the project
                    manager picks somebody later — the workstream still gets created.
                  </p>
                  {service.specialists.map((specialist) => (
                    <Field key={specialist.role} label={specialist.label}>
                      <Select
                        value={specialistOwners[specialist.role] ?? ""}
                        onChange={(event) =>
                          setSpecialistOwners((current) => ({
                            ...current,
                            [specialist.role]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Decide later</option>
                        {team
                          .filter((member) => member.teamRole === specialist.role)
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  ))}
                </>
              ) : (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                  This service needs no specialists. The project manager runs it.
                </p>
              )}

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-900">
                  Creating this client will also
                </p>
                <ul className="mt-1.5 space-y-0.5 text-sm leading-6 text-emerald-800">
                  <li>place them at the start of the journey</li>
                  <li>record the project manager as the current owner</li>
                  <li>create the workstreams this service needs</li>
                  <li>create the onboarding work and notify the project manager</li>
                </ul>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <Button
            type="button"
            variant="secondary"
            disabled={step === 0 || isPending}
            onClick={() => {
              setError(null);
              setStep((current) => Math.max(0, current - 1));
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next} className="gap-2">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={isPending} className="gap-2">
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Create client
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The button that opens it. Deliberately prominent. */
export function AddClientButton({
  services,
  team,
}: {
  services: ServiceOption[];
  team: TeamOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Client
      </Button>
      {open ? (
        <AddClientWizard services={services} team={team} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
