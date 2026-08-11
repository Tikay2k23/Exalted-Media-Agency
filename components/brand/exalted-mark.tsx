/**
 * The X mark, inline.
 *
 * A component rather than an <img> so it inherits size from the surrounding
 * layout and never flashes in after the rest of the page. The gradient id is
 * suffixed because two of these on one page would otherwise share a definition
 * and the second would silently render with the first's colours.
 */
export function ExaltedMark({
  className,
  idSuffix = "mark",
}: {
  className?: string;
  idSuffix?: string;
}) {
  const gradientId = `exalted-${idSuffix}`;

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="The Exalted Media"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-cyan)" />
          <stop offset="0.42" stopColor="var(--brand-blue)" />
          <stop offset="1" stopColor="var(--brand-magenta)" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M4 2H36l15 24 15-24h30L66 50l31 48H66L50 76l-17 22H3l31-48Z"
      />
    </svg>
  );
}

/**
 * The mark next to the agency name, as the sidebar and login header use it.
 *
 * The wordmark PNG is not used on dark surfaces: its lettering is black, so it
 * would disappear. The name is set in type instead, with the X carrying the
 * brand.
 */
export function ExaltedLockup({
  tone = "light",
  idSuffix = "lockup",
}: {
  /** "light" for dark backgrounds, "dark" for light ones. */
  tone?: "light" | "dark";
  idSuffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <ExaltedMark className="h-8 w-8 shrink-0" idSuffix={idSuffix} />
      <div className="min-w-0">
        <p
          className={`text-[0.6rem] uppercase tracking-[0.32em] ${
            tone === "light" ? "text-sky-200/80" : "text-slate-400"
          }`}
        >
          The Exalted
        </p>
        <p
          className={`text-lg font-semibold leading-tight tracking-tight ${
            tone === "light" ? "text-white" : "text-slate-950"
          }`}
        >
          Operations
        </p>
      </div>
    </div>
  );
}
