import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CADENCE_MONTHS,
  monthsAway,
  nextInvoiceDate,
  type AccountContract,
} from "@/components/clients/client-account";
import {
  clientCompanySchema,
  clientInternalNoteSchema,
  clientOwnershipSchema,
  clientRecordSchema,
} from "@/lib/validators";

/**
 * What the Account tab accepts.
 *
 * Everything about a company is optional, because an account begins life as a
 * converted lead with a name and an email and the rest arrives later. So these
 * check shape rather than presence: a website that is not a website and an
 * email that is not an email are worth refusing, an empty one is not.
 */
describe("company information", () => {
  const empty = {
    legalName: "",
    website: "",
    industry: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateRegion: "",
    postalCode: "",
    country: "",
    businessPhone: "",
    businessEmail: "",
    serviceArea: "",
    taxId: "",
    timezone: "",
  };

  it("accepts an account nobody has filled in yet", () => {
    assert.equal(clientCompanySchema.safeParse(empty).success, true);
  });

  it("takes a website the way people actually type one", () => {
    for (const website of [
      "cedarridgeland.com",
      "https://cedarridgeland.com",
      "http://www.cedarridgeland.com/landing",
    ]) {
      assert.equal(
        clientCompanySchema.safeParse({ ...empty, website }).success,
        true,
        `${website} should be accepted`,
      );
    }
  });

  it("refuses something that is not a website at all", () => {
    for (const website of ["not a website", "cedarridge", "http://"]) {
      assert.equal(
        clientCompanySchema.safeParse({ ...empty, website }).success,
        false,
        `${website} should be refused`,
      );
    }
  });

  it("refuses a business email that is not an address", () => {
    assert.equal(
      clientCompanySchema.safeParse({ ...empty, businessEmail: "info@" }).success,
      false,
    );
    assert.equal(
      clientCompanySchema.safeParse({ ...empty, businessEmail: "info@cedarridgeland.com" })
        .success,
      true,
    );
  });

  it("still allows the email to be cleared", () => {
    assert.equal(clientCompanySchema.safeParse({ ...empty, businessEmail: "" }).success, true);
  });

  it("says which field was wrong, so the dialog can point at it", () => {
    const result = clientCompanySchema.safeParse({ ...empty, website: "nope" });

    assert.equal(result.success, false);
    assert.equal(result.error!.issues[0]?.path[0], "website");
  });
});

/**
 * Who holds the account.
 *
 * Null is a real answer - "nobody is doing this" is worth being able to record,
 * and a schema that refuses it would force somebody to leave the wrong name in
 * a seat.
 */
describe("account ownership", () => {
  it("lets every seat be emptied", () => {
    const result = clientOwnershipSchema.safeParse({
      assignedUserId: null,
      seats: [{ role: "PROJECT_MANAGER", ownerId: null }],
    });

    assert.equal(result.success, true);
  });

  it("refuses a seat that is not one of the team's", () => {
    const result = clientOwnershipSchema.safeParse({
      assignedUserId: null,
      seats: [{ role: "PRIMARY_STRATEGIST", ownerId: null }],
    });

    assert.equal(result.success, false, "an invented seat should not be assignable");
  });

  it("refuses anything that is not a real user id", () => {
    assert.equal(
      clientOwnershipSchema.safeParse({ assignedUserId: "somebody", seats: [] }).success,
      false,
    );
  });
});

describe("internal account note", () => {
  it("accepts being cleared", () => {
    assert.equal(clientInternalNoteSchema.safeParse({ notes: "" }).success, true);
  });

  it("refuses an essay", () => {
    assert.equal(
      clientInternalNoteSchema.safeParse({ notes: "x".repeat(2001) }).success,
      false,
    );
  });
});

/**
 * The dates the Contract & Commercials card prints.
 *
 * Worth testing rather than eyeballing: the next-invoice figure walks forward
 * from the contract start in cadence-sized steps, and a cadence with no month
 * count - ONE_TIME - would spin that loop forever if it were ever let through.
 */
describe("contract dates", () => {
  const contract = (over: Partial<AccountContract> = {}): AccountContract => ({
    id: "k1",
    title: "Retainer",
    agreementStatus: "SIGNED",
    recurringFee: 1800,
    contractValue: null,
    billingCadence: "MONTHLY",
    startDate: "2026-08-15T00:00:00.000Z",
    endDate: "2027-08-15T00:00:00.000Z",
    renewalDate: "2027-08-15T00:00:00.000Z",
    paymentTerms: "Due on the 15th of each month",
    autoRenew: true,
    documentUrl: null,
    ...over,
  });

  const now = new Date("2026-08-22T12:00:00.000Z");

  it("says how far off the renewal is, the way the design prints it", () => {
    assert.equal(monthsAway("2027-08-15T00:00:00.000Z", now), "in 12 months");
    assert.equal(monthsAway("2026-09-15T00:00:00.000Z", now), "in 1 month");
    assert.equal(monthsAway("2026-08-30T00:00:00.000Z", now), "this month");
  });

  it("does not describe a renewal that has already passed as upcoming", () => {
    assert.equal(monthsAway("2026-02-15T00:00:00.000Z", now), "6 months ago");
  });

  it("finds the next invoice after today, not the first one ever raised", () => {
    const next = nextInvoiceDate(contract(), now);

    assert.ok(next);
    assert.equal(new Date(next).toISOString().slice(0, 10), "2026-09-15");
  });

  it("steps by the cadence rather than always by a month", () => {
    const next = nextInvoiceDate(contract({ billingCadence: "QUARTERLY" }), now);

    assert.equal(new Date(next!).toISOString().slice(0, 10), "2026-11-15");
  });

  it("walks forward from a start date years in the past", () => {
    const next = nextInvoiceDate(
      contract({ startDate: "2021-03-05T00:00:00.000Z" }),
      now,
    );

    assert.ok(new Date(next!) > now, "the next invoice must be ahead of today");
    assert.equal(new Date(next!).getUTCDate(), 5, "it keeps the billing day");
  });

  it("returns nothing for a cadence with no repeat, rather than looping", () => {
    assert.equal(nextInvoiceDate(contract({ billingCadence: "ONE_TIME" }), now), null);
    assert.equal(CADENCE_MONTHS.ONE_TIME, undefined);
  });

  it("returns nothing when no start date was ever recorded", () => {
    assert.equal(nextInvoiceDate(contract({ startDate: null }), now), null);
  });
});

/**
 * The client record editor's payload.
 *
 * The point of this schema is what it refuses to carry. The editor used to
 * submit the whole client - owner, status, stage, note - because that is the
 * shape the create-and-update endpoint takes, which meant saving a phone number
 * wrote back whatever stage the page happened to be rendered with. A stage
 * moved from the Journey board in the meantime was silently reverted.
 *
 * If any of those four ever reappear here, that bug comes back with them.
 */
describe("client record payload", () => {
  const valid = {
    clientName: "Dr. Omar Haddad",
    companyName: "Riverbend Orthodontics",
    contactEmail: "haddad@riverbendortho.test",
    contactPhone: "(555) 111 1077",
    serviceType: "PAID_ADVERTISING",
  };

  it("accepts the five fields the editor owns", () => {
    assert.equal(clientRecordSchema.safeParse(valid).success, true);
  });

  it("carries nothing that belongs to another control", () => {
    const parsed = clientRecordSchema.parse({
      ...valid,
      currentStageId: "stage-the-page-was-rendered-with",
      status: "ON_HOLD",
      assignedUserId: "someone-else",
      notes: "a note from elsewhere",
    });

    assert.deepEqual(
      Object.keys(parsed).sort(),
      ["clientName", "companyName", "contactEmail", "contactPhone", "serviceType"],
      "a field that reaches the update is a field that can be reverted by it",
    );
  });

  it("lets the phone be cleared but not the name", () => {
    assert.equal(clientRecordSchema.safeParse({ ...valid, contactPhone: "" }).success, true);
    assert.equal(clientRecordSchema.safeParse({ ...valid, clientName: "" }).success, false);
  });

  it("refuses an address that is not one", () => {
    assert.equal(clientRecordSchema.safeParse({ ...valid, contactEmail: "haddad@" }).success, false);
  });

  it("refuses a service the application does not offer", () => {
    assert.equal(
      clientRecordSchema.safeParse({ ...valid, serviceType: "SKYWRITING" }).success,
      false,
    );
  });
});
