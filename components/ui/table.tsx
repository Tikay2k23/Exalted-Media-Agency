import * as React from "react";

import { cn } from "@/lib/utils";

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    /*
     * min-w-0 is what makes the scroller actually scroll.
     *
     * A grid or flex child defaults to min-width:auto and refuses to shrink
     * below its own content, so without this the wrapper grows to the width of
     * the widest row and takes the page sideways with it - the overflow-x-auto
     * never gets the chance to do anything. max-w-full keeps it inside a block
     * parent for the same reason.
     */
    <div className="w-full min-w-0 max-w-full overflow-x-auto">
      <table className={cn("w-full min-w-full text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-slate-200", className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-slate-100", className)} {...props} />;
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition hover:bg-slate-50/80", className)} {...props} />;
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-4 align-top text-slate-700", className)} {...props} />;
}
