/*
  Two indexes that only ever existed in SQL.

  20260811000000_task_assignment_detail created EmployeeTask_category_idx and
  EmployeeTask_platform_idx by hand, but the matching @@index lines were never
  added to the Prisma schema. Every `migrate dev` since has re-proposed
  dropping them, and the drop had to be stripped out of each new migration by
  hand - including the two that ship alongside this one.

  Nothing reads them. No query in the application filters, orders or groups
  EmployeeTask by category or platform, and pg_stat_user_indexes reports
  idx_scan = 0 for both. They cost two B-tree updates on every task write and
  return nothing for it.

  IF EXISTS because an environment where somebody already dropped these by hand
  should not have its deploy fail on the second attempt.
*/

-- DropIndex
DROP INDEX IF EXISTS "EmployeeTask_category_idx";

-- DropIndex
DROP INDEX IF EXISTS "EmployeeTask_platform_idx";
