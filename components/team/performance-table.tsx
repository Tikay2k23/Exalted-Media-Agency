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
    plannedPosts: number;
    completedPosts: number;
    fulfillmentRate: number;
    activeTasks: number;
    weeklyCapacityHours: number;
    bookedHours: number;
    utilizationRate: number;
    overdueTasks: number;
  }>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Team member</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Assigned clients</TableHead>
          <TableHead>Social output</TableHead>
          <TableHead>Open work items</TableHead>
          <TableHead>Booked / capacity</TableHead>
          <TableHead>Overdue</TableHead>
          <TableHead>Fulfillment</TableHead>
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
            <TableCell>
              {row.completedPosts} / {row.plannedPosts}
            </TableCell>
            <TableCell>{row.activeTasks}</TableCell>
            <TableCell>
              {row.bookedHours}h / {row.weeklyCapacityHours}h
            </TableCell>
            <TableCell>{row.overdueTasks}</TableCell>
            <TableCell>
              <div className="min-w-40 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{row.utilizationRate}% utilization</span>
                  <span>{row.fulfillmentRate}% fulfillment</span>
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
