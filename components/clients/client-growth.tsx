"use client";

import { LoaderCircle, Quote, Sparkles, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatEnumLabel } from "@/lib/utils";

export interface RenewalState {
  exists: boolean;
  stage: string;
  renewalDate: string | null;
  currentPackage: string | null;
  recommendedPackage: string | null;
  currentValue: number | null;
  renewalValue: number | null;
  clientInterest: string | null;
  nextAction: string | null;
  outcomeNote: string | null;
  ownerName: string | null;
  daysUntil: number | null;
  window: number | null;
  overdue: boolean;
  isSettled: boolean;
}

export interface ExpansionRow {
  id: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  estimatedValue: number | null;
  ownerName: string | null;
  outcomeNote: string | null;
  isDecided: boolean;
}

export interface TestimonialRow {
  id: string;
  format: string;
  status: string;
  content: string | null;
  publishingChannels: string | null;
  permissions: string[];
  blockers: string[];
  canPublish: boolean;
}

export interface ReferralRow {
  id: string;
  contactName: string;
  businessName: string | null;
  status: string;
  permissionGranted: boolean;
  outcome: string | null;
  leadId: string | null;
  assignedToName: string | null;
}

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function money(value: number | null) {
  return value === null ? "—" : `${value.toLocaleString()}`;
}

export function ClientGrowth({
  clientId,
  canManage,
  canCreateLeads,
  renewal,
  expansions,
  testimonials,
  referrals,
  renewalStages,
  expansionTypes,
  expansionStatuses,
  testimonialFormats,
  testimonialStatuses,
  testimonialPermissions,
  owners,
}: {
  clientId: string;
  canManage: boolean;
  canCreateLeads: boolean;
  renewal: RenewalState;
  expansions: ExpansionRow[];
  testimonials: TestimonialRow[];
  referrals: ReferralRow[];
  renewalStages: { value: string; label: string }[];
  expansionTypes: { value: string; label: string }[];
  expansionStatuses: { value: string; label: string }[];
  testimonialFormats: { value: string; label: string }[];
  testimonialStatuses: { value: string; label: string }[];
  testimonialPermissions: { key: string; label: string }[];
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<
    "renewal" | "expansion" | "testimonial" | "referral" | null
  >(null);
  const [editingTestimonialId, setEditingTestimonialId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingTestimonial =
    testimonials.find((item) => item.id === editingTestimonialId) ?? null;

  function send(url: string, body: unknown, method = "POST", onDone?: () => void) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "That could not be saved.");
        return;
      }

      onDone?.();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Renewal and growth</CardTitle>
          <CardDescription>
            What happens to this account next: renewal, expansion, and the goodwill it
            has earned.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {renewal.overdue ? (
            <Badge tone="rose">Renewal date passed</Badge>
          ) : renewal.window ? (
            <Badge tone={renewal.window <= 30 ? "rose" : "amber"}>
              {renewal.daysUntil} days to renewal
            </Badge>
          ) : null}
          <Badge tone={renewal.isSettled ? "emerald" : "slate"}>
            {formatEnumLabel(renewal.stage)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="font-semibold text-slate-900">Renewal</p>
            {renewal.renewalDate ? (
              <p className="text-sm text-slate-500">
                {formatDate(new Date(renewal.renewalDate))}
              </p>
            ) : (
              <p className="text-sm text-amber-700">No renewal date set</p>
            )}
          </div>
          {renewal.exists ? (
            <>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                {money(renewal.currentValue)} now
                {renewal.renewalValue !== null
                  ? ` → ${money(renewal.renewalValue)} proposed`
                  : ""}
                {renewal.ownerName ? ` · ${renewal.ownerName}` : ""}
              </p>
              {renewal.nextAction ? (
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Next: {renewal.nextAction}
                </p>
              ) : null}
              {renewal.outcomeNote ? (
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Outcome: {renewal.outcomeNote}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Nothing recorded yet. SOP 09 starts the renewal conversation 90 days out.
            </p>
          )}
          {canManage ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => setPanel("renewal")}
            >
              {renewal.exists ? "Update the renewal" : "Start the renewal"}
            </Button>
          ) : null}
        </div>

        {expansions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Expansion</p>
            {expansions.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <Badge tone={item.status === "WON" ? "emerald" : "slate"}>
                    {formatEnumLabel(item.status)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  {formatEnumLabel(item.type)}
                  {item.estimatedValue !== null ? ` · ${money(item.estimatedValue)}` : ""}
                  {item.ownerName ? ` · ${item.ownerName}` : ""}
                </p>
                {item.outcomeNote ? (
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    {item.outcomeNote}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {testimonials.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Testimonials</p>
            {testimonials.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">
                    {formatEnumLabel(item.format)}
                  </p>
                  <Badge tone={item.status === "PUBLISHED" ? "emerald" : "slate"}>
                    {formatEnumLabel(item.status)}
                  </Badge>
                </div>
                {item.content ? (
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    &ldquo;{item.content}&rdquo;
                  </p>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {item.permissions.length
                    ? `Client agreed to: ${item.permissions.join(", ")}.`
                    : "The client has not agreed to anything being shown yet."}
                </p>
                {item.blockers.length ? (
                  <p className="mt-1.5 text-sm leading-6 text-amber-800">
                    Cannot be published because {item.blockers.join(", and ")}.
                  </p>
                ) : null}
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      setEditingTestimonialId(item.id);
                      setPanel("testimonial");
                    }}
                  >
                    Update
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {referrals.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Referrals</p>
            {referrals.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">
                    {item.contactName}
                    {item.businessName ? ` · ${item.businessName}` : ""}
                  </p>
                  <Badge tone={item.leadId ? "emerald" : "slate"}>
                    {formatEnumLabel(item.status)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  {item.permissionGranted
                    ? "The client has agreed to the introduction."
                    : "Not yet cleared to contact — ask the client first."}
                </p>
                {item.leadId ? (
                  <p className="mt-1.5 text-sm text-slate-500">Already in Sales as a lead.</p>
                ) : canManage && canCreateLeads && item.permissionGranted ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 gap-2"
                    disabled={isPending}
                    onClick={() => send(`/api/referrals/${item.id}/convert`, {})}
                  >
                    <UserPlus className="h-4 w-4" />
                    Hand to Sales
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {canManage && panel === "renewal" ? (
          <form
            action={(formData) =>
              send(
                `/api/clients/${clientId}/renewal`,
                {
                  stage: String(formData.get("stage") ?? ""),
                  renewalDate: String(formData.get("renewalDate") ?? ""),
                  currentPackage: String(formData.get("currentPackage") ?? "").trim(),
                  recommendedPackage: String(formData.get("recommendedPackage") ?? "").trim(),
                  currentValue: formData.get("currentValue")
                    ? Number(formData.get("currentValue"))
                    : null,
                  renewalValue: formData.get("renewalValue")
                    ? Number(formData.get("renewalValue"))
                    : null,
                  clientInterest: String(formData.get("clientInterest") ?? "").trim(),
                  nextAction: String(formData.get("nextAction") ?? "").trim(),
                  outcomeNote: String(formData.get("outcomeNote") ?? "").trim(),
                  ownerId: String(formData.get("ownerId") ?? ""),
                },
                "PUT",
                () => setPanel(null),
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Stage</span>
                <Select name="stage" defaultValue={renewal.stage}>
                  {renewalStages.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Renewal date</span>
                <Input
                  type="date"
                  name="renewalDate"
                  defaultValue={renewal.renewalDate?.slice(0, 10) ?? ""}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Current package</span>
                <Input name="currentPackage" defaultValue={renewal.currentPackage ?? ""} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Recommended package</span>
                <Input
                  name="recommendedPackage"
                  defaultValue={renewal.recommendedPackage ?? ""}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Current value</span>
                <Input
                  type="number"
                  name="currentValue"
                  min="0"
                  defaultValue={renewal.currentValue ?? ""}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Renewal value</span>
                <Input
                  type="number"
                  name="renewalValue"
                  min="0"
                  defaultValue={renewal.renewalValue ?? ""}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Owner</span>
                <Select name="ownerId" defaultValue="">
                  <option value="">The account owner</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Next action</span>
                <Input name="nextAction" defaultValue={renewal.nextAction ?? ""} />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Where the client stands
              </span>
              <textarea
                name="clientInterest"
                rows={2}
                className={areaClass}
                defaultValue={renewal.clientInterest ?? ""}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Outcome (required once it is renewed, declined or churned)
              </span>
              <textarea
                name="outcomeNote"
                rows={2}
                className={areaClass}
                defaultValue={renewal.outcomeNote ?? ""}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Save renewal
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === "expansion" ? (
          <form
            action={(formData) =>
              send(
                `/api/clients/${clientId}/expansion`,
                {
                  type: String(formData.get("type") ?? ""),
                  status: String(formData.get("status") ?? "IDENTIFIED"),
                  title: String(formData.get("title") ?? "").trim(),
                  description: String(formData.get("description") ?? "").trim(),
                  estimatedValue: formData.get("estimatedValue")
                    ? Number(formData.get("estimatedValue"))
                    : null,
                  outcomeNote: String(formData.get("outcomeNote") ?? "").trim(),
                  ownerId: String(formData.get("ownerId") ?? ""),
                },
                "POST",
                () => setPanel(null),
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What is the opportunity?</span>
              <Input name="title" required placeholder="Add Google Ads alongside Meta" />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Type</span>
                <Select name="type" defaultValue={expansionTypes[0]?.value}>
                  {expansionTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Status</span>
                <Select name="status" defaultValue="IDENTIFIED">
                  {expansionStatuses.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Estimated value</span>
                <Input type="number" name="estimatedValue" min="0" />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Why this solves a real problem for them
              </span>
              <textarea name="description" rows={2} className={areaClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Outcome (required once won or lost)
              </span>
              <textarea name="outcomeNote" rows={2} className={areaClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">Owner</span>
              <Select name="ownerId" defaultValue="">
                <option value="">The account owner</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                Save opportunity
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === "testimonial" ? (
          <form
            action={(formData) =>
              send(
                `/api/clients/${clientId}/testimonials`,
                {
                  testimonialId: editingTestimonial?.id ?? "",
                  format: String(formData.get("format") ?? ""),
                  status: String(formData.get("status") ?? "REQUESTED"),
                  content: String(formData.get("content") ?? "").trim(),
                  publishingChannels: String(formData.get("publishingChannels") ?? "").trim(),
                  allowPersonName: formData.get("allowPersonName") === "on",
                  allowBusinessName: formData.get("allowBusinessName") === "on",
                  allowLogo: formData.get("allowLogo") === "on",
                  allowPhoto: formData.get("allowPhoto") === "on",
                  allowPerformanceData: formData.get("allowPerformanceData") === "on",
                },
                "POST",
                () => {
                  setPanel(null);
                  setEditingTestimonialId(null);
                },
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Format</span>
                <Select name="format" defaultValue={editingTestimonial?.format ?? "WRITTEN"}>
                  {testimonialFormats.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Status</span>
                <Select name="status" defaultValue={editingTestimonial?.status ?? "REQUESTED"}>
                  {testimonialStatuses.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What they said</span>
              <textarea
                name="content"
                rows={3}
                className={areaClass}
                defaultValue={editingTestimonial?.content ?? ""}
              />
            </label>
            <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-medium text-slate-600">
                What the client agreed we may show
              </legend>
              <p className="text-xs leading-5 text-slate-500">
                Each of these is a separate permission. Publishing anything they did not
                agree to is the fastest way to lose the client who gave it.
              </p>
              {testimonialPermissions.map((permission) => (
                <label
                  key={permission.key}
                  className="flex items-center gap-2 text-sm text-slate-600"
                >
                  <input
                    type="checkbox"
                    name={permission.key}
                    className="h-4 w-4"
                    defaultChecked={
                      editingTestimonial?.permissions.includes(permission.label) ?? false
                    }
                  />
                  {permission.label}
                </label>
              ))}
            </fieldset>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Where it will be published
              </span>
              <Input
                name="publishingChannels"
                placeholder="Website case studies page, Google Business Profile"
                defaultValue={editingTestimonial?.publishingChannels ?? ""}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                Save testimonial
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPanel(null);
                  setEditingTestimonialId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === "referral" ? (
          <form
            action={(formData) =>
              send(
                `/api/clients/${clientId}/referrals`,
                {
                  contactName: String(formData.get("contactName") ?? "").trim(),
                  businessName: String(formData.get("businessName") ?? "").trim(),
                  email: String(formData.get("email") ?? "").trim(),
                  phone: String(formData.get("phone") ?? "").trim(),
                  permissionGranted: formData.get("permissionGranted") === "on",
                },
                "POST",
                () => setPanel(null),
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Who were we referred to?</span>
                <Input name="contactName" required />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Their business</span>
                <Input name="businessName" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Email</span>
                <Input name="email" type="email" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Phone</span>
                <Input name="phone" />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm leading-6 text-slate-600">
              <input type="checkbox" name="permissionGranted" className="mt-1 h-4 w-4" />
              The client has agreed we may contact this person. Nothing can move forward
              until they have.
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                Record referral
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => setPanel("expansion")}
            >
              <Sparkles className="h-4 w-4" />
              Add an expansion opportunity
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => {
                setEditingTestimonialId(null);
                setPanel("testimonial");
              }}
            >
              <Quote className="h-4 w-4" />
              Request a testimonial
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => setPanel("referral")}
            >
              <UserPlus className="h-4 w-4" />
              Record a referral
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
