"use client";

import {
  Building2,
  Download,
  Mail,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
  StickyNote,
  Upload,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { AccountDialog } from "@/components/clients/account-dialog";
import {
  CommercialsDialog,
  NextStepDialog,
  type NextStepValues,
} from "@/components/clients/account-commercial-editors";
import {
  CompanyDialog,
  ContactDialog,
  EMPTY_CONTACT,
  InternalNoteDialog,
  OwnershipDialog,
  type CompanyValues,
  type ContactValues,
  type OwnershipSeat,
} from "@/components/clients/account-editors";
import { Monogram, money } from "@/components/clients/client-bits";
import { ClientOverviewFooter } from "@/components/clients/client-overview-footer";
import { TabLink } from "@/components/clients/client-tabs";
import { Badge } from "@/components/ui/badge";
import { cn, formatEnumLabel } from "@/lib/utils";

/**
 * Clients → open a client → Account.
 *
 * The one place stable facts about the account live: who the company is, who
 * holds it internally, what was agreed commercially, who to talk to, and the
 * standing note about dealing with them. Everything that changes week to week -
 * work, approvals, reports - belongs to the other tabs and is only linked to
 * from here.
 *
 * Nothing on this page is invented. Where the application has no value it says
 * so and offers the control that would set one, because "Not provided" beside
 * an Edit button is useful and a plausible-looking placeholder is not.
 */

export interface AccountContact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  isApprover: boolean;
  communicationPreference: string | null;
  status: string;
}

export interface AccountContract {
  id: string;
  title: string;
  agreementStatus: string;
  recurringFee: number | null;
  contractValue: number | null;
  billingCadence: string;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  paymentTerms: string | null;
  autoRenew: boolean;
  documentUrl: string | null;
}

export interface AccountCompany extends CompanyValues {
  companyName: string;
  monthlyValue: number | null;
}

/* -------------------------------------------------------------------------- */
/* Furniture                                                                  */
/* -------------------------------------------------------------------------- */

function Card({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** The small outlined Edit in every card header. */
function EditButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

/** A label/value row. Missing values say so rather than showing a dash. */
function Row({
  label,
  children,
  missing,
}: {
  label: string;
  children?: React.ReactNode;
  missing?: string;
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-2">
      <span className="w-36 shrink-0 text-xs text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 text-xs text-slate-900">
        {children ?? <span className="text-slate-400">{missing ?? "Not provided"}</span>}
      </span>
    </div>
  );
}

export const CADENCE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

/** A date input wants YYYY-MM-DD, not an ISO timestamp. */
function dateInput(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function shortDate(value: string | null) {
  if (!value) return null;

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "in 12 months", the helper the reference prints beside the renewal date. */
export function monthsAway(value: string | null, now: Date) {
  if (!value) return null;

  const target = new Date(value);
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());

  if (months < 0) return `${Math.abs(months)} months ago`;
  if (months === 0) return "this month";

  return `in ${months} month${months === 1 ? "" : "s"}`;
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                   */
/* -------------------------------------------------------------------------- */

/** The badge under a contact's name, from the flags the record already carries. */
function contactBadge(contact: AccountContact) {
  if (contact.isPrimary) return { label: "Primary Contact", tone: "violet" as const };
  if (contact.isApprover) return { label: "Authorized Approver", tone: "emerald" as const };
  if (contact.isDecisionMaker) return { label: "Decision Maker", tone: "sky" as const };

  return null;
}

function ContactRowMenu({
  contact,
  canEdit,
  onEdit,
  onSetPrimary,
  onToggleApprover,
  onDeactivate,
}: {
  contact: AccountContact;
  canEdit: boolean;
  onEdit: () => void;
  onSetPrimary: () => void;
  onToggleApprover: () => void;
  onDeactivate: () => void;
}) {
  const [open, setOpen] = useState(false);

  /*
   * Only actions that would do something. "Set as primary contact" on the
   * person who already is one is a click that changes nothing, and a menu full
   * of those trains people not to open it.
   */
  const items: { label: string; run: () => void; danger?: boolean }[] = [
    ...(contact.email
      ? [{ label: "Send email", run: () => { window.location.href = `mailto:${contact.email}`; } }]
      : []),
    ...(contact.phone
      ? [{ label: "Send SMS", run: () => { window.location.href = `sms:${contact.phone}`; } }]
      : []),
    ...(canEdit ? [{ label: "Edit contact", run: onEdit }] : []),
    ...(canEdit && !contact.isPrimary && contact.status === "ACTIVE"
      ? [{ label: "Set as primary contact", run: onSetPrimary }]
      : []),
    ...(canEdit && contact.status === "ACTIVE"
      ? [
          {
            label: contact.isApprover
              ? "Remove as authorised approver"
              : "Set as authorised approver",
            run: onToggleApprover,
          },
        ]
      : []),
    ...(canEdit && contact.status === "ACTIVE"
      ? [{ label: "Deactivate contact", run: onDeactivate, danger: true }]
      : []),
  ];

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Actions for ${contact.name}`}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          {/*
            * Anchored right: this menu is the last cell of the table, hard
            * against the card's right edge.
            */}
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.run();
                }}
                className={cn(
                  "block w-full rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-slate-50",
                  item.danger ? "text-rose-600" : "text-slate-700",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

export function ClientAccount({
  clientId,
  company,
  contacts,
  contract,
  ownership,
  users,
  internalNote,
  noteAuthor,
  noteUpdatedAt,
  nextStep,
  canEdit,
  canSeeFinance,
  canEditFinance,
  serverNow,
}: {
  clientId: string;
  company: AccountCompany;
  contacts: AccountContact[];
  contract: AccountContract | null;
  ownership: { assignedUserId: string | null; owner: string | null; seats: OwnershipSeat[] };
  users: { id: string; name: string; teamRole: string }[];
  internalNote: string | null;
  noteAuthor: string | null;
  noteUpdatedAt: string | null;
  /** Blocker and next action, which three other pages read. */
  nextStep: NextStepValues;
  canEdit: boolean;
  canSeeFinance: boolean;
  /** Editing what the account is worth needs finance.edit, not clients.edit. */
  canEditFinance: boolean;
  serverNow: string;
}) {
  const [editing, setEditing] = useState<
    null | "company" | "ownership" | "note" | "commercials" | "nextStep"
  >(null);
  const [contactForm, setContactForm] = useState<ContactValues | null>(null);
  const [confirming, setConfirming] = useState<null | { contact: AccountContact; kind: "deactivate" }>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const now = new Date(serverNow);
  const primary = contacts.find((contact) => contact.isPrimary) ?? null;
  const nameOf = new Map(users.map((user) => [user.id, user.name]));

  const address = [
    company.addressLine1,
    company.addressLine2,
    [company.city, company.stateRegion, company.postalCode].filter(Boolean).join(", "),
    company.country,
  ].filter((line) => line && line.trim().length > 0);

  /*
   * One number for what the client pays.
   *
   * The header and this card both read Client.monthlyValue. The contract's
   * recurringFee is shown beside it only when the two disagree, because that
   * disagreement is a real thing somebody should fix rather than something to
   * paper over by silently preferring one.
   */
  const contractFee = contract?.recurringFee ?? null;
  const feeMismatch =
    canSeeFinance
    && contractFee !== null
    && company.monthlyValue !== null
    && Math.abs(contractFee - company.monthlyValue) > 0.005;

  const termMonths =
    contract?.startDate && contract?.endDate
      ? Math.max(
          1,
          Math.round(
            (new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime())
              / (30.44 * 86_400_000),
          ),
        )
      : null;

  /** PATCHes one contact flag through the same route the edit dialog uses. */
  function patchContact(contact: AccountContact, changes: Partial<ContactValues>) {
    setRowError(null);

    void (async () => {
      const response = await fetch(`/api/clients/${clientId}/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contact.name,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          role: contact.role ?? "",
          isPrimary: contact.isPrimary,
          isDecisionMaker: contact.isDecisionMaker,
          isApprover: contact.isApprover,
          communicationPreference: contact.communicationPreference ?? "",
          status: contact.status,
          ...changes,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        setRowError(data?.error ?? "We couldn't update that contact.");
        return;
      }

      window.location.reload();
    })();
  }

  return (
    <div className="space-y-4">
      {editing === "company" ? (
        <CompanyDialog
          clientId={clientId}
          companyName={company.companyName}
          canSeeTaxId={canSeeFinance}
          values={{
            legalName: company.legalName,
            website: company.website,
            industry: company.industry,
            addressLine1: company.addressLine1,
            addressLine2: company.addressLine2,
            city: company.city,
            stateRegion: company.stateRegion,
            postalCode: company.postalCode,
            country: company.country,
            businessPhone: company.businessPhone,
            businessEmail: company.businessEmail,
            serviceArea: company.serviceArea,
            taxId: company.taxId,
            timezone: company.timezone,
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {editing === "ownership" ? (
        <OwnershipDialog
          clientId={clientId}
          companyName={company.companyName}
          assignedUserId={ownership.assignedUserId}
          seats={ownership.seats}
          users={users}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {editing === "note" ? (
        <InternalNoteDialog
          clientId={clientId}
          companyName={company.companyName}
          note={internalNote ?? ""}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {editing === "commercials" ? (
        <CommercialsDialog
          clientId={clientId}
          companyName={company.companyName}
          hasContractRow={contract !== null}
          values={{
            monthlyValue: company.monthlyValue === null ? "" : String(company.monthlyValue),
            contractStartDate: dateInput(contract?.startDate ?? null),
            contractEndDate: dateInput(contract?.endDate ?? null),
            renewalDate: dateInput(contract?.renewalDate ?? null),
            billingCadence: contract?.billingCadence ?? "MONTHLY",
            agreementStatus: contract?.agreementStatus ?? "NOT_SENT",
            paymentTerms: contract?.paymentTerms ?? "",
            autoRenew: contract?.autoRenew ?? false,
            documentUrl: contract?.documentUrl ?? "",
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {editing === "nextStep" ? (
        <NextStepDialog
          clientId={clientId}
          companyName={company.companyName}
          values={nextStep}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {contactForm ? (
        <ContactDialog
          clientId={clientId}
          companyName={company.companyName}
          contact={contactForm}
          currentPrimaryName={primary?.name ?? null}
          onClose={() => setContactForm(null)}
        />
      ) : null}

      {confirming ? (
        <AccountDialog
          title="Deactivate this contact?"
          subtitle={confirming.contact.name}
          isDirty={false}
          isSaving={false}
          error={rowError}
          submitLabel="Deactivate"
          onClose={() => setConfirming(null)}
          onSubmit={() => {
            patchContact(confirming.contact, { status: "INACTIVE" });
            setConfirming(null);
          }}
        >
          <p className="text-sm leading-6 text-slate-700">
            {confirming.contact.name} stays on every approval and review they are already
            named on, and stops appearing as somebody to contact.
          </p>
        </AccountDialog>
      ) : null}

      {rowError ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {rowError}
        </p>
      ) : null}

      {/*
        * Two columns at desktop, roughly the reference's 44/56. minmax(0,…)
        * because these cards hold long addresses and email addresses, and a
        * plain fr track cannot shrink below its content.
        */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
        {/* ---------------------------------------------------- company */}
        <Card
          title="Company Information"
          action={canEdit ? <EditButton onClick={() => setEditing("company")} /> : null}
        >
          <div className="flex gap-4 border-t border-slate-100 py-3 pl-5 pr-0">
            <span
              aria-hidden
              className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600"
            >
              <Building2 className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1 divide-y divide-slate-50">
              <Row label="Legal business name">{company.legalName || null}</Row>
              <Row label="Website">
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-sky-600 hover:text-sky-700"
                  >
                    {company.website.replace(/^https?:\/\//i, "")}
                  </a>
                ) : null}
              </Row>
              <Row label="Industry">{company.industry || null}</Row>
              <Row label="Address">
                {address.length > 0 ? (
                  <span className="block whitespace-pre-line">{address.join("\n")}</span>
                ) : null}
              </Row>
              <Row label="Business phone">
                {company.businessPhone ? (
                  <a href={`tel:${company.businessPhone}`} className="hover:text-emerald-700">
                    {company.businessPhone}
                  </a>
                ) : null}
              </Row>
              <Row label="Business email">
                {company.businessEmail ? (
                  <a
                    href={`mailto:${company.businessEmail}`}
                    className="break-all text-sky-600 hover:text-sky-700"
                  >
                    {company.businessEmail}
                  </a>
                ) : null}
              </Row>
              <Row label="Service area">{company.serviceArea || null}</Row>
              {/* Finance data: a specialist has no business reading it. */}
              {canSeeFinance ? <Row label="Tax ID / EIN">{company.taxId || null}</Row> : null}
            </div>
          </div>
        </Card>

        {/* -------------------------------------------------- ownership */}
        <Card
          title="Account Ownership"
          action={canEdit ? <EditButton onClick={() => setEditing("ownership")} /> : null}
        >
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            <li className="flex items-center gap-4 px-5 py-3">
              <span className="w-36 shrink-0 text-xs text-slate-500">Account Owner</span>
              <SeatValue name={ownership.owner} />
            </li>

            {/*
              * The seats this account actually has, from its workstreams. The
              * list is different per client because it comes from the service
              * they bought - a website account has a creative specialist, an
              * ads account has an ads specialist.
              */}
            {ownership.seats.map((seat) => (
              <li key={seat.role} className="flex items-center gap-4 px-5 py-3">
                <span className="w-36 shrink-0 text-xs text-slate-500">{seat.label}</span>
                <SeatValue name={seat.ownerId ? nameOf.get(seat.ownerId) ?? null : null} />
              </li>
            ))}
          </ul>
        </Card>

        {/* --------------------------------------------------- contract */}
        <Card
          title="Contract & Commercials"
          action={
            <div className="flex shrink-0 items-center gap-2">
              {contract ? (
                <Badge tone={contract.agreementStatus === "SIGNED" ? "emerald" : "amber"}>
                  {contract.agreementStatus === "SIGNED"
                    ? "Active Contract"
                    : formatEnumLabel(contract.agreementStatus)}
                </Badge>
              ) : (
                <Badge tone="slate">No contract</Badge>
              )}
              {/* Editing the terms is finance work, so it follows finance.edit
                  rather than the clients.edit that gates the other cards. */}
              {canEditFinance ? <EditButton onClick={() => setEditing("commercials")} /> : null}
            </div>
          }
        >
          {!canSeeFinance ? (
            /*
              * Names the seat, not a vague tier. This read "account owners and
              * managers", which a project manager reasonably takes to include
              * them - and they are the seat most likely to be looking. Only
              * AGENCY_OWNER holds finance.view.
              */
            <p className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
              Commercial terms are visible to the agency owner.
            </p>
          ) : (
            <div className="divide-y divide-slate-50 border-t border-slate-100 py-2">
              <Row label="Monthly recurring value">
                {company.monthlyValue !== null ? (
                  <span className="font-semibold text-slate-950">
                    {money(company.monthlyValue)}
                    {feeMismatch ? (
                      <span className="ml-2 font-normal text-amber-600">
                        contract says {money(contractFee!)}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </Row>
              <Row label="Contract start date" missing="Not set">
                {shortDate(contract?.startDate ?? null)}
              </Row>
              <Row label="Renewal date" missing="No renewal date">
                {contract?.renewalDate ? (
                  <>
                    {shortDate(contract.renewalDate)}
                    <span className="ml-1.5 text-slate-400">
                      ({monthsAway(contract.renewalDate, now)})
                    </span>
                  </>
                ) : null}
              </Row>
              <Row label="Contract term" missing="Not set">
                {termMonths ? `${termMonths} months` : null}
              </Row>
              <Row label="Payment terms">{contract?.paymentTerms || null}</Row>
              <Row label="Billing cycle" missing="Not set">
                {contract ? formatEnumLabel(contract.billingCadence) : null}
              </Row>
              <Row label="Contract status" missing="No contract configured">
                {contract ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        contract.agreementStatus === "SIGNED" ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    {formatEnumLabel(contract.agreementStatus)}
                  </span>
                ) : null}
              </Row>
              <Row label="Next invoice date" missing="Not scheduled">
                {contract?.startDate && CADENCE_MONTHS[contract.billingCadence]
                  ? shortDate(nextInvoiceDate(contract, now))
                  : null}
              </Row>
              <Row label="Auto-renewal">
                {contract ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        contract.autoRenew ? "bg-emerald-500" : "bg-slate-300",
                      )}
                    />
                    {contract.autoRenew ? "Enabled" : "Disabled"}
                  </span>
                ) : null}
              </Row>
            </div>
          )}
        </Card>

        {/* --------------------------------------------------- contacts */}
        <Card
          title="Key Contacts"
          action={
            canEdit ? (
              <button
                type="button"
                onClick={() => setContactForm(EMPTY_CONTACT)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Contact
              </button>
            ) : null
          }
        >
          {contacts.length === 0 ? (
            <div className="border-t border-slate-100 px-5 py-6 text-center">
              <p className="text-xs text-slate-500">No contacts added yet.</p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setContactForm(EMPTY_CONTACT)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add Contact
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {/* Table from md up; cards below it, because five columns on a
                  phone is either a squeeze or a sideways scroll. */}
              <div className="hidden overflow-x-auto border-t border-slate-100 md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["Contact", "Role", "Email", "Phone", "Status", ""].map((heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contacts.map((contact) => {
                      const badge = contactBadge(contact);

                      return (
                        <tr key={contact.id} className="align-middle">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <Monogram name={contact.name} size="md" />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-slate-900">
                                  {contact.name}
                                </p>
                                {badge ? (
                                  <Badge tone={badge.tone} className="mt-0.5 px-2 py-0.5 text-[10px]">
                                    {badge.label}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {contact.role || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {contact.email ? (
                              <a
                                href={`mailto:${contact.email}`}
                                className="break-all text-sky-600 hover:text-sky-700"
                              >
                                {contact.email}
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                            {contact.phone ? (
                              <a href={`tel:${contact.phone}`} className="hover:text-emerald-700">
                                {contact.phone}
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={contact.status === "ACTIVE" ? "emerald" : "slate"}>
                              {formatEnumLabel(contact.status)}
                            </Badge>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <ContactRowMenu
                              contact={contact}
                              canEdit={canEdit}
                              onEdit={() => setContactForm(toValues(contact))}
                              onSetPrimary={() => patchContact(contact, { isPrimary: true })}
                              onToggleApprover={() =>
                                patchContact(contact, { isApprover: !contact.isApprover })
                              }
                              onDeactivate={() => setConfirming({ contact, kind: "deactivate" })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden">
                {contacts.map((contact) => {
                  const badge = contactBadge(contact);

                  return (
                    <li key={contact.id} className="flex items-start gap-3 p-4">
                      <Monogram name={contact.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {contact.name}
                          </p>
                          {badge ? (
                            <Badge tone={badge.tone} className="px-2 py-0.5 text-[10px]">
                              {badge.label}
                            </Badge>
                          ) : null}
                        </div>
                        {contact.role ? (
                          <p className="text-[11px] text-slate-500">{contact.role}</p>
                        ) : null}
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="mt-1 block break-all text-[11px] text-sky-600"
                          >
                            {contact.email}
                          </a>
                        ) : null}
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="block text-[11px] text-slate-600">
                            {contact.phone}
                          </a>
                        ) : null}
                        <Badge
                          tone={contact.status === "ACTIVE" ? "emerald" : "slate"}
                          className="mt-1.5 px-2 py-0.5 text-[10px]"
                        >
                          {formatEnumLabel(contact.status)}
                        </Badge>
                      </div>
                      <ContactRowMenu
                        contact={contact}
                        canEdit={canEdit}
                        onEdit={() => setContactForm(toValues(contact))}
                        onSetPrimary={() => patchContact(contact, { isPrimary: true })}
                        onToggleApprover={() =>
                          patchContact(contact, { isApprover: !contact.isApprover })
                        }
                        onDeactivate={() => setConfirming({ contact, kind: "deactivate" })}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

        {/* ----------------------------------------------------- notes */}
        <Card
          title="Internal Notes"
          action={canEdit ? <EditButton onClick={() => setEditing("note")} /> : null}
        >
          <div className="flex gap-3 border-t border-slate-100 p-5">
            <span
              aria-hidden
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"
            >
              <StickyNote className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              {internalNote ? (
                <>
                  <p className="whitespace-pre-wrap text-xs leading-6 text-slate-800">
                    {internalNote}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {noteAuthor ? `Added by ${noteAuthor} · ` : ""}
                    {noteUpdatedAt ? shortDate(noteUpdatedAt) : ""}
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-400">
                  No internal account note yet. This is the standing note about dealing with
                  this client; dated entries belong in Add Note.
                </p>
              )}
            </div>
          </div>

          {/*
            * What is stopping the account and what happens next.
            *
            * Under the standing note because both are internal annotations
            * rather than terms of the agreement - and they need to live
            * somewhere, because a recorded blocker turns journey health to
            * Blocked on three pages and an empty next action is one of the
            * reasons Needs Attention lists an account.
            */}
          <div className="border-t border-slate-100 px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Blocker &amp; next action
              </p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditing("nextStep")}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Pencil className="h-3 w-3" aria-hidden />
                  Edit
                </button>
              ) : null}
            </div>

            <dl className="mt-2 space-y-1.5">
              <div className="flex items-start gap-3">
                <dt className="w-24 shrink-0 text-[11px] text-slate-500">Blocker</dt>
                <dd className="min-w-0 flex-1 text-xs">
                  {nextStep.currentBlocker ? (
                    <span className="text-rose-600">{nextStep.currentBlocker}</span>
                  ) : (
                    <span className="text-slate-400">None recorded</span>
                  )}
                </dd>
              </div>
              <div className="flex items-start gap-3">
                <dt className="w-24 shrink-0 text-[11px] text-slate-500">Next action</dt>
                <dd className="min-w-0 flex-1 text-xs text-slate-800">
                  {nextStep.nextAction || <span className="text-slate-400">Not set</span>}
                  {nextStep.nextActionDueAt ? (
                    <span className="ml-1.5 text-slate-400">
                      · due {shortDate(nextStep.nextActionDueAt)}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        {/* --------------------------------------------- quick actions */}
        <Card title="Quick Actions">
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-5">
            {/*
              * Email and SMS hand off to the reader's own client.
              *
              * This application deliberately sends nothing to a client itself -
              * even the intake link is copied out by hand - so a button that
              * claimed to send from here would be the only control on the page
              * that does not do what it says. Both are disabled, with the
              * reason, when the primary contact has no address or number.
              */}
            <QuickAction
              icon={<Mail className="h-4 w-4" />}
              label="Send Email"
              href={primary?.email ? `mailto:${primary.email}` : null}
              disabledReason="No email on the primary contact"
            />
            <QuickAction
              icon={<MessageSquare className="h-4 w-4" />}
              label="Send SMS"
              href={primary?.phone ? `sms:${primary.phone}` : null}
              disabledReason="No mobile number available"
            />

            {/* Invoices and payments live together on Reports. */}
            {canSeeFinance ? (
              <>
                <TabLink
                  tab="reports"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Receipt className="h-4 w-4" aria-hidden />
                  View Invoices
                </TabLink>
                <TabLink
                  tab="reports"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Wallet className="h-4 w-4" aria-hidden />
                  View Payments
                </TabLink>
              </>
            ) : null}

            {contract?.documentUrl ? (
              <a
                href={contract.documentUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" aria-hidden />
                Download Contract
              </a>
            ) : (
              /*
                * No file stored, so there is nothing to download. The button
                * becomes the thing somebody can actually do about that, rather
                * than a link to a 404.
                */
              <TabLink
                tab="reports"
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" aria-hidden />
                No contract uploaded
              </TabLink>
            )}
          </div>
        </Card>
      </div>

      <ClientOverviewFooter loadedAt={serverNow} timezone={company.timezone || null} />
    </div>
  );
}

/**
 * One seat, staffed or not.
 *
 * An empty seat shows no avatar. Monogram renders "??" for a null name, which
 * beside the words "Not assigned" reads like a person whose initials failed to
 * load rather than a vacancy.
 */
function SeatValue({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          aria-hidden
          className="h-7 w-7 shrink-0 rounded-full border border-dashed border-slate-200"
        />
        <span className="truncate text-xs text-slate-400">Not assigned</span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Monogram name={name} />
      <span className="truncate text-xs text-slate-900">{name}</span>
    </span>
  );
}

/** Next invoice on the cadence, counting forward from the contract start. */
export function nextInvoiceDate(contract: AccountContract, now: Date) {
  const step = CADENCE_MONTHS[contract.billingCadence];

  if (!contract.startDate || !step) return null;

  const start = new Date(contract.startDate);
  const next = new Date(start);

  while (next <= now) next.setMonth(next.getMonth() + step);

  return next.toISOString();
}

function toValues(contact: AccountContact): ContactValues {
  return {
    id: contact.id,
    name: contact.name,
    role: contact.role ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    isPrimary: contact.isPrimary,
    isDecisionMaker: contact.isDecisionMaker,
    isApprover: contact.isApprover,
    communicationPreference: contact.communicationPreference ?? "",
    status: contact.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

function QuickAction({
  icon,
  label,
  href,
  disabledReason,
}: {
  icon: React.ReactNode;
  label: string;
  href: string | null;
  disabledReason: string;
}) {
  if (!href) {
    return (
      <span
        title={disabledReason}
        aria-disabled
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-300"
      >
        {icon}
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
    >
      {icon}
      {label}
    </a>
  );
}
