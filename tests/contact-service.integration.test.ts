import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { LeadSource, Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  createLeadWithOpportunity,
  createOpportunityForContact,
  findContactMatches,
  updateContactIdentity,
} from "@/lib/sales/contact-service";
import {
  stageStatusLabel,
  stageTag,
  statusForStageKey,
} from "@/lib/sales/pipeline-board";
import { moveLeadStage, setTags } from "@/lib/sales/sales-actions";

const TEST_PREFIX = "zz-contact-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let managerId = "";
let repId = "";
let walkLeadId = "";

async function cleanup() {
  const contacts = await prisma.contact.findMany({
    where: { businessName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { businessName: { startsWith: TEST_PREFIX } },
        ...(contacts.length ? [{ contactId: { in: contacts.map((row) => row.id) } }] : []),
      ],
    },
    select: { id: true },
  });
  const leadIds = leads.map((lead) => lead.id);

  if (leadIds.length) {
    await prisma.notification.deleteMany({ where: { entityId: { in: leadIds } } });
    await prisma.activityLog.deleteMany({ where: { entityId: { in: leadIds } } });
    await prisma.employeeTask.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.leadFollower.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.leadNote.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.leadCallLog.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  }

  await prisma.contact.deleteMany({ where: { businessName: { startsWith: TEST_PREFIX } } });
  await prisma.userPermissionOverride.deleteMany({
    where: { user: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.activityLog.deleteMany({
    where: { actor: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function actorFor(userId: string) {
  const actor = await loadAuthContext(userId);
  assert.ok(actor);
  return actor;
}

function opportunity(overrides: Record<string, unknown> = {}) {
  return { source: LeadSource.REFERRAL, ...overrides };
}

describe("contacts and opportunities (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [manager, rep] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Agency Owner",
          email: `${TEST_PREFIX}-owner@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.AGENCY_OWNER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Sales Rep",
          email: `${TEST_PREFIX}-rep@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.SALES_REP,
        },
        select: { id: true },
      }),
    ]);

    managerId = manager.id;
    repId = rep.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("creates the contact and the first opportunity in one step", async () => {
    const actor = await actorFor(managerId);

    const result = await createLeadWithOpportunity({
      actor,
      contact: {
        contactName: "Dr Steven Hale",
        businessName: `${TEST_PREFIX} Best Life Chiropractic`,
        email: `${TEST_PREFIX}-steven@example.test`,
        phone: "(555) 010-9987",
      },
      opportunity: opportunity({ serviceInterest: "CRM_AUTOMATION", opportunityValue: 4000 }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: result.leadId },
      select: {
        contactId: true,
        opportunityName: true,
        stage: { select: { stageKey: true } },
        status: true,
        createdById: true,
        opportunityValue: true,
      },
    });

    assert.equal(lead.contactId, result.contactId);
    // Opens at New Lead, named after the service, with the creator recorded.
    assert.equal(lead.stage?.stageKey, "new_website_lead");
    assert.equal(lead.status, "NEW");
    assert.equal(lead.createdById, managerId);
    assert.equal(lead.opportunityName, "Crm Automation");
    assert.equal(Number(lead.opportunityValue), 4000);
  });

  it("refuses a lead with no way to reach them", async () => {
    const actor = await actorFor(managerId);

    const result = await createLeadWithOpportunity({
      actor,
      contact: {
        contactName: "Nameless Prospect",
        businessName: `${TEST_PREFIX} No Contact Details`,
      },
      opportunity: opportunity(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("stops at a duplicate rather than creating a second contact", async () => {
    const actor = await actorFor(managerId);

    const result = await createLeadWithOpportunity({
      actor,
      contact: {
        contactName: "Steven Hale",
        // A different trading name, the same person.
        businessName: `${TEST_PREFIX} Best Life Chiro Group`,
        email: `${TEST_PREFIX}-STEVEN@example.test`,
      },
      opportunity: opportunity(),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.equal(result.code, "DUPLICATE_CONTACT");
    assert.equal(result.matches?.[0]?.confidence, "email");
  });

  it("adds a second opportunity to the existing contact instead", async () => {
    const actor = await actorFor(managerId);

    const existing = await prisma.contact.findFirstOrThrow({
      where: { businessName: `${TEST_PREFIX} Best Life Chiropractic` },
      select: { id: true },
    });

    const result = await createOpportunityForContact({
      actor,
      contactId: existing.id,
      opportunity: opportunity({
        opportunityName: "Website Redesign",
        opportunityValue: 5000,
      }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.usedExistingContact, true);

    const contacts = await prisma.contact.count({
      where: { businessName: { startsWith: `${TEST_PREFIX} Best Life` } },
    });
    const opportunities = await prisma.lead.count({ where: { contactId: existing.id } });

    // One relationship, two deals - which is the whole reason for the split.
    assert.equal(contacts, 1);
    assert.equal(opportunities, 2);
  });

  it("creates a separate contact when somebody insists", async () => {
    const actor = await actorFor(managerId);

    const result = await createLeadWithOpportunity({
      actor,
      contact: {
        contactName: "Steven Hale",
        businessName: `${TEST_PREFIX} Genuinely Different Firm`,
        email: `${TEST_PREFIX}-steven@example.test`,
      },
      opportunity: opportunity(),
      allowDuplicate: true,
    });

    assert.equal(result.ok, true);
  });

  it("renames the contact on every opportunity at once", async () => {
    const actor = await actorFor(managerId);

    const contact = await prisma.contact.findFirstOrThrow({
      where: { businessName: `${TEST_PREFIX} Best Life Chiropractic` },
      select: { id: true },
    });

    const result = await updateContactIdentity({
      actor,
      contactId: contact.id,
      data: { businessName: `${TEST_PREFIX} Best Life Wellness` },
    });

    assert.equal(result.ok, true);

    const stale = await prisma.lead.count({
      where: { contactId: contact.id, businessName: { not: `${TEST_PREFIX} Best Life Wellness` } },
    });

    // A copy that is not updated is a lie, and both deals hold a copy.
    assert.equal(stale, 0);
  });

  it("offers a same-company contact without treating it as certain", async () => {
    const matches = await findContactMatches({
      email: `${TEST_PREFIX}-marie@example.test`,
      businessName: `${TEST_PREFIX} Best Life Wellness`,
    });

    assert.ok(matches.length >= 1);
    assert.equal(matches[0]?.confidence, "company");
  });

  it("forces a scoped rep's own lead onto them, whoever they name", async () => {
    /*
     * A sales rep sees the whole book by default in this six-seat model;
     * narrowing one to their own pipeline is an explicit DENY override, so that
     * is how the scoped case has to be exercised.
     */
    await prisma.userPermissionOverride.create({
      data: {
        userId: repId,
        permission: "leads.view.all",
        effect: "DENY",
        reason: "Scoped to their own pipeline for this test.",
      },
    });

    const rep = await actorFor(repId);

    const result = await createLeadWithOpportunity({
      actor: rep,
      contact: {
        contactName: "Handover Attempt",
        businessName: `${TEST_PREFIX} Rep Owned`,
        email: `${TEST_PREFIX}-repowned@example.test`,
      },
      // Somebody who cannot see agency-wide leads cannot hand one away.
      opportunity: opportunity({ assignedToId: managerId }),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: result.leadId },
      select: { assignedToId: true },
    });

    assert.equal(lead.assignedToId, repId);
  });

  it("keeps a hand-typed stage tag out of the custom tags", async () => {
    const actor = await actorFor(managerId);

    const lead = await prisma.lead.findFirstOrThrow({
      where: { businessName: { startsWith: `${TEST_PREFIX} Best Life` } },
      select: { id: true },
    });

    const result = await setTags({
      actor,
      leadId: lead.id,
      tags: ["Enterprise", "stage_won", " Enterprise ", "Referral Partner"],
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    /*
     * The stage tag is derived from the stage. Storing one here would be a
     * second opinion about where the deal is, and the duplicate is dropped
     * rather than saved twice.
     */
    assert.deepEqual(result.tags, ["Enterprise", "Referral Partner"]);
  });

  /*
   * The whole progression, one stage at a time, checking after every move that
   * the stage, the stored status, the derived label and the tag all agree. A
   * mismatch anywhere is the failure the pipeline was rebuilt to remove.
   *
   * Inside this suite rather than its own, because a second describe runs after
   * this one's after() hook has already deleted the users it needs.
   */
  it("keeps stage, status, label and tag in step at every step", async () => {
    const actor = await actorFor(managerId);

    const created = await createLeadWithOpportunity({
      actor,
      contact: {
        contactName: "Pipeline Walker",
        businessName: `${TEST_PREFIX} Pipeline Walk`,
        email: `${TEST_PREFIX}-walk@example.test`,
      },
      opportunity: opportunity({ source: LeadSource.WEBSITE_FORM }),
    });

    assert.equal(created.ok, true);
    if (!created.ok) return;

    walkLeadId = created.leadId;

    const walk = [
      ["contacted", "Contacted", "stage_contacted"],
      ["strategy_call_booked", "Strategy Call", "stage_strategy_call"],
      ["qualified", "Qualified", "stage_qualified"],
      ["proposal_sent", "Proposal", "stage_proposal"],
      ["negotiation", "Negotiation", "stage_negotiation"],
    ] as const;

    for (const [stageKey, label, tag] of walk) {
      const moved = await moveLeadStage({ actor, leadId: walkLeadId, stageKey });

      assert.equal(moved.ok, true, stageKey);

      const row = await prisma.lead.findUniqueOrThrow({
        where: { id: walkLeadId },
        select: {
          status: true,
          tags: true,
          stage: { select: { stageKey: true, name: true } },
        },
      });

      const view = {
        stageKey: row.stage?.stageKey ?? null,
        stageName: row.stage?.name ?? null,
        status: row.status,
      } as unknown as Parameters<typeof stageStatusLabel>[0];

      assert.equal(row.stage?.stageKey, stageKey);
      assert.equal(row.status, statusForStageKey(stageKey), stageKey);
      assert.equal(stageStatusLabel(view), label, stageKey);
      assert.equal(stageTag(view), tag, stageKey);
      // The tag is derived, so it never lands in the custom tag column.
      assert.deepEqual(row.tags, [], stageKey);
    }
  });

  it("records who moved it, from where, and to where", async () => {
    const entry = await prisma.activityLog.findFirst({
      where: { entityType: "LEAD", entityId: walkLeadId, fieldName: "stageId" },
      orderBy: { createdAt: "desc" },
      select: { previousValue: true, newValue: true, actorId: true },
    });

    assert.equal(entry?.newValue, "negotiation");
    assert.equal(entry?.previousValue, "proposal_sent");
    assert.equal(entry?.actorId, managerId);
  });

  it("leaves custom tags alone when the stage changes", async () => {
    const actor = await actorFor(managerId);

    await setTags({ actor, leadId: walkLeadId, tags: ["Enterprise", "Spring Campaign"] });
    await moveLeadStage({ actor, leadId: walkLeadId, stageKey: "qualified" });

    const row = await prisma.lead.findUniqueOrThrow({
      where: { id: walkLeadId },
      select: { tags: true },
    });

    // A stage move cannot disturb these, because the stage tag is not in here.
    assert.deepEqual(row.tags, ["Enterprise", "Spring Campaign"]);
  });
});
