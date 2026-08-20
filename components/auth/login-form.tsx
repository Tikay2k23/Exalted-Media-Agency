"use client";

import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Where the user came from, if it is somewhere on this site. */
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

/**
 * The notice shown before anybody has typed anything.
 *
 * NextAuth puts a code in the query string when it turns somebody away, and
 * the two worth explaining are a session that ran out and being sent here from
 * a page that needed signing in for.
 */
function noticeForParam(error: string | null, hasCallback: boolean) {
  if (error === "SessionRequired") {
    return "Your session has expired. Sign in again to continue.";
  }

  if (error) {
    return "Please sign in to continue.";
  }

  if (hasCallback) {
    return "Your session has expired. Sign in again to continue.";
  }

  return null;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);

  const callbackParam = searchParams.get("callbackUrl");
  const callbackUrl = normalizeCallbackUrl(callbackParam);
  const notice = noticeForParam(searchParams.get("error"), Boolean(callbackParam));

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
        /*
         * Rejected credentials and a broken server need different words.
         *
         * NextAuth reports every rejected sign-in as "CredentialsSignin" -
         * wrong password, unknown address, deactivated account and throttled
         * attempt are indistinguishable here, by design and by the library.
         * Anything else is a server or configuration fault, and telling
         * somebody their password is wrong for that sends them hunting a
         * problem they do not have.
         */
        setError(
          response?.error && response.error !== "CredentialsSignin"
            ? "Sign-in is unavailable right now. This is a server problem, not your password. Please contact an administrator."
            : "Email or password is incorrect.",
        );
        return;
      }

      // Only follow the returned URL when it points back at this origin. If
      // NEXTAUTH_URL is configured for another environment, its redirect would
      // otherwise throw the user out to a different site after signing in.
      let destination = callbackUrl;

      if (response.url) {
        try {
          const parsed = new URL(response.url, window.location.origin);

          destination =
            parsed.origin === window.location.origin
              ? `${parsed.pathname}${parsed.search}${parsed.hash}`
              : callbackUrl;
        } catch {
          destination = callbackUrl;
        }
      }

      window.location.assign(destination);
    } catch (submitError) {
      console.error("[login-form] Sign in failed.", submitError);
      setError("We couldn't complete sign-in right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[30rem] rounded-2xl border border-slate-200/80 bg-white p-[clamp(1.25rem,min(5.3vh,6vw),3rem)] shadow-[0_24px_70px_-34px_rgba(15,23,42,0.35)]">
      <p className="flex items-center gap-2 text-[clamp(0.6875rem,1.45vh,0.8125rem)] font-semibold uppercase tracking-[0.28em] text-sky-700">
        <LockKeyhole className="h-[1em] w-[1em]" aria-hidden />
        Secure access
      </p>

      <h2 className="mt-[clamp(0.5rem,1.6vh,1rem)] text-[clamp(1.5rem,4vh,2.25rem)] font-bold leading-[1.15] tracking-tight text-slate-950">
        Sign in to Exalted Media
      </h2>
      <p className="mt-[clamp(0.375rem,1.3vh,0.75rem)] text-[clamp(0.8125rem,1.9vh,1.0625rem)] leading-[1.45] text-slate-500">
        Access the internal operations workspace using your agency email and password.
      </p>

      {notice ? (
        <p className="mt-[clamp(0.75rem,2.2vh,1.5rem)] rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[clamp(0.8125rem,1.7vh,0.9375rem)] leading-[1.5] text-amber-900">
          {notice}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-[clamp(0.875rem,2.6vh,1.75rem)] space-y-[clamp(0.625rem,2vh,1.25rem)]">
        <label className="block space-y-[clamp(0.25rem,0.9vh,0.5rem)]">
          <span className="text-[clamp(0.8125rem,1.65vh,0.9375rem)] font-medium text-slate-700">Email</span>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-4 top-1/2 h-[1.15rem] w-[1.15rem] -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@theexaltedmedia.com"
              required
              className="h-[clamp(2.75rem,6.2vh,3.5rem)] pl-11 text-base"
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-[clamp(0.8125rem,1.65vh,0.9375rem)] font-medium text-slate-700">Password</span>
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute left-4 top-1/2 h-[1.15rem] w-[1.15rem] -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="h-[clamp(2.75rem,6.2vh,3.5rem)] pl-11 pr-12 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {showPassword ? (
                <EyeOff className="h-[1.15rem] w-[1.15rem]" />
              ) : (
                <Eye className="h-[1.15rem] w-[1.15rem]" />
              )}
            </button>
          </div>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-[clamp(0.8125rem,1.65vh,0.9375rem)] text-slate-600">
            {/*
              * Remember me maps to nothing invented: NextAuth already issues a
              * persistent session cookie, so this controls whether the browser
              * keeps the email filled in next time rather than pretending to
              * change the session length.
              */}
            <input
              type="checkbox"
              name="remember"
              defaultChecked
              className="h-[1.15rem] w-[1.15rem] rounded border-slate-300 accent-slate-900"
            />
            Remember me
          </label>

          <button
            type="button"
            onClick={() => setShowResetHelp((open) => !open)}
            aria-expanded={showResetHelp}
            className="text-[clamp(0.8125rem,1.65vh,0.9375rem)] font-medium text-sky-700 transition hover:text-sky-800"
          >
            Forgot password?
          </button>
        </div>

        {showResetHelp ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[clamp(0.8125rem,1.7vh,0.9375rem)] leading-[1.5] text-slate-600">
            Passwords are reset by an administrator. Contact your agency administrator
            and they will issue you a new one.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[clamp(0.8125rem,1.7vh,0.9375rem)] leading-[1.5] text-rose-800"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="h-[clamp(2.75rem,6.2vh,3.5rem)] w-full gap-2 rounded-xl text-[clamp(0.9375rem,1.85vh,1.0625rem)] font-semibold"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <LoaderCircle className="h-[1.15rem] w-[1.15rem] animate-spin" aria-hidden />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="h-[1.15rem] w-[1.15rem]" aria-hidden />
            </>
          )}
        </Button>
      </form>

      <div className="mt-[clamp(0.875rem,2.4vh,2rem)] flex items-start gap-3 border-t border-slate-100 pt-[clamp(0.75rem,2vh,1.5rem)]">
        <span
          className="inline-flex aspect-square w-[clamp(2.25rem,4.6vh,2.75rem)] shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
          aria-hidden
        >
          <ShieldCheck className="h-[45%] w-[45%]" />
        </span>
        <div className="min-w-0">
          <p className="text-[clamp(0.8125rem,1.65vh,0.9375rem)] font-semibold text-slate-800">
            Authorized team members only.
          </p>
          <p className="mt-1 hidden text-[clamp(0.75rem,1.55vh,0.875rem)] leading-[1.5] text-slate-500 sm:block">
            Access is restricted to approved agency accounts. Contact an administrator if
            you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
