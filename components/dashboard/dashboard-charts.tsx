"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardChartsProps {
  pipelineOverview: Array<{
    id: string;
    name: string;
    color: string;
    count: number;
  }>;
  platformBreakdown: Array<{
    platform: string;
    planned: number;
    completed: number;
    rate: number;
  }>;
}

export function DashboardCharts({
  pipelineOverview,
  platformBreakdown,
}: DashboardChartsProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Client Pipeline Overview</CardTitle>
          <CardDescription>
            Current client distribution by stage across the agency pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pipelineOverview}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.08)" }} />
              <Bar dataKey="count" radius={[12, 12, 0, 0]}>
                {pipelineOverview.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Fulfillment</CardTitle>
          <CardDescription>
            Planned versus completed social posts by platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={platformBreakdown}
                dataKey="completed"
                nameKey="platform"
                innerRadius={58}
                outerRadius={102}
                paddingAngle={3}
              >
                {platformBreakdown.map((entry, index) => (
                  <Cell
                    key={entry.platform}
                    fill={["#0ea5e9", "#14b8a6", "#8b5cf6", "#f97316", "#e11d48", "#22c55e"][index % 6]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
