"use client";

import { Circle, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { A2PReadiness } from "@/lib/a2p/a2p-readiness";
import { cn } from "@/lib/utils";

/**
 * The operational A2P workspace.
 *
 * Its own page rather than a panel on Strategy: this is a registration form
 * with sixty-odd fields and a review trail, and squeezing it into a summary tab
 * would ruin both.
 *
 * Every section saves on its own and sends only its own fields, so working
 * through the form top to bottom never writes back a stale copy of a section
 * somebody else has since corrected.
 */

export interface A2PValues {
  [key: string]: string | boolean | string[] | null | undefined;
}

export interface SampleValues {
  id: string | null;
  category: "TRANSACTIONAL" | "LEAD_FOLLOW_UP" | "MARKETING" | "OTHER";
  body: string;
  reviewNote: string;
}

const USE_CASES: { value: string; label: string }[] = [
  { value: "APPOINTMENT_CONFIRMATION", label: "Appointment confirmations" },
  { value: "APPOINTMENT_REMINDER", label: "Appointment reminders" },
  { value: "LEAD_FOLLOW_UP", label: "Lead follow-up" },
  { value: "QUOTE_FOLLOW_UP", label: "Estimate or quote follow-up" },
  { value: "CUSTOMER_SUPPORT", label: "Customer support" },
  { value: "SERVICE_NOTIFICATION", label: "Service notifications" },
  { value: "ORDER_STATUS", label: "Order or status updates" },
  { value: "ACCOUNT_NOTIFICATION", label: "Account notifications" },
  { value: "MARKETING_PROMOTION", label: "Marketing and promotions" },
  { value: "REACTIVATION", label: "Reactivation campaigns" },
  { value: "TWO_FACTOR", label: "Two-factor authentication" },
  { value: "MISSED_CALL_TEXT_BACK", label: "Missed-call text back" },
  { value: "OTHER", label: "Something else" },
];

const OPT_IN_METHODS: { value: string; label: string }[] = [
  { value: "WEBSITE_FORM", label: "Website form" },
  { value: "CONTACT_FORM", label: "Contact form" },
  { value: "LANDING_PAGE", label: "Landing page" },
  { value: "BOOKING_FORM", label: "Booking form" },
  { value: "CHECKOUT", label: "Checkout" },
  { value: "PAPER_FORM", label: "Paper form" },
  { value: "IN_PERSON", label: "In person" },
  { value: "VERBAL", label: "Verbal" },
  { value: "TEXT_TO_JOIN", label: "Text-to-join keyword" },
  { value: "EXISTING_CUSTOMER", label: "Existing customer process" },
  { value: "OTHER", label: "Something else" },
];

const WEB_OPT_IN = ["WEBSITE_FORM", "CONTACT_FORM", "LANDING_PAGE", "BOOKING_FORM", "CHECKOUT"];

function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={cn("block min-w-0", wide && "sm:col-span-2")}>
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {hint ? <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function CheckGroup({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {options.map((option) => (
        <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, option.value]
                  : selected.filter((value) => value !== option.value),
              )
            }
            className="h-4 w-4 rounded border-slate-300"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** Yes / No / not answered. The third is a real state and must survive a save. */
function TriState({
  value,
  onChange,
}: {
  value: boolean | null | undefined;
  onChange: (next: boolean | null) => void;
}) {
  return (
    <Select
      value={value === true ? "yes" : value === false ? "no" : ""}
      onChange={(event) =>
        onChange(event.target.value === "" ? null : event.target.value === "yes")
      }
    >
      <option value="">Not answered</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </Select>
  );
}

function Section({
  title,
  description,
  children,
  onSave,
  saving,
  saved,
  error,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </header>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">{children}</div>

      {error ? (
        <p role="alert" className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      <footer className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3">
        {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Save section"
          )}
        </Button>
      </footer>
    </section>
  );
}

export function A2PProfileWorkspace({
  clientId,
  companyName,
  initial,
  initialSamples,
  readiness: initialReadiness,
  status: initialStatus,
  warnings,
  submissions,
  canRecordDecision,
}: {
  clientId: string;
  companyName: string;
  initial: A2PValues;
  initialSamples: SampleValues[];
  readiness: A2PReadiness;
  status: string;
  warnings: { sample: string; warning: string }[];
  submissions: {
    id: string;
    provider: string;
    brandId: string | null;
    campaignId: string | null;
    providerStatus: string | null;
    rejectedReason: string | null;
    submittedByName: string | null;
    submittedAt: string;
  }[];
  /** Only some seats may say a provider approved or refused a registration. */
  canRecordDecision: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState<A2PValues>(initial);
  const [samples, setSamples] = useState<SampleValues[]>(initialSamples);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<{ section: string; message: string } | null>(null);

  const set = (patch: A2PValues) => setForm((current) => ({ ...current, ...patch }));
  const str = (key: string) => (form[key] as string | null) ?? "";
  const list = (key: string) => (form[key] as string[] | undefined) ?? [];
  const bool = (key: string) => form[key] as boolean | null | undefined;

  const webOptIn = list("optInMethods").some((method) => WEB_OPT_IN.includes(method));

  /** Sends only the keys this section owns, so no section overwrites another. */
  function saveSection(section: string, keys: string[]) {
    setBusy(section);
    setError(null);
    setSaved(null);

    void (async () => {
      try {
        const body: A2PValues = {};

        for (const key of keys) body[key] = form[key];

        const response = await fetch(`/api/clients/${clientId}/a2p`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);

          setError({ section, message: data?.error ?? "We couldn't save that section." });
          setBusy(null);
          return;
        }

        const data = (await response.json()) as { readiness: A2PReadiness };

        setReadiness(data.readiness);
        setSaved(section);
        setBusy(null);
        startTransition(() => router.refresh());
      } catch {
        setError({ section, message: "We couldn't reach the server. Nothing was saved." });
        setBusy(null);
      }
    })();
  }

  function saveSamples() {
    setBusy("samples");
    setError(null);

    void (async () => {
      const response = await fetch(`/api/clients/${clientId}/a2p`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: samples.filter((s) => s.body.trim().length >= 5) }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        setError({ section: "samples", message: data?.error ?? "We couldn't save the messages." });
        setBusy(null);
        return;
      }

      setSaved("samples");
      setBusy(null);
      router.refresh();
    })();
  }

  function changeStatus(next: string) {
    setBusy("status");
    setError(null);

    void (async () => {
      const response = await fetch(`/api/clients/${clientId}/a2p/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        setError({ section: "status", message: data?.error ?? "We couldn't change the status." });
        setBusy(null);
        return;
      }

      setStatus(next);
      setBusy(null);
      router.refresh();
    })();
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- readiness */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-950">A2P readiness</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {readiness.complete} of {readiness.total} items collected for {companyName}.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Badge tone={status === "APPROVED" ? "emerald" : status === "REJECTED" ? "rose" : "amber"}>
              {status.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
            </Badge>
            <span className="text-2xl font-semibold text-slate-950">{readiness.percent}%</span>
          </div>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              readiness.percent === 100 ? "bg-emerald-500" : "bg-indigo-500",
            )}
            style={{ width: `${readiness.percent}%` }}
          />
        </div>

        {/*
          * Says what full actually means. It is the agency having collected
          * what it needs - a carrier has still said nothing, and any wording
          * that sounded like approval would be a promise somebody else has to
          * keep.
          */}
        <p className="mt-2 text-xs text-slate-600">
          {readiness.headline}
          {readiness.percent === 100
            ? ". A carrier decision is separate and has not happened."
            : null}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {readiness.bySection.map((section) => (
            <div key={section.section} className="rounded-xl border border-slate-200 px-3 py-2">
              <p className="truncate text-[11px] text-slate-500">{section.label}</p>
              <p className="text-xs font-semibold text-slate-900">
                {section.complete} / {section.total}
              </p>
            </div>
          ))}
        </div>

        {readiness.missing.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-900">Still needed</p>
            <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {readiness.missing.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <Circle className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              Worth a look before submitting
            </p>
            <ul className="mt-1.5 space-y-1">
              {warnings.map((warning, index) => (
                <li key={index} className="text-[11px] text-amber-800">
                  &ldquo;{warning.sample}&rdquo; — {warning.warning}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-amber-700">
              These are prompts for a human, not rulings.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-xs text-slate-500">Registration status</span>
          <Select
            value={status}
            onChange={(event) => changeStatus(event.target.value)}
            disabled={busy === "status"}
            className="h-9 w-auto"
          >
            {[
              "NOT_REQUIRED",
              "INFORMATION_NEEDED",
              "UNDER_INTERNAL_REVIEW",
              "NEEDS_CLIENT_CHANGES",
              "READY_TO_SUBMIT",
              ...(canRecordDecision
                ? ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "NEEDS_RESUBMISSION"]
                : []),
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </Select>
          {!canRecordDecision ? (
            <span className="text-[11px] text-slate-400">
              Recording a provider decision needs additional permission.
            </span>
          ) : null}
          {error?.section === "status" ? (
            <span role="alert" className="text-[11px] text-rose-600">
              {error.message}
            </span>
          ) : null}
        </div>
      </section>

      {/* --------------------------------------------- business identity */}
      <Section
        title="Business identity"
        description="The registered entity, as it would appear on a registration."
        onSave={() =>
          saveSection("identity", [
            "legalName",
            "dbaName",
            "entityType",
            "countryOfRegistration",
            "taxId",
            "addressLine1",
            "addressLine2",
            "city",
            "stateRegion",
            "postalCode",
            "country",
            "businessPhone",
            "businessEmail",
            "websiteUrl",
          ])
        }
        saving={busy === "identity"}
        saved={saved === "identity"}
        error={error?.section === "identity" ? error.message : null}
      >
        <Field label="Legal business name" hint="The registered entity, not the trading name.">
          <Input value={str("legalName")} onChange={(e) => set({ legalName: e.target.value })} />
        </Field>
        <Field label="Trading or brand name">
          <Input value={str("dbaName")} onChange={(e) => set({ dbaName: e.target.value })} />
        </Field>
        <Field label="Entity type">
          <Select
            value={str("entityType")}
            onChange={(e) => set({ entityType: e.target.value || null })}
          >
            <option value="">Not answered</option>
            {["SOLE_PROPRIETOR", "LLC", "CORPORATION", "PARTNERSHIP", "NONPROFIT", "GOVERNMENT", "OTHER"].map(
              (value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                </option>
              ),
            )}
          </Select>
        </Field>
        <Field label="Country of registration">
          <Input
            value={str("countryOfRegistration")}
            onChange={(e) => set({ countryOfRegistration: e.target.value })}
          />
        </Field>
        <Field label="Tax ID or registration number">
          <Input value={str("taxId")} onChange={(e) => set({ taxId: e.target.value })} />
        </Field>
        <Field label="Business phone">
          <Input value={str("businessPhone")} onChange={(e) => set({ businessPhone: e.target.value })} />
        </Field>
        <Field label="Address" wide>
          <Input
            value={str("addressLine1")}
            onChange={(e) => set({ addressLine1: e.target.value })}
            placeholder="Street address"
          />
        </Field>
        <Field label="Suite, unit or floor">
          <Input value={str("addressLine2")} onChange={(e) => set({ addressLine2: e.target.value })} />
        </Field>
        <Field label="City">
          <Input value={str("city")} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label="State or region">
          <Input value={str("stateRegion")} onChange={(e) => set({ stateRegion: e.target.value })} />
        </Field>
        <Field label="Postcode">
          <Input value={str("postalCode")} onChange={(e) => set({ postalCode: e.target.value })} />
        </Field>
        <Field label="Country" hint="Where the business trades, which the registration country may differ from.">
          <Input value={str("country")} onChange={(e) => set({ country: e.target.value })} />
        </Field>
        <Field label="Business email">
          <Input value={str("businessEmail")} onChange={(e) => set({ businessEmail: e.target.value })} />
        </Field>
        <Field label="Website" wide>
          <Input value={str("websiteUrl")} onChange={(e) => set({ websiteUrl: e.target.value })} />
        </Field>
      </Section>

      {/* ------------------------------------------------ representative */}
      <Section
        title="Authorised representative"
        description="Somebody who can answer for the business."
        onSave={() =>
          saveSection("rep", [
            "representativeName",
            "representativeTitle",
            "representativeEmail",
            "representativePhone",
            "representativeRelation",
            "authorisationConfirmed",
          ])
        }
        saving={busy === "rep"}
        saved={saved === "rep"}
        error={error?.section === "rep" ? error.message : null}
      >
        <Field label="Full name">
          <Input
            value={str("representativeName")}
            onChange={(e) => set({ representativeName: e.target.value })}
          />
        </Field>
        <Field label="Job title">
          <Input
            value={str("representativeTitle")}
            onChange={(e) => set({ representativeTitle: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <Input
            value={str("representativeEmail")}
            onChange={(e) => set({ representativeEmail: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <Input
            value={str("representativePhone")}
            onChange={(e) => set({ representativePhone: e.target.value })}
          />
        </Field>
        <Field label="Relationship to the business" wide>
          <Input
            value={str("representativeRelation")}
            onChange={(e) => set({ representativeRelation: e.target.value })}
            placeholder="Owner, director, office manager"
          />
        </Field>
        <div className="sm:col-span-2">
          <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={Boolean(form.authorisationConfirmed)}
              onChange={(e) => set({ authorisationConfirmed: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-xs font-medium text-slate-800">
                This person has confirmed they are authorised to act for the business
              </span>
              <span className="block text-[11px] text-slate-500">
                The time is recorded when this is saved.
              </span>
            </span>
          </label>
        </div>
      </Section>

      {/* ------------------------------------------------------ campaign */}
      <Section
        title="What the messages are for"
        description="In the client's words. The carrier category is set internally."
        onSave={() =>
          saveSection("campaign", [
            "useCases",
            "useCaseOther",
            "internalUseCase",
            "clientCampaignDescription",
            "reviewedCampaignDescription",
            "monthlyVolume",
            "monthlyLeads",
            "messagesContainLinks",
            "linkDomains",
            "messagesContainPhoneNumbers",
          ])
        }
        saving={busy === "campaign"}
        saved={saved === "campaign"}
        error={error?.section === "campaign" ? error.message : null}
      >
        <div className="sm:col-span-2">
          <Field label="What will they use SMS for?">
            <CheckGroup
              options={USE_CASES}
              selected={list("useCases")}
              onChange={(next) => set({ useCases: next })}
            />
          </Field>
        </div>

        <Field label="What the client told us" hint="Kept exactly as written." wide>
          <Textarea
            rows={3}
            value={str("clientCampaignDescription")}
            onChange={(e) => set({ clientCampaignDescription: e.target.value })}
          />
        </Field>

        <Field
          label="Reviewed description"
          hint="The version that would be submitted. Who sends, who receives, why, and what for."
          wide
        >
          <Textarea
            rows={3}
            value={str("reviewedCampaignDescription")}
            onChange={(e) => set({ reviewedCampaignDescription: e.target.value })}
          />
        </Field>

        <Field label="Expected messages per month">
          <Input value={str("monthlyVolume")} onChange={(e) => set({ monthlyVolume: e.target.value })} />
        </Field>
        <Field label="Internal carrier use case" hint="Not asked of the client.">
          <Input
            value={str("internalUseCase")}
            onChange={(e) => set({ internalUseCase: e.target.value })}
          />
        </Field>
        <Field label="Will messages contain links?">
          <TriState value={bool("messagesContainLinks")} onChange={(v) => set({ messagesContainLinks: v })} />
        </Field>
        <Field label="Will messages contain phone numbers?">
          <TriState
            value={bool("messagesContainPhoneNumbers")}
            onChange={(v) => set({ messagesContainPhoneNumbers: v })}
          />
        </Field>
        {bool("messagesContainLinks") === true ? (
          <Field label="Domains used in messages" wide>
            <Input value={str("linkDomains")} onChange={(e) => set({ linkDomains: e.target.value })} />
          </Field>
        ) : null}
      </Section>

      {/* ------------------------------------------------------- consent */}
      <Section
        title="Consent and opt-in"
        description="How customers agreed to be texted, and the evidence for it."
        onSave={() =>
          saveSection("consent", [
            "optInMethods",
            "optInMethodOther",
            "consentLanguage",
            "optInPageUrl",
            "optInFormUrl",
            "optInCheckboxText",
            "checkboxIsOptional",
            "checkboxUncheckedByDefault",
            "privacyPolicyUrl",
            "termsUrl",
            "smsTermsUrl",
          ])
        }
        saving={busy === "consent"}
        saved={saved === "consent"}
        error={error?.section === "consent" ? error.message : null}
      >
        <div className="sm:col-span-2">
          <Field label="How do customers consent?">
            <CheckGroup
              options={OPT_IN_METHODS}
              selected={list("optInMethods")}
              onChange={(next) => set({ optInMethods: next })}
            />
          </Field>
        </div>

        <Field label="The consent wording customers see" wide>
          <Textarea
            rows={2}
            value={str("consentLanguage")}
            onChange={(e) => set({ consentLanguage: e.target.value })}
          />
        </Field>

        {/* Only asked when consent is collected on the web - a business using
            paper forms has no checkbox to describe. */}
        {webOptIn ? (
          <>
            <Field label="Opt-in page URL">
              <Input value={str("optInPageUrl")} onChange={(e) => set({ optInPageUrl: e.target.value })} />
            </Field>
            <Field label="Form URL">
              <Input value={str("optInFormUrl")} onChange={(e) => set({ optInFormUrl: e.target.value })} />
            </Field>
            <Field label="Checkbox wording" wide>
              <Textarea
                rows={2}
                value={str("optInCheckboxText")}
                onChange={(e) => set({ optInCheckboxText: e.target.value })}
              />
            </Field>
            <Field label="Is the checkbox optional?">
              <TriState value={bool("checkboxIsOptional")} onChange={(v) => set({ checkboxIsOptional: v })} />
            </Field>
            <Field label="Is it unticked by default?">
              <TriState
                value={bool("checkboxUncheckedByDefault")}
                onChange={(v) => set({ checkboxUncheckedByDefault: v })}
              />
            </Field>
          </>
        ) : null}

        <Field label="Privacy policy URL">
          <Input value={str("privacyPolicyUrl")} onChange={(e) => set({ privacyPolicyUrl: e.target.value })} />
        </Field>
        <Field label="Terms URL">
          <Input value={str("termsUrl")} onChange={(e) => set({ termsUrl: e.target.value })} />
        </Field>
      </Section>

      {/* ----------------------------------------------- sample messages */}
      <Section
        title="Sample messages"
        description="Examples of what would actually be sent."
        onSave={saveSamples}
        saving={busy === "samples"}
        saved={saved === "samples"}
        error={error?.section === "samples" ? error.message : null}
      >
        <div className="space-y-3 sm:col-span-2">
          {samples.map((sample, index) => (
            <div key={sample.id ?? `new-${index}`} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Select
                  value={sample.category}
                  onChange={(event) =>
                    setSamples((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, category: event.target.value as SampleValues["category"] }
                          : row,
                      ),
                    )
                  }
                  className="h-9 w-auto"
                >
                  <option value="TRANSACTIONAL">Transactional</option>
                  <option value="LEAD_FOLLOW_UP">Lead follow-up</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="OTHER">Other</option>
                </Select>
                <button
                  type="button"
                  onClick={() => setSamples((current) => current.filter((_, i) => i !== index))}
                  className="rounded-lg px-2 py-1 text-[11px] text-rose-600 transition hover:bg-rose-50"
                >
                  Remove
                </button>
              </div>
              <Textarea
                rows={2}
                value={sample.body}
                onChange={(event) =>
                  setSamples((current) =>
                    current.map((row, i) => (i === index ? { ...row, body: event.target.value } : row)),
                  )
                }
                placeholder="Riverbend: your appointment is Tuesday at 2pm. Reply STOP to opt out."
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setSamples((current) => [
                ...current,
                { id: null, category: "TRANSACTIONAL", body: "", reviewNote: "" },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Add a sample message
          </button>
        </div>
      </Section>

      {/* ---------------------------------------------------- phone setup */}
      <Section
        title="Phone and messaging setup"
        description="What the agency needs to configure the number and the inbox."
        onSave={() =>
          saveSection("phone", [
            "existingPhoneNumber",
            "keepExistingNumber",
            "needsNewNumber",
            "preferredAreaCode",
            "forwardingNumber",
            "inboundCallRecipient",
            "voicemailRequired",
            "smsInboxUsers",
            "primarySmsResponder",
            "businessHours",
            "afterHoursBehaviour",
            "repliesHandledBy",
            "isTwoWay",
            "needsMissedCallTextBack",
          ])
        }
        saving={busy === "phone"}
        saved={saved === "phone"}
        error={error?.section === "phone" ? error.message : null}
      >
        <Field label="Existing business number">
          <Input
            value={str("existingPhoneNumber")}
            onChange={(e) => set({ existingPhoneNumber: e.target.value })}
          />
        </Field>
        <Field label="Preferred area code for a new number">
          <Input
            value={str("preferredAreaCode")}
            onChange={(e) => set({ preferredAreaCode: e.target.value })}
          />
        </Field>
        <Field label="Keep the existing number?">
          <TriState value={bool("keepExistingNumber")} onChange={(v) => set({ keepExistingNumber: v })} />
        </Field>
        <Field label="Needs a new number?">
          <TriState value={bool("needsNewNumber")} onChange={(v) => set({ needsNewNumber: v })} />
        </Field>
        <Field label="Who answers replies?">
          <Input
            value={str("repliesHandledBy")}
            onChange={(e) => set({ repliesHandledBy: e.target.value })}
          />
        </Field>
        <Field label="Primary SMS responder">
          <Input
            value={str("primarySmsResponder")}
            onChange={(e) => set({ primarySmsResponder: e.target.value })}
          />
        </Field>
        <Field label="Business hours">
          <Input value={str("businessHours")} onChange={(e) => set({ businessHours: e.target.value })} />
        </Field>
        <Field label="After hours">
          <Input
            value={str("afterHoursBehaviour")}
            onChange={(e) => set({ afterHoursBehaviour: e.target.value })}
          />
        </Field>
        <Field label="Missed-call text back needed?">
          <TriState
            value={bool("needsMissedCallTextBack")}
            onChange={(v) => set({ needsMissedCallTextBack: v })}
          />
        </Field>
        <Field label="Two-way messaging?">
          <TriState value={bool("isTwoWay")} onChange={(v) => set({ isTwoWay: v })} />
        </Field>

        <p className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 sm:col-span-2">
          Passwords are never collected here. Platform access is requested and tracked in Files
          &amp; Access.
        </p>
      </Section>

      {/* ------------------------------------------------ submissions */}
      {submissions.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Submission history</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Every attempt, and what came back. Kept so a resubmission can be prepared against
              the reason the last one was refused.
            </p>
          </header>

          <ul className="divide-y divide-slate-100">
            {submissions.map((submission) => (
              <li key={submission.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900">
                    {submission.provider}
                    {submission.campaignId ? ` · ${submission.campaignId}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(submission.submittedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {submission.submittedByName ? ` · ${submission.submittedByName}` : ""}
                  </p>
                </div>
                {submission.providerStatus ? (
                  <p className="mt-0.5 text-[11px] text-slate-600">{submission.providerStatus}</p>
                ) : null}
                {submission.rejectedReason ? (
                  <p className="mt-0.5 text-[11px] text-rose-600">{submission.rejectedReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
