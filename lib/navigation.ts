import type { Permission } from "@/lib/permissions";

/**
 * Sidebar structure.
 *
 * Navigation is derived from permissions, never from role checks in the
 * component. A link only appears when the signed-in user actually holds one of
 * its permissions, so nobody is shown a page that will reject them.
 *
 * Only routes that exist are listed here. A navigation entry pointing at an
 * unbuilt page is a broken link, not a roadmap.
 *
 * Kept deliberately short. Five of the eleven entries this replaced - Accounts,
 * Client Journey, Pipeline, My Work, Weekly Work - all read as "where the work
 * is", and nobody could tell which one to open. Pages that are real but rarely
 * the first thing you want now live where they belong rather than competing for
 * a top-level slot: user accounts under Settings, and team workload, weekly
 * updates and task assignment all under My Work - which is where somebody
 * already is when they think about any of them. /team still resolves; it
 * redirects here.
 */

export interface NavigationItem {
  href: string;
  label: string;
  /** Icon name resolved in the sidebar component. */
  icon: string;
  /** The user needs at least one of these. Omit for "any signed-in user". */
  anyOf?: Permission[];
  description?: string;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const NAVIGATION: NavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "LayoutDashboard",
        description: "Where the agency stands today",
      },
      {
        href: "/work",
        label: "My Work",
        icon: "CalendarRange",
        description: "What needs you today, and everything assigned to you",
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        href: "/leads",
        label: "Sales",
        icon: "Flame",
        anyOf: ["leads.view.all", "leads.view.assigned"],
        description: "Leads, qualification and closing",
      },
    ],
  },
  {
    label: "Delivery",
    items: [
      {
        href: "/clients",
        label: "Clients",
        icon: "BriefcaseBusiness",
        anyOf: ["clients.view.all", "clients.view.assigned"],
        description: "Every account and everything on it",
      },
      {
        href: "/journey",
        label: "Journey",
        icon: "Route",
        anyOf: ["journey.view"],
        description: "Where every account is, and what is blocking it",
      },
    ],
  },
  {
    label: "Organisation",
    items: [
      {
        href: "/governance",
        label: "SOPs and Audits",
        icon: "ScrollText",
        anyOf: ["governance.view"],
        description: "The rules, and whether they are followed",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "Settings2",
        description: "Your profile, and user accounts",
      },
    ],
  },
];

/** Filters the navigation tree down to what this user may actually reach. */
export function visibleNavigation(permissions: ReadonlySet<string>): NavigationGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.anyOf || item.anyOf.some((permission) => permissions.has(permission)),
    ),
  })).filter((group) => group.items.length > 0);
}
