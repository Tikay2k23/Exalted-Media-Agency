"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const demoAccounts = [
  "admin@exaltedagency.com",
  "manager@exaltedagency.com",
  "sarah@exaltedagency.com",
  "devon@exaltedagency.com",
];

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  async function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const response = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });

      if (!response?.ok) {
        setError("Invalid login details. Use one of the seeded accounts below.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-md border-slate-200/80 bg-white/90">
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Secure access</p>
        <CardTitle className="text-3xl">Sign in to Agency Hub</CardTitle>
        <CardDescription>
          Use the seeded credentials to explore the admin, manager, and team views.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={handleSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                name="email"
                type="email"
                defaultValue="admin@exaltedagency.com"
                required
                className="pl-10"
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Password</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                name="password"
                type="password"
                defaultValue="Agency123!"
                required
                className="pl-10"
              />
            </div>
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full gap-2" size="lg" disabled={isPending}>
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Continue to dashboard
          </Button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-700">Seeded demo accounts</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-500">
            {demoAccounts.map((account) => (
              <li key={account}>{account}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs uppercase tracking-[0.28em] text-slate-400">
            Password: Agency123!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
