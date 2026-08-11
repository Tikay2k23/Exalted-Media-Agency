import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { buildTaskCsv, taskCsvFilename } from "@/lib/tasks/task-csv";
import { TASK_LIST_SELECT, taskScopeFor } from "@/lib/tasks/task-queries";

export const runtime = "nodejs";

/**
 * Every finished task this person is allowed to see.
 *
 * The other export - what is currently on screen - is built in the browser from
 * rows it already has, because re-asking the server to reproduce a set of
 * filters is a second implementation of the filters. This one exists because
 * "all completed" reaches past the page, so it has to be a fresh query, and a
 * fresh query has to be scoped again rather than trusted from the client.
 */
export async function GET() {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tasks = await prisma.employeeTask.findMany({
    where: {
      ...taskScopeFor(actor),
      status: { in: ["APPROVED", "DONE"] },
    },
    orderBy: [{ completedAt: "desc" }, { dueDate: "desc" }],
    take: 5000,
    select: TASK_LIST_SELECT,
  });

  const csv = buildTaskCsv(tasks);

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${taskCsvFilename("completed")}"`,
      "Cache-Control": "no-store",
    },
  });
}
