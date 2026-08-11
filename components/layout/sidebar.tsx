"use client";

import {
  BriefcaseBusiness,
  CalendarRange,
  Flame,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  Route,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ExaltedLockup } from "@/components/brand/exalted-mark";
import { Badge } from "@/components/ui/badge";
import { visibleNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  LayoutDashboard,
  BriefcaseBusiness,
  Route,
  CalendarRange,
  Flame,
  Users2,
  ShieldCheck,
  ScrollText,
  Settings2,
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({
  permissions,
  pathname,
  onNavigate,
}: {
  permissions: ReadonlySet<string>;
  pathname: string;
  onNavigate?: () => void;
}) {
  const groups = visibleNavigation(permissions);

  return (
    <nav className="space-y-6">
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="px-4 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-slate-500">
            {group.label}
          </p>

          {group.items.map((item) => {
            const Icon = icons[item.icon] ?? LayoutDashboard;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  active
                    ? "bg-white text-slate-950"
                    : "text-slate-300 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({
  roleLabel,
  permissions,
}: {
  roleLabel: string;
  permissions: string[];
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const permissionSet = new Set(permissions);

  // The drawer closes from the link's own onNavigate handler rather than from
  // an effect watching the pathname, which would re-render on every route.

  return (
    <>
      {/* Compact bar shown only below the xl breakpoint. */}
      <div className="flex items-center justify-between rounded-[1.75rem] border border-white/70 bg-slate-950 px-5 py-4 text-slate-100 xl:hidden">
        <ExaltedLockup idSuffix="mobile-bar" />
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open navigation"
          aria-expanded={isOpen}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-slate-200 transition hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] overflow-y-auto bg-slate-950 px-5 py-6 text-slate-100">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <ExaltedLockup idSuffix="drawer" />
                <Badge tone="sky" className="mt-3">
                  {roleLabel}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close navigation"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 text-slate-300 transition hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <NavigationLinks
              permissions={permissionSet}
              pathname={pathname}
              onNavigate={() => setIsOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-full max-w-xs rounded-[2rem] border border-white/70 bg-slate-950 px-5 py-6 text-slate-100 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.65)] xl:block">
        <div className="mb-10 flex items-start justify-between gap-3">
          <ExaltedLockup idSuffix="sidebar" />
          <Badge tone="sky">{roleLabel}</Badge>
        </div>

        <NavigationLinks permissions={permissionSet} pathname={pathname} />

        <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
            Delivery Standard
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            Every account moves through the client journey under the same stage
            requirements, with overrides recorded.
          </p>
        </div>
      </aside>
    </>
  );
}
