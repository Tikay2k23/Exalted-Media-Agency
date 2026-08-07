import type { Position, Role, TeamRole } from "@prisma/client";

import {
  type AuthorizableUser,
  type Permission,
  can,
  resolvePermissions,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export interface AuthContext extends AuthorizableUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamRole: TeamRole;
  position: Position;
}

/**
 * Loads the authorization context for a user straight from the database.
 *
 * Permissions are deliberately not read from the session token: a token can be
 * minutes old, and a revoked permission has to take effect immediately. This
 * costs one indexed query per privileged action, which is the right trade.
 */
export async function loadAuthContext(userId: string): Promise<AuthContext | null> {
  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamRole: true,
        position: true,
        permissionOverrides: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { permission: true, effect: true, expiresAt: true },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teamRole: user.teamRole,
      position: user.position,
      permissionOverrides: user.permissionOverrides,
    };
  } catch (error) {
    console.error("[authz] Failed to load authorization context.", error);
    return null;
  }
}

export function contextCan(context: AuthContext, permission: Permission) {
  return can(context, permission);
}

export function contextPermissions(context: AuthContext) {
  return resolvePermissions(context);
}
