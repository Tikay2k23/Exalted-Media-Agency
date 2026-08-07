import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type PublishableTestimonial,
  canPublishTestimonial,
  describePublishingBlockers,
  grantedPermissions,
} from "@/lib/growth/advocacy-service";
import {
  RENEWAL_ALERT_DAYS,
  isExpansionDecided,
  isRenewalSettled,
  renewalRunway,
} from "@/lib/growth/renewal-service";
import {
  type CompletableOffboarding,
  hasLockoutRisk,
  isOffboardingComplete,
  outstandingOffboardingSteps,
} from "@/lib/success/offboarding-service";

const now = new Date("2026-08-08T12:00:00.000Z");

function daysFromNow(days: number) {
  return new Date(now.getTime() + days * 86_400_000);
}

describe("renewal runway", () => {
  it("has nothing to say without a renewal date", () => {
    const runway = renewalRunway(null, now);

    assert.equal(runway.daysUntil, null);
    assert.equal(runway.window, null);
    assert.equal(runway.overdue, false);
  });

  it("stays quiet while the renewal is far away", () => {
    const runway = renewalRunway(daysFromNow(200), now);

    assert.equal(runway.window, null);
    assert.equal(runway.overdue, false);
  });

  it("reports the tightest window crossed, not the widest", () => {
    // At 20 days out the useful number is 30, not 90. Showing the widest
    // window would make an urgent renewal look like a distant one.
    assert.equal(renewalRunway(daysFromNow(20), now).window, 30);
    assert.equal(renewalRunway(daysFromNow(85), now).window, 90);
    assert.equal(renewalRunway(daysFromNow(5), now).window, 7);
  });

  it("opens each window exactly on its day", () => {
    for (const days of RENEWAL_ALERT_DAYS) {
      assert.equal(
        renewalRunway(daysFromNow(days), now).window,
        days,
        `${days} days out should open the ${days} window`,
      );
    }
  });

  it("flags a renewal date that has already passed", () => {
    const runway = renewalRunway(daysFromNow(-3), now);

    assert.equal(runway.overdue, true);
    assert.ok(runway.daysUntil !== null && runway.daysUntil < 0);
  });
});

describe("settled outcomes", () => {
  it("treats renewed, downgraded, declined and churned as settled", () => {
    for (const stage of ["RENEWED", "DOWNGRADED", "DECLINED", "CHURNED"] as const) {
      assert.equal(isRenewalSettled(stage), true, stage);
    }
  });

  it("does not treat an in-flight renewal as settled", () => {
    for (const stage of ["NOT_STARTED", "PROPOSAL_SENT", "NEGOTIATING"] as const) {
      assert.equal(isRenewalSettled(stage), false, stage);
    }
  });

  it("treats won and lost expansion as decided, and deferred as not", () => {
    assert.equal(isExpansionDecided("WON"), true);
    assert.equal(isExpansionDecided("LOST"), true);
    // Deferred means "not now", which is not an outcome to write up.
    assert.equal(isExpansionDecided("DEFERRED"), false);
  });
});

function testimonial(
  overrides: Partial<PublishableTestimonial> = {},
): PublishableTestimonial {
  return {
    status: "APPROVED",
    content: "They rebuilt our booking funnel and calls doubled.",
    publishingChannels: "Website case studies page",
    allowPersonName: true,
    allowBusinessName: true,
    allowLogo: false,
    allowPhoto: false,
    allowPerformanceData: false,
    ...overrides,
  };
}

describe("testimonial consent", () => {
  it("lists only what the client actually agreed to", () => {
    const permissions = grantedPermissions(testimonial());

    assert.ok(permissions.some((item) => /name/i.test(item)));
    assert.ok(!permissions.some((item) => /logo/i.test(item)));
  });

  it("allows publishing when there is content, consent and a destination", () => {
    assert.equal(canPublishTestimonial(testimonial()), true);
    assert.deepEqual(describePublishingBlockers(testimonial()), []);
  });

  it("refuses to publish when the client agreed to nothing", () => {
    // A quote with no permission attached is not usable, however good it is.
    const nothing = testimonial({
      allowPersonName: false,
      allowBusinessName: false,
    });

    assert.equal(canPublishTestimonial(nothing), false);
    assert.ok(describePublishingBlockers(nothing).some((item) => /not agreed/i.test(item)));
  });

  it("refuses to publish with nowhere recorded to publish it", () => {
    const nowhere = testimonial({ publishingChannels: "   " });

    assert.equal(canPublishTestimonial(nowhere), false);
    assert.ok(describePublishingBlockers(nowhere).some((item) => /where/i.test(item)));
  });

  it("refuses to publish an empty testimonial", () => {
    assert.equal(canPublishTestimonial(testimonial({ content: null })), false);
  });

  it("refuses to publish one the client declined", () => {
    const declined = testimonial({ status: "DECLINED" });

    assert.equal(canPublishTestimonial(declined), false);
    assert.ok(describePublishingBlockers(declined).some((item) => /declined/i.test(item)));
  });

  it("reports every blocker at once", () => {
    const bad = testimonial({
      status: "DECLINED",
      content: null,
      publishingChannels: null,
      allowPersonName: false,
      allowBusinessName: false,
    });

    assert.equal(describePublishingBlockers(bad).length, 4);
  });
});

function offboarding(
  overrides: Partial<CompletableOffboarding> = {},
): CompletableOffboarding {
  return {
    finalBillingSettledAt: now,
    remainingWork: "Nothing outstanding.",
    assetsTransferredAt: now,
    dataExportedAt: now,
    clientAdminAccessConfirmedAt: now,
    agencyAccessRemovedAt: now,
    finalReportSentAt: now,
    ...overrides,
  };
}

describe("offboarding completeness", () => {
  it("is complete when every step is done", () => {
    assert.equal(isOffboardingComplete(offboarding()), true);
    assert.deepEqual(outstandingOffboardingSteps(offboarding()), []);
  });

  it("is incomplete while billing is unresolved", () => {
    const record = offboarding({ finalBillingSettledAt: null });

    assert.equal(isOffboardingComplete(record), false);
    assert.ok(
      outstandingOffboardingSteps(record).some((step) => /billing/i.test(step.label)),
    );
  });

  it("is incomplete while the data export is outstanding", () => {
    assert.equal(isOffboardingComplete(offboarding({ dataExportedAt: null })), false);
  });

  it("treats remaining work as done only when somebody wrote down what happened", () => {
    // Including "nothing was outstanding" - the point is that a person looked.
    assert.equal(isOffboardingComplete(offboarding({ remainingWork: null })), false);
    assert.equal(isOffboardingComplete(offboarding({ remainingWork: "   " })), false);
    assert.equal(isOffboardingComplete(offboarding({ remainingWork: "None." })), true);
  });

  it("lists outstanding steps in the order they should be done", () => {
    const record = offboarding({
      finalBillingSettledAt: null,
      dataExportedAt: null,
      finalReportSentAt: null,
    });

    const labels = outstandingOffboardingSteps(record).map((step) => step.label);

    assert.equal(labels.length, 3);
    assert.ok(/billing/i.test(labels[0]));
    assert.ok(/report/i.test(labels[2]));
  });
});

describe("the lockout rule", () => {
  it("flags agency access removed before the client was confirmed as admin", () => {
    // The one mistake here the agency cannot undo afterwards.
    assert.equal(
      hasLockoutRisk(
        offboarding({ clientAdminAccessConfirmedAt: null, agencyAccessRemovedAt: now }),
      ),
      true,
    );
  });

  it("is happy when the client was confirmed first", () => {
    assert.equal(hasLockoutRisk(offboarding()), false);
  });

  it("is happy while agency access has not been removed yet", () => {
    assert.equal(
      hasLockoutRisk(
        offboarding({ clientAdminAccessConfirmedAt: null, agencyAccessRemovedAt: null }),
      ),
      false,
    );
  });
});
