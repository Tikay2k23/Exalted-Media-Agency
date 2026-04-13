import type { ClientStatus } from "@prisma/client";
import Link from "next/link";

import { ClientForm } from "@/components/clients/client-form";
import { ClientStatusSelect } from "@/components/clients/client-status-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClientsData, serviceTypeOptions } from "@/lib/data/queries";
import { canAccessAssignedRecord, canManageClients } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatDate, formatPercent } from "@/lib/utils";

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

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : undefined;
  const status =
    typeof params.status === "string" ? (params.status as ClientStatus | "ALL") : "ALL";
  const assigneeId = typeof params.assignee === "string" ? params.assignee : "ALL";

  const data = await getClientsData(user, {
    search,
    status,
    assigneeId,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client Management</CardTitle>
          <CardDescription>
            Track client ownership, status, service type, and pipeline visibility in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1.4fr_0.9fr_0.9fr_auto]">
            <Input
              name="search"
              defaultValue={search}
              placeholder="Search clients, brands, or contact email"
            />
            <Select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="AT_RISK">At Risk</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
            </Select>
            <Select name="assignee" defaultValue={assigneeId}>
              <option value="ALL">All assignees</option>
              {data.users.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
            <Button type="submit" className="w-full md:w-auto">
              Apply filters
            </Button>
          </form>
        </CardContent>
      </Card>

      {canManageClients(user.role) ? (
        <ClientForm users={data.users} stages={data.stages} serviceTypes={serviceTypeOptions} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Client Directory</CardTitle>
          <CardDescription>
            {user.role === "TEAM_MEMBER"
              ? "Only the clients assigned to you are shown here."
              : "Managers and admins can review the full book of business here."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Date added</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead className="text-right">
                  {canManageClients(user.role) ? "Manage" : "View"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-slate-950">{client.companyName}</p>
                      <p className="mt-1 text-sm text-slate-500">{client.clientName}</p>
                    </div>
                  </TableCell>
                  <TableCell>{client.assignedUser?.name ?? "Unassigned"}</TableCell>
                  <TableCell>
                    <Badge tone="violet">{client.currentStage.name}</Badge>
                  </TableCell>
                  <TableCell>
                    <ClientStatusSelect
                      clientId={client.id}
                      value={client.status}
                      disabled={
                        !canManageClients(user.role) &&
                        !canAccessAssignedRecord(user.role, user.id, client.assignedUserId)
                      }
                    />
                  </TableCell>
                  <TableCell>{client.serviceType.replaceAll("_", " ")}</TableCell>
                  <TableCell>{formatDate(client.dateAdded)}</TableCell>
                  <TableCell>
                    <Badge tone={toneForStatus(client.status)}>
                      {formatPercent(client.fulfillmentRate)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/clients/${client.id}`}
                      className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                    >
                      {canManageClients(user.role) ? "Open and manage" : "Open profile"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
