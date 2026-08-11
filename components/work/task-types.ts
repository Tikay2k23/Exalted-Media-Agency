import type { FilterableTask } from "@/lib/tasks/task-filters";

/**
 * The shape a task takes once it has crossed from the server to the browser.
 *
 * Dates are strings here rather than Date objects, because that is what
 * survives serialisation, and pretending otherwise is how a component ends up
 * calling .getTime() on a string in production.
 */
export interface TaskRow extends FilterableTask {
  platform: string | null;
  recurrence: string;
  startDate: string | null;
  /** Last write to the task. Stands in for "waiting since" on parked work. */
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  actualHours: number | null;
  requiresApproval: boolean;
  kpi: string | null;
  blocker: string | null;
  requiredAssets: string | null;
  revisionNote: string | null;
  evidenceUrl: string | null;
  approvedBy: { id: string; name: string } | null;
  commentCount: number;
}

export interface TaskComment {
  id: string;
  body: string;
  isRevisionNote: boolean;
  createdAt: string;
  author: { id: string; name: string; teamRole: string | null; role?: string | null };
}

export interface TaskEvent {
  id: string;
  action: string;
  fieldName: string | null;
  previousValue: string | null;
  newValue: string | null;
  createdAt: string;
  actor: { id: string; name: string; teamRole: string | null } | null;
}

/**
 * What the person looking at the screen may do.
 *
 * Resolved on the server from the real permission engine and passed down, so
 * the interface hides what it hides for the same reason the API refuses it.
 * These flags decide what is drawn; they decide nothing about what is allowed -
 * every action is checked again server-side.
 */
export interface ViewerCapabilities {
  id: string;
  canEdit: boolean;
  canReviewAny: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canAssign: boolean;
}
