"use client";

import { UserRound } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  className?: string;
}

/**
 * A photo when there is one, initials when there is not.
 *
 * Initials also cover an image that fails to load. A stored avatar can be
 * bytes no browser can decode - a phone once supplied a HEIC file labelled as
 * WebP, and the label is not something to trust - and the difference between
 * a broken-image glyph and somebody's initials is the difference between the
 * app looking faulty and the photo simply being absent.
 */
export function Avatar({ src, alt, fallback, className }: AvatarProps) {
  // Which src failed, rather than a boolean. Remembering the value means a
  // different person, or a re-upload, gets a fresh attempt on its own - no
  // effect resetting state after the fact, which only causes a second render.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    const isDataUrl = src.startsWith("data:");

    return (
      <div className={cn("relative h-10 w-10 overflow-hidden rounded-2xl", className)}>
        <Image
          src={src}
          alt={alt ?? "Avatar"}
          fill
          sizes="80px"
          unoptimized={isDataUrl}
          onError={() => setFailedSrc(src)}
          className="object-cover"
        />
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

