"use client";

import { useState } from "react";

import { AccountDialog, DialogField } from "@/components/clients/account-dialog";
import { useAccountSaver } from "@/components/clients/account-editors";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The two editors the Account rebuild owed the application.
 *
 * Replacing the old stacked forms with cards took away the only place several
 * fields could be set - the monthly value, the contract dates, the blocker and
 * the next action - while leaving three pages still reading them. These put
 * them back, grouped by what they mean rather than by which table they sit in.
 */

/* -------------------------------------------------------------------------- */
/* Commercial terms                                                           */
/* -------------------------------------------------------------------------- */

export interface CommercialValues {
  monthlyValue: string;
  contractStartDate: string;
  contractEndDate: string;
  renewalDate: string;
  billingCadence: string;
  agreementStatus: string;
  paymentTerms: string;
  autoRenew: boolean;
  documentUrl: string;
}

const CADENCES = ["ONE_TIME", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];

const AGREEMENT_STATUSES = [
  "NOT_SENT",
  "SENT",
  "VIEWED",
  "SIGNED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
];

function humanise(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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

export function CommercialsDialog({
  clientId,
  companyName,
  values,
  hasContractRow,
  onClose,
}: {
  clientId: string;
  companyName: string;
  values: CommercialValues;
  /**
   * Whether a Contract record exists. Without one the value and the dates still
   * save - they live on the client - but the terms have nowhere to go, and
   * saying so beats letting somebody type them into a void.
   */
  hasContractRow: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState(values);
  const { saving, error, save } = useAccountSaver();

  const isDirty = (Object.keys(values) as (keyof CommercialValues)[]).some(
    (key) => form[key] !== values[key],
  );

  function set<K extends keyof CommercialValues>(key: K, value: CommercialValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <AccountDialog
      title="Contract & commercials"
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        save(
          `/api/clients/${clientId}/commercials`,
          {
            ...form,
            monthlyValue: form.monthlyValue.trim() === "" ? null : Number(form.monthlyValue),
          },
          onClose,
        )
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DialogField
          label="Monthly recurring value"
          hint="What the account is worth each month. Shown in the page header."
        >
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.monthlyValue}
            onChange={(event) => set("monthlyValue", event.target.value)}
          />
        </DialogField>

        <DialogField label="Billing cycle">
          <Select
            value={form.billingCadence}
            onChange={(event) => set("billingCadence", event.target.value)}
          >
            {CADENCES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </DialogField>

        <DialogField label="Contract start date">
          <Input
            type="date"
            value={form.contractStartDate}
            onChange={(event) => set("contractStartDate", event.target.value)}
          />
        </DialogField>

        <DialogField label="Contract end date">
          <Input
            type="date"
            value={form.contractEndDate}
            onChange={(event) => set("contractEndDate", event.target.value)}
          />
        </DialogField>

        <DialogField
          label="Renewal date"
          hint="Drives the renewal reminders and the Renewals Due figure."
        >
          <Input
            type="date"
            value={form.renewalDate}
            onChange={(event) => set("renewalDate", event.target.value)}
          />
        </DialogField>

        <DialogField label="Contract status">
          <Select
            value={form.agreementStatus}
            onChange={(event) => set("agreementStatus", event.target.value)}
          >
            {AGREEMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </DialogField>

        <div className="sm:col-span-2">
          <DialogField label="Payment terms" hint="In the words the agreement uses.">
            <Input
              value={form.paymentTerms}
              onChange={(event) => set("paymentTerms", event.target.value)}
              placeholder="Due on the 15th of each month"
            />
          </DialogField>
        </div>

        <div className="sm:col-span-2">
          <DialogField
            label="Contract document"
            hint="A link to the signed agreement. This is what Download Contract opens."
          >
            <Input
              value={form.documentUrl}
              onChange={(event) => set("documentUrl", event.target.value)}
              placeholder="https://"
            />
          </DialogField>
        </div>

        <div className="sm:col-span-2">
          <Toggle
            label="Auto-renewal"
            hint="Whether the term rolls over without a new signature."
            checked={form.autoRenew}
            onChange={(value) => set("autoRenew", value)}
          />
        </div>

        {!hasContractRow ? (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 sm:col-span-2">
            This account has no contract record, so the value and the dates will save but the
            terms, status and document will not. Contracts are created when a won opportunity
            is handed over.
          </p>
        ) : null}
      </div>
    </AccountDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocker and next action                                                    */
/* -------------------------------------------------------------------------- */

export interface NextStepValues {
  currentBlocker: string;
  nextAction: string;
  nextActionDueAt: string;
}

export function NextStepDialog({
  clientId,
  companyName,
  values,
  onClose,
}: {
  clientId: string;
  companyName: string;
  values: NextStepValues;
  onClose: () => void;
}) {
  const [form, setForm] = useState(values);
  const { saving, error, save } = useAccountSaver();

  const isDirty = (Object.keys(values) as (keyof NextStepValues)[]).some(
    (key) => form[key] !== values[key],
  );

  return (
    <AccountDialog
      title="Blocker & next action"
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() => save(`/api/clients/${clientId}/next-step`, form, onClose)}
    >
      <div className="space-y-4">
        <DialogField
          label="Current blocker"
          hint="Anything recorded here turns the account's journey health to Blocked."
        >
          <Textarea
            value={form.currentBlocker}
            onChange={(event) =>
              setForm((current) => ({ ...current, currentBlocker: event.target.value }))
            }
            rows={3}
            maxLength={500}
            placeholder="Waiting on the onboarding form"
          />
        </DialogField>

        <DialogField
          label="Next action"
          hint="The single next thing this account needs. An empty one is why it shows in Needs Attention."
        >
          <Textarea
            value={form.nextAction}
            onChange={(event) =>
              setForm((current) => ({ ...current, nextAction: event.target.value }))
            }
            rows={3}
            maxLength={500}
          />
        </DialogField>

        <DialogField label="Next action due">
          <Input
            type="date"
            value={form.nextActionDueAt}
            onChange={(event) =>
              setForm((current) => ({ ...current, nextActionDueAt: event.target.value }))
            }
          />
        </DialogField>
      </div>
    </AccountDialog>
  );
}
