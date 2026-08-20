import type { Role } from "@prisma/client";
import { compare } from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";
import {
  consumeRateLimit,
  isRateLimited,
  loginIdentityRule,
  loginOriginRule,
  resetRateLimit,
  resolveRequestOrigin,
} from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validators";
import { ensureRequiredWorkspaceInitialized } from "@/lib/workspace-bootstrap";

function getCookieSafeImageUrl(avatarUrl?: string | null) {
  if (!avatarUrl) {
    return null;
  }

  if (avatarUrl.startsWith("data:image/")) {
    return null;
  }

  return avatarUrl.length <= 2000 ? avatarUrl : null;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials, request) {
        try {
          const parsed = loginSchema.safeParse(credentials);

          if (!parsed.success) {
            return null;
          }

          const email = parsed.data.email.toLowerCase();
          const origin = resolveRequestOrigin(request?.headers);
          const identityKey = `login:identity:${email}`;
          const originKey = `login:origin:${origin}`;

          // Reject before touching the database or running bcrypt, so a
          // throttled attacker cannot consume server resources either.
          if (
            !isRateLimited(identityKey, loginIdentityRule).allowed
            || !isRateLimited(originKey, loginOriginRule).allowed
          ) {
            console.warn("[auth] Sign-in throttled.", { email, origin });
            return null;
          }

          const recordFailure = () => {
            consumeRateLimit(identityKey, loginIdentityRule);
            consumeRateLimit(originKey, loginOriginRule);
          };

          await ensureRequiredWorkspaceInitialized().catch((error) => {
            console.error("[auth] Workspace bootstrap failed during login.", error);
          });

          const user = await prisma.user.findUnique({
            where: {
              email,
            },
          });

          if (!user) {
            recordFailure();
            return null;
          }

          const passwordMatches = await compare(
            parsed.data.password,
            user.passwordHash,
          );

          if (!passwordMatches) {
            recordFailure();
            return null;
          }

          /*
           * Checked after the password, not before it.
           *
           * Not to report it differently - NextAuth v4 collapses every
           * authorize failure into "CredentialsSignin", so the browser cannot
           * tell a deactivated account from a wrong password however this
           * function fails. Verified against the running server rather than
           * assumed.
           *
           * The order still matters. When this sat above the comparison, a
           * deactivated address returned in a millisecond while a live one
           * spent the cost of a bcrypt compare, and that difference is
           * measurable - it told an attacker which addresses had live accounts
           * without them ever guessing a password. Everyone now pays the same
           * cost whatever the outcome.
           */
          if (!user.isActive) {
            recordFailure();
            return null;
          }

          resetRateLimit(identityKey);
          resetRateLimit(originKey);

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: getCookieSafeImageUrl(user.avatarUrl),
            role: user.role,
          };
        } catch (error) {
          console.error("[auth] Credentials authorization failed.", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      try {
        if (user) {
          token.id = user.id;
          token.role = user.role;
        }

        if (!token.id) {
          return token;
        }

        const currentUser = await prisma.user.findUnique({
          where: {
            id: token.id,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            isActive: true,
          },
        });

        if (!currentUser || !currentUser.isActive) {
          return {};
        }

        token.id = currentUser.id;
        token.name = currentUser.name;
        token.email = currentUser.email;
        token.role = currentUser.role;
        token.picture = getCookieSafeImageUrl(currentUser.avatarUrl);

        return token;
      } catch (error) {
        console.error("[auth] Failed to refresh JWT payload.", error);
        return token;
      }
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.role = (token.role ?? "TEAM_MEMBER") as Role;
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
        session.user.image = typeof token.picture === "string" ? token.picture : null;
      }

      return session;
    },
    async redirect({ url, baseUrl }) {
      const fallbackUrl = `${baseUrl}/dashboard`;

      if (!url) {
        return fallbackUrl;
      }

      const normalizePathname = (pathname: string) => pathname === "/login" || pathname.startsWith("/api/auth");

      if (url.startsWith("/")) {
        return normalizePathname(url) ? fallbackUrl : `${baseUrl}${url}`;
      }

      try {
        const parsed = new URL(url);

        if (parsed.origin !== baseUrl) {
          return fallbackUrl;
        }

        return normalizePathname(parsed.pathname) ? fallbackUrl : parsed.toString();
      } catch {
        return fallbackUrl;
      }
    },
  },
};

export async function getServerAuthSession() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || !session.user.email) {
      return null;
    }

    return session;
  } catch (error) {
    console.error("[auth] Failed to resolve server session.", error);
    return null;
  }
}
