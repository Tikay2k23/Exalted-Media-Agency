/**
 * One task, one row, one definition of the columns.
 *
 * Both exports come through here - the filtered one the browser builds from
 * what is on screen, and the completed one the server builds from a fresh
 * query. Two builders would drift, and the drift would show up as a
 * spreadsheet whose columns do not line up with the one from last month.
 */

/** The shape a row needs to expose. Dates may already be strings over the wire. */
export interface CsvTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  platform: string | null;
  recurrence: string;
  dueDate: Date | string;
  startDate: Date | string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
  approvedAt: Date | string | null;
  estimatedHours: number;
  actualHours: number | null;
  objective: string | null;
  completionCriteria: string | null;
  kpi: string | null;
  blocker: string | null;
  client: { companyName: string } | null;
  project: { name: string } | null;
  assignedTo: { name: string } | null;
  createdBy: { name: string } | null;
  reviewer: { name: string } | null;
  approvedBy: { name: string } | null;
}

export const CSV_HEADERS = [
  "Task ID",
  "Task Title",
  "Client",
  "Campaign or Project",
  "Category",
  "Platform or Channel",
  "Priority",
  "Status",
  "Assignee",
  "Assigned By",
  "Reviewer or Approver",
  "Assigned Date",
  "Start Date",
  "Due Date",
  "Completed Date",
  "Approved Date",
  "Estimated Hours",
  "Actual Hours",
  "Objective",
  "Deliverable",
  "KPI or Success Metric",
  "Dependency or Blocker",
  "Internal or Client Task",
] as const;

function readable(value: string | null | undefined) {
  if (!value) return "";
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * Quotes a value for CSV.
 *
 * A leading =, +, - or @ is prefixed with a quote so a spreadsheet treats it as
 * text. Task titles are typed by people, and a title starting with "=" would
 * otherwise be run as a formula the moment somebody opens the file.
 */
function cell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '""';

  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;
}

export function taskCsvRow(task: CsvTaskRow): string {
  return [
    task.id,
    task.title,
    task.client?.companyName ?? "Internal task",
    task.project?.name ?? "",
    readable(task.category),
    readable(task.platform),
    readable(task.priority),
    readable(task.status),
    task.assignedTo?.name ?? "",
    task.createdBy?.name ?? "",
    task.approvedBy?.name ?? task.reviewer?.name ?? "",
    isoDate(task.createdAt),
    isoDate(task.startDate),
    isoDate(task.dueDate),
    isoDate(task.completedAt),
    isoDate(task.approvedAt),
    task.estimatedHours,
    task.actualHours ?? "",
    task.objective ?? "",
    task.completionCriteria ?? "",
    task.kpi ?? "",
    task.blocker ?? "",
    task.client ? "Client task" : "Internal task",
  ]
    .map(cell)
    .join(",");
}

export function buildTaskCsv(tasks: CsvTaskRow[]): string {
  return [CSV_HEADERS.map(cell).join(","), ...tasks.map(taskCsvRow)].join("\r\n");
}

/** A filename that says what is in the file and when it was taken. */
export function taskCsvFilename(scope: "filtered" | "completed") {
  const stamp = new Date().toISOString().slice(0, 10);
  return scope === "completed"
    ? `exalted-completed-tasks-${stamp}.csv`
    : `exalted-tasks-${stamp}.csv`;
}
