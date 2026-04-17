"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error] Unhandled application error.", error);
  }, [error]);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[2.5rem] border border-slate-200 bg-white px-8 py-12 text-center shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] sm:px-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-rose-600">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">
            We hit a server issue
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-500">
            The workspace ran into a temporary error. You can retry this page now or return to the
            sign-in screen if your session has expired.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button type="button" className="gap-2" onClick={reset}>
              <RefreshCcw className="h-4 w-4" />
              Try again
            </Button>
            <Link href="/login" className={cn(buttonVariants({ variant: "secondary" }))}>
              Go to login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
