import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkFieldsForCredentials,
  checkForCredential,
} from "@/lib/security/credential-guard";

describe("credential guard", () => {
  it("allows an empty or missing value", () => {
    assert.equal(checkForCredential("").flagged, false);
    assert.equal(checkForCredential(null).flagged, false);
    assert.equal(checkForCredential(undefined).flagged, false);
    assert.equal(checkForCredential("   ").flagged, false);
  });

  it("allows the notes people legitimately write here", () => {
    const allowed = [
      "Held in the client's 1Password vault, Marketing collection.",
      "Owner shares access directly. Ask Sarah before requesting.",
      "Agency has admin. Two factor is on the owner's phone.",
      "Requested 3 March, chased 10 March, still waiting.",
      "See https://business.facebook.com/settings/people for the invite.",
      "Contact billing@exampleclient.com to be added.",
      "Client manages this themselves and will not delegate.",
    ];

    for (const value of allowed) {
      assert.equal(
        checkForCredential(value).flagged,
        false,
        `should have allowed: ${value}`,
      );
    }
  });

  it("catches a labelled password", () => {
    const result = checkForCredential("login is admin, password: hunter2");

    assert.equal(result.flagged, true);
    assert.match(result.reason ?? "", /password manager/);
  });

  it("catches the labels people actually use", () => {
    for (const value of [
      "pwd = summer2026",
      "API key: abc123def456",
      "token=9f8e7d6c5b4a",
      "passphrase: correct horse battery",
      "PIN: 4821",
    ]) {
      assert.equal(checkForCredential(value).flagged, true, `should have caught: ${value}`);
    }
  });

  it("catches well-known key formats by shape", () => {
    const keys = [
      "sk_live_51H8xKlMnOpQrStUvWx",
      "AKIAIOSFODNN7EXAMPLE",
      "ghp_16CharsMinimumTokenHere",
      "xoxb-123456789012-abcdefghijk",
      "-----BEGIN RSA PRIVATE KEY-----",
    ];

    for (const key of keys) {
      assert.equal(checkForCredential(key).flagged, true, `should have caught: ${key}`);
    }
  });

  it("catches a generated-looking secret with no label at all", () => {
    // The realistic accident: pasting the value alone into a notes box.
    assert.equal(checkForCredential("Xk9$mQ2vLp7!zRt4Wn").flagged, true);
  });

  it("does not trip on ordinary sentences, however long", () => {
    const prose =
      "The client confirmed on Tuesday that their marketing manager will grant us "
      + "administrator access to the advertising account once the contract is signed.";

    assert.equal(checkForCredential(prose).flagged, false);
  });

  it("does not trip on a URL or an email address", () => {
    assert.equal(
      checkForCredential("https://admin.example.com/settings?tab=users&ref=abc123XYZ").flagged,
      false,
    );
    assert.equal(checkForCredential("marketing.lead@exampleclient.com").flagged, false);
  });

  it("does not trip on a short code", () => {
    // Account numbers and reference codes are legitimate and short.
    assert.equal(checkForCredential("Account ref AC-4821").flagged, false);
  });

  it("reports which field was the problem", () => {
    const result = checkFieldsForCredentials({
      credentialLocation: "Client 1Password vault",
      notes: "password: hunter2",
    });

    assert.ok(result);
    assert.equal(result.field, "notes");
    assert.match(result.reason, /password manager/);
  });

  it("returns nothing when every field is clean", () => {
    assert.equal(
      checkFieldsForCredentials({
        credentialLocation: "Client 1Password vault",
        notes: "Requested on 3 March.",
      }),
      null,
    );
  });
});
