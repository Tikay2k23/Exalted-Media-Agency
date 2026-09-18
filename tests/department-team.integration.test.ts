import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { compare } from "bcryptjs";
import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { can, canManageEmployeeTasks } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  canViewTask,
  checklistFromLines,
  reassignTask,
  setChecklistItem,
} from "@/lib/tasks/task-workflow";
import { taskScopeFor } from "@/lib/tasks/task-queries";
import { assigneeScope } from "@/lib/team/departments";
import { acceptInvite, issueInvite, readInvite } from "@/lib/team/invites";
import {
  addMember,
  directReportIds,
  listDepartments,
  setMemberStatus,
  updateMember,
} from "@/lib/team/team-service";

const PREFIX = "zz-dept-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let ownerId = "";
let autoLeadId = "";
let creativeLeadId = "";
let outsiderId = "";

const email = (suffix: string) => `${PREFIX}-${suffix}@example.test`;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  await prisma.employeeTask.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.notification.deleteMany({ where: { recipientId: { in: ids } } });
  await prisma.activityLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.activityLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.verificationToken.deleteMany({
    where: { identifier: { in: ids.map((id) => `invite:${id}`) } },
  });
  /* Members first: they point at the leaders. */
  await prisma.user.deleteMany({ where: { id: { in: ids }, managerId: { not: null } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function makeUser(suffix: string, role: Role, teamRole: TeamRole) {
  const user = await prisma.user.create({
    data: { name: `Dept ${suffix}`, email: email(suffix), passwordHash: "x", role, teamRole },
    select: { id: true },
  });
  return user.id;
}

async function actor(id: string) {
  const ctx = await loadAuthContext(id);
  assert.ok(ctx, `no auth context for ${id}`);
  return ctx;
}

async function makeTask(title: string, assignedToId: string, createdById: string) {
  const task = await prisma.employeeTask.create({
    data: {
      title: `${PREFIX} ${title}`,
      assignedToId,
      createdById,
      dueDate: new Date(Date.now() + 5 * 86_400_000),
    },
    select: { id: true },
  });
  return task.id;
}

describe("department teams (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();
    ownerId = await makeUser("owner", Role.OWNER, TeamRole.AGENCY_OWNER);
    autoLeadId = await makeUser("auto-lead", Role.TEAM_MEMBER, TeamRole.AUTOMATION_SPECIALIST);
    creativeLeadId = await makeUser("creative-lead", Role.TEAM_MEMBER, TeamRole.CREATIVE_SPECIALIST);
    outsiderId = await makeUser("pm", Role.TEAM_MEMBER, TeamRole.PROJECT_MANAGER);
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /* --- permissions ------------------------------------------------------- */

  it("gives a member the specialist floor and none of the leader's rights", async () => {
    const member = { id: "m", role: Role.TEAM_MEMBER, teamRole: TeamRole.DEPARTMENT_MEMBER };

    assert.equal(can(member, "governance.view"), true, "must read SOPs and resources");
    assert.equal(can(member, "workItems.view.assigned"), true);
    assert.equal(can(member, "department.lead"), false);
    assert.equal(can(member, "workItems.assign"), false);
    assert.equal(can(member, "users.manage"), false);
    assert.equal(can(member, "team.view"), false);
  });

  it("makes the four specialist seats leaders, and nobody else", () => {
    for (const seat of [
      TeamRole.AUTOMATION_SPECIALIST,
      TeamRole.CREATIVE_SPECIALIST,
      TeamRole.ADS_SPECIALIST,
      TeamRole.SALES_REP,
    ]) {
      assert.equal(can({ role: Role.TEAM_MEMBER, teamRole: seat }, "department.lead"), true, seat);
    }
    assert.equal(
      can({ role: Role.TEAM_MEMBER, teamRole: TeamRole.PROJECT_MANAGER }, "department.lead"),
      false,
    );
  });

  it("leaves the existing task-assignment gate exactly as it was", () => {
    assert.equal(canManageEmployeeTasks(Role.OWNER), true);
    assert.equal(canManageEmployeeTasks(Role.ADMIN), true);
    assert.equal(canManageEmployeeTasks(Role.MANAGER), true);
    assert.equal(canManageEmployeeTasks(Role.TEAM_MEMBER), false);
  });

  /* --- adding members ---------------------------------------------------- */

  it("lets a leader add somebody under themselves", async () => {
    const result = await addMember(await actor(autoLeadId), {
      firstName: "John",
      lastName: "Smith",
      email: email("john"),
      departmentKey: "AUTOMATION",
      jobTitle: "GHL Specialist",
    });

    assert.ok(result.ok);
    const john = await prisma.user.findUniqueOrThrow({
      where: { email: email("john") },
      select: { teamRole: true, managerId: true, department: true, role: true, jobTitle: true },
    });
    assert.equal(john.teamRole, TeamRole.DEPARTMENT_MEMBER);
    assert.equal(john.managerId, autoLeadId);
    assert.equal(john.department, "AUTOMATION");
    assert.equal(john.role, Role.TEAM_MEMBER);
    assert.equal(john.jobTitle, "GHL Specialist");
  });

  it("refuses to let a leader add somebody to another department", async () => {
    const result = await addMember(await actor(autoLeadId), {
      firstName: "Wrong",
      lastName: "Department",
      email: email("wrong"),
      departmentKey: "CREATIVE",
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "FORBIDDEN");
    assert.equal(await prisma.user.count({ where: { email: email("wrong") } }), 0);
  });

  it("refuses somebody who leads nothing", async () => {
    const result = await addMember(await actor(outsiderId), {
      firstName: "No",
      lastName: "Access",
      email: email("noaccess"),
      departmentKey: "AUTOMATION",
    });

    assert.equal(result.ok, false);
  });

  it("lets the owner add to any department, under that department's leader", async () => {
    const result = await addMember(await actor(ownerId), {
      firstName: "Maria",
      lastName: "Santos",
      email: email("maria"),
      departmentKey: "CREATIVE",
      reportsToId: creativeLeadId,
      jobTitle: "Designer",
    });

    assert.ok(result.ok);
    const maria = await prisma.user.findUniqueOrThrow({
      where: { email: email("maria") },
      select: { managerId: true },
    });
    assert.equal(maria.managerId, creativeLeadId);

    /* The leader is told somebody joined; they did not add them themselves. */
    const told = await prisma.notification.count({
      where: { recipientId: creativeLeadId, type: "TEAM_MEMBER_ADDED" },
    });
    assert.equal(told, 1);
  });

  it("refuses a duplicate email", async () => {
    const result = await addMember(await actor(autoLeadId), {
      firstName: "John",
      lastName: "Again",
      email: email("john"),
      departmentKey: "AUTOMATION",
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "DUPLICATE");
  });

  /* --- editing and moving ------------------------------------------------ */

  it("stops a leader editing somebody in another department", async () => {
    const maria = await prisma.user.findUniqueOrThrow({ where: { email: email("maria") } });
    const result = await updateMember(await actor(autoLeadId), maria.id, { jobTitle: "Hijacked" });

    assert.equal(result.ok, false);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: maria.id } });
    assert.equal(after.jobTitle, "Designer");
  });

  it("stops a leader moving their own member out of the department", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const result = await updateMember(await actor(autoLeadId), john.id, {
      departmentKey: "CREATIVE",
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "FORBIDDEN");
  });

  it("lets the owner move a member between departments", async () => {
    await addMember(await actor(ownerId), {
      firstName: "David",
      lastName: "Lee",
      email: email("david"),
      departmentKey: "AUTOMATION",
      reportsToId: autoLeadId,
    });
    const david = await prisma.user.findUniqueOrThrow({ where: { email: email("david") } });

    const moved = await updateMember(await actor(ownerId), david.id, {
      departmentKey: "CREATIVE",
      reportsToId: creativeLeadId,
    });

    assert.ok(moved.ok);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: david.id },
      select: { managerId: true, department: true },
    });
    assert.equal(after.managerId, creativeLeadId);
    assert.equal(after.department, "CREATIVE");

    /* And back, for the tests that follow. */
    await updateMember(await actor(ownerId), david.id, {
      departmentKey: "AUTOMATION",
      reportsToId: autoLeadId,
    });
  });

  it("shows a leader only their own department", async () => {
    const depts = await listDepartments(await actor(autoLeadId));

    assert.equal(depts.length, 1);
    assert.equal(depts[0].key, "AUTOMATION");
    const names = depts[0].members.map((m) => m.name);
    assert.ok(names.includes("John Smith"));
    assert.ok(!names.includes("Maria Santos"), "must not see another department's people");
  });

  it("shows the owner all four", async () => {
    const depts = await listDepartments(await actor(ownerId));
    assert.deepEqual(
      depts.map((d) => d.key),
      ["CREATIVE", "ADS", "AUTOMATION", "SALES"],
    );
  });

  /* --- assigning and seeing work ----------------------------------------- */

  it("scopes a leader's assignees to themselves and their own people", async () => {
    const leader = await actor(autoLeadId);
    const scope = assigneeScope(leader, await directReportIds(autoLeadId));
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const maria = await prisma.user.findUniqueOrThrow({ where: { email: email("maria") } });

    assert.notEqual(scope, "all");
    if (scope !== "all") {
      assert.ok(scope.has(autoLeadId));
      assert.ok(scope.has(john.id));
      assert.ok(!scope.has(maria.id), "a creative member is not the automation leader's to assign");
    }

    assert.equal(assigneeScope(await actor(ownerId), []), "all");
    const member = assigneeScope(await actor(john.id), await directReportIds(john.id));
    assert.ok(member !== "all" && member.size === 0, "a member assigns to nobody");
  });

  it("lets a leader see work somebody else assigned to their member", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const taskId = await makeTask("owner-assigned", john.id, ownerId);
    const leader = await actor(autoLeadId);

    const visible = await prisma.employeeTask.findFirst({
      where: { AND: [taskScopeFor(leader), { id: taskId }] },
    });
    assert.ok(visible, "the leader should see it in their list");

    const row = await prisma.employeeTask.findUniqueOrThrow({
      where: { id: taskId },
      select: {
        assignedToId: true,
        createdById: true,
        reviewerId: true,
        assignedTo: { select: { managerId: true } },
      },
    });
    assert.equal(canViewTask(leader, row), true, "and be able to open it");
    assert.equal(canViewTask(await actor(creativeLeadId), row), false, "but not another leader");
  });

  it("does not widen anybody else's view", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const taskId = await makeTask("private", john.id, ownerId);

    /*
     * Somebody with no reports and no blanket sight sees only their own work,
     * as before. (Not the project manager: that seat has always had
     * workItems.view.all and sees every task by design.)
     */
    const maria = await prisma.user.findUniqueOrThrow({ where: { email: email("maria") } });
    const visible = await prisma.employeeTask.findFirst({
      where: { AND: [taskScopeFor(await actor(maria.id)), { id: taskId }] },
    });
    assert.equal(visible, null);

    /* And the new clause is what a leader matches on, not a widening for them either. */
    const creativeLead = await prisma.employeeTask.findFirst({
      where: { AND: [taskScopeFor(await actor(creativeLeadId)), { id: taskId }] },
    });
    assert.equal(creativeLead, null, "another department's leader still cannot see it");
  });

  it("lets a leader reassign within the department", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const david = await prisma.user.findUniqueOrThrow({ where: { email: email("david") } });
    const taskId = await makeTask("reassign-inside", john.id, autoLeadId);

    const result = await reassignTask({ actor: await actor(autoLeadId), taskId, assigneeId: david.id });

    assert.ok(result.ok);
    const task = await prisma.employeeTask.findUniqueOrThrow({ where: { id: taskId } });
    assert.equal(task.assignedToId, david.id);
  });

  it("refuses to let a leader push work to another department", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const maria = await prisma.user.findUniqueOrThrow({ where: { email: email("maria") } });
    const taskId = await makeTask("reassign-outside", john.id, autoLeadId);

    const result = await reassignTask({ actor: await actor(autoLeadId), taskId, assigneeId: maria.id });

    assert.equal(result.ok, false);
    const task = await prisma.employeeTask.findUniqueOrThrow({ where: { id: taskId } });
    assert.equal(task.assignedToId, john.id, "must be untouched");
  });

  it("refuses to let a member reassign their own work", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const david = await prisma.user.findUniqueOrThrow({ where: { email: email("david") } });
    const taskId = await makeTask("member-reassign", john.id, autoLeadId);

    const result = await reassignTask({ actor: await actor(john.id), taskId, assigneeId: david.id });

    assert.equal(result.ok, false);
  });

  it("lets the person doing the work tick the checklist", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const task = await prisma.employeeTask.create({
      data: {
        title: `${PREFIX} checklist`,
        assignedToId: john.id,
        createdById: autoLeadId,
        dueDate: new Date(Date.now() + 86_400_000),
        checklist: checklistFromLines(["Build it", "  ", "Test it"]) as never,
      },
      select: { id: true },
    });

    const result = await setChecklistItem({ actor: await actor(john.id), taskId: task.id, itemId: "c1", done: true });

    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.checklist.length, 2, "blank lines are dropped");
      assert.equal(result.checklist[0].done, true);
      assert.equal(result.checklist[1].done, false);
    }

    /* Somebody who cannot see the task cannot tick it. */
    const maria = await prisma.user.findUniqueOrThrow({ where: { email: email("maria") } });
    const outsider = await setChecklistItem({
      actor: await actor(maria.id),
      taskId: task.id,
      itemId: "c2",
      done: true,
    });
    assert.equal(outsider.ok, false);
  });

  /* --- deactivation and invitations -------------------------------------- */

  it("issues an invite that sets a password once", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const invite = await issueInvite(john.id, "https://example.test");
    const token = invite.url.split("/invite/")[1];

    assert.ok(await readInvite(token), "a fresh link is good");

    const accepted = await acceptInvite(token, "a-strong-password");
    assert.ok(accepted.ok);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: john.id }, select: { passwordHash: true } });
    assert.equal(await compare("a-strong-password", after.passwordHash), true);

    assert.equal(await readInvite(token), null, "and it only works once");

    /* The raw token is never what is stored. */
    const stored = await prisma.verificationToken.count({ where: { token } });
    assert.equal(stored, 0);
  });

  it("refuses an invite for somebody who has been deactivated", async () => {
    const david = await prisma.user.findUniqueOrThrow({ where: { email: email("david") } });
    const invite = await issueInvite(david.id, "https://example.test");
    const token = invite.url.split("/invite/")[1];

    await setMemberStatus(await actor(autoLeadId), david.id, "INACTIVE");

    assert.equal(await readInvite(token), null);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: david.id }, select: { isActive: true } });
    assert.equal(after.isActive, false, "inactive is what the login refuses");

    await setMemberStatus(await actor(autoLeadId), david.id, "ACTIVE");
  });

  it("deactivates without deleting, handing open work to a colleague", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const david = await prisma.user.findUniqueOrThrow({ where: { email: email("david") } });
    const open = await makeTask("handover-open", david.id, autoLeadId);
    const done = await prisma.employeeTask.create({
      data: {
        title: `${PREFIX} handover-done`,
        assignedToId: david.id,
        createdById: autoLeadId,
        dueDate: new Date(),
        status: "DONE",
      },
      select: { id: true },
    });

    const result = await setMemberStatus(await actor(autoLeadId), david.id, "INACTIVE", john.id);

    assert.ok(result.ok);
    assert.equal(await prisma.user.count({ where: { id: david.id } }), 1, "never deleted");
    assert.equal(
      (await prisma.employeeTask.findUniqueOrThrow({ where: { id: open } })).assignedToId,
      john.id,
      "unfinished work moves",
    );
    assert.equal(
      (await prisma.employeeTask.findUniqueOrThrow({ where: { id: done.id } })).assignedToId,
      david.id,
      "finished work stays with the person who did it",
    );
  });

  it("refuses to hand work to somebody outside the department", async () => {
    const john = await prisma.user.findUniqueOrThrow({ where: { email: email("john") } });
    const maria = await prisma.user.findUniqueOrThrow({ where: { email: email("maria") } });

    const result = await setMemberStatus(await actor(autoLeadId), john.id, "ON_LEAVE", maria.id);

    assert.equal(result.ok, false);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: john.id }, select: { availability: true } });
    assert.notEqual(after.availability, "ON_LEAVE", "nothing changed");
  });

  it("stops a leader deactivating another department's member", async () => {
    const maria = await prisma.user.findUniqueOrThrow({ where: { email: email("maria") } });
    const result = await setMemberStatus(await actor(autoLeadId), maria.id, "INACTIVE");

    assert.equal(result.ok, false);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: maria.id }, select: { isActive: true } });
    assert.equal(after.isActive, true);
  });
});
