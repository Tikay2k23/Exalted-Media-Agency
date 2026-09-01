"use client";

import { AssignTaskModal } from "@/components/team/assign-task-form";
import { AssignedTasks } from "@/components/work/assigned-tasks";
import type { TaskEvent, TaskRow, ViewerCapabilities } from "@/components/work/task-types";
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
 * - the way to create it.
 *
 * Assigning used to be a form sitting open at the bottom of this page. It cost
 * most of a screen to something most people use occasionally, and pushed the
 * day's work further from the top for everyone who never assigns anything. It
 * is now a button in the page's action row that opens the same form in a
 * dialog, so the queue starts higher and the page is shorter.
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
        /*
          The server decides whether this appears at all. Hiding the control is
          tidiness; POST /api/employee-tasks checks the permission itself.
        */
        headerAction={
          canManageTasks ? (
            <AssignTaskModal
              users={users}
              clients={clients}
              projects={projects}
              sops={sops}
            />
          ) : null
        }
      />
    </div>
  );
}
