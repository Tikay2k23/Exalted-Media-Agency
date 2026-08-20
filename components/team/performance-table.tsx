import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PerformanceRow {
  id: string;
  name: string;
  role: string;
  department: string;
  jobTitle: string | null;
  assignedClients: number;
  activeTasks: number;
  weeklyCapacityHours: number;
  bookedHours: number;
  utilizationRate: number;
  overdueTasks: number;
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

/**
 * Team workload: a table on a wide screen, cards on a narrow one.
 *
 * Seven columns cannot be read on a phone. They used to be there anyway, and
 * because a grid child will not shrink below its content by default, the
 * 897px table stretched the whole column - dragging the Recent Activity panel
 * beside it out to the same width and scrolling the entire page sideways.
 *
 * Below lg the same figures are stacked per person instead. The scroll
 * container on the table is kept for the awkward middle widths where seven
 * columns still do not quite fit.
 */
export function PerformanceTable({ rows }: { rows: PerformanceRow[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Team workload data will appear here once accounts and work assignments are active.
      </div>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team member</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Assigned accounts</TableHead>
              <TableHead>Open work items</TableHead>
              <TableHead>Booked / capacity</TableHead>
              <TableHead>Overdue</TableHead>
              <TableHead>Utilization</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-950">{row.name}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                      {row.jobTitle ?? row.role.replaceAll("_", " ")}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{row.department.replaceAll("_", " ")}</TableCell>
                <TableCell>{row.assignedClients}</TableCell>
                <TableCell>{row.activeTasks}</TableCell>
                <TableCell>
                  {row.bookedHours}h / {row.weeklyCapacityHours}h
                </TableCell>
                <TableCell>{row.overdueTasks}</TableCell>
                <TableCell>
                  <div className="min-w-40 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{row.utilizationRate}% utilized</span>
                    </div>
                    <Progress value={row.utilizationRate} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Narrow: one card per person, so nothing scrolls sideways. */}
      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-950">{row.name}</p>
                <p className="mt-0.5 truncate text-[11px] uppercase tracking-wide text-slate-400">
                  {row.jobTitle ?? row.role.replaceAll("_", " ")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {row.department.replaceAll("_", " ")}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
              <Figure label="Accounts" value={row.assignedClients} />
              <Figure label="Open work" value={row.activeTasks} />
              <Figure
                label="Booked"
                value={`${row.bookedHours}h / ${row.weeklyCapacityHours}h`}
              />
              <Figure label="Overdue" value={row.overdueTasks} />
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                  Utilization
                </span>
                <span className="text-xs font-medium text-slate-700">
                  {row.utilizationRate}%
                </span>
              </div>
              <Progress value={row.utilizationRate} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
