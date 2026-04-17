import type { Role } from "@prisma/client";

export const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TEAM_MEMBER: "Team Member",
};

export function canManageUsers(role: Role) {
  return role === "ADMIN";
}

export function canManageClients(role: Role) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canManageEmployeeTasks(role: Role) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canMovePipeline(role: Role) {
  return canManageClients(role);
}

export function canViewAllAgencyData(role: Role) {
  return role === "ADMIN" || role === "MANAGER";
}

export function canAccessAssignedRecord(
  role: Role,
  currentUserId: string,
  assignedUserId?: string | null,
) {
  return canViewAllAgencyData(role) || currentUserId === assignedUserId;
}

export function canUpdateEmployeeTask(
  role: Role,
  currentUserId: string,
  assignedToId?: string | null,
) {
  return canManageEmployeeTasks(role) || currentUserId === assignedToId;
}
