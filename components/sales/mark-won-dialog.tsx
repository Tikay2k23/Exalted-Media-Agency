"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Trophy,
  TriangleAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * The Won confirmation.
 *
 * Deliberately a modal with a form rather than a one-click stage move. Winning
 * a deal starts a chain that creates an account, opens a journey, raises an
 * invoice and assigns work to people, and none of that should follow from a
 * mis-drop on a board. What it asks for is the minimum the handoff genuinely
 * cannot proceed without.
 */

const SERVICE_TYPES = [
  "SOCIAL_MEDIA_MANAGEMENT",
  "CONTENT_PRODUCTION",
  "PAID_ADVERTISING",
  "BRAND_STRATEGY",
  "WEBSITE_SUPPORT",
  "FUNNEL_BUILD",
  "CRM_AUTOMATION",
  "SEO",
  "EMAIL_MARKETING",
  "FULL_SERVICE_RETAINER",
] as const;

const CONTRACT_STATUSES = ["NOT_SENT", "SENT", "VIEWED", "SIGNED"] as const;

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({ label: text, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-600">{text}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

interface ClientMatch {
  clientId: string;
  companyName: string;
  contactEmail: string;
  stageName: string;
  reason: string;
  isStrong: boolean;
}

interface WonPreview {
  leadId: string;
  businessName: string;
  contactName: string;
  suggestedServiceType: string | null;
  suggestedValue: number | null;
  matches: ClientMatch[];
  suggestedClientId: string | null;
  projectManagers: { id: string; name: string; openClients: number }[];
  specialists: string[];
  canOverrideDuplicate: boolean;
  existingHandoff: { state: string; clientId: string | null } | null;
}

interface WonResult {
  handoffId: string;
  state: string;
  clientId: string | null;
  alreadyProcessed: boolean;
  generatedTaskCount: number;
  linkedExistingClient: boolean;
}

export function MarkWonDialog({
  leadId,
  businessName,
  onClose,
}: {
  leadId: string;
  businessName: string;
  onClose: () => void;
}) {
  const router = useRouter();

  const [preview, setPreview] = useState<WonPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WonResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "PENDING">("PENDING");
  const [linkChoice, setLinkChoice] = useState<string>("");
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);

  /*
   * Guards a second submit at the source.
   *
   * The server is idempotent regardless - LeadHandoff.leadId is unique - but a
   * ref that flips before the request leaves stops the second click from ever
   * becoming a request, which is cheaper than discovering the duplicate on the
   * far side.
   */
  const inFlight = useRef(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/leads/${leadId}/won`);
      const data = await response.json().catch(() => null);

      if (cancelled) return;

      if (!response.ok) {
        setError(data?.error ?? "We could not prepare this opportunity.");
        setLoading(false);
        return;
      }

      setPreview(data as WonPreview);
      setLinkChoice((data as WonPreview).suggestedClientId ?? "");
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const submit = useCallback(
    async (formData: FormData) => {
      if (inFlight.current) return;

      inFlight.current = true;
      setSubmitting(true);
      setError(null);

      try {
        const value = String(formData.get("finalValue") ?? "").trim();

        const response = await fetch(`/api/leads/${leadId}/won`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceType: String(formData.get("serviceType") ?? ""),
            finalValue: value ? Number(value) : null,
            contractStatus: String(formData.get("contractStatus") ?? "NOT_SENT"),
            paymentStatus,
            expectedStartDate: String(formData.get("expectedStartDate") ?? "") || null,
            handoffNote: String(formData.get("handoffNote") ?? "").trim(),
            projectManagerId: String(formData.get("projectManagerId") ?? ""),
            linkClientId: linkChoice,
            overrideDuplicate,
          }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setError(data?.error ?? "We could not close this opportunity.");
          return;
        }

        setResult(data as WonResult);
        router.refresh();
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [leadId, linkChoice, overrideDuplicate, paymentStatus, router],
  );

  const strongMatch = preview?.matches.find((match) => match.isStrong) ?? null;
  const needsOverride = Boolean(strongMatch) && linkChoice === "";
  const blockedByPermission = needsOverride && !preview?.canOverrideDuplicate;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-slate-200 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Sales handoff
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">
              Mark this opportunity as Won?
            </h2>
            <p className="mt-1 truncate text-sm text-slate-500">{businessName}</p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Checking for an existing client account...
            </p>
          ) : result ? (
            <Outcome result={result} businessName={businessName} />
          ) : (
            <form id="won-form" action={submit} className="space-y-5">
              {error ? (
                <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              ) : null}

              {preview?.existingHandoff ? (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  This opportunity has already been closed as Won (
                  {label(preview.existingHandoff.state)}). Confirming again will not
                  create a second client.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Final deal value">
                  <input
                    name="finalValue"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={preview?.suggestedValue ?? ""}
                    placeholder="0.00"
                    className={fieldClass}
                  />
                </Field>

                <Field label="Service / package sold">
                  <select
                    name="serviceType"
                    required
                    defaultValue={preview?.suggestedServiceType ?? ""}
                    className={fieldClass}
                  >
                    <option value="" disabled>
                      Choose a service
                    </option>
                    {SERVICE_TYPES.map((service) => (
                      <option key={service} value={service}>
                        {label(service)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Contract status">
                  <select name="contractStatus" defaultValue="NOT_SENT" className={fieldClass}>
                    {CONTRACT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {label(status)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Expected start date">
                  <input name="expectedStartDate" type="date" className={fieldClass} />
                </Field>
              </div>

              {/*
                * Payment is a choice with consequences, so it is two explicit
                * cards rather than a dropdown: the difference between them is
                * whether the delivery team starts work today.
                */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-600">
                  Payment status
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "PAID" as const,
                        title: "Paid",
                        blurb: "Creates the client, starts the journey and generates onboarding work now.",
                        Icon: Check,
                      },
                      {
                        value: "PENDING" as const,
                        title: "Pending",
                        blurb: "Records the win and holds delivery until the payment is confirmed.",
                        Icon: Clock3,
                      },
                    ]
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPaymentStatus(option.value)}
                      aria-pressed={paymentStatus === option.value}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                        paymentStatus === option.value
                          ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                          : "border-slate-200 hover:bg-slate-50/70"
                      }`}
                    >
                      <option.Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">
                          {option.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-slate-500">
                          {option.blurb}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {preview && preview.matches.length > 0 ? (
                <fieldset className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <legend className="px-1 text-sm font-semibold text-amber-900">
                    {preview.matches.length === 1
                      ? "An account like this already exists"
                      : `${preview.matches.length} accounts like this already exist`}
                  </legend>

                  {preview.matches.map((match) => (
                    <label
                      key={match.clientId}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-white p-2.5"
                    >
                      <input
                        type="radio"
                        name="linkChoice"
                        checked={linkChoice === match.clientId}
                        onChange={() => {
                          setLinkChoice(match.clientId);
                          setOverrideDuplicate(false);
                        }}
                        className="mt-1 accent-slate-900"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">
                          Link to {match.companyName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {match.reason} &middot; {match.stageName} &middot;{" "}
                          {match.contactEmail}
                        </span>
                      </span>
                    </label>
                  ))}

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-white p-2.5">
                    <input
                      type="radio"
                      name="linkChoice"
                      checked={linkChoice === ""}
                      onChange={() => setLinkChoice("")}
                      className="mt-1 accent-slate-900"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">
                        Create a new client account
                      </span>
                      <span className="block text-xs text-slate-500">
                        Only when this is genuinely a different business.
                      </span>
                    </span>
                  </label>

                  {needsOverride ? (
                    blockedByPermission ? (
                      <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs leading-4 text-rose-800">
                        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Creating a second account for a business that already
                        exists needs somebody who can add clients. Ask a project
                        manager or the agency owner.
                      </p>
                    ) : (
                      <label className="flex cursor-pointer items-start gap-2 px-1 text-xs leading-4 text-amber-900">
                        <input
                          type="checkbox"
                          checked={overrideDuplicate}
                          onChange={(event) => setOverrideDuplicate(event.target.checked)}
                          className="mt-0.5 accent-slate-900"
                        />
                        I have checked, and this is a different business from the
                        account above.
                      </label>
                    )
                  ) : null}
                </fieldset>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Project manager"
                  hint={
                    preview?.specialists.length
                      ? `Specialists opened: ${preview.specialists.map(label).join(", ")}`
                      : "Pick the service to see which specialists open."
                  }
                >
                  <select name="projectManagerId" defaultValue="" className={fieldClass}>
                    <option value="">Assign the least loaded</option>
                    {preview?.projectManagers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name} ({manager.openClients} clients)
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Sales handoff note (optional)">
                <textarea
                  name="handoffNote"
                  rows={3}
                  placeholder="Anything delivery needs to know that is not already on the record."
                  className={areaClass}
                />
              </Field>
            </form>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
          {result ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="won-form"
                disabled={submitting || loading || blockedByPermission}
                className="gap-2"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trophy className="h-4 w-4" />
                )}
                Confirm Won
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** What actually happened, with the links to go and look at it. */
function Outcome({ result, businessName }: { result: WonResult; businessName: string }) {
  const awaiting = result.state === "AWAITING_PAYMENT";
  const failed = result.state === "FAILED";

  return (
    <div className="space-y-4 py-2">
      <div
        className={`flex items-start gap-3 rounded-xl p-4 ${
          failed
            ? "bg-rose-50 text-rose-900"
            : awaiting
              ? "bg-amber-50 text-amber-900"
              : "bg-emerald-50 text-emerald-900"
        }`}
      >
        {failed ? (
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        ) : awaiting ? (
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <Check className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {failed
              ? "Handoff incomplete"
              : awaiting
                ? "Won, awaiting payment"
                : `${businessName} is now a client`}
          </p>
          <p className="mt-1 text-sm leading-5">
            {failed
              ? "Some steps completed and some did not. An authorised user can retry from the opportunity without creating duplicates."
              : awaiting
                ? "The win is recorded and the opportunity sits in Won. Delivery starts as soon as the payment is confirmed."
                : result.alreadyProcessed
                  ? "This opportunity had already been handed over. Nothing was created twice."
                  : `${result.linkedExistingClient ? "Linked to the existing account" : "Client created"}, journey started, and ${result.generatedTaskCount} onboarding task${result.generatedTaskCount === 1 ? "" : "s"} assigned.`}
          </p>
        </div>
      </div>

      {result.clientId ? (
        <div className="flex flex-wrap gap-2">
          <a href={`/clients/${result.clientId}`}>
            <Button variant="secondary" className="gap-2">
              Open Client
              <ArrowRight className="h-4 w-4" />
            </Button>
          </a>
          {!awaiting ? (
            <a href="/journey">
              <Button variant="secondary" className="gap-2">
                Open Journey
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
