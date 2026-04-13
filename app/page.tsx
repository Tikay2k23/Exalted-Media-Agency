import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerAuthSession();

  redirect(session?.user ? "/dashboard" : "/login");
}
