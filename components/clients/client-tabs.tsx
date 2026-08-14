"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { ClientTab } from "@/lib/clients/client-workspace";

/**
 * The tabs across one client account.
 *
 * Every panel is rendered on the server and handed in as a slot, so nothing
 * inside them had to change to live under a tab - this component only decides
 * which one is on screen. Switching does not go back to the server, but it does
 * rewrite `?tab=` so a link somebody copies, or an attention item on the
 * dashboard pointing at `?tab=files`, lands where it says it will.
 */

const PRIMARY: { key: ClientTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts & Account" },
  { key: "services", label: "Services & Strategy" },
  { key: "tasks", label: "Tasks & Delivery" },
  { key: "journey", label: "Journey" },
  { key: "quality", label: "QA & Approvals" },
];

const SECONDARY: { key: ClientTab; label: string }[] = [
  { key: "reports", label: "Reports & Health" },
  { key: "files", label: "Files & Access" },
  { key: "activity", label: "Activity & Notes" },
  { key: "integrations", label: "Integrations" },
];

export const ALL_CLIENT_TABS = [...PRIMARY, ...SECONDARY];

export function ClientTabs({
  initial,
  panels,
}: {
  initial: ClientTab;
  panels: Partial<Record<ClientTab, ReactNode>>;
}) {
  const [active, setActive] = useState<ClientTab>(initial);
  const [moreOpen, setMoreOpen] = useState(false);

  function select(tab: ClientTab) {
    setActive(tab);
    setMoreOpen(false);

    /*
     * replaceState rather than a router push: the panels are already on the
     * page, so a navigation would re-fetch everything to show markup the
     * browser is holding. The URL still ends up correct and shareable.
     */
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }

  const inMore = SECONDARY.some((tab) => tab.key === active);
  const activeLabel = ALL_CLIENT_TABS.find((tab) => tab.key === active)?.label ?? "More";

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-1 border-b border-slate-200">
        {/*
          Horizontally scrollable rather than wrapped. A tab strip that wraps to
          two lines moves every panel down the page as the window narrows.
        */}
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {PRIMARY.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => select(tab.key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                active === tab.key
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* On wide screens the rest sit inline rather than behind More. */}
          <span className="hidden gap-1 2xl:flex">
            {SECONDARY.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => select(tab.key)}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                  active === tab.key
                    ? "border-slate-950 text-slate-950"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </span>
        </div>

        <div className="relative shrink-0 2xl:hidden">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition ${
              inMore
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {inMore ? activeLabel : "More"}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {moreOpen ? (
            <>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {SECONDARY.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => select(tab.key)}
                    className={`block w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      active === tab.key
                        ? "bg-slate-950 font-semibold text-white"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/*
        Only the active panel is mounted. The others are already built on the
        server, so this is a cheap swap rather than a fetch.
      */}
      <div>{panels[active] ?? panels.overview ?? null}</div>
    </div>
  );
}
