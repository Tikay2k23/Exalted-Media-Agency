"use client";

import { LoaderCircle, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Option {
  id: string;
  name: string;
  role?: string;
}

interface ClientFormValues {
  id: string;
  clientName: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string | null;
  assignedUserId: string | null;
  status: string;
  serviceType: string;
  currentStageId: string;
  notes: string | null;
}

export function ClientForm({
  users,
  stages,
  serviceTypes,
  client,
}: {
  users: Option[];
  stages: Option[];
  serviceTypes: string[];
  client?: ClientFormValues;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEditMode = Boolean(client);

  function handleSubmit(formData: FormData) {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const payload = {
        clientName: formData.get("clientName"),
        companyName: formData.get("companyName"),
        contactEmail: formData.get("contactEmail"),
        contactPhone: formData.get("contactPhone"),
        assignedUserId: formData.get("assignedUserId"),
        status: formData.get("status"),
        serviceType: formData.get("serviceType"),
        currentStageId: formData.get("currentStageId"),
        notes: formData.get("notes"),
      };

      const response = await fetch(client ? `/api/clients/${client.id}` : "/api/clients", {
        method: client ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Unable to create client right now.");
        return;
      }

      setMessage(client ? "Client updated successfully." : "Client created successfully.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditMode ? "Edit Client" : "Add New Client"}</CardTitle>
        <CardDescription>
          {isEditMode
            ? "Managers and admins can update client ownership, account details, service scope, and stage from here."
            : "Managers and admins can onboard new digital marketing accounts directly into the live pipeline."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Client name</span>
            <Input
              name="clientName"
              placeholder="Leah Morgan"
              defaultValue={client?.clientName}
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Company / brand</span>
            <Input
              name="companyName"
              placeholder="Northstar Fitness"
              defaultValue={client?.companyName}
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Contact email</span>
            <Input
              name="contactEmail"
              type="email"
              placeholder="hello@brand.com"
              defaultValue={client?.contactEmail}
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Contact phone</span>
            <Input
              name="contactPhone"
              placeholder="+1 555 555 5555"
              defaultValue={client?.contactPhone ?? ""}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Assigned teammate</span>
            <Select name="assignedUserId" defaultValue={client?.assignedUserId ?? ""}>
              <option value="">Unassigned account lead</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Client status</span>
            <Select name="status" defaultValue={client?.status ?? "ACTIVE"}>
              <option value="ACTIVE">Active</option>
              <option value="AT_RISK">At Risk</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Service type</span>
            <Select name="serviceType" defaultValue={client?.serviceType ?? serviceTypes[0]}>
              {serviceTypes.map((serviceType) => (
                <option key={serviceType} value={serviceType}>
                  {serviceType.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-600">Pipeline stage</span>
            <Select name="currentStageId" defaultValue={client?.currentStageId ?? stages[0]?.id}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-slate-600">Notes</span>
            <Textarea
              name="notes"
              placeholder="Scope, channels, content cadence, paid media goals, reporting requirements, or relationship notes."
              defaultValue={client?.notes ?? ""}
            />
          </label>

          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <Button type="submit" className="gap-2" disabled={isPending}>
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : isEditMode ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isEditMode ? "Save client changes" : "Create client"}
            </Button>
            {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
