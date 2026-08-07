import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardSection, Urgency } from "@/lib/data/dashboard-queries";
import { cn } from "@/lib/utils";

/** Urgency is carried by a word as well as a colour, never colour alone. */
const URGENCY: Record<Urgency, { tone: "rose" | "amber" | "sky" | "slate"; label: string }> = {
  overdue: { tone: "rose", label: "Overdue" },
  today: { tone: "amber", label: "Today" },
  soon: { tone: "sky", label: "Soon" },
  normal: { tone: "slate", label: "Scheduled" },
};

export function ActionSection({ section }: { section: DashboardSection }) {
  const urgent = section.items.filter((item) => item.urgency === "overdue").length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
          {section.items.length > 0 ? (
            <Badge tone={urgent > 0 ? "rose" : "slate"}>
              {section.items.length}
              {urgent > 0 ? ` · ${urgent} overdue` : ""}
            </Badge>
          ) : null}
        </div>

        {section.items.length === 0 ? (
          <div className="flex items-center gap-2.5 px-5 py-5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <p className="text-sm text-slate-600">{section.emptyMessage}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {section.items.map((item) => {
              const urgency = URGENCY[item.urgency];

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start justify-between gap-4 px-5 py-3.5 transition hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-sm leading-6 text-slate-500">
                        {item.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        tone={urgency.tone}
                        className={cn(item.urgency === "normal" && "hidden sm:inline-flex")}
                      >
                        {urgency.label}
                      </Badge>
                      <ArrowRight className="mt-1 h-4 w-4 text-slate-300" aria-hidden />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
