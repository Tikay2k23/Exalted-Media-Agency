"use client";

import { AssignTaskForm } from "@/components/team/assign-task-form";
import { AssignedTasks } from "@/components/work/assigned-tasks";
import type { TaskRow, ViewerCapabilities } from "@/components/work/task-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Option = {
  id: string;
  name: string;
  role?: string;
  department?: string;
  jobTitle?: string | null;
  weeklyCapacityHours?: number;
};

/**
 * Assigning work, and then the work itself.
 *
 * Two things on one page because they are two halves of one job: somebody hands
 * a task out, and then watches what happens to it. The queue below used to be
 * stacked cards with the whole brief inside each one, which meant seeing eight
 * tasks meant scrolling past eight paragraphs; it is now the scannable list.
 */
export function AgencyTaskPanel({
  tasks,
  users,
  clients,
  taskClients,
  projects,
  sops,
  canManageTasks,
  viewer,
  capped,
  serverNow,
}: {
  tasks: TaskRow[];
  users: Option[];
  clients: { id: string; companyName: string }[];
  /** Only the accounts that appear in this person's work, for the filter. */
  taskClients: { id: string; companyName: string }[];
  projects: { id: string; name: string; clientId: string }[];
  sops: { id: string; reference: string; title: string; status: string }[];
  canManageTasks: boolean;
  viewer: ViewerCapabilities;
  capped: boolean;
  serverNow: string;
}) {
  return (
    <div className="space-y-6">
      {canManageTasks ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign Marketing Task</CardTitle>
            <CardDescription>
              Create and assign a marketing task with all the details your team needs to
              deliver.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssignTaskForm
              users={users}
              clients={clients}
              projects={projects}
              sops={sops}
            />
          </CardContent>
        </Card>
      ) : null}

      {/*
        Deliberately not wrapped in a Card. Card carries backdrop-blur, which
        makes a containing block and would trap the detail drawer's fixed
        positioning inside it - the bug that clipped the Add Client dialog.
      */}
      <AssignedTasks
        tasks={tasks}
        clients={taskClients}
        viewer={viewer}
        capped={capped}
        serverNow={serverNow}
        heading={canManageTasks ? "Marketing Ops Queue" : "My Assigned Tasks"}
      />
    </div>
  );
}
