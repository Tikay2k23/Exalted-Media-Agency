import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { can } from "@/lib/permissions";

/**
 * The link to Manage users and the page it opens must agree.
 *
 * Settings shows the link to anyone holding users.manage. The page used to
 * require the ADMIN access tier outright, and the two disagreed for eight
 * combinations of tier and seat - including every OWNER-tier account, the
 * highest privilege in the system, which was shown the link and then
 * redirected to the dashboard on arrival.
 *
 * A link that leads somewhere its reader is refused is worse than no link: it
 * reads as a broken product rather than a closed door.
 */
const PAGE = readFileSync("app/(dashboard)/admin/users/page.tsx", "utf8");
const QUERIES = readFileSync("lib/data/queries.ts", "utf8");

const seat = (role: Role, teamRole: TeamRole) => ({
  role,
  teamRole,
  position: null,
  permissionOverrides: [],
});

describe("access to Manage users", () => {
  it("gates the page on the same permission that shows the link", () => {
    assert.match(PAGE, /can\(actor,\s*"users\.manage"\)/, "page must require users.manage");
    assert.ok(
      !PAGE.includes("requireRole"),
      "the tier-only gate disagreed with the link and must not come back",
    );
  });

  it("loads the directory for whoever the page let in", () => {
    /*
     * The second half of the same bug. The query refused anyone whose tier was
     * not ADMIN, so fixing only the page would have shown an empty table to
     * the people it had just admitted.
     */
    const fn = QUERIES.slice(QUERIES.indexOf("export async function getAdminUsersData"));
    const body = fn.slice(0, fn.indexOf("\n}"));

    assert.match(body, /can\(actor,\s*"users\.manage"\)/, "query must check the permission");
    assert.ok(!/role !== "ADMIN"/.test(body), "query must not gate on the access tier");
  });

  it("admits every seat that holds users.manage, including below ADMIN", () => {
    for (const combination of [
      seat(Role.OWNER, TeamRole.AGENCY_OWNER),
      seat(Role.OWNER, TeamRole.PROJECT_MANAGER),
      seat(Role.ADMIN, TeamRole.CREATIVE_SPECIALIST),
      seat(Role.TEAM_MEMBER, TeamRole.AGENCY_OWNER),
    ]) {
      assert.equal(
        can(combination, "users.manage"),
        true,
        `${combination.role}/${combination.teamRole} should reach Manage users`,
      );
    }
  });

  it("still refuses the seats that do not hold it", () => {
    for (const combination of [
      seat(Role.MANAGER, TeamRole.PROJECT_MANAGER),
      seat(Role.TEAM_MEMBER, TeamRole.CREATIVE_SPECIALIST),
      seat(Role.TEAM_MEMBER, TeamRole.SALES_REP),
      seat(Role.TEAM_MEMBER, TeamRole.ADS_SPECIALIST),
    ]) {
      assert.equal(
        can(combination, "users.manage"),
        false,
        `${combination.role}/${combination.teamRole} must not reach Manage users`,
      );
    }
  });
});
