import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import {
  PERMISSIONS,
  type Permission,
  can,
  isPermission,
  resolvePermissions,
  roleLabels,
  teamRoleDescriptions,
  teamRoleLabels,
  canManageClients,
  canManageUsers,
  canMovePipeline,
  canViewAllAgencyData,
} from "@/lib/permissions";

/** A team member holding a given seat, which is the normal case. */
const seat = (teamRole: TeamRole) => ({ role: Role.TEAM_MEMBER, teamRole });

describe("the six seats", () => {
  it("gives the agency owner everything", () => {
    assert.equal(resolvePermissions(seat(TeamRole.AGENCY_OWNER)).size, PERMISSIONS.length);
  });

  it("keeps sales out of delivery, production, and money", () => {
    const sales = seat(TeamRole.SALES_REP);

    assert.equal(can(sales, "leads.view.all"), true);
    assert.equal(can(sales, "leads.convert"), true);
    assert.equal(can(sales, "sales.reporting"), true);

    // A sales rep must not reach production records or financial data.
    assert.equal(can(sales, "projects.manage"), false);
    assert.equal(can(sales, "workItems.assign"), false);
    assert.equal(can(sales, "finance.view"), false);
    assert.equal(can(sales, "reporting.financial"), false);
    assert.equal(can(sales, "users.manage"), false);
  });

  it("gives the project manager the delivery and client-success authority", () => {
    const pm = seat(TeamRole.PROJECT_MANAGER);

    for (const permission of [
      "clients.view.all",
      "clients.edit",
      "journey.move",
      "journey.override",
      "workItems.assign",
      "qa.approve",
      "launch.activate",
      "health.manage",
      "renewals.manage",
      "offboarding.manage",
    ] as Permission[]) {
      assert.equal(can(pm, permission), true, `project manager should hold ${permission}`);
    }

    // Money and agency governance stay with the owner.
    assert.equal(can(pm, "finance.edit"), false);
    assert.equal(can(pm, "reporting.financial"), false);
    assert.equal(can(pm, "users.manage"), false);
    assert.equal(can(pm, "settings.system"), false);
  });

  it("restricts every specialist seat to their own assigned work", () => {
    for (const specialist of [
      TeamRole.AUTOMATION_SPECIALIST,
      TeamRole.CREATIVE_SPECIALIST,
      TeamRole.ADS_SPECIALIST,
    ]) {
      const user = seat(specialist);

      assert.equal(can(user, "workItems.view.assigned"), true, specialist);
      assert.equal(can(user, "workItems.updateOwn"), true, specialist);

      assert.equal(can(user, "workItems.view.all"), false, specialist);
      assert.equal(can(user, "clients.view.all"), false, specialist);
      assert.equal(can(user, "leads.view.all"), false, specialist);
      assert.equal(can(user, "finance.view"), false, specialist);
      assert.equal(can(user, "journey.override"), false, specialist);
      assert.equal(can(user, "users.manage"), false, specialist);
    }
  });

  it("shares QA across the specialist seats instead of a seventh person", () => {
    // The agency has six people. Every specialist can test their own area,
    // which is what makes a separate QA seat unnecessary.
    for (const specialist of [
      TeamRole.AUTOMATION_SPECIALIST,
      TeamRole.CREATIVE_SPECIALIST,
      TeamRole.ADS_SPECIALIST,
    ]) {
      assert.equal(can(seat(specialist), "qa.test"), true, specialist);
    }

    // Closing a defect is a separate authority and stays with the PM and owner,
    // which is what stops a builder signing off their own work.
    assert.equal(can(seat(TeamRole.CREATIVE_SPECIALIST), "qa.closeDefect"), false);
    assert.equal(can(seat(TeamRole.PROJECT_MANAGER), "qa.closeDefect"), true);
    assert.equal(can(seat(TeamRole.AGENCY_OWNER), "qa.closeDefect"), true);
  });

  it("only lets the owner and project manager override a stage gate", () => {
    assert.equal(can(seat(TeamRole.AGENCY_OWNER), "journey.override"), true);
    assert.equal(can(seat(TeamRole.PROJECT_MANAGER), "journey.override"), true);

    assert.equal(can(seat(TeamRole.SALES_REP), "journey.override"), false);
    assert.equal(can(seat(TeamRole.CREATIVE_SPECIALIST), "journey.override"), false);
  });

  it("keeps financial data to the owner alone", () => {
    for (const teamRole of Object.values(TeamRole)) {
      const granted = resolvePermissions(seat(teamRole));

      if (teamRole !== TeamRole.AGENCY_OWNER) {
        assert.equal(granted.has("finance.view"), false, teamRole);
        assert.equal(granted.has("finance.edit"), false, teamRole);
      }
    }
  });
});

describe("backward compatibility with pre-seat accounts", () => {
  it("keeps an ADMIN fully privileged whatever their seat", () => {
    const admin = { role: Role.ADMIN, teamRole: TeamRole.CREATIVE_SPECIALIST };

    assert.equal(canManageUsers(Role.ADMIN), true);
    assert.equal(can(admin, "users.manage"), true);
    assert.equal(resolvePermissions(admin).size, PERMISSIONS.length);
  });

  it("keeps a MANAGER able to manage clients and assign work", () => {
    const manager = { role: Role.MANAGER, teamRole: TeamRole.PROJECT_MANAGER };

    assert.equal(can(manager, "clients.edit"), true);
    assert.equal(can(manager, "workItems.assign"), true);
    assert.equal(canManageClients(Role.MANAGER), true);
    assert.equal(canMovePipeline(Role.MANAGER), true);
    assert.equal(canViewAllAgencyData(Role.MANAGER), true);
  });

  it("still resolves for a caller that passes no seat at all", () => {
    const legacy = { role: Role.TEAM_MEMBER };

    assert.doesNotThrow(() => resolvePermissions(legacy));
    assert.equal(can(legacy, "workItems.updateOwn"), true);
    assert.equal(can(legacy, "clients.view.all"), false);
  });
});

describe("per-user overrides", () => {
  it("grants an extra permission with an ALLOW override", () => {
    const user = {
      ...seat(TeamRole.CREATIVE_SPECIALIST),
      permissionOverrides: [{ permission: "finance.view", effect: "ALLOW" as const }],
    };

    assert.equal(can(user, "finance.view"), true);
  });

  it("revokes a permission with a DENY override, even from the owner", () => {
    const user = {
      role: Role.ADMIN,
      teamRole: TeamRole.AGENCY_OWNER,
      permissionOverrides: [{ permission: "finance.view", effect: "DENY" as const }],
    };

    assert.equal(can(user, "finance.view"), false);
    assert.equal(can(user, "users.manage"), true);
  });

  it("lets DENY win when both effects target the same permission", () => {
    const user = {
      ...seat(TeamRole.CREATIVE_SPECIALIST),
      permissionOverrides: [
        { permission: "clients.delete", effect: "ALLOW" as const },
        { permission: "clients.delete", effect: "DENY" as const },
      ],
    };

    assert.equal(can(user, "clients.delete"), false);
  });

  it("ignores an expired override", () => {
    const user = {
      ...seat(TeamRole.CREATIVE_SPECIALIST),
      permissionOverrides: [
        {
          permission: "finance.view",
          effect: "ALLOW" as const,
          expiresAt: new Date(Date.now() - 1000),
        },
      ],
    };

    assert.equal(can(user, "finance.view"), false);
  });

  it("honours an override that has not expired yet", () => {
    const user = {
      ...seat(TeamRole.CREATIVE_SPECIALIST),
      permissionOverrides: [
        {
          permission: "finance.view",
          effect: "ALLOW" as const,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
    };

    assert.equal(can(user, "finance.view"), true);
  });

  it("ignores an override naming a permission that does not exist", () => {
    const user = {
      ...seat(TeamRole.CREATIVE_SPECIALIST),
      permissionOverrides: [{ permission: "not.a.real.permission", effect: "ALLOW" as const }],
    };

    assert.doesNotThrow(() => resolvePermissions(user));
    assert.equal(isPermission("not.a.real.permission"), false);
  });
});

describe("matrix coherence", () => {
  it("labels and describes every seat", () => {
    for (const teamRole of Object.values(TeamRole)) {
      assert.ok(teamRoleLabels[teamRole], `missing label for ${teamRole}`);
      assert.ok(teamRoleDescriptions[teamRole], `missing description for ${teamRole}`);
    }

    for (const role of Object.values(Role)) {
      assert.ok(roleLabels[role], `missing label for role ${role}`);
    }
  });

  it("has exactly six seats", () => {
    assert.equal(Object.values(TeamRole).length, 6);
  });

  it("has no duplicate permission keys", () => {
    assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length);
  });

  it("gives defect-closing authority to anyone who can approve QA", () => {
    for (const teamRole of Object.values(TeamRole)) {
      const granted = resolvePermissions(seat(teamRole));

      if (granted.has("qa.approve")) {
        assert.ok(granted.has("qa.closeDefect"), `${teamRole} approves QA but cannot close a defect`);
      }
    }
  });

  it("gives QA visibility to anyone who can act on QA", () => {
    for (const teamRole of Object.values(TeamRole)) {
      const granted = resolvePermissions(seat(teamRole));

      if (granted.has("qa.test") || granted.has("qa.closeDefect")) {
        assert.ok(granted.has("qa.view"), `${teamRole} acts on QA but cannot view it`);
      }
    }
  });

  it("never grants an edit capability without the matching read", () => {
    const pairs: [Permission, Permission][] = [
      ["finance.edit", "finance.view"],
      ["health.manage", "health.view"],
      ["renewals.manage", "renewals.view"],
      ["revisions.manage", "revisions.view"],
      ["launch.activate", "launch.view"],
      ["security.permissions", "security.view"],
      ["journey.override", "journey.move"],
    ];

    for (const teamRole of Object.values(TeamRole)) {
      const granted = resolvePermissions(seat(teamRole));

      for (const [edit, read] of pairs) {
        if (granted.has(edit)) {
          assert.ok(granted.has(read), `${teamRole} has ${edit} without ${read}`);
        }
      }
    }
  });

  it("resolves a non-empty permission set for every seat", () => {
    for (const teamRole of Object.values(TeamRole)) {
      assert.ok(resolvePermissions(seat(teamRole)).size > 0, teamRole);
    }
  });
});
