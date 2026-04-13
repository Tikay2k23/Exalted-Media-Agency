import { UserRound } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
}

export function Avatar({ src, alt, fallback, className }: AvatarProps) {
  if (src) {
    return (
      <div className={cn("relative h-10 w-10 overflow-hidden rounded-2xl", className)}>
        <Image src={src} alt={alt ?? "Avatar"} fill className="object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600",
        className,
      )}
    >
      {fallback ? fallback.slice(0, 2).toUpperCase() : <UserRound className="h-4 w-4" />}
    </div>
  );
}
