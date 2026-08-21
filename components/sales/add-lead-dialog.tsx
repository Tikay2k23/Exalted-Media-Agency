"use client";

import { ChevronDown, LoaderCircle, TriangleAlert, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ContactMatch } from "@/lib/sales/contact-matching";

const LEAD_SOURCES = [
  "WEBSITE_FORM",
  "PAID_ADS",
  "ORGANIC_SEARCH",
  "SOCIAL_MEDIA",
  "REFERRAL",
  "OUTBOUND",
  "PARTNER",
  "EVENT",
  "REPEAT_CLIENT",
  "OTHER",
] as const;

const SERVICE_TYPES = [
  "CRM_AUTOMATION",
  "PAID_ADVERTISING",
  "WEBSITE_SUPPORT",
  "FUNNEL_BUILD",
  "SEO",
  "SOCIAL_MEDIA_MANAGEMENT",
  "CONTENT_PRODUCTION",
  "BRAND_STRATEGY",
  "EMAIL_MARKETING",
  "FULL_SERVICE_RETAINER",
] as const;

const BUDGET_RANGES = [
  "Under $1,000",
  "$1,000–$2,500",
  "$2,500–$5,000",
  "$5,000–$10,000",
  "$10,000+",
] as const;

const TIMELINES = ["ASAP", "Within 30 Days", "1–3 Months", "3+ Months", "Not Sure"] as const;

/**
 * The moves a salesperson actually writes down.
 *
 * Offered as suggestions on a free-text field rather than as a closed list:
 * these cover most of it, and "call back after the board meeting on the 3rd" is
 * a better next action than anything a dropdown could have offered.
 */
const NEXT_ACTIONS = [
  "Call Lead",
  "Send Email",
  "Send SMS",
  "Book Strategy Call",
  "Follow Up",
  "Prepare Proposal",
  "Send Proposal",
] as const;

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface FormState {
  contactName: string;
  businessName: string;
  email: string;
  phone: string;
  opportunityName: string;
  source: string;
  serviceInterest: string;
  opportunityValue: string;
  budgetRange: string;
  timeline: string;
  isDecisionMaker: string;
  assignedToId: string;
  nextAction: string;
  nextFollowUpAt: string;
  expectedCloseAt: string;
  mainProblem: string;
  goal: string;
  currentSolution: string;
  qualificationNotes: string;
  campaign: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referralSource: string;
  tags: string;
  notes: string;
}

const EMPTY: FormState = {
  contactName: "",
  businessName: "",
  email: "",
  phone: "",
  opportunityName: "",
  source: "WEBSITE_FORM",
  serviceInterest: "",
  opportunityValue: "",
  budgetRange: "",
  timeline: "",
  isDecisionMaker: "",
  assignedToId: "",
  nextAction: "",
  nextFollowUpAt: "",
  expectedCloseAt: "",
  mainProblem: "",
  goal: "",
  currentSolution: "",
  qualificationNotes: "",
  campaign: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  referralSource: "",
  tags: "",
  notes: "",
};

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

/** A section that starts closed, so the quick path stays quick. */
function Collapsible({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span>
          <span className="block text-xs font-semibold text-slate-800">{title}</span>
          <span className="block text-[11px] text-slate-500">{hint}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="space-y-3 border-t border-slate-100 p-3">{children}</div> : null}
    </section>
  );
}

function Labelled({
  label: text,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-slate-600">
        {text}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

/**
 * Add Lead, and the same form as Create Opportunity.
 *
 * One component for both, because they are the same twenty fields with one
 * difference: whether a contact is being created or reused. Two forms would
 * have drifted the first time somebody added a field to one of them.
 *
 * The duplicate check runs while the form is still open rather than on submit,
 * so the warning arrives before the rest of it has been filled in - and it
 * offers the alternatives instead of just refusing. A CRM that silently creates
 * the second copy of an account is the reason nobody trusts its numbers.
 */
export function AddLeadDialog({
  owners,
  canAssign,
  contact,
  onClose,
  onCreated,
}: {
  owners: { id: string; name: string }[];
  canAssign: boolean;
  /** Set to attach the new opportunity to a contact that already exists. */
  contact?: { id: string; name: string; businessName: string } | null;
  onClose: () => void;
  onCreated: (leadId: string, message: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    contactName: contact?.name ?? "",
    businessName: contact?.businessName ?? "",
  });
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [blocked, setBlocked] = useState<ContactMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const forExistingContact = Boolean(contact);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** The live duplicate check. Skipped entirely when the contact is known. */
  async function checkDuplicates() {
    if (forExistingContact) return;

    const query = new URLSearchParams();

    if (form.email.trim()) query.set("email", form.email.trim());
    if (form.phone.trim()) query.set("phone", form.phone.trim());
    if (form.businessName.trim()) query.set("company", form.businessName.trim());

    if (![...query.keys()].length) {
      setMatches([]);
      return;
    }

    const response = await fetch(`/api/contacts?${query.toString()}`);

    if (!response.ok) return;

    const data = (await response.json()) as { matches: ContactMatch[] };

    setMatches(data.matches);
  }

  function payload(extra: Record<string, unknown> = {}) {
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    return {
      ...(forExistingContact
        ? {}
        : {
            contactName: form.contactName.trim(),
            businessName: form.businessName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
          }),
      opportunityName: form.opportunityName.trim(),
      source: form.source,
      serviceInterest: form.serviceInterest || null,
      opportunityValue: form.opportunityValue === "" ? null : Number(form.opportunityValue),
      budgetRange: form.budgetRange,
      timeline: form.timeline,
      isDecisionMaker:
        form.isDecisionMaker === "" ? null : form.isDecisionMaker === "yes",
      assignedToId: form.assignedToId,
      nextAction: form.nextAction.trim(),
      nextFollowUpAt: form.nextFollowUpAt,
      expectedCloseAt: form.expectedCloseAt,
      mainProblem: form.mainProblem.trim(),
      goal: form.goal.trim(),
      currentSolution: form.currentSolution.trim(),
      qualificationNotes: form.qualificationNotes.trim(),
      campaign: form.campaign.trim(),
      utmSource: form.utmSource.trim(),
      utmMedium: form.utmMedium.trim(),
      utmCampaign: form.utmCampaign.trim(),
      referralSource: form.referralSource.trim(),
      tags,
      notes: form.notes.trim(),
      ...extra,
    };
  }

  async function submit(extra: Record<string, unknown> = {}) {
    setSaving(true);
    setError(null);

    const url = contact
      ? `/api/contacts/${contact.id}/opportunities`
      : "/api/leads";

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(extra)),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          error?: string;
          code?: string;
          matches?: ContactMatch[];
          leadId?: string;
          contactName?: string;
          stageName?: string;
          usedExistingContact?: boolean;
        }
      | null;

    setSaving(false);

    if (!response.ok) {
      // Not an error so much as a question: which of these did you mean?
      if (data?.code === "DUPLICATE_CONTACT") {
        setBlocked(data.matches ?? []);
        return;
      }

      setError(data?.error ?? "That didn't save.");
      return;
    }

    startTransition(() => router.refresh());

    onCreated(
      data?.leadId ?? "",
      data?.usedExistingContact
        ? `Added an opportunity for ${data?.contactName ?? "this contact"}.`
        : `${data?.contactName ?? "The lead"} was added to ${data?.stageName ?? "New Lead"}.`,
    );
  }

  const canSubmit =
    forExistingContact
    || (form.contactName.trim().length >= 2
      && (form.email.trim().length > 0 || form.phone.trim().length > 0));

  const body = (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              {forExistingContact ? "Existing contact" : "Sales"}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950">
              {forExistingContact ? `New opportunity for ${contact?.name}` : "Add Lead"}
            </h2>
            <p className="text-xs text-slate-500">
              {forExistingContact
                ? "Attached to the contact you already have. No second contact is created."
                : "Creates the contact and their first opportunity in one step."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* The duplicate decision replaces the form rather than sitting under it. */}
        {blocked ? (
          <div className="space-y-4 overflow-y-auto p-5">
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  This contact may already exist.
                </p>
                <p className="text-xs text-amber-800">
                  Adding another opportunity to the existing contact keeps one relationship in
                  one place.
                </p>
              </div>
            </div>

            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {blocked.map((match) => (
                <li
                  key={match.contact.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {match.contact.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {match.contact.businessName}
                      {match.contact.email ? ` · ${match.contact.email}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {match.reason} ·{" "}
                      {match.contact.opportunityCount === 1
                        ? "1 opportunity"
                        : `${match.contact.opportunityCount} opportunities`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void submit({ contactId: match.contact.id })}
                  >
                    Add opportunity here
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setBlocked(null)}>
                Back to the form
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => void submit({ allowDuplicate: true })}
              >
                Create a separate contact anyway
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-5 overflow-y-auto p-5">
              {error ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
              ) : null}

              {!forExistingContact ? (
                <Group title="Basic information">
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                    <Labelled label="Contact name" required>
                      <Input
                        className="h-9 text-sm"
                        value={form.contactName}
                        onChange={(event) => set("contactName", event.target.value)}
                        placeholder="Dr Steven Hale"
                      />
                    </Labelled>
                    <Labelled label="Business name">
                      <Input
                        className="h-9 text-sm"
                        value={form.businessName}
                        onChange={(event) => set("businessName", event.target.value)}
                        onBlur={checkDuplicates}
                        placeholder="Best Life Chiropractic"
                      />
                    </Labelled>
                    <Labelled label="Email">
                      <Input
                        type="email"
                        className="h-9 text-sm"
                        value={form.email}
                        onChange={(event) => set("email", event.target.value)}
                        onBlur={checkDuplicates}
                        placeholder="steven@bestlifechiro.com"
                      />
                    </Labelled>
                    <Labelled label="Phone">
                      <Input
                        className="h-9 text-sm"
                        value={form.phone}
                        onChange={(event) => set("phone", event.target.value)}
                        onBlur={checkDuplicates}
                        placeholder="(555) 010-9987"
                      />
                    </Labelled>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    A name plus either an email or a phone number. Anything else can wait.
                  </p>

                  {matches.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-semibold text-amber-900">
                        {matches.length === 1
                          ? "One contact looks like this one."
                          : `${matches.length} contacts look like this one.`}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {matches.slice(0, 3).map((match) => (
                          <li
                            key={match.contact.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900"
                          >
                            <span className="min-w-0 truncate">
                              {match.contact.name} · {match.contact.businessName}
                              <span className="text-amber-700"> — {match.reason}</span>
                            </span>
                            <button
                              type="button"
                              className="shrink-0 font-semibold underline"
                              onClick={() => void submit({ contactId: match.contact.id })}
                            >
                              Add opportunity here
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Group>
              ) : null}

              <Group title="Sales information">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                  <Labelled label="Opportunity name">
                    <Input
                      className="h-9 text-sm"
                      value={form.opportunityName}
                      onChange={(event) => set("opportunityName", event.target.value)}
                      placeholder="Named after the service if left blank"
                    />
                  </Labelled>
                  <Labelled label="Lead source" required>
                    <Select
                      className="h-9 text-sm"
                      value={form.source}
                      onChange={(event) => set("source", event.target.value)}
                    >
                      {LEAD_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {label(source)}
                        </option>
                      ))}
                    </Select>
                  </Labelled>
                  <Labelled label="Service interest">
                    <Select
                      className="h-9 text-sm"
                      value={form.serviceInterest}
                      onChange={(event) => set("serviceInterest", event.target.value)}
                    >
                      <option value="">Not sure yet</option>
                      {SERVICE_TYPES.map((service) => (
                        <option key={service} value={service}>
                          {label(service)}
                        </option>
                      ))}
                    </Select>
                  </Labelled>
                  <Labelled label="Opportunity value">
                    <Input
                      type="number"
                      min={0}
                      className="h-9 text-sm"
                      value={form.opportunityValue}
                      onChange={(event) => set("opportunityValue", event.target.value)}
                      placeholder="4000"
                    />
                  </Labelled>
                  {/*
                    Budget, timeline and decision maker are asked once, here.
                    The spec lists them under qualification too; two controls
                    writing one column would be two answers to one question.
                  */}
                  <Labelled label="Budget range">
                    <Select
                      className="h-9 text-sm"
                      value={form.budgetRange}
                      onChange={(event) => set("budgetRange", event.target.value)}
                    >
                      <option value="">Not discussed</option>
                      {BUDGET_RANGES.map((range) => (
                        <option key={range} value={range}>
                          {range}
                        </option>
                      ))}
                    </Select>
                  </Labelled>
                  <Labelled label="Timeline">
                    <Select
                      className="h-9 text-sm"
                      value={form.timeline}
                      onChange={(event) => set("timeline", event.target.value)}
                    >
                      <option value="">Not discussed</option>
                      {TIMELINES.map((timeline) => (
                        <option key={timeline} value={timeline}>
                          {timeline}
                        </option>
                      ))}
                    </Select>
                  </Labelled>
                  <Labelled label="Decision maker">
                    <Select
                      className="h-9 text-sm"
                      value={form.isDecisionMaker}
                      onChange={(event) => set("isDecisionMaker", event.target.value)}
                    >
                      <option value="">Unknown</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </Select>
                  </Labelled>
                  <Labelled label="Expected close date">
                    <Input
                      type="date"
                      className="h-9 text-sm"
                      value={form.expectedCloseAt}
                      onChange={(event) => set("expectedCloseAt", event.target.value)}
                    />
                  </Labelled>
                </div>
              </Group>

              <Group title="Ownership and next step">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
                  <Labelled label="Assigned to">
                    <Select
                      className="h-9 text-sm"
                      value={form.assignedToId}
                      disabled={!canAssign}
                      onChange={(event) => set("assignedToId", event.target.value)}
                    >
                      <option value="">{canAssign ? "Unassigned" : "You"}</option>
                      {owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name}
                        </option>
                      ))}
                    </Select>
                  </Labelled>
                  <Labelled label="Next action">
                    <Input
                      className="h-9 text-sm"
                      list="next-action-suggestions"
                      value={form.nextAction}
                      onChange={(event) => set("nextAction", event.target.value)}
                      placeholder="Call Lead"
                    />
                    <datalist id="next-action-suggestions">
                      {NEXT_ACTIONS.map((action) => (
                        <option key={action} value={action} />
                      ))}
                    </datalist>
                  </Labelled>
                  <Labelled label="Next follow up">
                    <Input
                      type="datetime-local"
                      className="h-9 text-sm"
                      value={form.nextFollowUpAt}
                      onChange={(event) => set("nextFollowUpAt", event.target.value)}
                    />
                  </Labelled>
                </div>
                <p className="text-[11px] text-slate-500">
                  An opportunity with an owner and a next step is one somebody is actually
                  working.
                </p>
              </Group>

              <Collapsible
                title="Qualification details"
                hint="Optional. Fill these in now or from the opportunity later."
              >
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                  <Labelled label="Main problem">
                    <Textarea
                      rows={2}
                      className="text-sm"
                      value={form.mainProblem}
                      onChange={(event) => set("mainProblem", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="Goal or desired outcome">
                    <Textarea
                      rows={2}
                      className="text-sm"
                      value={form.goal}
                      onChange={(event) => set("goal", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="Current solution">
                    <Textarea
                      rows={2}
                      className="text-sm"
                      value={form.currentSolution}
                      onChange={(event) => set("currentSolution", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="Qualification notes">
                    <Textarea
                      rows={2}
                      className="text-sm"
                      value={form.qualificationNotes}
                      onChange={(event) => set("qualificationNotes", event.target.value)}
                    />
                  </Labelled>
                </div>
              </Collapsible>

              <Collapsible
                title="Advanced tracking"
                hint="Campaign and UTM detail. Never required for a lead typed in by hand."
              >
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                  <Labelled label="Campaign">
                    <Input
                      className="h-9 text-sm"
                      value={form.campaign}
                      onChange={(event) => set("campaign", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="Referral source">
                    <Input
                      className="h-9 text-sm"
                      value={form.referralSource}
                      onChange={(event) => set("referralSource", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="UTM source">
                    <Input
                      className="h-9 text-sm"
                      value={form.utmSource}
                      onChange={(event) => set("utmSource", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="UTM medium">
                    <Input
                      className="h-9 text-sm"
                      value={form.utmMedium}
                      onChange={(event) => set("utmMedium", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="UTM campaign">
                    <Input
                      className="h-9 text-sm"
                      value={form.utmCampaign}
                      onChange={(event) => set("utmCampaign", event.target.value)}
                    />
                  </Labelled>
                  <Labelled label="Tags">
                    <Input
                      className="h-9 text-sm"
                      value={form.tags}
                      onChange={(event) => set("tags", event.target.value)}
                      placeholder="Enterprise, Referral Partner"
                    />
                  </Labelled>
                </div>
                <Labelled label="Internal notes">
                  <Textarea
                    rows={3}
                    className="text-sm"
                    value={form.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                </Labelled>
              </Collapsible>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
              <p className="text-[11px] text-slate-500">
                Opens at New Lead, on the Exalted Media sales pipeline.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!canSubmit || saving} onClick={() => void submit()}>
                  {saving ? (
                    <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {forExistingContact ? "Create opportunity" : "Create lead"}
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
