import { Department, TeamRole } from "@prisma/client";

import { type AuthContext } from "@/lib/authz";
import { can, canManageEmployeeTasks } from "@/lib/permissions";

/**
 * The four departments, and who runs each.
 *
 * A department is not a new table. It is one of the four leader seats that
 * already exist - the Creative, Ads and Reporting, Automation and Sales
 * accounts - and the people who report to whoever holds that seat. So:
 *
 *   leader  = a user holding one of these seats
 *   member  = a DEPARTMENT_MEMBER whose managerId points at a leader
 *   a member's department = their leader's seat
 *
 * Nothing about the existing accounts changes: they keep their names, seats
 * and access. Holding the seat is what makes them a leader.
 *
 * The HR `department` column on User is set to match, so the existing team
 * screens that show it read correctly - but access is decided by the seat and
 * the reporting line, never by that label.
 */
export const DEPARTMENTS = [
  {
    key: "CREATIVE",
    seat: TeamRole.CREATIVE_SPECIALIST,
    label: "Creative",
    department: Department.CREATIVE,
  },
  {
    key: "ADS",
    seat: TeamRole.ADS_SPECIALIST,
    label: "Ads & Reporting",
    department: Department.PAID_MEDIA,
  },
  {
    key: "AUTOMATION",
    seat: TeamRole.AUTOMATION_SPECIALIST,
    label: "Automation",
    department: Department.AUTOMATION,
  },
  {
    key: "SALES",
    seat: TeamRole.SALES_REP,
    label: "Sales",
    department: Department.SALES,
  },
] as const;

export type DepartmentDef = (typeof DEPARTMENTS)[number];
export type DepartmentKey = DepartmentDef["key"];

export const DEPARTMENT_KEYS = DEPARTMENTS.map((d) => d.key) as [DepartmentKey, ...DepartmentKey[]];

export function departmentByKey(key: string): DepartmentDef | null {
  return DEPARTMENTS.find((d) => d.key === key) ?? null;
}

export function departmentForSeat(seat: TeamRole | null | undefined): DepartmentDef | null {
  return DEPARTMENTS.find((d) => d.seat === seat) ?? null;
}

/**
 * Whether this person runs every department.
 *
 * The agency owner and admins - anybody who already manages users. They add
 * people to any department, move them between departments, and set leaders.
 */
export function canManageAllDepartments(actor: AuthContext) {
  return can(actor, "users.manage");
}

/**
 * The one department this person leads, if they lead one.
 *
 * Needs both the permission and one of the four seats. The permission alone is
 * not enough - the owner holds every permission but no department seat - which
 * is why an owner's reach comes from canManageAllDepartments instead.
 */
export function ledDepartment(actor: AuthContext): DepartmentDef | null {
  if (!can(actor, "department.lead")) return null;

  return departmentForSeat(actor.teamRole);
}

/** The departments this person may see and manage. */
export function managedDepartments(actor: AuthContext): DepartmentDef[] {
  if (canManageAllDepartments(actor)) return [...DEPARTMENTS];

  const led = ledDepartment(actor);

  return led ? [led] : [];
}

/**
 * Whether this person may manage the given department.
 *
 * The rule the whole feature rests on: a leader acts on their own department
 * and on nobody else's. Checked on the server for every write.
 */
export function canManageDepartment(actor: AuthContext, key: DepartmentKey) {
  if (canManageAllDepartments(actor)) return true;

  return ledDepartment(actor)?.key === key;
}

/**
 * Who this person may assign work to.
 *
 * "all" for exactly the people who could assign work before departments
 * existed - the same tier check POST /api/employee-tasks has always made, so
 * nobody's reach grows or shrinks. A department leader gets themselves and
 * their own active members. Everybody else assigns to nobody.
 */
export function assigneeScope(
  actor: AuthContext,
  directReportIds: string[],
): "all" | Set<string> {
  if (canManageEmployeeTasks(actor.role)) {
    return "all";
  }

  if (ledDepartment(actor)) {
    return new Set([actor.id, ...directReportIds]);
  }

  return new Set();
}

/** Member status, as the three words people use for it. */
export const MEMBER_STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * A status read from the columns that already hold it.
 *
 * No new column: "inactive" is isActive = false, which login already refuses,
 * and "on leave" is the existing ON_LEAVE availability.
 */
export function memberStatusOf(user: { isActive: boolean; availability: string }): MemberStatus {
  if (!user.isActive) return "INACTIVE";

  return user.availability === "ON_LEAVE" ? "ON_LEAVE" : "ACTIVE";
}

/** Statuses that mean a task is finished with, for workload counts. */
export const CLOSED_TASK_STATUSES = ["DONE", "APPROVED", "CANCELLED"] as const;
