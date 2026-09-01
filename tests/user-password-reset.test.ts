import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { can } from "@/lib/permissions";

/**
 * What guards resetting another user's password.
 *
 * The route (app/api/admin/users/[id]/password) is the only way to set a
 * password an admin does not know - hashes are one-way and there is no mailer,
 * so without it a locked-out account is a lost account. That makes it powerful
 * enough to be worth pinning: it must require users.manage, resolved from the
 * seat and not the access tier alone.
 *
 * The route handler reads the session, so it cannot be called from here; these
 * pin the permission it depends on and the shape of its guard, by reading the
 * source. The end-to-end path - reset, authenticate, restore - was exercised
 * against a running database by hand.
 */
const ROUTE = readFileSync("app/api/admin/users/[id]/password/route.ts", "utf8");

const seat = (role: Role, teamRole: TeamRole) => ({
  role,
  teamRole,
  position: null,
  permissionOverrides: [],
});

describe("resetting a user password", () => {
  it("is guarded on users.manage, resolved from context not the tier", () => {
    assert.match(ROUTE, /loadAuthContext/, "must resolve the full auth context");
    assert.match(ROUTE, /can\(actor,\s*"users\.manage"\)/, "must require users.manage");
    assert.ok(
      !ROUTE.includes("canManageUsers("),
      "must not use the tier-only helper, which misses an Agency Owner on a lower tier",
    );
  });

  it("enforces a minimum password length", () => {
    assert.match(ROUTE, /min\(8/, "must reject passwords shorter than 8");
  });

  it("never writes the password into the activity log", () => {
    /* The log records that a reset happened, never the value. */
    const logCall = ROUTE.slice(ROUTE.indexOf("logActivity"));
    assert.ok(!/password:\s*parsed/.test(logCall), "the new password must not reach the log");
    assert.match(ROUTE, /Reset the password for/, "logs that a reset happened");
  });

  it("only the owner and admin tiers, or an agency-owner seat, hold users.manage", () => {
    /* The set of people who can reach this route, stated as a test. */
    assert.equal(can(seat(Role.ADMIN, TeamRole.CREATIVE_SPECIALIST), "users.manage"), true);
    assert.equal(can(seat(Role.OWNER, TeamRole.AGENCY_OWNER), "users.manage"), true);
    assert.equal(can(seat(Role.TEAM_MEMBER, TeamRole.AGENCY_OWNER), "users.manage"), true);

    assert.equal(can(seat(Role.MANAGER, TeamRole.PROJECT_MANAGER), "users.manage"), false);
    assert.equal(can(seat(Role.TEAM_MEMBER, TeamRole.SALES_REP), "users.manage"), false);
    assert.equal(can(seat(Role.TEAM_MEMBER, TeamRole.CREATIVE_SPECIALIST), "users.manage"), false);
  });
});
