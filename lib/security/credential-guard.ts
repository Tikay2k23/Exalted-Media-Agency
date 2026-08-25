/**
 * Keeps credentials out of the database.
 *
 * The access tracker records *whether* the agency can reach a platform and
 * *where* the credential is held. It has no password field and must never gain
 * one. Somebody will nonetheless paste a password into a notes box one day, so
 * this rejects the obvious cases before they are stored.
 *
 * This is a guard, not a security boundary: it catches carelessness, not a
 * determined attempt. The real protection is that there is nowhere legitimate
 * to put a secret.
 */

export interface CredentialCheck {
  flagged: boolean;
  reason?: string;
}

/** Labels people actually type before pasting a secret. */
const LABELLED_SECRET =
  /\b(pass(word|wd|phrase)?|pwd|secret|api[\s_-]?key|token|otp|pin|seed[\s_-]?phrase)\b\s*[:=]\s*\S+/i;

/** Well-known key formats worth catching by shape alone. */
const KNOWN_KEY_SHAPES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bsk_(live|test)_[A-Za-z0-9]{8,}/, label: "a Stripe secret key" },
  { pattern: /\bAKIA[0-9A-Z]{12,}/, label: "an AWS access key" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}/, label: "a GitHub token" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, label: "a Slack token" },
  { pattern: /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, label: "a JSON web token" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "a private key" },
];

/** Punctuation that holds the parts of an ordinary identifier together. */
const IDENTIFIER_SEPARATORS = new Set(["_", "-", ".", "/", ":", "(", ")", "[", "]"]);

/**
 * An address, rather than anything merely containing an at sign.
 *
 * The exemption exists so a contact address in a notes box is not mistaken for
 * a key. Testing for the character alone let any secret through that happened
 * to contain one, which is a common enough thing for a generated password to
 * do, so the shape is checked instead.
 */
function looksLikeEmailAddress(candidate: string): boolean {
  const parts = candidate.split("@");

  return parts.length === 2 && parts[0].length > 0 && parts[1].includes(".");
}

/**
 * A long unbroken run of mixed character classes. Deliberately conservative:
 * it needs length, no whitespace, and three of four classes, so ordinary text
 * and URLs do not trip it.
 */
function looksLikeRandomSecret(value: string): boolean {
  for (const rawToken of value.split(/\s+/)) {
    if (rawToken.length < 14 || rawToken.length > 200) {
      continue;
    }

    // URLs and email addresses are legitimate here.
    if (/^https?:\/\//i.test(rawToken) || looksLikeEmailAddress(rawToken)) {
      continue;
    }

    /*
     * Identifier punctuation is stripped before the character classes are
     * counted. Platform IDs are built from a prefix, a separator and a number -
     * act_4471902235 for a Meta ad account, a UUID, a hyphenated campaign slug -
     * and counting the separator as a class made every one of them look like a
     * generated secret. The intake form asks for those IDs by name, so the guard
     * was rejecting the exact answer the question had just requested.
     *
     * Unusual punctuation stays and still counts: a dollar sign or an
     * exclamation mark belongs in a password, not in an account ID.
     */
    const token = [...rawToken]
      .filter((character) => !IDENTIFIER_SEPARATORS.has(character))
      .join("");

    const classes = [
      /[a-z]/.test(token),
      /[A-Z]/.test(token),
      /[0-9]/.test(token),
      /[^A-Za-z0-9]/.test(token),
    ].filter(Boolean).length;

    if (classes >= 3) {
      return true;
    }
  }

  return false;
}

export function checkForCredential(value: string | null | undefined): CredentialCheck {
  if (!value?.trim()) {
    return { flagged: false };
  }

  if (LABELLED_SECRET.test(value)) {
    return {
      flagged: true,
      reason:
        "This looks like a password or key. Store the credential in the client's password "
        + "manager and record only where it is held.",
    };
  }

  for (const { pattern, label } of KNOWN_KEY_SHAPES) {
    if (pattern.test(value)) {
      return {
        flagged: true,
        reason:
          `This looks like ${label}. Keys must never be stored here — record only where `
          + "the credential is held.",
      };
    }
  }

  if (looksLikeRandomSecret(value)) {
    return {
      flagged: true,
      reason:
        "This contains something that looks like a generated secret. Record where the "
        + "credential is held, not the credential itself.",
    };
  }

  return { flagged: false };
}

/** Checks several free-text fields at once, returning the first problem found. */
export function checkFieldsForCredentials(
  fields: Record<string, string | null | undefined>,
): { field: string; reason: string } | null {
  for (const [field, value] of Object.entries(fields)) {
    const result = checkForCredential(value);

    if (result.flagged) {
      return { field, reason: result.reason! };
    }
  }

  return null;
}
