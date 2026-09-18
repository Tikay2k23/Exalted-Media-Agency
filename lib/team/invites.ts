import { createHash, randomBytes } from "node:crypto";

import { hash } from "bcryptjs";

import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";

/**
 * Account invitations for department members.
 *
 * This application sends no email - there is no mailer anywhere in it - so an
 * invitation is a link, not a message. Whoever adds the member copies it and
 * sends it however they already talk to that person. The member opens it and
 * chooses their own password, so nobody else ever knows it.
 *
 * Stored in NextAuth's VerificationToken table, which the credentials login
 * never used, rather than in a new table. Only a hash of the token is kept: the
 * raw value exists in the link and nowhere else, so a copy of the database is
 * not a way into anybody's account.
 *
 * Login itself is untouched. Accepting an invite just sets passwordHash; the
 * member then signs in on the ordinary login page like everybody else.
 */

const INVITE_DAYS = 7;

function identifierFor(userId: string) {
  return `invite:${userId}`;
}

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A password nobody knows.
 *
 * A member created without an invite, or before accepting one, still needs a
 * passwordHash - the column is required - so they get the hash of 32 random
 * bytes that are then thrown away. Nothing can match it.
 */
export async function unusablePasswordHash() {
  return hash(randomBytes(32).toString("base64url"), 12);
}

/**
 * Issues a fresh invite link, replacing any earlier one.
 *
 * Replacing rather than adding: if the first link went to the wrong place,
 * issuing a new one must make the old one stop working.
 */
export async function issueInvite(userId: string, origin: string) {
  const token = randomBytes(32).toString("base64url");
  const identifier = identifierFor(userId);

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier } }),
    prisma.verificationToken.create({
      data: {
        identifier,
        token: digest(token),
        expires: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      },
    }),
  ]);

  return { url: `${origin}/invite/${token}`, expiresInDays: INVITE_DAYS };
}

/** Who a link belongs to, if it is still good. Never says why it is not. */
export async function readInvite(token: string) {
  if (!token || token.length > 200) return null;

  const row = await prisma.verificationToken.findUnique({
    where: { token: digest(token) },
    select: { identifier: true, expires: true },
  });

  if (!row || !row.identifier.startsWith("invite:") || row.expires.getTime() < Date.now()) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: { id: row.identifier.slice("invite:".length), isActive: true, deletedAt: null },
    select: { id: true, name: true, email: true },
  });

  return user;
}

/**
 * Sets the member's password and spends the link.
 *
 * Refused for an inactive member: deactivating somebody must not leave a link
 * lying around that turns their account back on.
 */
export async function acceptInvite(token: string, password: string) {
  if (password.length < 8) {
    return { ok: false as const, message: "Choose a password of at least 8 characters." };
  }

  const user = await readInvite(token);

  if (!user) {
    return { ok: false as const, message: "This invitation link has expired or is no longer valid." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(password, 12) },
    }),
    prisma.verificationToken.deleteMany({ where: { identifier: identifierFor(user.id) } }),
  ]);

  await logActivity({
    actorId: user.id,
    action: `${user.name} accepted their invitation and set a password`,
    entityType: "USER",
    entityId: user.id,
  });

  return { ok: true as const, email: user.email };
}

/** Removes any outstanding link - used when somebody is deactivated. */
export async function revokeInvites(userId: string) {
  await prisma.verificationToken.deleteMany({ where: { identifier: identifierFor(userId) } });
}
