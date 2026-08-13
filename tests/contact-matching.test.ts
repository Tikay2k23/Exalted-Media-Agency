import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  companyKeyOf,
  defaultOpportunityName,
  emailKeyOf,
  isStrongMatch,
  matchContacts,
  phoneKeyOf,
  type MatchCandidate,
} from "@/lib/sales/contact-matching";

function contact(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Dr Steven Hale",
    businessName: "Best Life Chiropractic",
    email: "steven@bestlifechiro.com",
    phone: "(555) 010-9987",
    opportunityCount: 1,
    ...overrides,
  };
}

describe("normalising what people type", () => {
  it("treats one phone number typed three ways as one number", () => {
    const forms = ["(555) 010-9987", "555-010-9987", "555 010 9987", "555.010.9987"];
    const keys = new Set(forms.map(phoneKeyOf));

    assert.equal(keys.size, 1);
    assert.equal([...keys][0], "5550109987");
  });

  it("keeps a country code rather than merging two different numbers", () => {
    assert.notEqual(phoneKeyOf("+1 555 010 9987"), phoneKeyOf("555 010 9987"));
  });

  it("refuses an extension as a phone number", () => {
    // Four digits would match every extension in the building onto one contact.
    assert.equal(phoneKeyOf("4471"), null);
    assert.equal(phoneKeyOf(""), null);
    assert.equal(phoneKeyOf(null), null);
  });

  it("lowercases an address and rejects anything that is not one", () => {
    assert.equal(emailKeyOf("  Steven@BestLifeChiro.com "), "steven@bestlifechiro.com");
    assert.equal(emailKeyOf("Dr Steven"), null);
    assert.equal(emailKeyOf(""), null);
  });

  it("collapses the whitespace in a company name", () => {
    assert.equal(companyKeyOf("  Best  Life   Chiropractic "), "best life chiropractic");
  });
});

describe("finding the contact that already exists", () => {
  it("matches on email whatever the case and spacing", () => {
    const existing = contact();

    const matches = matchContacts(
      { email: "  STEVEN@bestlifechiro.com", phone: null, businessName: "Somewhere Else" },
      [existing],
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.confidence, "email");
    assert.equal(matches[0]!.contact.id, existing.id);
  });

  it("matches on phone when the email is different or absent", () => {
    const matches = matchContacts(
      { email: null, phone: "555-010-9987", businessName: "Unrelated Ltd" },
      [contact()],
    );

    assert.equal(matches[0]?.confidence, "phone");
  });

  it("offers a same-company match without calling it certain", () => {
    const matches = matchContacts(
      {
        email: "marie@bestlifechiro.com",
        phone: "555 222 3333",
        businessName: "Best Life Chiropractic",
      },
      [contact()],
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.confidence, "company");
    // Two people at one firm are two contacts, so this must not block anything.
    assert.equal(isStrongMatch(matches[0]!), false);
  });

  it("ranks the certain match above the probable one", () => {
    const sameEmail = contact({ businessName: "Different Trading Name" });
    const sameCompany = contact({
      email: "reception@bestlifechiro.com",
      phone: "555 444 1111",
    });

    const matches = matchContacts(
      {
        email: "steven@bestlifechiro.com",
        phone: null,
        businessName: "Best Life Chiropractic",
      },
      [sameCompany, sameEmail],
    );

    assert.deepEqual(
      matches.map((match) => match.confidence),
      ["email", "company"],
    );
    assert.equal(matches[0]!.contact.id, sameEmail.id);
  });

  it("reports each contact once, at its strongest reason", () => {
    // Same email and same company on one record used to produce two rows, which
    // read as two duplicate contacts when there was only ever one.
    const matches = matchContacts(
      {
        email: "steven@bestlifechiro.com",
        phone: "(555) 010-9987",
        businessName: "Best Life Chiropractic",
      },
      [contact()],
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0]!.confidence, "email");
  });

  it("finds nothing when there is nothing to match on", () => {
    assert.deepEqual(
      matchContacts({ email: null, phone: null, businessName: "" }, [contact()]),
      [],
    );
  });

  it("does not match an empty company against a contact with none", () => {
    const nameless = contact({ email: null, phone: null, businessName: "" });

    assert.deepEqual(
      matchContacts({ email: null, phone: null, businessName: "" }, [nameless]),
      [],
    );
  });
});

describe("naming a new opportunity", () => {
  it("uses the service, so two deals on one account read differently", () => {
    assert.equal(
      defaultOpportunityName({
        serviceInterest: "CRM_AUTOMATION",
        businessName: "Best Life Chiropractic",
      }),
      "Crm Automation",
    );
  });

  it("falls back to the account when no service was chosen", () => {
    assert.equal(
      defaultOpportunityName({
        serviceInterest: null,
        businessName: "Best Life Chiropractic",
      }),
      "Best Life Chiropractic",
    );
  });

  it("falls back to the person when there is no business name", () => {
    assert.equal(
      defaultOpportunityName({ serviceInterest: null, businessName: "", contactName: "Dr Steven" }),
      "Dr Steven",
    );
  });
});
