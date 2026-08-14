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
    // `backdrop-blur` makes this a stacking context, so the notification panel
    // inside it cannot escape however high its own z-index goes. The bar has to
    // be raised above the content below it, or the panel opens behind the cards.
    /*
     * One row on a phone, not a stacked block.
     *
     * This sat above every page as flex-col below lg: a 56px avatar, the name,
     * the seat badge, the email and three controls, all stacked. On a phone
     * that is most of the first screen spent on chrome before any of the work
     * appears. It is a single compact row now, and the two lines that are
     * already elsewhere - the email, which is on Settings, and the seat, which
     * is in the sidebar - are dropped below sm rather than shrunk.
     */
    <header className="relative z-30 flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:rounded-[2rem] sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Avatar
          src={avatarUrl}
          fallback={name ?? email ?? "EU"}
          className="h-10 w-10 shrink-0 sm:h-14 sm:w-14"
        />
        <div className="min-w-0">
          <p className="hidden text-sm text-slate-500 sm:block">Agency workspace</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:mt-1 sm:gap-3">
            <h2 className="truncate text-base font-semibold tracking-tight text-slate-950 sm:text-xl">
              {name}
            </h2>
            <Badge tone="sky" className="hidden sm:inline-flex">
              {roleLabel}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500 sm:mt-1 sm:text-sm">{email}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <NotificationBell initialUnreadCount={unreadCount} />
        <Link
          href="/settings"
          aria-label="Account settings"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:px-4"
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Account settings</span>
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
