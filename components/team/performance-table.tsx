import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PerformanceTable({
  rows,
}: {
  rows: Array<{
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
  }>;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        Team workload data will appear here once accounts and work assignments are active.
      </div>
    );
  }

  return (
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
  );
}
