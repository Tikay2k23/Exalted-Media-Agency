"use client";

import { AssignTaskForm } from "@/components/team/assign-task-form";
import { AssignedTasks } from "@/components/work/assigned-tasks";
import type { TaskEvent, TaskRow, ViewerCapabilities } from "@/components/work/task-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { MyWorkView } from "@/lib/tasks/my-work-view";

type Option = {
  id: string;
  name: string;
  role?: string;
  department?: string;
  jobTitle?: string | null;
  weeklyCapacityHours?: number;
};

/**
 * My Work: the daily overview, the task table, and - for whoever hands work out
 * - the form that creates it.
 *
 * One screen rather than three, because they are one job: see what needs you,
 * work through it, and assign what somebody else should pick up. The assign
 * form sits below the overview so it does not push the day's work off the top
 * for the people who never use it.
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
  identity,
  overview,
  recentActivity,
  initialTaskId,
  initialTodayOnly,
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
  identity: { eyebrow: string; title: string; subtitle: string };
  overview: MyWorkView;
  recentActivity: TaskEvent[];
  initialTaskId?: string | null;
  initialTodayOnly?: boolean;
}) {
  return (
    <div className="space-y-6">
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
        identity={identity}
        overview={overview}
        recentActivity={recentActivity}
        initialTaskId={initialTaskId}
        initialTodayOnly={initialTodayOnly}
        heading="All My Tasks"
      />

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
    </div>
  );
}
