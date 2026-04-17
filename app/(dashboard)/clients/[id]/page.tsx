import { notFound } from "next/navigation";

import { ClientForm } from "@/components/clients/client-form";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { ClientStatusSelect } from "@/components/clients/client-status-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getClientDetail,
  getSharedOptions,
  serviceTypeOptions,
} from "@/lib/data/queries";
import { canAccessAssignedRecord, canManageClients } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime, formatEnumLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toneForStatus(status: string): "sky" | "amber" | "rose" | "emerald" {
  switch (status) {
    case "AT_RISK":
      return "rose";
    case "ON_HOLD":
      return "amber";
    case "COMPLETED":
      return "emerald";
    default:
      return "sky";
  }
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const [client, options] = await Promise.all([
    getClientDetail(user, id),
    getSharedOptions(),
  ]);

  if (!client) {
    notFound();
  }

  const canManageClient = canManageClients(user.role);
  const canEditStatus =
    canManageClient ||
    canAccessAssignedRecord(user.role, user.id, client.assignedUserId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-sky-600">Client profile</p>
            <CardTitle className="mt-3 text-3xl">{client.companyName}</CardTitle>
            <CardDescription className="mt-2 text-base">
              Primary contact: {client.clientName} / {client.contactEmail}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="violet">{client.currentStage.name}</Badge>
            <Badge tone="sky">{formatEnumLabel(client.serviceType)}</Badge>
            <Badge tone={toneForStatus(client.status)}>{formatEnumLabel(client.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Assigned teammate</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {client.assignedUser?.name ?? "Unassigned"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Date added</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {formatDate(client.dateAdded)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Contact phone</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {client.contactPhone ?? "Not provided"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Open work items</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{client.openTaskCount}</p>
            <p className="mt-1 text-sm text-slate-500">{client.overdueTaskCount} overdue</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Client status</p>
            <div className="mt-2">
              <ClientStatusSelect clientId={client.id} value={client.status} disabled={!canEditStatus} />
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageClient ? (
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <ClientForm
            users={options.users}
            stages={options.stages}
            serviceTypes={serviceTypeOptions}
            client={{
              id: client.id,
              clientName: client.clientName,
              companyName: client.companyName,
              contactEmail: client.contactEmail,
              contactPhone: client.contactPhone,
              assignedUserId: client.assignedUserId,
              status: client.status,
              serviceType: client.serviceType,
              currentStageId: client.currentStageId,
              notes: client.notes,
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Delete the client if the account should be removed from the system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-7 text-slate-600">
                This removes the client profile and pipeline history. Linked internal tasks stay in the system but lose the client reference.
              </p>
              <DeleteClientButton
                clientId={client.id}
                companyName={client.companyName}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Linked Delivery Work</CardTitle>
            <CardDescription>
              Internal agency tasks currently tied to this account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.agencyTasks.length ? (
                  client.agencyTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-950">{task.title}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatEnumLabel(task.category)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{task.assignedTo.name}</TableCell>
                      <TableCell>{formatDate(task.dueDate)}</TableCell>
                      <TableCell>{formatEnumLabel(task.status)}</TableCell>
                      <TableCell>{formatEnumLabel(task.priority)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                      No internal delivery tasks are linked to this account yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Context and delivery details for the account.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="leading-7 text-slate-600">{client.notes ?? "No notes added yet."}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Stage History</CardTitle>
          <CardDescription>Every stage change is stored for accountability.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.stageHistory.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {entry.fromStage?.name ?? "Created"} to {entry.toStage.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {entry.changedBy?.name ?? "System"}
                  </p>
                </div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  {formatDateTime(entry.changedAt)}
                </p>
              </div>
              {entry.note ? <p className="mt-3 text-sm text-slate-600">{entry.note}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
