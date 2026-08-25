import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import {
  loadIntakeByToken,
  reviewIntake,
  saveIntakeAnswers,
  sendIntakeForm,
} from "@/lib/intake/intake-service";
import {
  deriveIntakeProgress,
  questionsForService,
  sectionsForService,
} from "@/lib/intake/question-catalogue";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-intake-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";
let token = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.intakeForm.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientWorkstream.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient: { email: { startsWith: TEST_PREFIX } } },
        ...(ids.length ? [{ entityId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(ids.length ? [{ entityId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

/** Fills in every required question for a service. */
function completeAnswers(service: "CRM_AUTOMATION") {
  const answers: Record<string, string> = {};

  for (const question of questionsForService(service)) {
    if (question.required) {
      answers[question.id] = `An answer for ${question.label}.`;
    }
  }

  return answers;
}

describe("client intake (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const makeUser = (name: string, suffix: string, teamRole: TeamRole) =>
      prisma.user.create({
        data: {
          name,
          email: `${TEST_PREFIX}-${suffix}@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole,
        },
        select: { id: true },
      });

    const [pm, specialist] = await Promise.all([
      makeUser("Intake PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Intake Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
    ]);

    pmId = pm.id;
    specialistId = specialist.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "payment_received", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Intake Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "CRM_AUTOMATION",
        currentStageId: stage.id,
        assignedUserId: pm.id,
      },
      select: { id: true },
    });

    clientId = client.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("refuses to send the form without permission", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await sendIntakeForm({ actor: specialist, clientId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("sends the form with an unguessable, expiring link", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await sendIntakeForm({ actor: pm, clientId });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    token = result.form.token;

    // 32 random bytes, base64url. Short enough to email, long enough that
    // guessing is not a strategy.
    assert.ok(token.length >= 40);
    assert.ok(result.form.expiresAt);
    assert.equal(result.form.status, "SENT");
  });

  it("returns nothing for a token that does not exist", async () => {
    // Not "expired", not "wrong client" - nothing. Anything else confirms a
    // link once existed to whoever is guessing.
    assert.equal(await loadIntakeByToken("a".repeat(43)), null);
    assert.equal(await loadIntakeByToken("short"), null);
    assert.equal(await loadIntakeByToken(""), null);
  });

  it("exposes only the client's own business name and answers", async () => {
    const form = await loadIntakeByToken(token);
    assert.ok(form);

    const keys = Object.keys(form.client);

    // No owner, no stage, no health, no money.
    assert.deepEqual(keys.sort(), ["companyName", "serviceType"]);
  });

  it("asks a CRM client the CRM questions and not the advertising ones", async () => {
    const sections = sectionsForService("CRM_AUTOMATION").map((section) => section.id);

    assert.ok(sections.includes("crm"));
    assert.ok(!sections.includes("advertising"));
    assert.ok(!sections.includes("website"));
  });

  it("asks a full-service client everything", async () => {
    const sections = sectionsForService("FULL_SERVICE_RETAINER").map((s) => s.id);

    assert.ok(sections.includes("crm"));
    assert.ok(sections.includes("website"));
    assert.ok(sections.includes("advertising"));
  });

  it("saves a partial answer without complaining", async () => {
    // A form that only accepts a complete submission is one people abandon.
    const result = await saveIntakeAnswers({
      token,
      answers: { legalName: "Reyes Plumbing Ltd" },
      submit: false,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.submitted, false);
    assert.ok(result.percent > 0);
  });

  it("ignores keys the client was never asked", async () => {
    await saveIntakeAnswers({
      token,
      answers: { metaBusinessManager: "should not be stored", legalName: "Reyes Plumbing Ltd" },
      submit: false,
    });

    const form = await prisma.intakeForm.findUniqueOrThrow({
      where: { token },
      select: { answers: true },
    });

    const answers = form.answers as Record<string, string>;

    assert.equal(answers.metaBusinessManager, undefined);
    assert.equal(answers.legalName, "Reyes Plumbing Ltd");
  });

  it("refuses a password pasted into any answer", async () => {
    // The one route where somebody outside the agency is typing, so this is
    // where a credential would arrive if it ever did.
    const result = await saveIntakeAnswers({
      token,
      answers: { crmName: "GoHighLevel, password: hunter2placeholder" },
      submit: false,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "CREDENTIAL_SUBMITTED");
    assert.deepEqual(result.fields, ["crmName"]);
  });

  it("does not store the answer it refused", async () => {
    const form = await prisma.intakeForm.findUniqueOrThrow({
      where: { token },
      select: { answers: true },
    });

    assert.equal((form.answers as Record<string, string>).crmName, undefined);
  });

  it("refuses to submit while required answers are missing, and names them", async () => {
    const result = await saveIntakeAnswers({ token, answers: {}, submit: true });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.ok((result.fields ?? []).length > 0);
  });

  it("submits once everything required is answered", async () => {
    const result = await saveIntakeAnswers({
      token,
      answers: { ...completeAnswers("CRM_AUTOMATION"), website: "https://reyes.test" },
      submit: true,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.submitted, true);

    const form = await prisma.intakeForm.findUniqueOrThrow({
      where: { token },
      select: { status: true, submittedAt: true },
    });

    assert.equal(form.status, "SUBMITTED");
    assert.ok(form.submittedAt);
  });

  /*
   * The A2P section does not ask for an address, a phone number, an email or a
   * website, because the general section already did. If these are not carried
   * over, the readiness checklist reports four things missing that the client
   * answered in this very submission.
   */
  it("carries over the contact details the general section already collected", async () => {
    const profile = await prisma.a2PProfile.findUniqueOrThrow({
      where: { clientId },
      select: {
        addressLine1: true,
        businessPhone: true,
        businessEmail: true,
        websiteUrl: true,
      },
    });

    assert.match(profile.addressLine1 ?? "", /Business address/);
    assert.match(profile.businessPhone ?? "", /Phone number customers should use/);
    assert.match(profile.businessEmail ?? "", /Email customers should use/);
    assert.equal(profile.websiteUrl, "https://reyes.test");
  });

  it("tells the project manager it arrived", async () => {
    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: pmId },
      select: { title: true },
    });

    assert.ok(notified.some((item) => /submitted their intake/i.test(item.title)));
  });

  it("refuses further edits after submission", async () => {
    const result = await saveIntakeAnswers({
      token,
      answers: { legalName: "Changed after the fact" },
      submit: false,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "ALREADY_SUBMITTED");
  });

  it("refuses to send a fresh link once it has been submitted", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await sendIntakeForm({ actor: pm, clientId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "ALREADY_SUBMITTED");
  });

  it("records the review", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await reviewIntake({
      actor: pm,
      clientId,
      notes: "No Meta account yet, needs creating before ads work starts.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.form.status, "REVIEWED");
    assert.equal(result.form.reviewedById, pmId);
  });
});

describe("intake progress", () => {
  it("treats an empty form as nothing answered", () => {
    const progress = deriveIntakeProgress("CRM_AUTOMATION", null);

    assert.equal(progress.answered, 0);
    assert.equal(progress.complete, false);
    assert.ok(progress.missingRequired.length > 0);
  });

  it("does not block on optional questions", () => {
    // Somebody who answered everything essential is done, whatever else is
    // blank. Blocking on a nice-to-have is how forms stall.
    const answers: Record<string, string> = {};

    for (const question of questionsForService("CRM_AUTOMATION")) {
      if (question.required) {
        answers[question.id] = "answered";
      }
    }

    const progress = deriveIntakeProgress("CRM_AUTOMATION", answers);

    assert.equal(progress.complete, true);
    assert.ok(progress.percent < 100, "optional questions still count towards progress");
  });

  it("does not accept whitespace as an answer", () => {
    const progress = deriveIntakeProgress("CRM_AUTOMATION", { legalName: "   " });

    assert.equal(progress.answered, 0);
  });
});
