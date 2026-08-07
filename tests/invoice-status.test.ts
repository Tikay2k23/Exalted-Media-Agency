import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveInvoiceStatus } from "@/lib/finance/invoice-service";

const YESTERDAY = new Date("2026-08-05");
const TOMORROW = new Date("2026-08-07");
const NOW = new Date("2026-08-06");

const derive = (overrides: Partial<Parameters<typeof deriveInvoiceStatus>[0]> = {}) =>
  deriveInvoiceStatus({
    amountDue: 1000,
    settledAmount: 0,
    hasFailedPayment: false,
    dueAt: TOMORROW,
    now: NOW,
    ...overrides,
  });

describe("invoice status derivation", () => {
  it("is awaiting payment when nothing has been received and it is not yet due", () => {
    const result = derive();

    assert.equal(result.status, "SENT");
    assert.equal(result.isSettled, false);
  });

  it("is overdue once the due date has passed with nothing received", () => {
    assert.equal(derive({ dueAt: YESTERDAY }).status, "OVERDUE");
  });

  it("is part paid when some money has landed", () => {
    const result = derive({ settledAmount: 400 });

    assert.equal(result.status, "PARTIALLY_PAID");
    assert.equal(result.isSettled, false);
  });

  it("is paid the moment the full amount is covered", () => {
    const result = derive({ settledAmount: 1000 });

    assert.equal(result.status, "PAID");
    assert.equal(result.isSettled, true);
  });

  it("is paid when the client overpays", () => {
    assert.equal(derive({ settledAmount: 1200 }).isSettled, true);
  });

  it("treats a failed payment as failed while money is still outstanding", () => {
    const result = derive({ settledAmount: 0, hasFailedPayment: true });

    assert.equal(result.status, "FAILED");
    assert.equal(result.isSettled, false);
  });

  it("reports failed rather than part paid when a later attempt bounced", () => {
    // Money is still owed and something went wrong, so the account needs
    // chasing. Showing "part paid" would bury the failure.
    assert.equal(derive({ settledAmount: 400, hasFailedPayment: true }).status, "FAILED");
  });

  it("does not hold a past failure against a fully paid invoice", () => {
    // A card that was retried successfully must not leave the client looking
    // delinquent once the money has actually arrived.
    const result = derive({ settledAmount: 1000, hasFailedPayment: true });

    assert.equal(result.status, "PAID");
    assert.equal(result.isSettled, true);
  });

  it("prefers the failure over the overdue date when both apply", () => {
    assert.equal(
      derive({ dueAt: YESTERDAY, hasFailedPayment: true }).status,
      "FAILED",
    );
  });

  it("settles a zero-value invoice without needing a payment", () => {
    // A fully discounted or zero-rated invoice is not perpetually outstanding.
    const result = derive({ amountDue: 0, settledAmount: 0 });

    assert.equal(result.status, "PAID");
    assert.equal(result.isSettled, true);
  });

  it("stays awaiting payment when no due date has been set", () => {
    assert.equal(derive({ dueAt: null }).status, "SENT");
  });
});
