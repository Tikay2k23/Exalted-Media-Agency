"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AccountDialog, DialogField } from "@/components/clients/account-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/utils";

/**
 * The client record itself, and removing it.
 *
 * These two lived on the Account tab as a full form and a danger zone until it
 * was rebuilt to the reference design, which has room for neither. They belong
 * in the header's More menu: rarely used, account-level, and exactly the kind
 * of thing that menu is for.
 *
 * Only the fields with no other home are editable here. The account owner is
 * set in Account Ownership, the status by the header dropdown, the stage by
 * Move Stage - which checks the gate first - and the note in Internal Notes.
 * Offering any of them a second time would create two places to change one
 * thing, which is how they come to disagree.
 */

export interface ClientRecordValues {
  clientName: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  serviceType: string;
}

export function ClientRecordDialog({
  clientId,
  passthrough,
  values,
  serviceTypes,
  onClose,
}: {
  clientId: string;
  /**
   * Fields this dialog does not edit but the endpoint insists on.
   *
   * The client PATCH takes the whole form, so these ride along unchanged
   * rather than being blanked. The same values the page rendered with, which
   * means a stage moved in another tab while this sat open would be written
   * back - the window is small, and it is the behaviour the form this replaces
   * already had.
   */
  passthrough: {
    assignedUserId: string | null;
    status: string;
    currentStageId: string;
    notes: string | null;
  };
  values: ClientRecordValues;
  serviceTypes: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState(values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = (Object.keys(values) as (keyof ClientRecordValues)[]).some(
    (key) => form[key] !== values[key],
  );

  function submit() {
    setSaving(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            assignedUserId: passthrough.assignedUserId ?? "",
            status: passthrough.status,
            currentStageId: passthrough.currentStageId,
            notes: passthrough.notes ?? "",
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);

          setError(data?.error ?? "We couldn't save that. No changes were made.");
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
      title="Client record"
      subtitle={values.companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <DialogField label="Company name" hint="What the account is called across the app.">
            <Input
              required
              value={form.companyName}
              onChange={(event) =>
                setForm((current) => ({ ...current, companyName: event.target.value }))
              }
            />
          </DialogField>
        </div>

        <DialogField label="Primary contact name">
          <Input
            required
            value={form.clientName}
            onChange={(event) =>
              setForm((current) => ({ ...current, clientName: event.target.value }))
            }
          />
        </DialogField>

        <DialogField label="Service type">
          <Select
            value={form.serviceType}
            onChange={(event) =>
              setForm((current) => ({ ...current, serviceType: event.target.value }))
            }
          >
            {serviceTypes.map((value) => (
              <option key={value} value={value}>
                {formatEnumLabel(value)}
              </option>
            ))}
          </Select>
        </DialogField>

        <DialogField label="Contact email">
          <Input
            required
            type="email"
            value={form.contactEmail}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactEmail: event.target.value }))
            }
          />
        </DialogField>

        <DialogField label="Contact phone">
          <Input
            value={form.contactPhone}
            onChange={(event) =>
              setForm((current) => ({ ...current, contactPhone: event.target.value }))
            }
            inputMode="tel"
          />
        </DialogField>

        <p className="text-[11px] text-slate-400 sm:col-span-2">
          The account owner, status, stage and internal note are set elsewhere on this page,
          so they are not repeated here.
        </p>
      </div>
    </AccountDialog>
  );
}

/**
 * Removing a client.
 *
 * Typing the company name rather than clicking through a confirm: this takes a
 * whole account and its pipeline history out of the workspace, and the browser
 * dialog it replaces was one keystroke away from doing it by accident.
 */
export function DeleteClientDialog({
  clientId,
  companyName,
  onClose,
}: {
  clientId: string;
  companyName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === companyName;

  function submit() {
    if (!matches) {
      setError(`Type "${companyName}" exactly to confirm.`);
      return;
    }

    setDeleting(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });

        if (!response.ok) {
          const data = await response.json().catch(() => null);

          setError(data?.error ?? "We couldn't delete this client.");
          setDeleting(false);
          return;
        }

        // Away from a page that no longer has anything to show.
        router.replace("/clients");
        router.refresh();
      } catch {
        setError("We couldn't reach the server. Nothing was deleted.");
        setDeleting(false);
      }
    })();
  }

  return (
    <AccountDialog
      title="Delete this client?"
      subtitle={companyName}
      isDirty={false}
      isSaving={deleting}
      error={error}
      submitLabel="Delete client"
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-slate-700">
          This removes {companyName} and its pipeline history from the workspace. Internal
          tasks stay in the system but lose their link to this account.
        </p>

        <DialogField label={`Type ${companyName} to confirm`}>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={companyName}
            autoComplete="off"
          />
        </DialogField>
      </div>
    </AccountDialog>
  );
}
