import { Role } from "@prisma/client";

import { UserManagementPanel } from "@/components/admin/user-management-panel";
import { getAdminUsersData } from "@/lib/data/queries";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminUsersPage() {
  const user = await requireRole([Role.ADMIN]);
  const data = await getAdminUsersData(user);

  return <UserManagementPanel users={data?.users ?? []} />;
}
