import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import {
  archiveResource,
  createDocumentResource,
  createLinkResource,
  deleteResource,
  linkResourceToSop,
  listResourcesForSop,
  searchLinkableResources,
  unlinkResourceFromSop,
  updateResource,
} from "@/lib/governance/resource-service";
import { prisma } from "@/lib/prisma";

const PREFIX = "zz-res-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let ownerId = "";
let specialistId = "";
let sopAId = "";
let sopBId = "";

async function cleanup() {
  await prisma.resource.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.sop.deleteMany({ where: { reference: { startsWith: PREFIX } } });
  await prisma.activityLog.deleteMany({ where: { actor: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

describe("SOP resources (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [owner, specialist] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Res Owner",
          email: `${PREFIX}-owner@example.test`,
          passwordHash: "x",
          role: Role.OWNER,
          teamRole: TeamRole.AGENCY_OWNER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Res Specialist",
          email: `${PREFIX}-specialist@example.test`,
          passwordHash: "x",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.CREATIVE_SPECIALIST,
        },
        select: { id: true },
      }),
    ]);
    ownerId = owner.id;
    specialistId = specialist.id;

    const [a, b] = await Promise.all([
      prisma.sop.create({
        data: { reference: `${PREFIX}-A`, title: "Resource Test A", currentVersion: "1.0" },
        select: { id: true },
      }),
      prisma.sop.create({
        data: { reference: `${PREFIX}-B`, title: "Resource Test B", currentVersion: "1.0" },
        select: { id: true },
      }),
    ]);
    sopAId = a.id;
    sopBId = b.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("creates a document resource and links it to the SOP", async () => {
    const owner = await loadAuthContext(ownerId);
    const result = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Qualify a Lead`,
      type: "HOW_TO_GUIDE",
      content: "# How to qualify\n\nAsk about budget.",
    });

    assert.ok(result.ok);
    const list = await listResourcesForSop(sopAId);
    assert.equal(list.length, 1);
    assert.equal(list[0].title, `${PREFIX} Qualify a Lead`);
    assert.equal(list[0].source, "DOCUMENT");
  });

  it("refuses a specialist, who may read but not manage", async () => {
    const specialist = await loadAuthContext(specialistId);
    const result = await createDocumentResource({
      actor: specialist!,
      sopId: sopAId,
      title: `${PREFIX} Should Not Exist`,
      type: "SCRIPT",
      content: "nope",
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "FORBIDDEN");
  });

  it("rejects a document typed as a file or link", async () => {
    const owner = await loadAuthContext(ownerId);
    const result = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Wrong Type`,
      // EXTERNAL_LINK is a valid ResourceType, just not a document type - rejected at runtime.
      type: "EXTERNAL_LINK",
      content: "x",
    });

    assert.equal(result.ok, false);
  });

  it("rejects a link that is not a valid http(s) URL", async () => {
    const owner = await loadAuthContext(ownerId);

    const bad = await createLinkResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Bad Link`,
      externalUrl: "javascript:alert(1)",
    });
    assert.equal(bad.ok, false);

    const notUrl = await createLinkResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Bad Link 2`,
      externalUrl: "not a url",
    });
    assert.equal(notUrl.ok, false);
  });

  it("is the same authoritative record when linked to a second SOP", async () => {
    const owner = await loadAuthContext(ownerId);
    const created = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Shared Guide`,
      type: "REFERENCE_GUIDE",
      content: "shared",
    });
    assert.ok(created.ok);
    const resourceId = created.ok ? created.resourceId : "";

    const linked = await linkResourceToSop({ actor: owner!, resourceId, sopId: sopBId });
    assert.ok(linked.ok);

    const onA = await listResourcesForSop(sopAId);
    const onB = await listResourcesForSop(sopBId);
    assert.ok(onA.some((r) => r.id === resourceId));
    assert.ok(onB.some((r) => r.id === resourceId));

    /* One row, two links - not two copies. */
    const rows = await prisma.resource.count({ where: { id: resourceId } });
    assert.equal(rows, 1);
    const links = await prisma.resourceSopLink.count({ where: { resourceId } });
    assert.equal(links, 2);
  });

  it("refuses to link the same resource to the same SOP twice", async () => {
    const owner = await loadAuthContext(ownerId);
    const created = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Dupe Guard`,
      type: "CHECKLIST",
      content: "x",
    });
    const resourceId = created.ok ? created.resourceId : "";

    const again = await linkResourceToSop({ actor: owner!, resourceId, sopId: sopAId });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.code, "DUPLICATE");
  });

  it("removing from one SOP is unlinking, not deleting", async () => {
    const owner = await loadAuthContext(ownerId);
    const created = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Survives Unlink`,
      type: "TEMPLATE",
      content: "keep me",
    });
    const resourceId = created.ok ? created.resourceId : "";
    await linkResourceToSop({ actor: owner!, resourceId, sopId: sopBId });

    const removed = await unlinkResourceFromSop({ actor: owner!, resourceId, sopId: sopAId });
    assert.ok(removed.ok);

    /* Gone from A... */
    const onA = await listResourcesForSop(sopAId);
    assert.ok(!onA.some((r) => r.id === resourceId));

    /* ...still alive on B, and the record still exists. */
    const onB = await listResourcesForSop(sopBId);
    assert.ok(onB.some((r) => r.id === resourceId));
    const stillThere = await prisma.resource.findUnique({ where: { id: resourceId } });
    assert.ok(stillThere, "unlinking must not delete the resource");
  });

  it("does not offer a resource already linked to the SOP as linkable", async () => {
    const owner = await loadAuthContext(ownerId);
    const created = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Only On A`,
      type: "SCRIPT",
      content: "x",
    });
    const resourceId = created.ok ? created.resourceId : "";

    /* Linkable to B (not yet on it), not to A (already on it). */
    const forB = await searchLinkableResources({ query: `${PREFIX} Only On A`, excludeSopId: sopBId });
    assert.ok(forB.some((r) => r.id === resourceId));
    const forA = await searchLinkableResources({ query: `${PREFIX} Only On A`, excludeSopId: sopAId });
    assert.ok(!forA.some((r) => r.id === resourceId));
  });

  it("archives a resource out of the active list", async () => {
    const owner = await loadAuthContext(ownerId);
    const created = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} To Archive`,
      type: "REFERENCE_GUIDE",
      content: "x",
    });
    const resourceId = created.ok ? created.resourceId : "";

    await archiveResource({ actor: owner!, resourceId });

    const active = await listResourcesForSop(sopAId);
    assert.ok(!active.some((r) => r.id === resourceId));
    const withArchived = await listResourcesForSop(sopAId, { includeArchived: true });
    assert.ok(withArchived.some((r) => r.id === resourceId));
  });

  it("deletes a resource from every SOP at once", async () => {
    const owner = await loadAuthContext(ownerId);
    const created = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} To Delete`,
      type: "TEMPLATE",
      content: "x",
    });
    const resourceId = created.ok ? created.resourceId : "";
    await linkResourceToSop({ actor: owner!, resourceId, sopId: sopBId });

    const del = await deleteResource({ actor: owner!, resourceId });
    assert.ok(del.ok);

    assert.equal(await prisma.resource.count({ where: { id: resourceId } }), 0);
    assert.equal(await prisma.resourceSopLink.count({ where: { resourceId } }), 0);
  });

  it("filters and searches the SOP's list", async () => {
    const owner = await loadAuthContext(ownerId);
    await createDocumentResource({
      actor: owner!,
      sopId: sopBId,
      title: `${PREFIX} Findable Script`,
      type: "SCRIPT",
      content: "x",
    });

    const byType = await listResourcesForSop(sopBId, { type: "SCRIPT" });
    assert.ok(byType.every((r) => r.type === "SCRIPT"));
    assert.ok(byType.some((r) => r.title === `${PREFIX} Findable Script`));

    const byQuery = await listResourcesForSop(sopBId, { query: "Findable" });
    assert.ok(byQuery.some((r) => r.title === `${PREFIX} Findable Script`));
  });

  it("will not update a document into a file type", async () => {
    const owner = await loadAuthContext(ownerId);
    const created = await createDocumentResource({
      actor: owner!,
      sopId: sopAId,
      title: `${PREFIX} Stays A Document`,
      type: "HOW_TO_GUIDE",
      content: "x",
    });
    const resourceId = created.ok ? created.resourceId : "";

    const result = await updateResource({ actor: owner!, resourceId, type: "FILE" });
    assert.equal(result.ok, false);
  });
});
