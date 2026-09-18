import { AvailabilityStatus, EmploymentType, Prisma, Role, TeamRole } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  CLOSED_TASK_STATUSES,
  DEPARTMENTS,
  type DepartmentDef,
  type DepartmentKey,
  type MemberStatus,
  canManageAllDepartments,
  canManageDepartment,
  departmentByKey,
  departmentForSeat,
  ledDepartment,
  managedDepartments,
  memberStatusOf,
} from "@/lib/team/departments";
import { revokeInvites, unusablePasswordHash } from "@/lib/team/invites";

/**
 * Department members: the people who work under the four department leaders.
 *
 * A member is an ordinary User with the DEPARTMENT_MEMBER seat and a managerId
 * pointing at their leader. No parallel people table, no separate profile
 * system - the existing User record, login, activity log and notifications do
 * the work.
 *
 * Every function checks scope itself. The screen hides what a leader cannot
 * do; this is what actually stops them.
 */

export type TeamFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "DUPLICATE";

export interface TeamFailure {
  ok: false;
  code: TeamFailureCode;
  message: string;
}

function failure(code: TeamFailureCode, message: string): TeamFailure {
  return { ok: false, code, message };
}

export const TEAM_FAILURE_STATUS: Record<TeamFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  DUPLICATE: 409,
};

/** Active holders of a department's seat - the people who lead it. */
async function leadersOf(dept: DepartmentDef) {
  return prisma.user.findMany({
    where: { teamRole: dept.seat, isActive: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
}

/** The department a member belongs to, read from their leader's seat. */
async function departmentOfMember(memberId: string) {
  const member = await prisma.user.findFirst({
    where: { id: memberId, deletedAt: null },
    select: {
      id: true,
      name: true,
      teamRole: true,
      managerId: true,
      isActive: true,
      availability: true,
      manager: { select: { id: true, name: true, teamRole: true } },
    },
  });

  if (!member || member.teamRole !== TeamRole.DEPARTMENT_MEMBER) return null;

  return { member, dept: departmentForSeat(member.manager?.teamRole) };
}

/** The active members reporting to this person. */
export async function directReportIds(leaderId: string) {
  const rows = await prisma.user.findMany({
    where: { managerId: leaderId, isActive: true, deletedAt: null },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

/* --- reading --- */

interface WorkloadCounts {
  open: number;
  dueSoon: number;
  overdue: number;
  highPriority: number;
}

const EMPTY_LOAD: WorkloadCounts = { open: 0, dueSoon: 0, overdue: 0, highPriority: 0 };

/**
 * Open-task counts per person, in one query.
 *
 * Kept deliberately simple - enough to decide who gets the next task, not a
 * workforce-analytics screen. "Due soon" is the next two days.
 */
async function workloadFor(userIds: string[], now = new Date()) {
  const soon = new Date(now.getTime() + 2 * 86_400_000);
  const map = new Map<string, WorkloadCounts>();

  if (!userIds.length) return map;

  const rows = await prisma.employeeTask.findMany({
    where: {
      assignedToId: { in: userIds },
      deletedAt: null,
      archivedAt: null,
      status: { notIn: [...CLOSED_TASK_STATUSES] },
    },
    select: { assignedToId: true, dueDate: true, priority: true },
  });

  for (const row of rows) {
    const load = map.get(row.assignedToId) ?? { ...EMPTY_LOAD };
    load.open += 1;
    if (row.dueDate < now) load.overdue += 1;
    else if (row.dueDate <= soon) load.dueSoon += 1;
    if (row.priority === "HIGH" || row.priority === "URGENT" || row.priority === "CRITICAL") {
      load.highPriority += 1;
    }
    map.set(row.assignedToId, load);
  }

  return map;
}

const MEMBER_SELECT = {
  id: true,
  name: true,
  email: true,
  jobTitle: true,
  avatarUrl: true,
  phone: true,
  timezone: true,
  workingHours: true,
  startDate: true,
  notes: true,
  employmentType: true,
  isActive: true,
  availability: true,
  managerId: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

/**
 * The departments this person manages, with their people and workload.
 *
 * An owner sees all four; a leader sees their own; anybody else sees none.
 * Inactive members are included - deactivating somebody should not make them
 * vanish from the list while their unfinished work still needs moving.
 */
export async function listDepartments(actor: AuthContext) {
  const depts = managedDepartments(actor);

  if (!depts.length) return [];

  const leadersByDept = await Promise.all(depts.map((dept) => leadersOf(dept)));
  const leaderIds = leadersByDept.flat().map((leader) => leader.id);

  const members = await prisma.user.findMany({
    where: {
      teamRole: TeamRole.DEPARTMENT_MEMBER,
      managerId: { in: leaderIds },
      deletedAt: null,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: MEMBER_SELECT,
  });

  const load = await workloadFor([...leaderIds, ...members.map((m) => m.id)]);

  return depts.map((dept, index) => {
    const leaders = leadersByDept[index];
    const ids = new Set(leaders.map((leader) => leader.id));

    return {
      key: dept.key,
      label: dept.label,
      leaders: leaders.map((leader) => ({
        ...leader,
        workload: load.get(leader.id) ?? EMPTY_LOAD,
      })),
      members: members
        .filter((member) => member.managerId && ids.has(member.managerId))
        .map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          jobTitle: member.jobTitle,
          avatarUrl: member.avatarUrl,
          employmentType: member.employmentType,
          reportsToId: member.managerId,
          status: memberStatusOf(member),
          lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
          workload: load.get(member.id) ?? EMPTY_LOAD,
        })),
    };
  });
}

/**
 * One member's profile, for the View action.
 *
 * Visible to whoever manages their department, and to the member themselves.
 */
export async function getMemberProfile(actor: AuthContext, memberId: string) {
  const found = await departmentOfMember(memberId);

  if (!found || !found.dept) return failure("NOT_FOUND", "Team member not found.");

  const isSelf = actor.id === memberId;

  if (!isSelf && !canManageDepartment(actor, found.dept.key)) {
    return failure("NOT_FOUND", "Team member not found.");
  }

  const now = new Date();

  const [profile, tasks, activity] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: memberId }, select: MEMBER_SELECT }),
    prisma.employeeTask.findMany({
      where: { assignedToId: memberId, deletedAt: null, archivedAt: null },
      orderBy: { dueDate: "asc" },
      take: 200,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        client: { select: { id: true, companyName: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.activityLog.findMany({
      where: { actorId: memberId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, createdAt: true },
    }),
  ]);

  const open = tasks.filter(
    (task) => !(CLOSED_TASK_STATUSES as readonly string[]).includes(task.status),
  );

  const clients = new Map<string, string>();
  const projects = new Map<string, string>();
  for (const task of open) {
    if (task.client) clients.set(task.client.id, task.client.companyName);
    if (task.project) projects.set(task.project.id, task.project.name);
  }

  return {
    ok: true as const,
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      jobTitle: profile.jobTitle,
      avatarUrl: profile.avatarUrl,
      phone: profile.phone,
      timezone: profile.timezone,
      workingHours: profile.workingHours,
      startDate: profile.startDate?.toISOString() ?? null,
      notes: profile.notes,
      employmentType: profile.employmentType,
      status: memberStatusOf(profile),
      department: found.dept.label,
      departmentKey: found.dept.key,
      reportsTo: found.member.manager?.name ?? null,
      reportsToId: found.member.managerId,
      counts: {
        assigned: open.length,
        completed: tasks.length - open.length,
        overdue: open.filter((task) => task.dueDate < now).length,
      },
      openTasks: open.slice(0, 15).map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate.toISOString(),
        client: task.client?.companyName ?? null,
      })),
      clients: [...clients.values()],
      projects: [...projects.values()],
      recentActivity: activity.map((event) => ({
        id: event.id,
        action: event.action,
        at: event.createdAt.toISOString(),
      })),
    },
  };
}

/* --- writing --- */

export interface MemberInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  departmentKey: DepartmentKey;
  reportsToId?: string | null;
  jobTitle?: string | null;
  employmentType?: EmploymentType;
  timezone?: string | null;
  workingHours?: string | null;
  startDate?: string | null;
  status?: MemberStatus;
  notes?: string | null;
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function statusColumns(status: MemberStatus | undefined) {
  if (status === "INACTIVE") {
    return { isActive: false };
  }

  return {
    isActive: true,
    availability: status === "ON_LEAVE" ? AvailabilityStatus.ON_LEAVE : AvailabilityStatus.AVAILABLE,
  };
}

/**
 * Resolves who a new or moved member reports to.
 *
 * A leader always adds people under themselves - they cannot name somebody
 * else's leader. An owner may pick a leader of the chosen department, and gets
 * its first leader when they do not.
 */
async function resolveLeader(actor: AuthContext, dept: DepartmentDef, requested?: string | null) {
  if (!canManageAllDepartments(actor)) {
    return { ok: true as const, leaderId: actor.id };
  }

  const leaders = await leadersOf(dept);

  if (!leaders.length) {
    return failure(
      "INVALID",
      `The ${dept.label} department has no active leader yet, so there is nobody for this person to report to.`,
    );
  }

  if (requested) {
    const match = leaders.find((leader) => leader.id === requested);
    if (!match) return failure("INVALID", `That person does not lead the ${dept.label} department.`);
    return { ok: true as const, leaderId: match.id };
  }

  return { ok: true as const, leaderId: leaders[0].id };
}

export async function addMember(actor: AuthContext, input: MemberInput) {
  const dept = departmentByKey(input.departmentKey);

  if (!dept) return failure("INVALID", "Choose a department.");

  if (!canManageDepartment(actor, dept.key)) {
    return failure("FORBIDDEN", "You can only add people to your own department.");
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();

  if (!firstName || !lastName) return failure("INVALID", "A first and last name are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return failure("INVALID", "That email address is not valid.");

  const leader = await resolveLeader(actor, dept, input.reportsToId);

  if (!leader.ok) return leader;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) return failure("DUPLICATE", "Somebody with that email already has an account.");

  const startDate = input.startDate ? new Date(input.startDate) : null;

  if (startDate && Number.isNaN(startDate.getTime())) {
    return failure("INVALID", "That start date is not valid.");
  }

  const name = `${firstName} ${lastName}`;

  const member = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await unusablePasswordHash(),
      role: Role.TEAM_MEMBER,
      teamRole: TeamRole.DEPARTMENT_MEMBER,
      department: dept.department,
      jobTitle: clean(input.jobTitle),
      employmentType: input.employmentType ?? EmploymentType.FULL_TIME,
      phone: clean(input.phone),
      avatarUrl: clean(input.avatarUrl),
      timezone: clean(input.timezone),
      workingHours: clean(input.workingHours),
      startDate,
      notes: clean(input.notes),
      managerId: leader.leaderId,
      ...statusColumns(input.status),
    },
    select: { id: true, name: true },
  });

  await logActivity({
    actorId: actor.id,
    action: `${actor.name} added ${name} to the ${dept.label} department`,
    entityType: "USER",
    entityId: member.id,
  });

  /* The leader hears about it when somebody else added to their department. */
  if (leader.leaderId !== actor.id) {
    await createNotifications([
      {
        recipientId: leader.leaderId,
        type: "TEAM_MEMBER_ADDED",
        title: `${name} joined your department`,
        body: `${actor.name} added ${name}${clean(input.jobTitle) ? ` (${clean(input.jobTitle)})` : ""} to ${dept.label}.`,
        entityType: "USER",
        entityId: member.id,
        href: "/work#department",
      },
    ]);
  }

  return { ok: true as const, memberId: member.id };
}

export async function updateMember(
  actor: AuthContext,
  memberId: string,
  input: Partial<MemberInput>,
) {
  const found = await departmentOfMember(memberId);

  if (!found || !found.dept) return failure("NOT_FOUND", "Team member not found.");

  if (!canManageDepartment(actor, found.dept.key)) {
    return failure("FORBIDDEN", "You can only edit people in your own department.");
  }

  const data: Prisma.UserUpdateInput = {};

  if (input.firstName !== undefined || input.lastName !== undefined) {
    const first = input.firstName?.trim();
    const last = input.lastName?.trim();
    if (!first || !last) return failure("INVALID", "A first and last name are required.");
    data.name = `${first} ${last}`;
  }

  if (input.jobTitle !== undefined) data.jobTitle = clean(input.jobTitle);
  if (input.phone !== undefined) data.phone = clean(input.phone);
  if (input.avatarUrl !== undefined) data.avatarUrl = clean(input.avatarUrl);
  if (input.timezone !== undefined) data.timezone = clean(input.timezone);
  if (input.workingHours !== undefined) data.workingHours = clean(input.workingHours);
  if (input.notes !== undefined) data.notes = clean(input.notes);
  if (input.employmentType !== undefined) data.employmentType = input.employmentType;

  if (input.startDate !== undefined) {
    const start = input.startDate ? new Date(input.startDate) : null;
    if (start && Number.isNaN(start.getTime())) return failure("INVALID", "That start date is not valid.");
    data.startDate = start;
  }

  let moved: DepartmentDef | null = null;

  /*
   * Moving between departments, or to another leader. Owner only: a leader
   * who could move somebody out would be managing the department they moved
   * them into.
   */
  const wantsMove =
    (input.departmentKey && input.departmentKey !== found.dept.key)
    || (input.reportsToId && input.reportsToId !== found.member.managerId);

  if (wantsMove) {
    if (!canManageAllDepartments(actor)) {
      return failure("FORBIDDEN", "Only the agency owner can move somebody to another department.");
    }

    const target = departmentByKey(input.departmentKey ?? found.dept.key);
    if (!target) return failure("INVALID", "Choose a department.");

    const leader = await resolveLeader(actor, target, input.reportsToId);
    if (!leader.ok) return leader;

    data.manager = { connect: { id: leader.leaderId } };
    data.department = target.department;
    if (target.key !== found.dept.key) moved = target;
  }

  await prisma.user.update({ where: { id: memberId }, data });

  await logActivity({
    actorId: actor.id,
    action: moved
      ? `${actor.name} moved ${found.member.name} from ${found.dept.label} to ${moved.label}`
      : `${actor.name} updated ${found.member.name}'s details`,
    entityType: "USER",
    entityId: memberId,
  });

  return { ok: true as const };
}

/**
 * Active, on leave, or inactive.
 *
 * Never a delete. Inactive sets isActive = false, which the login already
 * refuses and which the session check re-reads on every request, so access
 * ends immediately. Completed work, comments and history are untouched.
 *
 * Unfinished work can be handed on in the same step, to somebody else in the
 * department - otherwise it sits assigned to a person who can no longer log in.
 */
export async function setMemberStatus(
  actor: AuthContext,
  memberId: string,
  status: MemberStatus,
  reassignToId?: string | null,
) {
  const found = await departmentOfMember(memberId);

  if (!found || !found.dept) return failure("NOT_FOUND", "Team member not found.");

  if (!canManageDepartment(actor, found.dept.key)) {
    return failure("FORBIDDEN", "You can only change people in your own department.");
  }

  let handedOnTo: { id: string; name: string } | null = null;

  if (reassignToId) {
    if (reassignToId === memberId) return failure("INVALID", "Choose somebody else to take the work.");

    const target = await prisma.user.findFirst({
      where: { id: reassignToId, isActive: true, deletedAt: null },
      select: { id: true, name: true, teamRole: true, managerId: true },
    });

    /* Handed on within the department only: its leader, or another member of it. */
    const leaderIds = new Set((await leadersOf(found.dept)).map((l) => l.id));
    const inDepartment =
      target && (leaderIds.has(target.id) || (target.managerId && leaderIds.has(target.managerId)));

    if (!target || !inDepartment) {
      return failure("INVALID", "Unfinished work can only be handed to somebody in the same department.");
    }

    handedOnTo = { id: target.id, name: target.name };
  }

  const openWhere: Prisma.EmployeeTaskWhereInput = {
    assignedToId: memberId,
    deletedAt: null,
    archivedAt: null,
    status: { notIn: [...CLOSED_TASK_STATUSES] },
  };

  /* The status change and the hand-over land together or not at all. */
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.user.update({ where: { id: memberId }, data: statusColumns(status) }),
  ];

  if (handedOnTo) {
    operations.push(
      prisma.employeeTask.updateMany({ where: openWhere, data: { assignedToId: handedOnTo.id } }),
    );
  }

  const results = await prisma.$transaction(operations);
  const movedCount = handedOnTo ? (results[1] as Prisma.BatchPayload).count : 0;

  if (status === "INACTIVE") {
    await revokeInvites(memberId);
  }

  const label = status === "INACTIVE" ? "inactive" : status === "ON_LEAVE" ? "on leave" : "active";

  await logActivity({
    actorId: actor.id,
    action:
      `${actor.name} set ${found.member.name} to ${label}`
      + (handedOnTo && movedCount ? ` and reassigned ${movedCount} open task${movedCount === 1 ? "" : "s"} to ${handedOnTo.name}` : ""),
    entityType: "USER",
    entityId: memberId,
  });

  if (handedOnTo && movedCount) {
    await createNotifications([
      {
        recipientId: handedOnTo.id,
        type: "TASK_ASSIGNED",
        title: `${movedCount} task${movedCount === 1 ? "" : "s"} reassigned to you`,
        body: `${found.member.name}'s unfinished work was handed to you.`,
        href: "/work",
      },
    ]);
  }

  return { ok: true as const, reassigned: movedCount };
}

/** For the Add Team Member form: which departments this person may add to. */
export function addableDepartments(actor: AuthContext) {
  return managedDepartments(actor).map((dept) => ({ key: dept.key, label: dept.label }));
}

/** Whether this person sees the department section at all. */
export function seesDepartments(actor: AuthContext) {
  return canManageAllDepartments(actor) || Boolean(ledDepartment(actor));
}

export { DEPARTMENTS };

/**
 * What a department leader's Assign Task form needs.
 *
 * The existing loader only fills these for people who could already assign
 * work, so a leader would otherwise open the form to empty lists. Assignees are
 * scoped to the leader and their own active members; clients, projects and SOPs
 * are the names needed to link a task to existing records - ids and titles, not
 * the records themselves.
 */
export async function getLeaderTaskOptions(actor: AuthContext) {
  const led = ledDepartment(actor);

  if (!led) return null;

  const [people, clients, projects, sops] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [{ id: actor.id }, { managerId: actor.id }],
        isActive: true,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, teamRole: true, jobTitle: true },
    }),
    prisma.client.findMany({
      where: { deletedAt: null },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, clientId: true },
    }),
    prisma.sop.findMany({
      orderBy: { reference: "asc" },
      select: { id: true, reference: true, title: true, status: true },
    }),
  ]);

  return { users: people, clients, projects, sops };
}
