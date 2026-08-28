"use client";

import { MoreVertical } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface RowMenuItem {
  label: string;
  /** Either a destination or something to run. Not both. */
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
}

/** Roughly how tall the menu will be, to decide whether it opens up or down. */
const ITEM_HEIGHT = 34;
const MENU_PADDING = 8;
const MENU_WIDTH = 208;

/**
 * The three-dot menu on a table row.
 *
 * Rendered into the body rather than beside the button. In the row it lived
 * inside a list with overflow-hidden, which clipped it on the lower rows, and
 * it competed with the rows below it for stacking - so the next row painted
 * over the top of it. Both of those are properties of where it sat in the tree,
 * not of the menu, and a portal removes the question entirely.
 *
 * Position is measured in the click handler rather than an effect, so the menu
 * is placed before it ever paints and never appears in the wrong spot first.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number }>({
    left: 0,
    top: 0,
  });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;

      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    // Scrolling moves the row out from under a menu that is fixed to the
    // viewport, so the menu closes rather than floating away from its button.
    function onScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    /* Passive: this only closes the menu, so it never cancels the scroll. */
    window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();

    if (!rect) return;

    const height = items.length * ITEM_HEIGHT + MENU_PADDING;
    const fitsBelow = rect.bottom + height + 8 <= window.innerHeight;

    setPosition({
      // Right-aligned to the button, but never off the left edge.
      left: Math.max(8, rect.right - MENU_WIDTH),
      ...(fitsBelow
        ? { top: rect.bottom + 4 }
        : { bottom: window.innerHeight - rect.top + 4 }),
    });

    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                left: position.left,
                top: position.top,
                bottom: position.bottom,
                width: MENU_WIDTH,
              }}
              className="fixed z-[60] rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            >
              {items.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    className="block rounded-lg px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                      item.danger ? "text-rose-600" : "text-slate-700"
                    }`}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                  >
                    {item.label}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
