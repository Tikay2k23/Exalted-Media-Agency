"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AccountDialog, DialogField } from "@/components/clients/account-dialog";
import { useAccountSaver } from "@/components/clients/account-editors";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The editors behind the Strategy tab's cards.
 *
 * Goals and audiences are edited as whole lists, which is why the dialog shows
 * every row: what it submits is exactly what the person was looking at, and a
 * row they removed is a row missing from the payload. Nothing is written back
 * that they could not see.
 */

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

export interface GoalValues {
  id: string | null;
  title: string;
  category: string;
  metric: string;
  baseline: string;
  target: string;
  targetDate: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PROPOSED" | "AGREED" | "IN_PROGRESS" | "ACHIEVED" | "DROPPED";
  ownerId: string | null;
  notes: string;
}

const EMPTY_GOAL: GoalValues = {
  id: null,
  title: "",
  category: "",
  metric: "",
  baseline: "",
  target: "",
  targetDate: "",
  priority: "MEDIUM",
  status: "PROPOSED",
  ownerId: null,
  notes: "",
};

function RowShell({
  index,
  onRemove,
  children,
}: {
  index: number;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          #{index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-rose-600 transition hover:bg-rose-50"
        >
          <Trash2 className="h-3 w-3" aria-hidden />
          Remove
        </button>
      </div>
      {children}
    </div>
  );
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

export function GoalsDialog({
  clientId,
  companyName,
  goals,
  users,
  onClose,
}: {
  clientId: string;
  companyName: string;
  goals: GoalValues[];
  users: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<GoalValues[]>(goals.length ? goals : [EMPTY_GOAL]);
  const { saving, error, save } = useAccountSaver();

  const isDirty = JSON.stringify(rows) !== JSON.stringify(goals.length ? goals : [EMPTY_GOAL]);

  const set = (index: number, patch: Partial<GoalValues>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <AccountDialog
      title="Business goals"
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        save(
          `/api/clients/${clientId}/strategy/goals`,
          // Blank rows are somebody who clicked add and changed their mind.
          { goals: rows.filter((row) => row.title.trim().length >= 3) },
          onClose,
        )
      }
    >
      <div className="space-y-3">
        {rows.map((row, index) => (
          <RowShell
            key={row.id ?? `new-${index}`}
            index={index}
            onRemove={() => setRows((current) => current.filter((_, i) => i !== index))}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <DialogField label="Goal">
                  <Input
                    value={row.title}
                    onChange={(event) => set(index, { title: event.target.value })}
                    placeholder="Generate 30% more qualified leads"
                  />
                </DialogField>
              </div>

              <DialogField label="Metric" hint="What is being counted.">
                <Input
                  value={row.metric}
                  onChange={(event) => set(index, { metric: event.target.value })}
                  placeholder="Qualified leads per month"
                />
              </DialogField>

              <DialogField label="Target date">
                <Input
                  type="date"
                  value={row.targetDate}
                  onChange={(event) => set(index, { targetDate: event.target.value })}
                />
              </DialogField>

              <DialogField label="Baseline" hint="Where it started.">
                <Input
                  value={row.baseline}
                  onChange={(event) => set(index, { baseline: event.target.value })}
                />
              </DialogField>

              <DialogField label="Target">
                <Input
                  value={row.target}
                  onChange={(event) => set(index, { target: event.target.value })}
                />
              </DialogField>

              <DialogField label="Priority">
                <Select
                  value={row.priority}
                  onChange={(event) =>
                    set(index, { priority: event.target.value as GoalValues["priority"] })
                  }
                >
                  {["LOW", "MEDIUM", "HIGH"].map((value) => (
                    <option key={value} value={value}>
                      {value.charAt(0) + value.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </DialogField>

              <DialogField label="Status">
                <Select
                  value={row.status}
                  onChange={(event) =>
                    set(index, { status: event.target.value as GoalValues["status"] })
                  }
                >
                  {["PROPOSED", "AGREED", "IN_PROGRESS", "ACHIEVED", "DROPPED"].map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </Select>
              </DialogField>

              <div className="sm:col-span-2">
                <DialogField label="Owner">
                  <Select
                    value={row.ownerId ?? ""}
                    onChange={(event) => set(index, { ownerId: event.target.value || null })}
                  >
                    <option value="">Not assigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </DialogField>
              </div>
            </div>
          </RowShell>
        ))}

        <AddRowButton
          label="Add another goal"
          onClick={() => setRows((current) => [...current, { ...EMPTY_GOAL }])}
        />
      </div>
    </AccountDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Audience                                                                   */
/* -------------------------------------------------------------------------- */

export interface AudienceValues {
  id: string | null;
  tier: "PRIMARY" | "SECONDARY";
  name: string;
  location: string;
  attributes: string;
  needs: string;
  painPoints: string;
  buyingTriggers: string;
  objections: string;
  decisionMakers: string;
  channels: string;
  notes: string;
}

const EMPTY_AUDIENCE: AudienceValues = {
  id: null,
  tier: "PRIMARY",
  name: "",
  location: "",
  attributes: "",
  needs: "",
  painPoints: "",
  buyingTriggers: "",
  objections: "",
  decisionMakers: "",
  channels: "",
  notes: "",
};

export function AudienceDialog({
  clientId,
  companyName,
  audiences,
  onClose,
}: {
  clientId: string;
  companyName: string;
  audiences: AudienceValues[];
  onClose: () => void;
}) {
  const initial = audiences.length ? audiences : [EMPTY_AUDIENCE];
  const [rows, setRows] = useState<AudienceValues[]>(initial);
  const { saving, error, save } = useAccountSaver();

  const isDirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const set = (index: number, patch: Partial<AudienceValues>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <AccountDialog
      title="Target audience"
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        save(
          `/api/clients/${clientId}/strategy/audiences`,
          { audiences: rows.filter((row) => row.name.trim().length >= 2) },
          onClose,
        )
      }
    >
      <div className="space-y-3">
        {rows.map((row, index) => (
          <RowShell
            key={row.id ?? `new-${index}`}
            index={index}
            onRemove={() => setRows((current) => current.filter((_, i) => i !== index))}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DialogField label="Audience">
                <Input
                  value={row.name}
                  onChange={(event) => set(index, { name: event.target.value })}
                  placeholder="Homeowners in Orlando, FL"
                />
              </DialogField>

              <DialogField label="Tier">
                <Select
                  value={row.tier}
                  onChange={(event) =>
                    set(index, { tier: event.target.value as AudienceValues["tier"] })
                  }
                >
                  <option value="PRIMARY">Primary</option>
                  <option value="SECONDARY">Secondary</option>
                </Select>
              </DialogField>

              <div className="sm:col-span-2">
                <DialogField label="Where they are">
                  <Input
                    value={row.location}
                    onChange={(event) => set(index, { location: event.target.value })}
                  />
                </DialogField>
              </div>

              <div className="sm:col-span-2">
                <DialogField label="What they need">
                  <Textarea
                    rows={2}
                    value={row.needs}
                    onChange={(event) => set(index, { needs: event.target.value })}
                  />
                </DialogField>
              </div>

              <div className="sm:col-span-2">
                <DialogField label="What frustrates them">
                  <Textarea
                    rows={2}
                    value={row.painPoints}
                    onChange={(event) => set(index, { painPoints: event.target.value })}
                  />
                </DialogField>
              </div>

              <DialogField label="What makes them buy">
                <Textarea
                  rows={2}
                  value={row.buyingTriggers}
                  onChange={(event) => set(index, { buyingTriggers: event.target.value })}
                />
              </DialogField>

              <DialogField label="What holds them back">
                <Textarea
                  rows={2}
                  value={row.objections}
                  onChange={(event) => set(index, { objections: event.target.value })}
                />
              </DialogField>

              <DialogField label="Who decides">
                <Input
                  value={row.decisionMakers}
                  onChange={(event) => set(index, { decisionMakers: event.target.value })}
                />
              </DialogField>

              <DialogField label="Where to reach them">
                <Input
                  value={row.channels}
                  onChange={(event) => set(index, { channels: event.target.value })}
                />
              </DialogField>
            </div>
          </RowShell>
        ))}

        <AddRowButton
          label="Add another audience"
          onClick={() => setRows((current) => [...current, { ...EMPTY_AUDIENCE }])}
        />
      </div>
    </AccountDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Value proposition                                                          */
/* -------------------------------------------------------------------------- */

export interface ValuePropValues {
  statement: string;
  offer: string;
  primaryOutcome: string;
  differentiators: string[];
  proofPoints: string;
  guarantees: string;
  objections: string;
  positioningStatement: string;
  competitorNotes: string;
}

export function ValuePropDialog({
  clientId,
  companyName,
  values,
  onClose,
}: {
  clientId: string;
  companyName: string;
  values: ValuePropValues;
  onClose: () => void;
}) {
  const [form, setForm] = useState(values);
  const { saving, error, save } = useAccountSaver();

  const isDirty = JSON.stringify(form) !== JSON.stringify(values);

  const set = (patch: Partial<ValuePropValues>) =>
    setForm((current) => ({ ...current, ...patch }));

  return (
    <AccountDialog
      title="Value proposition"
      subtitle={companyName}
      isDirty={isDirty}
      isSaving={saving}
      error={error}
      onClose={onClose}
      onSubmit={() =>
        save(
          `/api/clients/${clientId}/strategy/value-prop`,
          {
            ...form,
            differentiators: form.differentiators.map((d) => d.trim()).filter(Boolean),
          },
          onClose,
        )
      }
    >
      <div className="space-y-4">
        <DialogField label="Value proposition" hint="One sentence, in the client's words.">
          <Textarea
            rows={3}
            value={form.statement}
            onChange={(event) => set({ statement: event.target.value })}
            placeholder="We create and maintain outdoor spaces that raise property value."
          />
        </DialogField>

        <div>
          <p className="text-xs font-medium text-slate-700">Key differentiators</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Two to four. The card shows the first four.
          </p>
          <div className="mt-2 space-y-2">
            {form.differentiators.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={item}
                  onChange={(event) =>
                    set({
                      differentiators: form.differentiators.map((value, i) =>
                        i === index ? event.target.value : value,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    set({ differentiators: form.differentiators.filter((_, i) => i !== index) })
                  }
                  aria-label="Remove"
                  className="shrink-0 rounded-lg p-2 text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {form.differentiators.length < 6 ? (
              <AddRowButton
                label="Add a differentiator"
                onClick={() => set({ differentiators: [...form.differentiators, ""] })}
              />
            ) : null}
          </div>
        </div>

        <DialogField label="The offer">
          <Textarea
            rows={2}
            value={form.offer}
            onChange={(event) => set({ offer: event.target.value })}
          />
        </DialogField>

        <DialogField label="Proof points" hint="Why anybody should believe it.">
          <Textarea
            rows={2}
            value={form.proofPoints}
            onChange={(event) => set({ proofPoints: event.target.value })}
          />
        </DialogField>

        <DialogField label="Common objections">
          <Textarea
            rows={2}
            value={form.objections}
            onChange={(event) => set({ objections: event.target.value })}
          />
        </DialogField>

        <DialogField label="Positioning statement">
          <Textarea
            rows={2}
            value={form.positioningStatement}
            onChange={(event) => set({ positioningStatement: event.target.value })}
          />
        </DialogField>
      </div>
    </AccountDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Note                                                                       */
/* -------------------------------------------------------------------------- */

export function NoteDialog({
  clientId,
  companyName,
  onClose,
}: {
  clientId: string;
  companyName: string;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const { saving, error, save } = useAccountSaver();

  return (
    <AccountDialog
      title="Add a strategy note"
      subtitle={companyName}
      isDirty={body.trim().length > 0}
      isSaving={saving}
      error={error}
      submitLabel="Add note"
      onClose={onClose}
      onSubmit={() =>
        save(
          `/api/clients/${clientId}/notes`,
          { category: "STRATEGY", body },
          onClose,
          "POST",
        )
      }
    >
      <DialogField
        label="Note"
        hint="Dated and kept. It also appears in the account's activity timeline."
      >
        <Textarea
          rows={5}
          maxLength={4000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Client mentioned seasonal promotions are a priority for Q4."
        />
      </DialogField>
    </AccountDialog>
  );
}
