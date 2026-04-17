"use client";

import {
  BriefcaseBusiness,
  CalendarRange,
  KanbanSquare,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Accounts", icon: BriefcaseBusiness },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/fulfillment", label: "Weekly Work", icon: CalendarRange },
  { href: "/team", label: "Team", icon: Users2 },
  { href: "/admin/users", label: "Users", icon: ShieldCheck, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function Sidebar({ role }: { role: "ADMIN" | "MANAGER" | "TEAM_MEMBER" }) {
  const pathname = usePathname();

  return (
    <aside className="w-full max-w-xs rounded-[2rem] border border-white/70 bg-slate-950 px-5 py-6 text-slate-100 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.65)]">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-200/80">
            Exalted Media
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Operations</h1>
        </div>
        <Badge tone="sky">{role.replace("_", " ")}</Badge>
      </div>

      <nav className="space-y-2">
        {navigation
          .filter((item) => (item.adminOnly ? role === "ADMIN" : true))
          .map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  active
                    ? "bg-white text-slate-950"
                    : "text-slate-300 hover:bg-white/8 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
          Delivery Standard
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          Built for account visibility, clean execution, and weekly accountability across the
          agency team.
        </p>
      </div>
    </aside>
  );
}
