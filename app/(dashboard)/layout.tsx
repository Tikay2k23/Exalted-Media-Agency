import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <div className="min-h-screen px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 xl:flex-row">
        <div className="xl:sticky xl:top-8 xl:h-fit">
          <Sidebar role={user.role} />
        </div>
        <div className="flex-1 space-y-6">
          <Topbar
            name={user.name}
            email={user.email}
            role={user.role}
            avatarUrl={user.image}
          />
          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
