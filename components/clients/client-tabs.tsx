"use client";

import { ChevronDown } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ClientTab } from "@/lib/clients/client-workspace";

/**
 * The tabs across one client account.
 *
 * Every panel is rendered on the server and handed in as a slot, so nothing
 * inside them had to change to live under a tab - this component only decides
 * which one is on screen.
 *
 * Switching is one mechanism, shared through context, and that is deliberate.
 * The obvious alternative - a `<Link href="?tab=tasks">` inside a panel - does
 * not work: App Router treats it as a soft navigation, the client component
 * re-renders with a new `initial` prop but is never remounted, so `useState`
 * keeps the old value and the tab silently does not change. Anything that wants
 * to move the user to another tab calls setTab instead.
 */

interface TabController {
  active: ClientTab;
  setTab: (tab: ClientTab) => void;
}

const TabContext = createContext<TabController | null>(null);

/**
 * Switch tabs from inside a panel.
 *
 * Returns null outside the provider so a panel rendered on its own still works
 * rather than throwing.
 */
export function useClientTab(): TabController | null {
  return useContext(TabContext);
}

/*
 * One word per tab.
 *
 * These read "Contacts & Account", "Services & Strategy" and so on, which is
 * accurate and too long: seven ampersands across a tab strip is what pushed
 * Reports into the overflow menu in the first place. Single words fit, and
 * Reports comes back out where people expect to find it.
 */
const PRIMARY: { key: ClientTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Account" },
  { key: "services", label: "Strategy" },
  { key: "tasks", label: "Work" },
  { key: "journey", label: "Journey" },
  { key: "quality", label: "Approvals" },
  { key: "reports", label: "Reports" },
];

const SECONDARY: { key: ClientTab; label: string }[] = [
  { key: "files", label: "Files & Access" },
  { key: "activity", label: "Activity & Notes" },
  { key: "integrations", label: "Integrations" },
];

export const ALL_CLIENT_TABS = [...PRIMARY, ...SECONDARY];

function TabButton({
  label,
  isActive,
  onSelect,
}: {
  label: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "page" : undefined}
      className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
        isActive
          // Blue, not near-black: the underline is the only thing marking the
          // open tab, and a slate rule under slate text barely registers.
          ? "border-sky-600 text-sky-700"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

export function ClientTabs({
  initial,
  panels,
}: {
  initial: ClientTab;
  panels: Partial<Record<ClientTab, ReactNode>>;
}) {
  const [active, setActive] = useState<ClientTab>(initial);
  const [moreOpen, setMoreOpen] = useState(false);

  const setTab = useCallback((tab: ClientTab) => {
    setActive(tab);
    setMoreOpen(false);

    /*
     * replaceState rather than a router navigation: every panel is already on
     * the page, so a navigation would re-run the whole server query to produce
     * markup the browser is already holding. The URL still ends up correct, so
     * a link somebody copies opens on the right tab.
     */
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());

    // A tab is a page as far as the reader is concerned; landing halfway down
    // the previous one is disorienting.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const controller = useMemo<TabController>(() => ({ active, setTab }), [active, setTab]);

  const inMore = SECONDARY.some((tab) => tab.key === active);
  const activeLabel = ALL_CLIENT_TABS.find((tab) => tab.key === active)?.label ?? "More";

  return (
    <TabContext.Provider value={controller}>
      <div className="space-y-4">
        <div className="flex items-end gap-1 border-b border-slate-200">
          {/*
            Horizontally scrollable rather than wrapped. A tab strip that wraps
            to two lines moves every panel down the page as the window narrows.
          */}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {PRIMARY.map((tab) => (
              <TabButton
                key={tab.key}
                label={tab.label}
                isActive={active === tab.key}
                onSelect={() => setTab(tab.key)}
              />
            ))}

            {/* On wide screens the rest sit inline rather than behind More. */}
            <span className="hidden gap-1 2xl:flex">
              {SECONDARY.map((tab) => (
                <TabButton
                  key={tab.key}
                  label={tab.label}
                  isActive={active === tab.key}
                  onSelect={() => setTab(tab.key)}
                />
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
                      onClick={() => setTab(tab.key)}
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
    </TabContext.Provider>
  );
}

/**
 * A link that moves to another tab.
 *
 * Renders a button, because that is what it is - nothing navigates. Falls back
 * to a real anchor when used outside the provider so it is never a dead
 * control.
 */
export function TabLink({
  tab,
  className,
  children,
}: {
  tab: ClientTab;
  className?: string;
  children: ReactNode;
}) {
  const controller = useClientTab();

  if (!controller) {
    return (
      <a href={`?tab=${tab}`} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" onClick={() => controller.setTab(tab)} className={className}>
      {children}
    </button>
  );
}
