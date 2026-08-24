"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AccountDialog, DialogField } from "@/components/clients/account-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The four editors behind the Account tab's Edit buttons.
 *
 * Each posts to one route and then calls router.refresh(), which re-runs the
 * server render so the card and the page header agree immediately - the header
 * shows the account owner, and changing it in the ownership dialog has to move
 * both. Reloading the browser would do the same thing and lose scroll position
 * and anything half-typed elsewhere.
 */

interface Saver {
  saving: boolean;
  error: string | null;
  /** PATCH by default; creating something takes POST. */
  save: (
    url: string,
    body: unknown,
    onDone: () => void,
    method?: "PATCH" | "POST",
  ) => void;
}

/** POST-and-refresh, with the error states every one of these needs. */
export function useAccountSaver(): Saver {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save(
    url: string,
    body: unknown,
    onDone: () => void,
    method: "PATCH" | "POST" = "PATCH",
  ) {
    setSaving(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);

          // The server's own words where it has them: it knows whether this was
          // a permission problem, a validation problem or a conflict.
          setError(data?.error ?? "We couldn't save that. No changes were made.");
          setSaving(false);
          return;
        }

        startTransition(() => router.refresh());
        setSaving(false);
        onDone();
      } catch {
        setError("We couldn't reach the server. No changes were made.");
        setSaving(false);
      }
    })();
  }

  return { saving: saving || pending, error, save };
}

/* -------------------------------------------------------------------------- */
/* Company information                                                        */
/* -------------------------------------------------------------------------- */

export interface CompanyValues {
  legalName: string;
  website: string;
  industry: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  country: string;
  businessPhone: string;
  businessEmail: string;
  serviceArea: string;
  taxId: string;
  timezone: string;
}

export function CompanyDialog({
  clientId,
  companyName,
  values,
  canSeeTaxId,
  onClose,
}: {
  clientId: string;
  companyName: string;
  values: CompanyValues;
  /** The tax ID is finance data; a specialist should not be editing it. */
  canSeeTaxId: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState(values);
  const { saving, error, save } = useAccountSaver();

  const isDirty = (Object.keys(values) as (keyof CompanyValues)[]).some(
    (key) => form[key] !== values[key],
  );

  const set = (key: keyof CompanyValues) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <AccountDialog
      title="Company information"
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        save(
          `/api/clients/${clientId}/company`,
          // The tax ID is left out entirely when this person may not see it,
          // so submitting the form cannot blank a value they never loaded.
          canSeeTaxId ? form : { ...form, taxId: values.taxId },
          onClose,
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <DialogField label="Legal business name" hint="As it appears on the contract.">
            <Input
              value={form.legalName}
              onChange={(event) => set("legalName")(event.target.value)}
              placeholder={companyName}
            />
          </DialogField>
        </div>

        <DialogField label="Website" hint="cedarridgeland.com is fine.">
          <Input
            value={form.website}
            onChange={(event) => set("website")(event.target.value)}
            inputMode="url"
          />
        </DialogField>

        <DialogField label="Industry">
          <Input
            value={form.industry}
            onChange={(event) => set("industry")(event.target.value)}
          />
        </DialogField>

        <div className="sm:col-span-2">
          <DialogField label="Address">
            <Input
              value={form.addressLine1}
              onChange={(event) => set("addressLine1")(event.target.value)}
              placeholder="Street address"
            />
          </DialogField>
        </div>

        <div className="sm:col-span-2">
          <Input
            value={form.addressLine2}
            onChange={(event) => set("addressLine2")(event.target.value)}
            placeholder="Suite, floor (optional)"
          />
        </div>

        <DialogField label="City">
          <Input value={form.city} onChange={(event) => set("city")(event.target.value)} />
        </DialogField>

        <DialogField label="State or region">
          <Input
            value={form.stateRegion}
            onChange={(event) => set("stateRegion")(event.target.value)}
          />
        </DialogField>

        <DialogField label="Postcode">
          <Input
            value={form.postalCode}
            onChange={(event) => set("postalCode")(event.target.value)}
          />
        </DialogField>

        <DialogField label="Country">
          <Input value={form.country} onChange={(event) => set("country")(event.target.value)} />
        </DialogField>

        <DialogField label="Business phone">
          <Input
            value={form.businessPhone}
            onChange={(event) => set("businessPhone")(event.target.value)}
            inputMode="tel"
          />
        </DialogField>

        <DialogField label="Business email">
          <Input
            value={form.businessEmail}
            onChange={(event) => set("businessEmail")(event.target.value)}
            inputMode="email"
          />
        </DialogField>

        <div className="sm:col-span-2">
          <DialogField label="Service area" hint="Where they actually operate.">
            <Input
              value={form.serviceArea}
              onChange={(event) => set("serviceArea")(event.target.value)}
            />
          </DialogField>
        </div>

        <DialogField
          label="Timezone"
          hint="An IANA zone, e.g. America/Chicago. Used by the page footer."
        >
          <Input
            value={form.timezone}
            onChange={(event) => set("timezone")(event.target.value)}
            placeholder="America/Chicago"
          />
        </DialogField>

        {canSeeTaxId ? (
          <DialogField label="Tax ID / EIN">
            <Input value={form.taxId} onChange={(event) => set("taxId")(event.target.value)} />
          </DialogField>
        ) : null}
      </div>
    </AccountDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Ownership                                                                  */
/* -------------------------------------------------------------------------- */

export interface OwnershipSeat {
  role: string;
  label: string;
  ownerId: string | null;
}

export function OwnershipDialog({
  clientId,
  companyName,
  assignedUserId,
  seats,
  users,
  onClose,
}: {
  clientId: string;
  companyName: string;
  assignedUserId: string | null;
  seats: OwnershipSeat[];
  users: { id: string; name: string; teamRole: string }[];
  onClose: () => void;
}) {
  const [owner, setOwner] = useState(assignedUserId ?? "");
  const [staffing, setStaffing] = useState(() =>
    Object.fromEntries(seats.map((seat) => [seat.role, seat.ownerId ?? ""])),
  );
  const { saving, error, save } = useAccountSaver();

  const isDirty =
    owner !== (assignedUserId ?? "")
    || seats.some((seat) => staffing[seat.role] !== (seat.ownerId ?? ""));

  return (
    <AccountDialog
      title="Account ownership"
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        save(
          `/api/clients/${clientId}/ownership`,
          {
            assignedUserId: owner || null,
            seats: seats.map((seat) => ({
              role: seat.role,
              ownerId: staffing[seat.role] || null,
            })),
          },
          onClose,
        )
      }
    >
      <div className="space-y-4">
        <DialogField
          label="Account owner"
          hint="The standing owner of the relationship, whoever is holding the work today."
        >
          <Select value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="">Not assigned</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </DialogField>

        {/*
          * Only the seats this client actually has.
          *
          * They come from the service blueprint - a website account has a
          * creative specialist, an ads account has an ads specialist - so this
          * list is different per client rather than a fixed five. Offering a
          * seat the account does not have would create a workstream nothing
          * asked for.
          */}
        {seats.map((seat) => (
          <DialogField key={seat.role} label={seat.label}>
            <Select
              value={staffing[seat.role]}
              onChange={(event) =>
                setStaffing((current) => ({ ...current, [seat.role]: event.target.value }))
              }
            >
              <option value="">Not assigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </DialogField>
        ))}

        {seats.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            This account has no delivery seats yet. They are created from the service the
            client bought.
          </p>
        ) : null}
      </div>
    </AccountDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Internal note                                                              */
/* -------------------------------------------------------------------------- */

export function InternalNoteDialog({
  clientId,
  companyName,
  note,
  onClose,
}: {
  clientId: string;
  companyName: string;
  note: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(note);
  const { saving, error, save } = useAccountSaver();

  return (
    <AccountDialog
      title="Internal account note"
      subtitle={companyName}
      isDirty={text !== note}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        save(`/api/clients/${clientId}/internal-note`, { notes: text }, onClose)
      }
    >
      <DialogField
        label="Note"
        hint="One standing fact about dealing with this client. Dated entries belong in Add Note."
      >
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          maxLength={2000}
          placeholder="Prefers email. Available 8 AM - 5 PM Eastern."
        />
      </DialogField>
      <p className="mt-2 text-[11px] text-slate-400">{text.length} / 2000</p>
    </AccountDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Contact                                                                    */
/* -------------------------------------------------------------------------- */

export interface ContactValues {
  id: string | null;
  name: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  isApprover: boolean;
  communicationPreference: string;
  status: "ACTIVE" | "INACTIVE";
}

export const EMPTY_CONTACT: ContactValues = {
  id: null,
  name: "",
  role: "",
  email: "",
  phone: "",
  isPrimary: false,
  isDecisionMaker: false,
  isApprover: false,
  communicationPreference: "",
  status: "ACTIVE",
};

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-800">{label}</span>
        {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ContactDialog({
  clientId,
  companyName,
  contact,
  currentPrimaryName,
  onClose,
}: {
  clientId: string;
  companyName: string;
  contact: ContactValues;
  /** Whoever holds primary now, so promoting somebody says what it displaces. */
  currentPrimaryName: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState(contact);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = contact.id !== null;
  const isDirty = (Object.keys(contact) as (keyof ContactValues)[]).some(
    (key) => form[key] !== contact[key],
  );

  const displacesPrimary =
    form.isPrimary
    && !contact.isPrimary
    && currentPrimaryName !== null
    && currentPrimaryName !== contact.name;

  function submit() {
    setSaving(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(
          isEditing
            ? `/api/clients/${clientId}/contacts/${contact.id}`
            : `/api/clients/${clientId}/contacts`,
          {
            method: isEditing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: form.name,
              email: form.email,
              phone: form.phone,
              role: form.role,
              isPrimary: form.isPrimary,
              isDecisionMaker: form.isDecisionMaker,
              isApprover: form.isApprover,
              communicationPreference: form.communicationPreference,
              ...(isEditing ? { status: form.status } : {}),
            }),
          },
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);

          setError(data?.error ?? "We couldn't save this contact.");
          setSaving(false);
          return;
        }

        startTransition(() => router.refresh());
        setSaving(false);
        onClose();
      } catch {
        setError("We couldn't reach the server. No changes were made.");
        setSaving(false);
      }
    })();
  }

  return (
    <AccountDialog
      title={isEditing ? "Edit contact" : "Add contact"}
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      submitLabel={isEditing ? "Save changes" : "Add contact"}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DialogField label="Name">
          <Input
            required
            value={form.name}
            onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
          />
        </DialogField>

        <DialogField label="Job title or role">
          <Input
            value={form.role}
            onChange={(event) => setForm((c) => ({ ...c, role: event.target.value }))}
            placeholder="Owner, Billing, Marketing Lead"
          />
        </DialogField>

        <DialogField label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))}
          />
        </DialogField>

        <DialogField label="Phone">
          <Input
            value={form.phone}
            onChange={(event) => setForm((c) => ({ ...c, phone: event.target.value }))}
            inputMode="tel"
          />
        </DialogField>

        <div className="sm:col-span-2">
          <DialogField label="Preferred contact method">
            <Input
              value={form.communicationPreference}
              onChange={(event) =>
                setForm((c) => ({ ...c, communicationPreference: event.target.value }))
              }
              placeholder="Email, phone, WhatsApp"
            />
          </DialogField>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Toggle
            label="Primary contact"
            hint={
              displacesPrimary
                ? `This will take primary from ${currentPrimaryName}.`
                : "The person the agency deals with by default. Only one per account."
            }
            checked={form.isPrimary}
            onChange={(value) => setForm((c) => ({ ...c, isPrimary: value }))}
          />
          <Toggle
            label="Authorised approver"
            hint="May sign off deliverables. Client review needs at least one."
            checked={form.isApprover}
            onChange={(value) => setForm((c) => ({ ...c, isApprover: value }))}
          />
          <Toggle
            label="Decision maker"
            checked={form.isDecisionMaker}
            onChange={(value) => setForm((c) => ({ ...c, isDecisionMaker: value }))}
          />
        </div>

        {isEditing ? (
          <div className="sm:col-span-2">
            <DialogField
              label="Status"
              hint="Deactivate rather than delete anyone who appears on past approvals."
            >
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((c) => ({
                    ...c,
                    status: event.target.value as ContactValues["status"],
                  }))
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </DialogField>
          </div>
        ) : null}
      </div>
    </AccountDialog>
  );
}
