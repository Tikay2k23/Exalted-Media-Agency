import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyRows,
  mapHeaders,
  normaliseEmail,
  normaliseSource,
  parseCsv,
  parseLeadCsv,
  rowsToWrite,
  summariseImport,
} from "@/lib/sales/lead-import";

describe("splitting the file", () => {
  it("keeps a comma inside a quoted field", () => {
    // Company names contain commas. A naive split corrupts exactly the rows
    // somebody cares about.
    const rows = parseCsv('name,company\nJohn Smith,"Smith, Jones and Co"');

    assert.deepEqual(rows[1], ["John Smith", "Smith, Jones and Co"]);
  });

  it("keeps a newline inside a quoted field", () => {
    const rows = parseCsv('name,notes\nJohn,"line one\nline two"');

    assert.equal(rows.length, 2);
    assert.equal(rows[1][1], "line one\nline two");
  });

  it("unescapes a doubled quote", () => {
    const rows = parseCsv('name\n"He said ""hello"""');

    assert.equal(rows[1][0], 'He said "hello"');
  });

  it("copes with carriage returns and a trailing newline", () => {
    const rows = parseCsv("name,company\r\nJohn,ABC\r\n");

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], ["John", "ABC"]);
  });

  it("strips a byte order mark from the first header", () => {
    // Excel writes one, and "﻿email" matches no alias.
    const rows = parseCsv("﻿email,name\njohn@a.com,John");

    assert.equal(rows[0][0], "email");
  });

  it("drops blank lines rather than importing empty leads", () => {
    const rows = parseCsv("name,company\nJohn,ABC\n\n,\n");

    assert.equal(rows.length, 2);
  });
});

describe("working out which column is which", () => {
  it("accepts the headers different systems actually export", () => {
    for (const header of ["Email", "E-Mail", "email address", "Contact Email"]) {
      assert.equal(mapHeaders([header]).email, 0, header);
    }

    for (const header of ["Company", "Business Name", "company_name", "Organisation"]) {
      assert.equal(mapHeaders([header]).businessName, 0, header);
    }
  });

  it("leaves a column it does not recognise unmapped", () => {
    assert.equal(mapHeaders(["shoe size"]).email, undefined);
  });
});

describe("cleaning up values", () => {
  it("lowercases an email and rejects something that is not one", () => {
    assert.equal(normaliseEmail("  John@ABC.com "), "john@abc.com");
    assert.equal(normaliseEmail("john at abc"), null);
    assert.equal(normaliseEmail(""), null);
    assert.equal(normaliseEmail(null), null);
  });

  it("maps the words people write to a real source", () => {
    assert.equal(normaliseSource("Meta Ads"), "PAID_ADS");
    assert.equal(normaliseSource("referral"), "REFERRAL");
    assert.equal(normaliseSource("Cold Outreach"), "OUTBOUND");
    // A file exported from this system re-imports unchanged.
    assert.equal(normaliseSource("WEBSITE_FORM"), "WEBSITE_FORM");
    // Anything unrecognised is Other rather than a guess.
    assert.equal(normaliseSource("carrier pigeon"), "OTHER");
    assert.equal(normaliseSource(""), null);
  });
});

describe("reading rows", () => {
  const header = "Contact Name,Company,Email,Phone,Source,Budget,Notes\n";

  it("reads a full row", () => {
    const result = parseLeadCsv(
      `${header}John Smith,ABC Plumbing,John@ABC.com,555-1234,Referral,"$3,500",Wants a funnel`,
    );

    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.rows[0], {
      line: 2,
      contactName: "John Smith",
      businessName: "ABC Plumbing",
      email: "john@abc.com",
      phone: "555-1234",
      source: "REFERRAL",
      budgetAmount: 3500,
      notes: "Wants a funnel",
    });
  });

  it("accepts a lead with only a name and a company", () => {
    // Rejecting it would push somebody back to typing them in by hand.
    const result = parseLeadCsv("name,company\nJane,Bright Dental");

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].email, null);
  });

  it("refuses the file when the two required columns are missing", () => {
    const result = parseLeadCsv("email,phone\njohn@a.com,555");

    assert.deepEqual(result.missingColumns, ["contact name", "business name"]);
    assert.equal(result.rows.length, 0);
  });

  it("rejects a row with a malformed email rather than dropping the address", () => {
    // Importing the lead with the email silently gone would leave a record
    // nobody can dedupe or contact.
    const result = parseLeadCsv(`${header}John,ABC,not-an-email,,,,`);

    assert.equal(result.rows.length, 0);
    assert.equal(result.invalid.length, 1);
    assert.match(result.invalid[0].reason, /not an email/);
  });

  it("names the line in the file when something is wrong", () => {
    const result = parseLeadCsv("name,company\nJohn,ABC\n,Missing Name Co");

    assert.equal(result.invalid[0].line, 3);
    assert.match(result.invalid[0].reason, /No contact name/);
  });

  it("strips currency symbols from the value", () => {
    const result = parseLeadCsv(`${header}John,ABC,,,,"£1,250.50",`);

    assert.equal(result.rows[0].budgetAmount, 1250.5);
  });

  it("returns nothing rather than throwing on an empty file", () => {
    const result = parseLeadCsv("");

    assert.deepEqual(result.rows, []);
    assert.ok(result.missingColumns.length > 0);
  });
});

describe("deciding what happens to each row", () => {
  const rows = parseLeadCsv(
    [
      "name,company,email",
      "John Smith,ABC Plumbing,john@abc.com",
      "Jane Doe,Bright Dental,jane@bright.com",
      "Johnny Smith,ABC Plumbing,JOHN@abc.com",
      "No Email,Quiet Co,",
    ].join("\n"),
  ).rows;

  it("matches an existing lead on email, ignoring case", () => {
    const classified = classifyRows(rows, new Map([["jane@bright.com", "lead-1"]]));

    const jane = classified.find((entry) => entry.row.email === "jane@bright.com");

    assert.equal(jane?.verdict, "duplicate");
    assert.equal(jane?.existingLeadId, "lead-1");
  });

  it("catches the same address twice inside one file", () => {
    // A mistake in the file rather than a decision for the user: importing both
    // would create the duplicate this step exists to prevent.
    const classified = classifyRows(rows, new Map());

    assert.equal(classified[0].verdict, "new");
    assert.equal(classified[2].verdict, "duplicate-in-file");
    assert.match(classified[2].detail ?? "", /line 2 of this file/);
  });

  it("treats a row with no email as new, and says why", () => {
    // Two people called John Smith at two plumbing firms are two leads. Matching
    // on the name would merge them.
    const classified = classifyRows(rows, new Map());
    const noEmail = classified[3];

    assert.equal(noEmail.verdict, "new");
    assert.match(noEmail.detail ?? "", /could not be matched/);
  });

  it("counts every row into exactly one bucket", () => {
    const classified = classifyRows(rows, new Map([["john@abc.com", "lead-1"]]));
    const invalid = [{ line: 9, reason: "No company name." }];
    const summary = summariseImport(classified, invalid);

    assert.equal(summary.total, 5);
    assert.equal(
      summary.new + summary.duplicates + summary.duplicatesInFile + summary.invalid,
      summary.total,
    );
  });
});

describe("what actually gets written", () => {
  const rows = parseLeadCsv(
    [
      "name,company,email",
      "John Smith,ABC Plumbing,john@abc.com",
      "Jane Doe,Bright Dental,jane@bright.com",
    ].join("\n"),
  ).rows;

  const classified = classifyRows(rows, new Map([["jane@bright.com", "lead-1"]]));

  it("skips duplicates by default, changing nothing that exists", () => {
    const plan = rowsToWrite(classified, "skip");

    assert.equal(plan.create.length, 1);
    assert.equal(plan.create[0].email, "john@abc.com");
    assert.deepEqual(plan.update, []);
  });

  it("updates them only when that is explicitly chosen", () => {
    const plan = rowsToWrite(classified, "update");

    assert.equal(plan.create.length, 1);
    assert.equal(plan.update.length, 1);
    assert.equal(plan.update[0].id, "lead-1");
  });

  it("never writes a row that was a duplicate within the file", () => {
    const doubled = parseLeadCsv(
      ["name,company,email", "A,Co,x@y.com", "B,Co,x@y.com"].join("\n"),
    ).rows;

    const plan = rowsToWrite(classifyRows(doubled, new Map()), "update");

    assert.equal(plan.create.length, 1);
    assert.equal(plan.update.length, 0);
  });
});
