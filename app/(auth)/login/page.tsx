import { ArrowUpRight, BarChart3, KanbanSquare, Users2 } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent } from "@/components/ui/card";
import { getServerAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const highlights = [
  {
    icon: Users2,
    title: "Role-aware access",
    description: "Admins, managers, and delivery teammates each land on the right operational surface.",
  },
  {
    icon: KanbanSquare,
    title: "Pipeline clarity",
    description: "Track clients from new lead through review and completion with stage history.",
  },
  {
    icon: BarChart3,
    title: "Fulfillment visibility",
    description: "Monitor planned versus completed posts across clients, platforms, and assignees.",
  },
];

export default async function LoginPage() {
  const session = await getServerAuthSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 lg:px-12">
      <div className="mx-auto grid max-w-7xl gap-8 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[2.5rem] bg-slate-950 px-8 py-10 text-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.8)] sm:px-10 lg:px-14 lg:py-14">
          <div className="flex items-center gap-3 text-sky-300">
            <div className="rounded-2xl bg-white/10 p-3">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-[0.35em]">Exalted Media Agency</p>
          </div>

          <div className="mt-14 max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Delivery operations for agencies that need clarity without the clutter.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Manage clients, track the pipeline, and keep posting fulfillment visible from one
              production-ready workspace.
            </p>
          </div>

          <div className="mt-12 grid gap-4">
            {highlights.map((highlight) => {
              const Icon = highlight.icon;

              return (
                <Card key={highlight.title} className="border-white/10 bg-white/5 text-white">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-2xl bg-white/10 p-3 text-sky-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">{highlight.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        {highlight.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="flex items-center justify-center">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
