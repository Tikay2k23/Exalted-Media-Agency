"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      variant="secondary"
      aria-label="Sign out"
      className="gap-2"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="h-4 w-4" />
      {/* The icon carries it on a phone; the label was costing the name its room. */}
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
