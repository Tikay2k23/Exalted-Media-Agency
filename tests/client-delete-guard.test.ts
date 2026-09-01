import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { can, canManageClients, resolvePermissions } from "@/lib/permissions";

/**
 * What guards the destructive delete on an account.
 *
 * DELETE /api/clients/[id] is a real delete: the row goes, and contacts,
 * contract, notes, projects, invoices, journey history, approvals and reports
 * cascade with it. It used to authorise on canManageClients - which resolves to
 * clients.edit - and to read only the access tier, ignoring the seat.
 *
 * Worth being accurate about what that was. At access-tier level clients.edit
 * and clients.delete coincide, and everybody holding clients.delete also holds
 * clients.view.all, so nothing was reachable that should not have been. It was
 * a route authorising on the wrong predicate, which stays harmless only until
 * somebody tightens clients.delete in the matrix and this endpoint carries on
 * reading clients.edit.
 *
 * The route handler cannot be invoked here - its guard reads the signed-in
 * session, and faking that needs module mocking the test runner does not have
 * switched on. So two of these read the source to pin which permission the
 * route asks for. That is a narrower test than calling it, and it is the part
 * that regressed before.
 */

const ROUTE = readFileSync("app/api/clients/[id]/route.ts", "utf8");
const ARCHIVE = readFileSync("lib/success/archive-service.ts", "utf8");

/** Just the DELETE handler, so a permission used by PATCH cannot satisfy these. */
const DELETE_HANDLER = ROUTE.slice(ROUTE.indexOf("export async function DELETE"));

const seat = (role: Role, teamRole: TeamRole) => ({
  role,
  teamRole,
  position: null,
  permissionOverrides: [],
});

describe("deleting an account", () => {
  it("is guarded on clients.delete, not clients.edit", () => {
    assert.match(
      DELETE_HANDLER,
      /guardClientWrite\(\s*id\s*,\s*"clients\.delete"\s*\)/,
      "the DELETE handler must ask guardClientWrite for clients.delete",
    );

    assert.ok(
      !DELETE_HANDLER.includes("canManageClients"),
      "canManageClients resolves to clients.edit and must not guard the delete",
    );
  });

  it("is guarded at least as strongly as archiving, which can be undone", () => {
    /*
     * The rule the change exists to enforce. Archiving is reversible and asks
     * for clients.delete; deleting is not reversible and must not ask for
     * less.
     */
    assert.ok(ARCHIVE.includes('can(actor, "clients.delete")'), "archive requires clients.delete");
    assert.ok(DELETE_HANDLER.includes('"clients.delete"'), "so does the delete route");
  });

  it("separates the seat that can edit an account from the seat that can destroy it", () => {
    /*
     * A project manager on a team-member tier is the case that tells the two
     * predicates apart: it carries clients.edit, which is exactly what the old
     * check asked for, and not clients.delete.
     */
    const granted = resolvePermissions(seat(Role.TEAM_MEMBER, TeamRole.PROJECT_MANAGER));

    assert.ok(granted.has("clients.edit"), "the seat can edit accounts");
    assert.ok(!granted.has("clients.delete"), "and cannot destroy them");
  });

  it("reads the seat, not only the access tier", () => {
    /*
     * The other half of the old bug. An agency owner sitting on a team-member
     * tier was refused, because canManageClients never looked at the seat -
     * while the interface, which resolves both, showed them the button.
     */
    assert.equal(canManageClients(Role.TEAM_MEMBER), false, "the tier alone says no");
    assert.equal(
      can(seat(Role.TEAM_MEMBER, TeamRole.AGENCY_OWNER), "clients.delete"),
      true,
      "the seat says yes, and the seat is right",
    );
  });

  it("lets no specialist seat reach it", () => {
    for (const teamRole of [
      TeamRole.SALES_REP,
      TeamRole.AUTOMATION_SPECIALIST,
      TeamRole.CREATIVE_SPECIALIST,
      TeamRole.ADS_SPECIALIST,
    ]) {
      assert.equal(
        can(seat(Role.TEAM_MEMBER, teamRole), "clients.delete"),
        false,
        `${teamRole} must not be able to delete an account`,
      );
    }
  });
});
