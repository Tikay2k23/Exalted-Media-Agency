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
import { setTags } from "@/lib/sales/sales-actions";

const TEST_PREFIX = "zz-contact-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let managerId = "";
let repId = "";

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
});
