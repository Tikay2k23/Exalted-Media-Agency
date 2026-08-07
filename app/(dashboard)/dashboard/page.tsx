import { redirect } from "next/navigation";

import { ActionSection } from "@/components/dashboard/action-section";
import { Card, CardContent } from "@/components/ui/card";
import { loadAuthContext } from "@/lib/authz";
import { getRoleDashboard } from "@/lib/data/dashboard-queries";
import { teamRoleDescriptions } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Dashboard",
};

const TONE_CLASS = {
  default: "text-slate-950",
  warning: "text-amber-700",
  danger: "text-rose-700",
} as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  const data = await getRoleDashboard(actor);
  const firstName = actor.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Good day, {firstName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {data.intro}
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Signed in as {data.seatLabel} — {teamRoleDescriptions[actor.teamRole]}
        </p>
      </div>

      {data.isDegraded ? (
        <Card>
          <CardContent className="px-6 py-5">
            <p className="text-sm text-amber-800">
              Your dashboard could not load. Refresh, and tell an administrator if it keeps
              happening.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* A short row of figures, and only ones that change what you do next. */}
      {data.headlines.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.headlines.map((headline) => (
            <Card key={headline.label}>
              <CardContent className="px-5 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {headline.label}
                </p>
                <p
                  className={`mt-1.5 text-2xl font-semibold ${TONE_CLASS[headline.tone ?? "default"]}`}
                >
                  {headline.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {data.sections.map((section) => (
          <ActionSection key={section.key} section={section} />
        ))}
      </div>
    </div>
  );
}
