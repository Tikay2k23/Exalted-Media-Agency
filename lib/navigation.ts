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
        description: "Agency command centre",
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        href: "/leads",
        label: "Leads and Sales",
        icon: "Flame",
        anyOf: ["leads.view.all", "leads.view.assigned"],
        description: "Lead pipeline, qualification, and conversion",
      },
    ],
  },
  {
    label: "Delivery",
    items: [
      {
        href: "/clients",
        label: "Accounts",
        icon: "BriefcaseBusiness",
        anyOf: ["clients.view.all", "clients.view.assigned"],
        description: "Client account directory",
      },
      {
        href: "/journey",
        label: "Client Journey",
        icon: "Route",
        anyOf: ["journey.view"],
        description: "Stage gates and journey control",
      },
      {
        href: "/pipeline",
        label: "Pipeline",
        icon: "KanbanSquare",
        anyOf: ["journey.view"],
        description: "Drag-and-drop account movement",
      },
      {
        href: "/fulfillment",
        label: "Weekly Work",
        icon: "CalendarRange",
        anyOf: ["workItems.view.all", "workItems.view.assigned"],
        description: "Weekly execution and EOD updates",
      },
    ],
  },
  {
    label: "Organisation",
    items: [
      {
        href: "/team",
        label: "Team",
        icon: "Users2",
        anyOf: ["team.view", "dashboard.view.own"],
        description: "Workload and capacity",
      },
      {
        href: "/governance",
        label: "Governance",
        icon: "ScrollText",
        anyOf: ["governance.view"],
        description: "SOPs, audits and improvement",
      },
      {
        href: "/admin/users",
        label: "Users",
        icon: "ShieldCheck",
        anyOf: ["users.manage"],
        description: "Accounts, roles, and positions",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "Settings2",
        description: "Your profile and preferences",
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
