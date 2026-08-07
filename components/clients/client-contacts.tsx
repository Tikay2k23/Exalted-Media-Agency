"use client";

import { LoaderCircle, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  isApprover: boolean;
}

export function ClientContacts({
  clientId,
  contacts,
  canEdit,
}: {
  clientId: string;
  contacts: ContactRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasPrimary = contacts.some((contact) => contact.isPrimary);
  const hasApprover = contacts.some((contact) => contact.isApprover);

  function submit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim(),
          phone: String(formData.get("phone") ?? "").trim(),
          role: String(formData.get("role") ?? "").trim(),
          isPrimary: formData.get("isPrimary") === "on",
          isDecisionMaker: formData.get("isDecisionMaker") === "on",
          isApprover: formData.get("isApprover") === "on",
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't add this contact.");
        return;
      }

      setIsAdding(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Client contacts</CardTitle>
          <CardDescription>
            Who to speak to, and who is allowed to sign work off.
          </CardDescription>
        </div>
        {canEdit && !isAdding ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setIsAdding(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add contact
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Both of these are stage requirements, so their absence is called out
            here rather than only surfacing when a move is blocked. */}
        {(!hasPrimary || !hasApprover) && contacts.length > 0 ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {!hasPrimary ? "No contact is marked as the primary contact. " : ""}
            {!hasApprover
              ? "No contact is marked as an authorised approver, which blocks client review."
              : ""}
          </p>
        ) : null}

        {contacts.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            No contacts yet. Add the person you deal with, and mark whoever signs work off
            as an authorised approver.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{contact.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {[contact.role, contact.email, contact.phone].filter(Boolean).join(" · ")
                      || "No contact details recorded"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.isPrimary ? <Badge tone="sky">Primary</Badge> : null}
                  {contact.isDecisionMaker ? <Badge tone="violet">Decision maker</Badge> : null}
                  {contact.isApprover ? <Badge tone="emerald">Approver</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isAdding ? (
          <form action={submit} className="grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Name</span>
              <Input name="name" required />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Job title</span>
              <Input name="role" placeholder="e.g. Owner, Marketing Manager" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Email</span>
              <Input name="email" type="email" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Phone</span>
              <Input name="phone" />
            </label>

            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-2.5">
                <input type="checkbox" name="isPrimary" className="h-4 w-4 rounded border-slate-300" />
                <span className="text-sm text-slate-700">
                  Primary contact — the person we deal with day to day
                </span>
              </label>
              <label className="flex items-center gap-2.5">
                <input type="checkbox" name="isDecisionMaker" className="h-4 w-4 rounded border-slate-300" />
                <span className="text-sm text-slate-700">Decision maker</span>
              </label>
              <label className="flex items-center gap-2.5">
                <input type="checkbox" name="isApprover" className="h-4 w-4 rounded border-slate-300" />
                <span className="text-sm text-slate-700">
                  Authorised approver — allowed to sign deliverables off
                </span>
              </label>
            </div>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Add contact
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAdding(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
