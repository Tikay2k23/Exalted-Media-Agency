import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  consumeRateLimit,
  isRateLimited,
  loginIdentityRule,
  resetRateLimit,
  resolveRequestOrigin,
  type RateLimitRule,
} from "@/lib/rate-limit";

const rule: RateLimitRule = { limit: 3, windowMs: 60_000 };

let keyCounter = 0;

function uniqueKey() {
  keyCounter += 1;
  return `test:key:${keyCounter}`;
}

describe("consumeRateLimit", () => {
  let key: string;

  beforeEach(() => {
    key = uniqueKey();
  });

  it("allows attempts up to the configured limit", () => {
    assert.equal(consumeRateLimit(key, rule).allowed, true);
    assert.equal(consumeRateLimit(key, rule).allowed, true);
    assert.equal(consumeRateLimit(key, rule).allowed, true);
  });

  it("blocks the attempt that exceeds the limit", () => {
    for (let attempt = 0; attempt < rule.limit; attempt += 1) {
      consumeRateLimit(key, rule);
    }

    const result = consumeRateLimit(key, rule);

    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
    assert.ok(result.retryAfterMs > 0, "a blocked result should report a retry delay");
  });

  it("reports remaining attempts as the window fills", () => {
    assert.equal(consumeRateLimit(key, rule).remaining, 2);
    assert.equal(consumeRateLimit(key, rule).remaining, 1);
    assert.equal(consumeRateLimit(key, rule).remaining, 0);
  });

  it("clears the window on reset, which is what a successful login does", () => {
    for (let attempt = 0; attempt < rule.limit; attempt += 1) {
      consumeRateLimit(key, rule);
    }

    assert.equal(isRateLimited(key, rule).allowed, false);

    resetRateLimit(key);

    assert.equal(isRateLimited(key, rule).allowed, true);
    assert.equal(consumeRateLimit(key, rule).allowed, true);
  });

  it("tracks each key independently", () => {
    const otherKey = uniqueKey();

    for (let attempt = 0; attempt <= rule.limit; attempt += 1) {
      consumeRateLimit(key, rule);
    }

    assert.equal(isRateLimited(key, rule).allowed, false);
    assert.equal(isRateLimited(otherKey, rule).allowed, true);
  });
});

describe("isRateLimited", () => {
  it("does not record an attempt", () => {
    const key = uniqueKey();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      assert.equal(isRateLimited(key, rule).allowed, true);
    }

    assert.equal(consumeRateLimit(key, rule).remaining, rule.limit - 1);
  });

  it("treats an untouched key as allowed with a full allowance", () => {
    const result = isRateLimited(uniqueKey(), loginIdentityRule);

    assert.equal(result.allowed, true);
    assert.equal(result.remaining, loginIdentityRule.limit);
  });
});

describe("resolveRequestOrigin", () => {
  it("takes the left-most address from x-forwarded-for", () => {
    assert.equal(
      resolveRequestOrigin({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }),
      "203.0.113.7",
    );
  });

  it("handles a header delivered as an array", () => {
    assert.equal(resolveRequestOrigin({ "x-forwarded-for": ["203.0.113.9"] }), "203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    assert.equal(resolveRequestOrigin({ "x-real-ip": "198.51.100.4" }), "198.51.100.4");
  });

  it("returns a stable placeholder when no address header is present", () => {
    assert.equal(resolveRequestOrigin({}), "unknown");
    assert.equal(resolveRequestOrigin(undefined), "unknown");
  });

  it("does not return an empty origin for a malformed header", () => {
    assert.equal(resolveRequestOrigin({ "x-forwarded-for": "  " }), "unknown");
  });
});
