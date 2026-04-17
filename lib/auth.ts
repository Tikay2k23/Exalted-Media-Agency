import type { Role } from "@prisma/client";
import { compare } from "bcryptjs";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { ensureRequiredWorkspaceInitialized } from "@/lib/workspace-bootstrap";

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
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials);

          if (!parsed.success) {
            return null;
          }

          await ensureRequiredWorkspaceInitialized().catch((error) => {
            console.error("[auth] Workspace bootstrap failed during login.", error);
          });

          const user = await prisma.user.findUnique({
            where: {
              email: parsed.data.email.toLowerCase(),
            },
          });

          if (!user || !user.isActive) {
            return null;
          }

          const passwordMatches = await compare(
            parsed.data.password,
            user.passwordHash,
          );

          if (!passwordMatches) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.avatarUrl,
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
        token.picture = currentUser.avatarUrl ?? null;

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
