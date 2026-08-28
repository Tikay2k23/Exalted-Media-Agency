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

/**
 * What sits behind More, in three groups.
 *
 * Grouped rather than listed because the six are not one kind of thing:
 * running the account, billing it, and ending it are separate jobs, and a flat
 * list of six makes somebody read all of them to find the one they meant.
 *
 * The order is the order an account passes through them.
 */
const SECONDARY_GROUPS: { heading: string; tabs: { key: ClientTab; label: string }[] }[] = [
  {
    heading: "Operations",
    tabs: [
      { key: "files", label: "Files & Access" },
      { key: "activity", label: "Activity & Notes" },
      { key: "integrations", label: "Integrations" },
    ],
  },
  {
    heading: "Commercial",
    tabs: [
      { key: "billing", label: "Billing & Payments" },
      { key: "renewal", label: "Renewal & Growth" },
    ],
  },
  {
    heading: "Lifecycle",
    tabs: [{ key: "offboarding", label: "Offboarding" }],
  },
];

const SECONDARY = SECONDARY_GROUPS.flatMap((group) => group.tabs);

export const ALL_CLIENT_TABS = [...PRIMARY, ...SECONDARY];

/**
 * A short word on a menu entry, drawn from the account's own records.
 *
 * Only ever real: the caller computes these from rows it has already loaded,
 * and a tab with nothing to say carries nothing. A badge that appears on every
 * account teaches people to stop reading badges.
 */
export type TabBadges = Partial<Record<ClientTab, { label: string; tone: "rose" | "amber" | "slate" }>>;

const BADGE_TONES = {
  rose: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-800",
  slate: "bg-slate-100 text-slate-600",
} as const;

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
  badges = {},
}: {
  initial: ClientTab;
  panels: Partial<Record<ClientTab, ReactNode>>;
  badges?: TabBadges;
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

          </div>

          {/*
            * More at every width.
            *
            * Three of these used to sit inline on a wide screen. Six cannot:
            * the strip becomes thirteen tabs, which is the clutter the menu
            * exists to prevent, and the seven that matter stop standing out.
            */}
          <div className="relative shrink-0">
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
              {/*
                * One dot when something behind the menu needs attention, so a
                * closed menu is not silence. Which item it is stays inside -
                * the strip is not the place to enumerate them.
                */}
              {!inMore && SECONDARY.some((tab) => badges[tab.key]?.tone === "rose") ? (
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-label="Needs attention" />
              ) : null}
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
                <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {SECONDARY_GROUPS.map((group, index) => (
                    <div key={group.heading}>
                      {index > 0 ? <div className="my-1 border-t border-slate-100" /> : null}
                      <p className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {group.heading}
                      </p>
                      {group.tabs.map((tab) => {
                        const badge = badges[tab.key];

                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setTab(tab.key)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                              active === tab.key
                                ? "bg-slate-950 font-semibold text-white"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span>{tab.label}</span>
                            {badge ? (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  active === tab.key
                                    ? "bg-white/15 text-white"
                                    : BADGE_TONES[badge.tone]
                                }`}
                              >
                                {badge.label}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
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
