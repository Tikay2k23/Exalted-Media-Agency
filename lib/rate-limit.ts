/**
 * Fixed-window rate limiting for authentication-sensitive actions.
 *
 * The store is deliberately kept behind a narrow interface. The in-memory
 * implementation below protects a single server instance, which is the correct
 * behaviour for a long-running Node server. A multi-instance or serverless
 * deployment should swap `memoryStore` for a shared store (database or Redis)
 * without changing any caller.
 */

export interface RateLimitRule {
  /** Maximum number of recorded attempts allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface WindowRecord {
  count: number;
  expiresAt: number;
}

interface RateLimitStore {
  increment(key: string, windowMs: number): WindowRecord;
  peek(key: string): WindowRecord | null;
  reset(key: string): void;
}

const MAX_TRACKED_KEYS = 10_000;

function createMemoryStore(): RateLimitStore {
  const windows = new Map<string, WindowRecord>();

  function evictExpired(now: number) {
    for (const [key, record] of windows) {
      if (record.expiresAt <= now) {
        windows.delete(key);
      }
    }
  }

  return {
    increment(key, windowMs) {
      const now = Date.now();
      const existing = windows.get(key);

      if (existing && existing.expiresAt > now) {
        existing.count += 1;
        return existing;
      }

      // Bound memory growth before inserting a new key.
      if (windows.size >= MAX_TRACKED_KEYS) {
        evictExpired(now);

        if (windows.size >= MAX_TRACKED_KEYS) {
          const oldestKey = windows.keys().next().value;

          if (oldestKey !== undefined) {
            windows.delete(oldestKey);
          }
        }
      }

      const record: WindowRecord = { count: 1, expiresAt: now + windowMs };
      windows.set(key, record);
      return record;
    },
    peek(key) {
      const record = windows.get(key);

      if (!record) {
        return null;
      }

      if (record.expiresAt <= Date.now()) {
        windows.delete(key);
        return null;
      }

      return record;
    },
    reset(key) {
      windows.delete(key);
    },
  };
}

const globalForRateLimit = globalThis as unknown as {
  rateLimitStore?: RateLimitStore;
};

// Survives dev-server hot reloads so the counters are not silently cleared.
const store = globalForRateLimit.rateLimitStore ?? createMemoryStore();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimit.rateLimitStore = store;
}

export function consumeRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const record = store.increment(key, rule.windowMs);
  const allowed = record.count <= rule.limit;

  return {
    allowed,
    remaining: Math.max(0, rule.limit - record.count),
    retryAfterMs: allowed ? 0 : Math.max(0, record.expiresAt - Date.now()),
  };
}

/**
 * Reports whether a key has already exhausted its allowance, without recording
 * a new attempt. Use this to reject early, then call `consumeRateLimit` only
 * when an attempt actually fails.
 */
export function isRateLimited(key: string, rule: RateLimitRule): RateLimitResult {
  const record = store.peek(key);

  if (!record) {
    return { allowed: true, remaining: rule.limit, retryAfterMs: 0 };
  }

  const allowed = record.count < rule.limit;

  return {
    allowed,
    remaining: Math.max(0, rule.limit - record.count),
    retryAfterMs: allowed ? 0 : Math.max(0, record.expiresAt - Date.now()),
  };
}

export function resetRateLimit(key: string) {
  store.reset(key);
}

/** Failed sign-ins for one email address. */
export const loginIdentityRule: RateLimitRule = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

/**
 * Failed sign-ins from one network origin, across every email address. This is
 * what stops password spraying against the published agency addresses.
 */
export const loginOriginRule: RateLimitRule = {
  limit: 20,
  windowMs: 15 * 60 * 1000,
};

/**
 * Attempts against the public intake endpoint from one network origin.
 *
 * The intake link is 32 random bytes, so guessing one is not a realistic
 * attack - this exists to stop somebody hammering the endpoint rather than to
 * stop them succeeding. Generous enough that a client filling in a long form
 * on a flaky connection is never turned away.
 *
 * Worth knowing: the store behind this is in-memory, so on a serverless host
 * the limit is per instance and resets on deploy. That is a real weakness and
 * it is written down rather than implied.
 */
export const intakeOriginRule: RateLimitRule = {
  limit: 60,
  windowMs: 10 * 60 * 1000,
};

/**
 * Resolves the client address from proxy headers. Vercel and most reverse
 * proxies set `x-forwarded-for`; the left-most entry is the original client.
 */
export function resolveRequestOrigin(headers?: {
  "x-forwarded-for"?: string | string[];
  "x-real-ip"?: string | string[];
}): string {
  const forwardedFor = headers?.["x-forwarded-for"];
  const realIp = headers?.["x-real-ip"];

  const candidate = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor ?? (Array.isArray(realIp) ? realIp[0] : realIp);

  if (!candidate) {
    return "unknown";
  }

  return candidate.split(",")[0]?.trim() || "unknown";
}
