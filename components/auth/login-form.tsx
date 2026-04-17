"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function normalizeCallbackUrl(rawValue: string | null) {
  if (!rawValue) {
    return "/dashboard";
  }

  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const parsed = new URL(rawValue, origin);

    if (parsed.origin !== origin) {
      return "/dashboard";
    }

    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (parsed.pathname === "/login" || parsed.pathname.startsWith("/api/auth")) {
      return "/dashboard";
    }

    return path || "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callbackUrl = normalizeCallbackUrl(searchParams.get("callbackUrl"));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
        callbackUrl,
      });

      if (!response?.ok || response.error) {
        setError("Invalid email or password. Please try again.");
        return;
      }

      const destination = response.url ?? callbackUrl;
      window.location.assign(destination);
    } catch (submitError) {
      console.error("[login-form] Sign in failed.", submitError);
      setError("We couldn't complete sign-in right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-slate-200/90 bg-white">
      <CardHeader>
        <p className="text-xs uppercase tracking-[0.35em] text-sky-700">Secure access</p>
        <CardTitle className="text-3xl">Sign in to Exalted Media</CardTitle>
        <CardDescription>
          Access the internal operations workspace using your agency email and password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                name="email"
                type="email"
                placeholder="name@theexaltedmedia.com"
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

          <Button type="submit" className="w-full gap-2" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Continue to dashboard
          </Button>
        </form>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
          This workspace is restricted to authorized team members. Contact the agency administrator
          if you need account access or password support.
        </div>
      </CardContent>
    </Card>
  );
}
