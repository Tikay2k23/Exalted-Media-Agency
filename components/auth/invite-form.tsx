"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Choosing a password from an invitation link.
 *
 * The only thing this does is set a password. Signing in happens on the normal
 * login page afterwards, through the unchanged login flow.
 */
export function InviteForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (password.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "That did not work.");
        return;
      }

      setDone(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm leading-6 text-slate-600">
          Your password is set. Sign in with <span className="font-medium text-slate-900">{email}</span>.
        </p>
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-600">Email</span>
        <Input value={email} disabled readOnly />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-600">Choose a password</span>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-600">Confirm password</span>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Set password
      </Button>
    </form>
  );
}
