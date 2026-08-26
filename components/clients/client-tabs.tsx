"use client";

import { ChevronDown } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
  /**
   * Move to a tab, optionally naming a record for it to open.
   *
   * The focus exists because every panel is already mounted: a panel cannot
   * read what to open out of the URL on arrival, having initialised long
   * before anybody clicked. Passing it through the same call that moves the
   * user is the only handover that actually reaches the other side.
   */
  setTab: (tab: ClientTab, focus?: string) => void;
  /** What the current tab was asked to open, if anything. */
  focus: string | null;
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
  const [focus, setFocus] = useState<string | null>(null);

  const setTab = useCallback((tab: ClientTab, nextFocus?: string) => {
    setActive(tab);
    setFocus(nextFocus ?? null);
    setMoreOpen(false);

    /*
     * History rather than a router navigation: the panels are rendered here,
     * so a navigation would re-run the whole server query to produce markup
     * the browser is already holding. The URL still ends up correct, so a link
     * somebody copies opens on the right tab.
     *
     * pushState rather than replaceState, so Back returns to the tab they came
     * from. Replacing meant a reader who followed a link out of Journey into
     * Work and pressed Back left the client entirely, having never been given
     * an entry to go back to. Skipped when the tab is not actually changing,
     * because clicking the tab you are already on should not cost a Back press
     * to undo.
     */
    const url = new URL(window.location.href);

    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.pushState(null, "", url.toString());
    }

    // A tab is a page as far as the reader is concerned; landing halfway down
    // the previous one is disorienting.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /*
   * Back and Forward.
   *
   * Without this the address bar and the page disagree: history moves the URL
   * to ?tab=journey while this component's own state keeps showing Work, which
   * is a worse failure than not having the entry at all. Reading the tab back
   * out of the URL is what makes pushState above safe.
   */
  useEffect(() => {
    const onPop = () => {
      const tab = new URL(window.location.href).searchParams.get("tab");

      setActive(
        ALL_CLIENT_TABS.some((entry) => entry.key === tab)
          ? (tab as ClientTab)
          : initial,
      );
      // Whatever a panel was asked to open belongs to the click, not to the
      // history entry somebody has just stepped back onto.
      setFocus(null);
      setMoreOpen(false);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [initial]);

  const controller = useMemo<TabController>(
    () => ({ active, setTab, focus }),
    [active, setTab, focus],
  );

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
/**
 * A link to another tab of this client's record.
 *
 * Always an anchor with a working href, never a bare button. The href is what
 * makes middle-click, ctrl-click and "open in new tab" behave, what a reader
 * sees on hover, and what happens on the standalone journey page where there
 * is no tab controller to ask.
 *
 * A plain left-click is intercepted instead, because a real navigation to
 * ?tab= does not work from inside the page: the App Router treats it as a soft
 * navigation, so ClientTabs re-renders with a new initial prop and is never
 * remounted - its own state keeps the old tab and nothing moves. Links written
 * as <Link href="?tab=..."> from inside the client record therefore changed
 * the address bar and left the reader looking at the page they started on.
 *
 * `clientId` is only needed when the link is rendered somewhere the current
 * URL is not already this client's record.
 */
export function TabLink({
  tab,
  clientId,
  className,
  children,
}: {
  tab: ClientTab;
  clientId?: string;
  className?: string;
  children: ReactNode;
}) {
  const controller = useClientTab();
  const href = clientId ? `/clients/${clientId}?tab=${tab}` : `?tab=${tab}`;

  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        /*
         * Anything that is not an ordinary left-click belongs to the browser -
         * a ctrl-click asking for a new tab must get one, not a tab switch in
         * the window they were trying to keep.
         */
        if (
          !controller
          || event.defaultPrevented
          || event.button !== 0
          || event.metaKey
          || event.ctrlKey
          || event.shiftKey
          || event.altKey
        ) {
          return;
        }

        event.preventDefault();
        controller.setTab(tab);
      }}
    >
      {children}
    </a>
  );
}
