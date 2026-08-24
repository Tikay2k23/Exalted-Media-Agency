import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clientCompanySchema,
  clientInternalNoteSchema,
  clientOwnershipSchema,
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
