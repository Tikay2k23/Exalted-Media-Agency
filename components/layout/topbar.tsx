import { Settings2 } from "lucide-react";
import Link from "next/link";

import { NotificationBell } from "@/components/layout/notification-bell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function Topbar({
  name,
  roleLabel,
  email,
  avatarUrl,
  unreadCount,
}: {
  name?: string | null;
  roleLabel: string;
  email?: string | null;
  avatarUrl?: string | null;
  unreadCount: number;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl} fallback={name ?? email ?? "EU"} className="h-14 w-14" />
        <div className="min-w-0">
          <p className="text-sm text-slate-500">Agency workspace</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950">
              {name}
            </h2>
            <Badge tone="sky">{roleLabel}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{email}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell initialUnreadCount={unreadCount} />
        <Link
          href="/settings"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Account settings</span>
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
